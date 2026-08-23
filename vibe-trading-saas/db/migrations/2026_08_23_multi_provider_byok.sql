-- =====================================================================
-- Migration: 2026-08-23 — Multi-provider BYOK (catalog-driven)
-- Author: Auroras
-- Purpose: Open the SaaS BYOK layer to the full LLM provider catalog
--   (Tradi/agent/src/providers/llm_providers.json), replacing the
--   hardcoded deepseek|ollama gates. The engine already supports all
--   of these providers; only the SaaS wrapper + worker + frontend were
--   pinned to deepseek/ollama.
--
-- Scope decision: web BYOK accepts all 23 key/URL providers from the
--   catalog. The 2 OAuth/gh_cli providers (openai-codex, copilot) are
--   EXCLUDED — they require an interactive CLI login the worker cannot
--   perform. They remain usable only via the engine's own CLI.
--
-- Changes:
--   1. llm_provider_catalog table (single source of truth, populated
--      below) + list_supported_llm_providers() RPC — read by BOTH the
--      worker (cached at boot) and the frontend (provider picker).
--   2. user_api_keys.provider CHECK -> all 23 catalog providers
--      (service-category, so a future catalog addition is a data
--      insert, never a migration).
--   3. agent_runs.provider CHECK -> same 23 providers.
--   4. save_user_api_key — generic validation via the catalog
--      (non-empty secret for key providers, http(s) URL for ollama).
--   5. user_llm_prefs table + get/set_selected_provider RPCs — the
--      per-user "active provider" the runs resolve to.
--   6. start_agent_run / start_swarm_run / start_shadow_run — gate on
--      the selected provider (or any configured provider as fallback),
--      and record the resolved provider on the run row for audit.
--
-- Security notes:
--   * The vault pattern is unchanged — secrets are provider-agnostic.
--   * validation lives server-side in save_user_api_key; the client
--     only mirrors it for fast feedback. The RPC is the authority.
--   * catalog rows are service-role managed (seeded here); users never
--     write to them. list_supported_llm_providers is granted to
--     authenticated so the Profile picker can render the catalog.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. llm_provider_catalog — single source of truth for web BYOK
-- ---------------------------------------------------------------------
-- Service-category column: a provider belongs to 'key' (requires an
-- API key) or 'url' (requires a base URL, e.g. self-hosted Ollama).
-- PROVIDER_TYPE is computed at seed time; the worker/frontend read it
-- to decide whether to ask for a key or a URL. We do NOT add a CHECK on
-- user_api_keys.provider tied to this list's literal values — instead we
-- validate against the catalog at write time inside save_user_api_key,
-- so adding a provider later is a pure INSERT, not a DDL change.

