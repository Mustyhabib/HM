-- Multi-provider BYOK migration
--
-- Expands the BYOK system from (deepseek, ollama) to support ALL providers
-- defined in Tradi/agent/src/providers/llm_providers.json.
--
-- Changes:
--   1. user_api_keys.provider CHECK → open text (no enum — the app layer
--      validates against the catalog; DB just stores it)
--   2. agent_runs.provider CHECK → same open text
--   3. save_user_api_key — generic API key validation (non-empty, trimmed)
--      with special-case URL validation for ollama/copilot (base-URL providers)
--   4. start_agent_run — gate accepts ANY configured provider
--   5. start_swarm_run — same
--   6. start_shadow_run — same
--
-- Security notes:
--   * Vault pattern identical to before — credential is stored as a vault
--     secret and decrypted only by the worker via worker_get_user_api_key.
--   * The provider name is validated by the frontend + worker against the
--     llm_providers.json catalog; the DB stores it as free text to avoid
--     needing a migration every time a provider is added upstream.
--   * RLS unchanged — user_api_keys has zero policies (default deny);
--     all access via SECURITY DEFINER RPCs.

begin;

-- ---------------------------------------------------------------------
-- 1. Drop restrictive CHECK on user_api_keys.provider
-- ---------------------------------------------------------------------

alter table public.user_api_keys
  drop constraint if exists user_api_keys_provider_check;

comment on column public.user_api_keys.provider is
  'LLM provider name (matches llm_providers.json "name" field).
   API-key providers store an API key; base-URL providers (ollama, copilot)
   store a URL. All encrypted in vault.secrets.';


-- ---------------------------------------------------------------------
-- 2. Drop restrictive CHECK on agent_runs.provider
-- ---------------------------------------------------------------------

alter table public.agent_runs
  drop constraint if exists agent_runs_provider_check;

comment on column public.agent_runs.provider is
  'LLM provider resolved for this run. Recorded at enqueue time as the
   default; the worker uses whichever provider the user actually has
   configured at execution time.';


-- ---------------------------------------------------------------------
-- 3. save_user_api_key — generic multi-provider validation
-- ---------------------------------------------------------------------

