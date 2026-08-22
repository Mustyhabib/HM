-- =====================================================================
-- Migration: 2026-08-22 — Ollama BYOK (second provider)
-- Author: Auroras
-- Purpose: Add Ollama as a second BYOK LLM provider alongside DeepSeek.
--   For Ollama the "key" is the user's Ollama server base URL
--   (e.g. http://my-server:11434). The URL is encrypted at rest in
--   Supabase Vault identically to a DeepSeek key — vault is provider-
--   agnostic. The worker injects OLLAMA_BASE_URL + LANGCHAIN_PROVIDER=ollama
--   instead of DEEPSEEK_API_KEY when this provider is resolved.
--
-- Changes:
--   1. user_api_keys.provider CHECK → ('deepseek','ollama')
--   2. agent_runs.provider CHECK → ('deepseek','ollama')
--   3. save_user_api_key — URL validation branch for 'ollama'
--   4. list_user_api_key_statuses() — new RPC, returns all configured providers
--   5. start_agent_run — gate accepts deepseek OR ollama
--   6. start_swarm_run — gate accepts deepseek OR ollama
--   7. start_shadow_run — gate accepts deepseek OR ollama
--
-- Security notes:
--   * The vault pattern is identical to DeepSeek. The URL is treated as
--     a low-sensitivity secret (reveals internal infra) — vault is the
--     right boundary regardless.
--   * key_last4 for a URL is the last 4 chars (e.g. ':443' → ':443',
--     '1434' → '1434'). The 4-char constraint is unchanged.
--   * Worker retains sole authority over which provider to actually use;
--     agent_runs.provider keeps 'deepseek' as the recorded value until
--     the worker can write back the resolved provider (future: add a
--     worker_update_run_provider RPC). This is cosmetic — the run itself
--     uses the correct provider via env injection.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Expand user_api_keys.provider CHECK
-- ---------------------------------------------------------------------

alter table public.user_api_keys
  drop constraint if exists user_api_keys_provider_check;
alter table public.user_api_keys
  add constraint user_api_keys_provider_check
  check (provider in ('deepseek', 'ollama'));

comment on column public.user_api_keys.provider is
  'LLM provider this credential is for. deepseek stores an API key
   (sk-…). ollama stores the user''s Ollama base URL (http://host:port).
   Both are encrypted in vault.secrets and retrieved only by the worker.';


-- ---------------------------------------------------------------------
-- 2. Expand agent_runs.provider CHECK
-- ---------------------------------------------------------------------

alter table public.agent_runs
  drop constraint if exists agent_runs_provider_check;
alter table public.agent_runs
  add constraint agent_runs_provider_check
  check (provider in ('deepseek', 'ollama'));

comment on column public.agent_runs.provider is
  'LLM provider resolved for this run. Recorded at enqueue time as the
   platform default (deepseek); the worker uses whichever provider the
   user actually has configured at execution time.';


-- ---------------------------------------------------------------------
-- 3. save_user_api_key — multi-provider validation
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

  if p_provider not in ('deepseek', 'ollama') then
    raise exception 'unsupported_provider' using errcode = 'P0001';
  end if;

  -- Provider-specific format validation ----------------------------------
  if p_provider = 'deepseek' then
    -- sk-<20+ alnum/underscore/hyphen>, 23–200 chars total.
    if v_key is null
       or length(v_key) < 23
       or length(v_key) > 200
       or v_key !~ '^sk-[A-Za-z0-9_-]{20,}$' then
      raise exception 'invalid_key_format' using errcode = 'P0001';
    end if;
  elsif p_provider = 'ollama' then
    -- HTTP/HTTPS base URL, 10–500 chars. Trailing slashes stripped by client.
    if v_key is null
       or length(v_key) < 10
       or length(v_key) > 500
       or v_key !~ '^https?://.{3,}' then
      raise exception 'invalid_url_format' using errcode = 'P0001';
    end if;
  end if;
  -------------------------------------------------------------------------

  v_last4 := right(v_key, 4);

  -- Capture the outgoing vault secret (if any) before creating the new one.
  select secret_id into v_old_secret
    from public.user_api_keys
    where user_id = v_user_id and provider = p_provider;

  -- Encrypt via Supabase Vault. Fresh UUID in the name so rotations never
  -- collide with the not-yet-deleted outgoing secret.
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

  -- Delete old vault secret only after the new row is committed.
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

-- Grant unchanged — already granted to authenticated.
comment on function public.save_user_api_key(text, text) is
  'Store (or rotate) the caller''s credential for a provider.
   deepseek: validates sk-… API key format.
   ollama: validates HTTP/HTTPS base URL.
   Both are encrypted via Supabase Vault; never returns plaintext.
   Errors: not_authenticated, unsupported_provider,
           invalid_key_format (deepseek), invalid_url_format (ollama).';


-- ---------------------------------------------------------------------
-- 4. list_user_api_key_statuses — return all configured providers
-- ---------------------------------------------------------------------
-- New function. get_user_api_key_status() (DeepSeek-only) is NOT changed
-- so Agent page gating and existing callers remain unaffected.

create or replace function public.list_user_api_key_statuses()
returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider',      provider,
          'last4',         key_last4,
          'configured_at', configured_at
        )
        order by provider
      ),
      '[]'::jsonb
    )
    from public.user_api_keys
    where user_id = v_user_id
  );