create table if not exists public.llm_provider_catalog (
  name              text primary key,
  label             text not null,
  api_key_env       text,
  base_url_env      text,
  default_model     text not null,
  default_base_url  text not null,
  base_url_options  jsonb not null default '[]'::jsonb,
  provider_type     text not null check (provider_type in ('key', 'url')),
  auth_type         text,
  login_command     text,
  sort_order        integer not null default 0,
  enabled           boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on table public.llm_provider_catalog is
  'Authoritative list of LLM providers the SaaS accepts for web BYOK.
   Mirrors Tradi/agent/src/providers/llm_providers.json but excludes the
   2 OAuth/gh_cli providers (openai-codex, copilot). Seeded by the
   2026_08_23 migration; the worker caches it at boot and the frontend
   renders it as the provider picker.';

-- Seed from the engine catalog. OAuth/gh_cli providers are intentionally
-- omitted (auth_type in ('oauth','gh_cli')). provider_type: 'url' when
-- api_key_env is null (only Ollama today), else 'key'.
insert into public.llm_provider_catalog
  (name, label, api_key_env, base_url_env, default_model, default_base_url,
   base_url_options, provider_type, auth_type, login_command, sort_order)
values
  ('openrouter',        'OpenRouter',                          'OPENROUTER_API_KEY',     'OPENROUTER_BASE_URL',     'deepseek/deepseek-v4-pro',            'https://openrouter.ai/api/v1',            '[]'::jsonb, 'key', null, null, 10),
  ('requesty',          'Requesty',                            'REQUESTY_API_KEY',       'REQUESTY_BASE_URL',       'openai/gpt-4o-mini',                  'https://router.requesty.ai/v1',           '[]'::jsonb, 'key', null, null, 11),
  ('openai',            'OpenAI',                              'OPENAI_API_KEY',         'OPENAI_BASE_URL',         'gpt-5.5',                             'https://api.openai.com/v1',               '[]'::jsonb, 'key', null, null, 20),
  ('anthropic',         'Anthropic / Messages API Proxy',      'ANTHROPIC_API_KEY',      'ANTHROPIC_BASE_URL',      'claude-sonnet-4-6',                   'https://api.anthropic.com',               '[]'::jsonb, 'key', null, null, 21),
  ('deepseek',          'DeepSeek',                            'DEEPSEEK_API_KEY',       'DEEPSEEK_BASE_URL',       'deepseek-v4-pro',                     'https://api.deepseek.com/v1',             '[]'::jsonb, 'key', null, null, 30),
  ('siliconflow-cn',    'SiliconFlow (CN)',                   'SILICONFLOW_API_KEY',    'SILICONFLOW_BASE_URL',    'deepseek-ai/DeepSeek-V3.1-Terminus',  'https://api.siliconflow.cn/v1',           '[]'::jsonb, 'key', null, null, 40),
  ('siliconflow-global','SiliconFlow (Global)',               'SILICONFLOW_GLOBAL_API_KEY','SILICONFLOW_GLOBAL_BASE_URL','deepseek-ai/DeepSeek-V3.1-Terminus','https://api.siliconflow.com/v1',       '[]'::jsonb, 'key', null, null, 41),
  ('nvidia',            'NVIDIA NIM',                          'NVIDIA_API_KEY',         'NVIDIA_BASE_URL',         'nvidia/nemotron-3-ultra-550b-a55b',   'https://integrate.api.nvidia.com/v1',     '[]'::jsonb, 'key', null, null, 50),
  ('gemini',            'Gemini',                             'GEMINI_API_KEY',         'GEMINI_BASE_URL',         'gemini-3.5-flash',                    'https://generativelanguage.googleapis.com/v1beta/openai/','[]'::jsonb, 'key', null, null, 60),
  ('groq',              'Groq',                               'GROQ_API_KEY',           'GROQ_BASE_URL',           'meta-llama/llama-4-maverick-17b-128e-instruct','https://api.groq.com/openai/v1',    '[]'::jsonb, 'key', null, null, 61),
  ('novita',            'Novita AI',                          'NOVITA_API_KEY',         'NOVITA_BASE_URL',         'moonshotai/kimi-k3',                  'https://api.novita.ai/openai',            '[]'::jsonb, 'key', null, null, 70),
  ('dashscope',         'DashScope / Qwen',                   'DASHSCOPE_API_KEY',      'DASHSCOPE_BASE_URL',      'qwen-plus-latest',                    'https://dashscope.aliyuncs.com/compatible-mode/v1','[]'::jsonb, 'key', null, null, 80),
  ('qwen',              'Qwen',                               'DASHSCOPE_API_KEY',      'DASHSCOPE_BASE_URL',      'qwen-plus-latest',                    'https://dashscope.aliyuncs.com/compatible-mode/v1','[]'::jsonb, 'key', null, null, 81),
  ('zhipu',             'Zhipu',                              'ZHIPU_API_KEY',          'ZHIPU_BASE_URL',          'glm-5.1',                             'https://open.bigmodel.cn/api/paas/v4',   '[]'::jsonb, 'key', null, null, 90),
  ('glm',               'GLM (Zhipu)',                        'ZHIPU_API_KEY',          'ZHIPU_BASE_URL',          'glm-5.1',                             'https://open.bigmodel.cn/api/paas/v4',   '[]'::jsonb, 'key', null, null, 91),
  ('moonshot',          'Moonshot / Kimi',                    'MOONSHOT_API_KEY',       'MOONSHOT_BASE_URL',       'kimi-k2.6',                           'https://api.moonshot.ai/v1',              '[]'::jsonb, 'key', null, null, 100),
  ('kimi-coding',       'Kimi for Coding (subscription plan)','KIMI_CODING_API_KEY',   'KIMI_CODING_BASE_URL',    'kimi-for-coding',                     'https://api.kimi.com/coding/v1',          '[]'::jsonb, 'key', null, null, 101),
  ('minimax',           'MiniMax',                            'MINIMAX_API_KEY',        'MINIMAX_BASE_URL',        'MiniMax-M3',                          'https://api.minimax.io/v1',               '["https://api.minimax.io/v1","https://api.minimaxi.com/v1"]'::jsonb, 'key', null, null, 110),
  ('mimo',              'Xiaomi MIMO',                        'MIMO_API_KEY',           'MIMO_BASE_URL',           'MiMo-72B-A27B',                       'https://api.xiaomimimo.com/v1',           '[]'::jsonb, 'key', null, null, 120),
  ('spark',             'iFlytek Spark',                      'SPARK_API_KEY',          'SPARK_BASE_URL',          '4.0Ultra',                            'https://spark-api-open.xf-yun.com/v1',    '[]'::jsonb, 'key', null, null, 130),
  ('zai',               'Z.ai',                               'ZAI_API_KEY',            'ZAI_BASE_URL',            'glm-5.1',                             'https://api.z.ai/api/coding/paas/v4',     '[]'::jsonb, 'key', null, null, 140),
  ('modelscope',        'ModelScope',                         'MODELSCOPE_API_KEY',     'MODELSCOPE_BASE_URL',     'Qwen/Qwen3.5-27B',                    'https://api-inference.modelscope.cn/v1', '[]'::jsonb, 'key', null, null, 150),
  ('ollama',            'Ollama',                             null,                     'OLLAMA_BASE_URL',         'qwen2.5:32b',                         'http://localhost:11434',                 '[]'::jsonb, 'url', null, null, 200)
on conflict (name) do update set
  label            = excluded.label,
  api_key_env      = excluded.api_key_env,
  base_url_env     = excluded.base_url_env,
  default_model    = excluded.default_model,
  default_base_url = excluded.default_base_url,
  base_url_options = excluded.base_url_options,
  provider_type    = excluded.provider_type,
  auth_type        = excluded.auth_type,
  login_command    = excluded.login_command,
  sort_order       = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 1b. list_supported_llm_providers — catalog for worker + frontend
-- ---------------------------------------------------------------------

create or replace function public.list_supported_llm_providers()
returns jsonb
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name',             c.name,
        'label',            c.label,
        'api_key_env',      c.api_key_env,
        'base_url_env',     c.base_url_env,
        'default_model',    c.default_model,
        'default_base_url', c.default_base_url,
        'base_url_options', c.base_url_options,
        'provider_type',    c.provider_type,
        'auth_type',        c.auth_type,
        'login_command',    c.login_command
      )
      order by c.sort_order, c.name
    ),
    '[]'::jsonb
  )
  from public.llm_provider_catalog c
  where c.enabled;