create or replace function public.save_user_api_key(
  p_provider text,
  p_api_key  text
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id  uuid;
  v_trimmed  text;
  v_last4    text;
  v_secret_id uuid;
  v_old_secret uuid;
begin
  -- Auth gate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Provider must be a non-empty string
  if p_provider is null or trim(p_provider) = '' then
    raise exception 'unsupported_provider' using errcode = 'P0001';
  end if;

  v_trimmed := trim(p_api_key);
  if v_trimmed = '' then
    raise exception 'invalid_key_format' using errcode = 'P0001';
  end if;

  -- Provider-specific validation
  -- Base-URL providers (no API key — they store a URL)
  if p_provider in ('ollama', 'copilot') then
    if v_trimmed !~ '^https?://.{3,}$' then
      raise exception 'invalid_url_format' using errcode = 'P0001';
    end if;
  -- DeepSeek special case (sk-… key format)
  elsif p_provider = 'deepseek' then
    if v_trimmed !~ '^sk-[A-Za-z0-9_-]{20,}$' then
      raise exception 'invalid_key_format' using errcode = 'P0001';
    end if;
  -- All other API-key providers: just require non-empty (at least 10 chars)
  else
    if length(v_trimmed) < 10 then
      raise exception 'invalid_key_format' using errcode = 'P0001';
    end if;
  end if;

  v_last4 := right(v_trimmed, 4);

  -- Capture the outgoing vault secret (if any) before creating the new one.
  select secret_id into v_old_secret
    from public.user_api_keys
    where user_id = v_user_id and provider = p_provider;

  -- Encrypt via Supabase Vault.
  select vault.create_secret(v_trimmed,
    format('user_api_key:%s:%s:%s', v_user_id, p_provider, gen_random_uuid())
  ) into v_secret_id;

  insert into public.user_api_keys (user_id, provider, secret_id, key_last4)
    values (v_user_id, p_provider, v_secret_id, v_last4)
  on conflict (user_id, provider) do update
    set secret_id     = excluded.secret_id,
        key_last4     = excluded.key_last4,
        updated_at    = now();

  -- Clean up the old vault secret after the upsert succeeds.
  if v_old_secret is not null then
    perform vault.delete_secret(v_old_secret);
  end if;

  return jsonb_build_object(
    'provider',      p_provider,
    'last4',         v_last4,
    'configured_at', now()
  );
end;
$$;

comment on function public.save_user_api_key(text, text) is
  'Store (or rotate) the caller''s credential for any supported LLM provider.
   Provider-specific validation: deepseek requires sk-… format; ollama/copilot
   require http/https URL; all others require at least 10 chars.
   Encrypted via Supabase Vault; never returns plaintext.
   Errors: not_authenticated, unsupported_provider,
           invalid_key_format, invalid_url_format.';


-- ---------------------------------------------------------------------
-- 4. start_agent_run — gate on ANY configured provider
-- ---------------------------------------------------------------------

create or replace function public.start_agent_run(
  p_prompt          text,
  p_max_iter        integer default 5,
  p_idempotency_key text    default null,
  p_attachments     jsonb   default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id uuid;
  v_run_id  uuid;
  v_count   integer;
begin
  -- Gate 1: authenticated
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Gate 2: active subscription
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'no_active_subscription' using errcode = 'P0001';
  end if;

  -- Gate 3: any BYOK credential configured (any provider)
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Gate 4: 30-run/hour soft rate limit
  select count(*) into v_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour';
  if v_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments, provider)
    values
    (v_user_id, null, p_prompt, p_max_iter, p_idempotency_key, 'queued',
     'single', p_attachments, 'deepseek')
    returning id into v_run_id;

  return v_run_id;
end;
$$;

comment on function public.start_agent_run(text, integer, text, jsonb) is
  'Queue a single-prompt agent run. BYOK pivot: no quota — gates on active
   subscription, any configured LLM credential, and a 30-run/hour soft rate
   limit. The worker resolves the actual provider at execution time.
   Errors: not_authenticated, no_active_subscription, no_api_key,
           rate_limited.';


-- ---------------------------------------------------------------------
-- 5. start_swarm_run — gate on ANY configured provider
-- ---------------------------------------------------------------------

create or replace function public.start_swarm_run(
  p_preset_name     text,
  p_user_vars       jsonb   default null,
  p_idempotency_key text    default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id uuid;
  v_run_id  uuid;
  v_count   integer;
begin
  -- Auth gate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Active subscription
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'No active subscription' using errcode = 'P0001';
  end if;

  -- Plan gate: Pro or Premium for swarm
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status = 'active'
      and plan_id in ('pro', 'premium')
  ) then
    raise exception 'plan_gate: swarm teams require Pro or Premium' using errcode = 'P0001';
  end if;

  -- BYOK gate: any configured provider
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- 30/hr rate limit (shared with single runs)
  select count(*) into v_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour';
  if v_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, preset_name, user_vars, provider)
    values
    (v_user_id, null, 'swarm:' || p_preset_name, 5, p_idempotency_key, 'queued',
     'swarm', p_preset_name, p_user_vars, 'deepseek')
    returning id into v_run_id;

  return v_run_id;
end;
$$;

comment on function public.start_swarm_run(text, jsonb, text) is
  'Queue a swarm run. Requires Pro/Premium and any configured LLM
   credential. BYOK pivot: no quota, 30-run/hour soft rate limit shared
   with single runs.
   Errors: not_authenticated, "No active subscription", plan_gate: ...,
           no_api_key, rate_limited.';


-- ---------------------------------------------------------------------
-- 6. start_shadow_run — gate on ANY configured provider
-- ---------------------------------------------------------------------

create or replace function public.start_shadow_run(
  p_journal_file    text,
  p_journal_storage text    default null,
  p_attachments     jsonb   default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id uuid;
  v_run_id  uuid;
  v_count   integer;
  v_attach  jsonb;
begin
  -- Auth gate
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Active subscription
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status = 'active'
  ) then
    raise exception 'No active subscription' using errcode = 'P0001';
  end if;

  -- Plan gate: Premium only for shadow
  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status = 'active'
      and plan_id = 'premium'
  ) then
    raise exception 'plan_gate: shadow account requires Premium' using errcode = 'P0001';
  end if;

  -- BYOK gate: any configured provider
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- 30/hr rate limit (shared)
  select count(*) into v_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour';
  if v_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Build attachments array
  if p_journal_storage is not null then
    v_attach := jsonb_build_array(p_journal_storage);
  elsif p_attachments is not null then
    v_attach := p_attachments;
  else
    v_attach := jsonb_build_array(p_journal_file);
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments, provider)
    values
    (v_user_id, null,
     'shadow account analysis: ' || p_journal_file,
     10, null, 'queued', 'shadow', v_attach, 'deepseek')
    returning id into v_run_id;

  return v_run_id;
end;
$$;

comment on function public.start_shadow_run(text, text, jsonb) is
  'Queue a shadow account run (journal → strategy → backtest → report).
   Requires Premium plan and any configured LLM credential.
   Errors: not_authenticated, "No active subscription",
           plan_gate: ..., no_api_key, rate_limited.';

commit;
