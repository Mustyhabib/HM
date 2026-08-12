-- =====================================================================
-- Migration: 2026-08-12 — BYOK (Bring-Your-Own-Key) Pivot
-- Author: Auroras
-- Purpose: Server-side backing for the BYOK pivot design doc
--   1. New public.user_api_keys metadata table (Supabase Vault-backed,
--      no user-facing RLS SELECT — every access path is a RPC)
--   2. Four new RPCs: save/get/delete for `authenticated`, one
--      worker-only decrypt RPC for `service_role`
--   3. agent_runs: +provider column, usage_period_id relaxed to nullable,
--      +index backing the new rolling rate-limit gate
--   4. start_agent_run / start_swarm_run: quota removed, gated instead on
--      active subscription + configured key + a 30-runs/hour soft limit
--
-- Safety notes:
--   * usage_periods / usage_events are NOT dropped — kept as historical /
--     analytical tables. Nothing in this migration writes to them anymore.
--   * agent_runs.usage_period_id DROP NOT NULL is additive/backwards
--     compatible: existing rows are untouched, new rows may leave it null.
--   * All four new RPCs are SECURITY DEFINER with `set search_path`
--     pinned to 'public', and every reference to vault.* is fully
--     schema-qualified — no search-path hijack surface.
--   * public.user_api_keys never gets a client-facing SELECT/INSERT/
--     UPDATE/DELETE grant. RLS is enabled with zero policies (default
--     deny) AND table privileges are explicitly revoked from
--     anon/authenticated — belt and suspenders.
--   * worker_get_user_api_key is the only function granted to
--     service_role; anon/authenticated are explicitly locked out. It
--     takes p_user_id directly (not auth.uid()) because the caller is the
--     trusted worker process (already RLS-bypassing via the service-role
--     key, see hm_worker/db.py's module docstring) — never reachable by a
--     browser client, so this does not violate the "never trust a
--     client-supplied user_id" rule.
--   * Requires the `supabase_vault` extension to already be enabled on
--     this project (Database → Extensions → Vault). Per the design's own
--     decision log this migration does not enable it — that's a one-time
--     project-level toggle, not per-migration DDL.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. public.user_api_keys — BYOK metadata only (no plaintext, ever)
-- ---------------------------------------------------------------------

create table public.user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  provider      text not null check (provider in ('deepseek')),
  secret_id     uuid not null,
  key_last4     text not null check (length(key_last4) = 4),
  configured_at timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index user_api_keys_user_provider_idx
  on public.user_api_keys (user_id, provider);

alter table public.user_api_keys enable row level security;
-- No policies at all — default-deny. Every read/write goes through a
-- SECURITY DEFINER RPC below, which runs in auth.uid()'s context, so a
-- client can never list or touch another user's row.
revoke all on public.user_api_keys from anon, authenticated;

comment on table public.user_api_keys is
  'BYOK metadata only — the plaintext key never lands here, it lives
   encrypted in vault.secrets and is referenced by secret_id. RLS is
   enabled with NO policies (default deny) and table grants are revoked
   from anon/authenticated: all access is through save_user_api_key,
   get_user_api_key_status, delete_user_api_key, worker_get_user_api_key.';
comment on column public.user_api_keys.user_id is
  'Owner — FK to profiles(id), cascades on account delete.';
comment on column public.user_api_keys.provider is
  'LLM provider this key is for. Only deepseek is supported today; the
   column stays provider-agnostic for future expansion.';
comment on column public.user_api_keys.secret_id is
  'Opaque pointer into vault.secrets.id — the encrypted key. Not a
   database-level FK (vault is a separate extension schema); resolved via
   vault.decrypted_secrets, only inside worker_get_user_api_key.';
comment on column public.user_api_keys.key_last4 is
  'Last 4 characters of the key, for masked UI display (sk-...XXXX). Not
   sensitive on its own — safe to read back to the owning user.';
comment on column public.user_api_keys.configured_at is
  'When the currently-stored key was (re)configured. Refreshed on every
   rotation (save_user_api_key), so it always reflects the active key,
   not the row''s original creation time.';
comment on column public.user_api_keys.updated_at is
  'Generic last-modified bookkeeping timestamp.';


-- ---------------------------------------------------------------------
-- 2. save_user_api_key — create or rotate the caller's key
-- ---------------------------------------------------------------------

create or replace function public.save_user_api_key(
  p_provider text,
  p_api_key  text
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id    uuid := auth.uid();
  v_key        text := trim(p_api_key);
  v_last4      text;
  v_secret_id  uuid;
  v_old_secret uuid;
  v_configured timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_provider is null or p_provider <> 'deepseek' then
    raise exception 'unsupported_provider' using errcode = 'P0001';
  end if;

  -- sk-<20+ alnum/underscore/hyphen>, 23-200 chars total.
  if v_key is null
     or length(v_key) < 23
     or length(v_key) > 200
     or v_key !~ '^sk-[A-Za-z0-9_-]{20,}$' then
    raise exception 'invalid_key_format' using errcode = 'P0001';
  end if;

  v_last4 := right(v_key, 4);

  -- Capture the outgoing secret (if any) before creating the new one, so it
  -- can be deleted from the vault only after the replacement is committed.
  select secret_id into v_old_secret
    from public.user_api_keys
    where user_id = v_user_id and provider = p_provider;

  -- Encrypt-at-rest via Supabase Vault. The name embeds a fresh uuid so a
  -- rotation never collides with the (not-yet-deleted) outgoing secret's
  -- name. The plaintext key is never written to public.user_api_keys or
  -- any log — only vault.secrets holds it, encrypted.
  v_secret_id := vault.create_secret(
    v_key,
    format('user_api_key:%s:%s:%s', v_user_id, p_provider, gen_random_uuid())
  );

  insert into public.user_api_keys (user_id, provider, secret_id, key_last4)
    values (v_user_id, p_provider, v_secret_id, v_last4)
  on conflict (user_id, provider) do update
    set secret_id     = excluded.secret_id,
        key_last4     = excluded.key_last4,
        configured_at = now(),
        updated_at    = now()
  returning configured_at into v_configured;

  -- Only reachable once the new row is safely committed-in-transaction;
  -- if anything above raised, this DELETE never runs and the old key
  -- (still valid) is untouched on rollback.
  if v_old_secret is not null then
    delete from vault.secrets where id = v_old_secret;
  end if;

  return jsonb_build_object(
    'provider', p_provider,
    'last4', v_last4,
    'configured_at', v_configured
  );
end;
$$;

revoke execute on function public.save_user_api_key(text, text) from public;
grant execute on function public.save_user_api_key(text, text) to authenticated;

comment on function public.save_user_api_key(text, text) is
  'Store (or rotate) the caller''s DeepSeek API key. Validates provider +
   format, encrypts via Supabase Vault, deletes the previous vault secret
   only after the replacement is committed. Never returns plaintext.
   Errors: not_authenticated, unsupported_provider, invalid_key_format.';


-- ---------------------------------------------------------------------
-- 3. get_user_api_key_status — read-only masked status for the caller
-- ---------------------------------------------------------------------

create or replace function public.get_user_api_key_status()
returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     public.user_api_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_row
    from public.user_api_keys
    where user_id = v_user_id and provider = 'deepseek';

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'provider', v_row.provider,
    'last4', v_row.key_last4,
    'configured_at', v_row.configured_at
  );
end;
$$;

revoke execute on function public.get_user_api_key_status() from public;
grant execute on function public.get_user_api_key_status() to authenticated;

comment on function public.get_user_api_key_status() is
  'Return the caller''s DeepSeek key status ({provider, last4,
   configured_at}) or SQL null if none is configured. Never exposes
   plaintext. Errors: not_authenticated.';