$$;

revoke execute on function public.list_supported_llm_providers() from public;
grant execute on function public.list_supported_llm_providers() to authenticated, service_role;

comment on function public.list_supported_llm_providers() is
  'Return the web-BYOK provider catalog as JSONB (shape matches the
   frontend LLMProviderOption). Single source of truth for the worker
   (cached at boot) and the Profile provider picker. Excludes OAuth/gh_cli
   providers. Errors: none (returns [] when empty).';

-- ---------------------------------------------------------------------
-- 2. Expand user_api_keys.provider CHECK (service-category)
-- ---------------------------------------------------------------------
-- We validate against the catalog at write time (save_user_api_key), so
-- the CHECK does not enumerate literal names; it only guarantees the
-- stored provider exists in the catalog. This keeps future additions as
-- pure data inserts.

-- Postgres forbids subqueries in CHECK constraints, so the catalog link is
-- a foreign key to llm_provider_catalog(name) instead: same invariant (the
-- stored provider exists in the catalog), and future additions stay pure
-- data inserts.

alter table public.user_api_keys
  drop constraint if exists user_api_keys_provider_check;

alter table public.user_api_keys
  add constraint user_api_keys_provider_fkey
  foreign key (provider) references public.llm_provider_catalog(name);

comment on column public.user_api_keys.provider is
  'LLM provider this credential is for. Constrained to the seeded
   llm_provider_catalog. key-type providers store an API key; url-type
   providers (ollama) store a base URL. Both encrypted in vault.secrets.';