end;
$$;

revoke execute on function public.list_user_api_key_statuses() from public;
grant execute on function public.list_user_api_key_statuses() to authenticated;

comment on function public.list_user_api_key_statuses() is
  'Return a JSONB array of {provider, last4, configured_at} for every
   provider the caller has configured. Empty array when none. Never
   exposes plaintext. Errors: not_authenticated.';


-- ---------------------------------------------------------------------
-- 5. start_agent_run — gate on deepseek OR ollama
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

  -- Gate 2: active subscription
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status in ('active', 'trialing')
  ) then
    raise exception 'no_active_subscription' using errcode = 'P0001';
  end if;

  -- Gate 3: any BYOK credential configured (deepseek OR ollama)
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id and provider in ('deepseek', 'ollama')
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Gate 4: soft rate limit — 30 runs / rolling hour / user
  select count(*) into v_run_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour'
      and idempotency_key is distinct from p_idempotency_key;

  if v_run_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

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
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

comment on function public.start_agent_run(text, integer, text, jsonb) is
  'Queue a single-prompt agent run. BYOK pivot: no quota — gates on active
   subscription, a configured deepseek OR ollama credential, and a
   30-run/hour soft rate limit. The worker resolves the actual provider at
   execution time (deepseek first, ollama fallback).
   Errors: not_authenticated, no_active_subscription, no_api_key,
           rate_limited.';


-- ---------------------------------------------------------------------
-- 6. start_swarm_run — gate on deepseek OR ollama
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

  -- Plan-tier gate: only Pro or Premium
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

  -- BYOK gate: deepseek OR ollama
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id and provider in ('deepseek', 'ollama')
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Soft rate limit — 30 runs / rolling hour / user
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
     50, p_idempotency_key, 'queued',
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

comment on function public.start_swarm_run(text, jsonb, text) is
  'Queue a swarm run. Requires Pro/Premium and a deepseek OR ollama
   credential. BYOK pivot: no quota, 30-run/hour soft rate limit shared
   with single runs.
   Errors: not_authenticated, "No active subscription", plan_gate: ...,
           no_api_key, rate_limited.';


-- ---------------------------------------------------------------------
-- 7. start_shadow_run — gate on deepseek OR ollama
-- ---------------------------------------------------------------------

create or replace function public.start_shadow_run(
  p_prompt          text,
  p_idempotency_key text,
  p_journal_paths   jsonb default '[]'::jsonb
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

  -- Plan-tier gate: Premium only (shadow account is a Premium feature)
  select plan_id into v_plan_id
    from public.subscriptions
    where user_id = v_user_id and status in ('active', 'trialing')
    order by current_period_end desc
    limit 1;

  if v_plan_id is null then
    raise exception 'No active subscription' using errcode = 'P0001';
  end if;
  if v_plan_id <> 'premium' then
    raise exception 'plan_gate: shadow account requires Premium' using errcode = 'P0001';
  end if;

  -- BYOK gate: deepseek OR ollama
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id and provider in ('deepseek', 'ollama')
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Soft rate limit — 30 runs / rolling hour / user
  select count(*) into v_run_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour'
      and idempotency_key is distinct from p_idempotency_key;

  if v_run_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_journal_paths) <> 'array' then
    raise exception 'journal_paths must be a JSON array' using errcode = '22023';
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments, provider)
    values
    (v_user_id, null, p_prompt, 40, p_idempotency_key, 'queued',
     'shadow', p_journal_paths, 'deepseek')
    returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

-- Grants: same as the original start_shadow_run — authenticated only.
grant execute on function public.start_shadow_run(text, text, jsonb) to authenticated;
revoke execute on function public.start_shadow_run(text, text, jsonb) from anon;

comment on function public.start_shadow_run(text, text, jsonb) is
  'Queue a shadow account run (journal → strategy → backtest → report).
   Requires Premium plan and a deepseek OR ollama credential.
   Errors: not_authenticated, "No active subscription",
           plan_gate: ..., no_api_key, rate_limited.';

commit;