-- ---------------------------------------------------------------------
-- 4. delete_user_api_key — remove the caller's key (metadata + vault)
-- ---------------------------------------------------------------------

create or replace function public.delete_user_api_key(
  p_provider text
) returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id   uuid := auth.uid();
  v_secret_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  delete from public.user_api_keys
    where user_id = v_user_id and provider = p_provider
    returning secret_id into v_secret_id;

  if v_secret_id is null then
    return false;
  end if;

  delete from vault.secrets where id = v_secret_id;
  return true;
end;
$$;

revoke execute on function public.delete_user_api_key(text) from public;
grant execute on function public.delete_user_api_key(text) to authenticated;

comment on function public.delete_user_api_key(text) is
  'Delete the caller''s API key row and its Vault secret. Returns true if
   a row existed, false if there was nothing to delete for that provider.
   Errors: not_authenticated.';


-- ---------------------------------------------------------------------
-- 5. worker_get_user_api_key — service_role-only plaintext decrypt
-- ---------------------------------------------------------------------

create or replace function public.worker_get_user_api_key(
  p_user_id  uuid,
  p_provider text
) returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_key text;
begin
  select vs.decrypted_secret into v_key
    from public.user_api_keys uak
    join vault.decrypted_secrets vs on vs.id = uak.secret_id
    where uak.user_id = p_user_id and uak.provider = p_provider;

  return v_key;
end;
$$;

-- service_role only — explicit REVOKE from anon/authenticated (also
-- covered by revoking from public, which anon/authenticated inherit from).
revoke all on function public.worker_get_user_api_key(uuid, text) from public;
revoke execute on function public.worker_get_user_api_key(uuid, text) from anon, authenticated;
grant execute on function public.worker_get_user_api_key(uuid, text) to service_role;

comment on function public.worker_get_user_api_key(uuid, text) is
  'service_role-only: decrypt and return a user''s API key plaintext so the
   worker can inject it into the Tradi subprocess env. p_user_id is
   worker-supplied from the claimed run row, not client-supplied — safe
   because this function is unreachable by anon/authenticated. Returns
   SQL null if no key is configured.';


-- ---------------------------------------------------------------------
-- 6. agent_runs — provider column + relax usage_period_id NOT NULL
-- ---------------------------------------------------------------------

alter table public.agent_runs
  add column if not exists provider text not null default 'deepseek'
    check (provider in ('deepseek'));