-- ---------------------------------------------------------------------
-- 3. Expand agent_runs.provider CHECK
-- ---------------------------------------------------------------------

alter table public.agent_runs
  drop constraint if exists agent_runs_provider_check;

alter table public.agent_runs
  add constraint agent_runs_provider_fkey
  foreign key (provider) references public.llm_provider_catalog(name);

comment on column public.agent_runs.provider is
  'LLM provider resolved for this run. Recorded at enqueue time from the
   user''s selected provider (user_llm_prefs); the worker injects that
   provider''s credential into the engine subprocess.';
-- END PART 1

-- ---------------------------------------------------------------------
-- 4. save_user_api_key — generic, catalog-driven validation
-- ---------------------------------------------------------------------
-- Replaces the deepseek/ollama hardcoded branches. Validation now reads
-- the catalog: a 'key' provider requires a non-empty secret (any format
-- — we no longer enforce sk-…, which broke OpenAI/Anthropic/etc.),
-- a 'url' provider requires an http(s) URL. The provider must exist in
-- the catalog and be enabled.

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
  v_type       text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Provider must exist + be enabled in the catalog.
  select provider_type into v_type
    from public.llm_provider_catalog
    where name = p_provider and enabled;

  if v_type is null then
    raise exception 'unsupported_provider' using errcode = 'P0001';
  end if;

  -- Generic format validation per provider type.
  if v_type = 'key' then
    -- Any non-empty secret. We deliberately do NOT hardcode a prefix
    -- (sk-… wrongly rejects OpenAI/Anthropic/Gemini/etc.). Length cap
    -- prevents accidental megabyte pastes / vault abuse.
    if v_key is null or length(v_key) < 1 or length(v_key) > 2000 then
      raise exception 'invalid_key_format' using errcode = 'P0001';
    end if;
  elsif v_type = 'url' then
    -- HTTP/HTTPS base URL, 10–500 chars.
    if v_key is null
       or length(v_key) < 10
       or length(v_key) > 500
       or v_key !~ '^https?://.{3,}' then
      raise exception 'invalid_url_format' using errcode = 'P0001';
    end if;
  else
    -- Defensive: unknown type should never reach here.
    raise exception 'unsupported_provider' using errcode = 'P0001';
  end if;

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

  -- Keep the user's selection in sync: first key configured becomes the
  -- selected provider if they have no explicit selection yet.
  insert into public.user_llm_prefs (user_id, selected_provider)
    values (v_user_id, p_provider)
  on conflict (user_id) do nothing;

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
  'Store (or rotate) the caller''s credential for a catalog provider.
   key-type: validates non-empty secret (no prefix enforcement).
   url-type (ollama): validates http(s) URL.
   Both encrypted via Supabase Vault; never returns plaintext.
   Errors: not_authenticated, unsupported_provider,
           invalid_key_format, invalid_url_format.';

-- ---------------------------------------------------------------------
-- 5. user_llm_prefs — per-user active provider selection
-- ---------------------------------------------------------------------

create table if not exists public.user_llm_prefs (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  selected_provider text not null,
  updated_at        timestamptz not null default now(),
  constraint user_llm_prefs_selected_fk
    foreign key (selected_provider)
    references public.llm_provider_catalog(name)
);

comment on table public.user_llm_prefs is
  'Per-user active LLM provider for runs. The worker resolves this to
   the credential to inject. Inserted by save_user_api_key (first key
   wins) and overwritten by set_selected_provider.';

-- ---------------------------------------------------------------------
-- 5b. get/set selected provider
-- ---------------------------------------------------------------------

create or replace function public.get_selected_provider()
returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_provider text;
  v_configured boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select p.selected_provider into v_provider
    from public.user_llm_prefs p
    where p.user_id = v_user_id;

  if v_provider is null then
    return jsonb_build_object('selected_provider', null, 'configured', false);
  end if;

  -- Is there actually a credential for it?
  select exists (
    select 1 from public.user_api_keys k
    where k.user_id = v_user_id and k.provider = v_provider
  ) into v_configured;

  return jsonb_build_object(
    'selected_provider', v_provider,
    'configured', v_configured
  );
end;
$$;

revoke execute on function public.get_selected_provider() from public;
grant execute on function public.get_selected_provider() to authenticated;

comment on function public.get_selected_provider() is
  'Return the caller''s selected provider name + whether a credential is
   configured for it. selected_provider is null when never set.';

create or replace function public.set_selected_provider(
  p_provider text
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_exists  boolean;
  v_has_key boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.llm_provider_catalog c
    where c.name = p_provider and c.enabled
  ) into v_exists;

  if not v_exists then
    raise exception 'unsupported_provider' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.user_api_keys k
    where k.user_id = v_user_id and k.provider = p_provider
  ) into v_has_key;

  insert into public.user_llm_prefs (user_id, selected_provider, updated_at)
    values (v_user_id, p_provider, now())
  on conflict (user_id) do update
    set selected_provider = excluded.selected_provider,
        updated_at        = excluded.updated_at;

  return jsonb_build_object(
    'selected_provider', p_provider,
    'configured', v_has_key
  );
end;
$$;

revoke execute on function public.set_selected_provider(text) from public;
grant execute on function public.set_selected_provider(text) to authenticated;

comment on function public.set_selected_provider(text) is
  'Set the caller''s active provider for runs. The provider must be in
   the enabled catalog (errors unsupported_provider otherwise). Returns
   whether a credential is already configured for it.';
-- END PART 2

-- ---------------------------------------------------------------------
-- 6. start_*_run — resolve + record the selected provider
-- ---------------------------------------------------------------------
-- Helper: pick the provider a run should use. Priority:
--   1. the user's explicit selection (user_llm_prefs) IF a credential
--      exists for it;
--   2. otherwise, the first configured credential (catalog sort order);
--   3. else NULL -> caller raises no_api_key.
-- Returns the provider name or NULL.

create or replace function public.resolve_run_provider(
  p_user_id uuid
) returns text
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_selected text;
  v_provider text;
begin
  -- 1. explicit selection with a configured credential
  select p.selected_provider into v_selected
    from public.user_llm_prefs p
    where p.user_id = p_user_id;

  if v_selected is not null then
    if exists (
      select 1 from public.user_api_keys k
      where k.user_id = p_user_id and k.provider = v_selected
    ) then
      return v_selected;
    end if;
  end if;

  -- 2. first configured credential in catalog sort order
  select k.provider into v_provider
    from public.user_api_keys k
    join public.llm_provider_catalog c on c.name = k.provider
    where k.user_id = p_user_id
    order by c.sort_order, c.name
    limit 1;

  return v_provider; -- may be null
end;
$$;