comment on column public.agent_runs.provider is
  'LLM provider whose key the worker injected for this run (BYOK pivot).
   Only deepseek is supported today; kept provider-agnostic for later.';

-- BYOK pivot: runs no longer consume a usage_periods row, so new inserts
-- must be able to leave this null. usage_periods/usage_events are kept as
-- historical/analytical tables — a future Paystack rework may repopulate
-- them, this column stays intact for that.
alter table public.agent_runs
  alter column usage_period_id drop not null;

create index if not exists agent_runs_user_created_idx
  on public.agent_runs (user_id, created_at desc);

comment on index public.agent_runs_user_created_idx is
  'Backs the start_agent_run / start_swarm_run rolling-hour count(*) soft
   rate-limit guard (30 runs/hour/user) — a retry-storm safety net, not a
   business quota.';


-- ---------------------------------------------------------------------
-- 7. start_agent_run — quota removed; subscription + key + rate gates
-- ---------------------------------------------------------------------

create or replace function public.start_agent_run(
  p_prompt          text,
  p_max_iter        integer,
  p_idempotency_key text,
  p_attachments     jsonb default '[]'::jsonb
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id   uuid := auth.uid();
  v_run_id    uuid;
  v_run_count integer;
begin
  -- Gate 1: authenticated
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Gate 2: active (flat) subscription — BYOK pivot, no quota to check
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status in ('active', 'trialing')
  ) then
    raise exception 'no_active_subscription' using errcode = 'P0001';
  end if;

  -- Gate 3: user has a DeepSeek key configured (the worker injects it)
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id and provider = 'deepseek'
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Gate 4: soft rate limit — 30 runs / rolling hour / user. A safety net
  -- against retry storms and abusive scripts, not a business quota. A
  -- retried idempotency key doesn't count twice — it falls through to the
  -- unique_violation handler below and returns the original run.
  select count(*) into v_run_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour'
      and idempotency_key is distinct from p_idempotency_key;

  if v_run_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Validate attachments is an array
  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'attachments must be a JSON array' using errcode = '22023';
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments, provider)
    values
    (v_user_id, null, p_prompt, p_max_iter, p_idempotency_key, 'queued',
     'single', p_attachments, 'deepseek')
    returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then   -- idempotency retry: return the existing run
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

grant execute on function public.start_agent_run(text, integer, text, jsonb) to authenticated;
revoke execute on function public.start_agent_run(text, integer, text, jsonb) from anon;

comment on function public.start_agent_run(text, integer, text, jsonb) is
  'Queue a single-prompt agent run. BYOK pivot: no quota consumption —
   gates on active subscription, a configured DeepSeek key, and a
   30-run/hour soft rate limit. Server is the sole authority; client
   tier/key checks are UI only.
   Errors: not_authenticated, no_active_subscription, no_api_key,
   rate_limited.';


-- ---------------------------------------------------------------------
-- 8. start_swarm_run — quota removed; plan + key + rate gates
-- ---------------------------------------------------------------------

create or replace function public.start_swarm_run(
  p_preset_name     text,
  p_user_vars       jsonb,
  p_idempotency_key text
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id   uuid := auth.uid();
  v_plan_id   text;
  v_run_id    uuid;
  v_run_count integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_preset_name is null or length(trim(p_preset_name)) = 0 then
    raise exception 'preset_name required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_user_vars) is distinct from 'object' then
    raise exception 'user_vars must be a JSON object' using errcode = '22023';
  end if;

  -- Plan-tier gate: only Pro or Premium (unchanged by the BYOK pivot)
  select plan_id into v_plan_id
    from public.subscriptions
    where user_id = v_user_id and status in ('active', 'trialing')
    order by current_period_end desc
    limit 1;

  if v_plan_id is null then
    raise exception 'No active subscription' using errcode = 'P0001';
  end if;
  if v_plan_id not in ('pro', 'premium') then
    raise exception 'plan_gate: swarm teams require Pro or Premium' using errcode = 'P0001';
  end if;

  -- BYOK gate: user must have a DeepSeek key configured
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id and provider = 'deepseek'
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Soft rate limit — 30 runs / rolling hour / user, shared with single runs.
  select count(*) into v_run_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour'
      and idempotency_key is distinct from p_idempotency_key;

  if v_run_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, preset_name, user_vars, provider)
    values
    (v_user_id, null,
     format('[swarm:%s] %s', p_preset_name, coalesce(p_user_vars::text, '{}')),
     50,               -- swarms are longer-running; worker caps per-agent
     p_idempotency_key, 'queued',
     'swarm', p_preset_name, p_user_vars, 'deepseek')
    returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

grant execute on function public.start_swarm_run(text, jsonb, text) to authenticated;
revoke execute on function public.start_swarm_run(text, jsonb, text) from anon;

comment on function public.start_swarm_run(text, jsonb, text) is
  'Queue a swarm (multi-agent team) run. Requires Pro or Premium plan and
   a configured DeepSeek key. BYOK pivot: no quota consumption, 30-run/hour
   soft rate limit shared with single runs.
   Errors: not_authenticated, "No active subscription", plan_gate: ...,
   no_api_key, rate_limited.';

commit;