revoke execute on function public.resolve_run_provider(uuid) from public;
grant execute on function public.resolve_run_provider(uuid) to authenticated;

comment on function public.resolve_run_provider(uuid) is
  'Pick the provider for a user''s next run: the selected provider when a
   credential exists for it, else the first configured credential by
   catalog order. NULL when the user has no credential at all.';

-- 6a. start_agent_run

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
  v_provider  text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where user_id = v_user_id and status in ('active', 'trialing')
  ) then
    raise exception 'no_active_subscription' using errcode = 'P0001';
  end if;

  -- BYOK gate: resolve a configured provider (selected first, else first).
  v_provider := public.resolve_run_provider(v_user_id);
  if v_provider is null then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

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
     'single', p_attachments, v_provider)
    returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

grant execute on function public.start_agent_run(text, integer, text, jsonb) to authenticated;
revoke execute on function public.start_agent_run(text, integer, text, jsonb) from anon;

comment on function public.start_agent_run(text, integer, text, jsonb) is
  'Queue a single-prompt agent run. BYOK pivot: gates on active
   subscription, a configured provider credential, and a 30-run/hour soft
   rate limit. Resolves the run provider (selected first, else first
   configured) and records it on agent_runs.provider.
   Errors: not_authenticated, no_active_subscription, no_api_key,
           rate_limited.';

-- 6b. start_swarm_run

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
  v_provider  text;
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

  v_provider := public.resolve_run_provider(v_user_id);
  if v_provider is null then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

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
     'swarm', p_preset_name, p_user_vars, v_provider)
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
  'Queue a swarm run. Requires Pro/Premium and a configured provider
   credential (resolved like start_agent_run). Records the provider.
   Errors: not_authenticated, "No active subscription", plan_gate: ...,
           no_api_key, rate_limited.';

-- 6c. start_shadow_run

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
  v_provider  text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

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

  v_provider := public.resolve_run_provider(v_user_id);
  if v_provider is null then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

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
     'shadow', p_journal_paths, v_provider)
    returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

grant execute on function public.start_shadow_run(text, text, jsonb) to authenticated;
revoke execute on function public.start_shadow_run(text, text, jsonb) from anon;

comment on function public.start_shadow_run(text, text, jsonb) is
  'Queue a shadow account run. Requires Premium and a configured provider
   credential (resolved like start_agent_run). Records the provider.
   Errors: not_authenticated, "No active subscription",
           plan_gate: ..., no_api_key, rate_limited.';

-- 7. claim_agent_run — surface the resolved provider to the worker
--    The start_*_run gates now resolve + record the provider on
--    agent_runs.provider; the worker reads it via run_provider to know
--    which credential to inject. Additive: adds one returned column.

create or replace function public.claim_agent_run(
  p_worker_id text,
  p_stale_after interval default '00:15:00'::interval
) returns table (
  run_id uuid, run_user_id uuid, run_prompt text, run_max_iter integer,
  run_kind text, run_attachments jsonb, run_preset_name text,
  run_user_vars jsonb, run_provider text
)
  language plpgsql
  security definer
  set search_path to ''
as $$
declare
  v_run_id uuid;
begin
  select r.id
    into v_run_id
    from public.agent_runs r
   where r.status = 'queued'
      or (r.status = 'running' and r.claimed_at < now() - p_stale_after)
   order by r.created_at
   limit 1
   for update skip locked;

  if v_run_id is null then
    return;
  end if;

  return query
  update public.agent_runs r
     set status     = 'running',
         claimed_by = p_worker_id,
         claimed_at = now(),
         started_at = coalesce(r.started_at, now())
   where r.id = v_run_id
  returning r.id, r.user_id, r.prompt, r.max_iter,
            r.kind, r.attachments, r.preset_name, r.user_vars, r.provider;
end;
$$;

-- 8. get_user_api_key_status + worker_get_user_api_key are already
--    provider-agnostic (take p_provider); no change required.

commit;

