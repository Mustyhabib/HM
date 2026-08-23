-- =====================================================================
-- Migration: 2026-08-23 — Per-provider model override
-- Author: Auroras
-- Purpose: Let each user choose WHICH MODEL their runs call, per
--   provider. Previously LANGCHAIN_MODEL_NAME always came from the
--   catalog default_model (worker-side), so users on e.g. OpenRouter
--   could not switch models without a code/env change.
--
-- Design:
--   * user_llm_prefs.selected_model — the user's chosen model for their
--     SELECTED provider (nullable = "use catalog default").
--   * agent_runs.model — recorded at enqueue time next to provider, so
--     every run carries an auditable (provider, model) pair and the
--     worker injects exactly what was resolved at enqueue time.
--   * claim_agent_run returns run_model alongside run_provider.
--   * Worker prefers run.model > url-type env override > catalog
--     default. Null model anywhere degrades gracefully to the default.
--
-- Security notes:
--   * Model strings are freeform but length-capped (1..120); they are
--     injected into the engine subprocess env only, never interpolated
--     into shell commands. Validation here is sanity, not security.
--   * set_selected_provider gains an optional p_model arg WITH a
--     default — the existing single-arg call sites stay valid.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------

alter table public.user_llm_prefs
  add column if not exists selected_model text;

alter table public.user_llm_prefs
  drop constraint if exists user_llm_prefs_model_len;

alter table public.user_llm_prefs
  add constraint user_llm_prefs_model_len
  check (selected_model is null or length(selected_model) between 1 and 120);

comment on column public.user_llm_prefs.selected_model is
  'Model the user pinned for their selected provider (e.g.
   deepseek/deepseek-chat on openrouter). NULL = use the catalog
   default_model for that provider.';

alter table public.agent_runs
  add column if not exists model text;

comment on column public.agent_runs.model is
  'LLM model resolved for this run (recorded at enqueue time from
   user_llm_prefs.selected_model). NULL = provider default. The worker
   injects this into LANGCHAIN_MODEL_NAME.';

-- ---------------------------------------------------------------------
-- 2. get_selected_provider — also surface the model
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
  v_model text;
  v_configured boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select p.selected_provider, p.selected_model
    into v_provider, v_model
    from public.user_llm_prefs p
    where p.user_id = v_user_id;

  if v_provider is null then
    return jsonb_build_object('selected_provider', null, 'configured', false,
                              'selected_model', null);
  end if;

  -- Is there actually a credential for it?
  select exists (
    select 1 from public.user_api_keys k
    where k.user_id = v_user_id and k.provider = v_provider
  ) into v_configured;

  return jsonb_build_object(
    'selected_provider', v_provider,
    'configured', v_configured,
    'selected_model', v_model
  );
end;
$$;

revoke execute on function public.get_selected_provider() from public;
grant execute on function public.get_selected_provider() to authenticated;

comment on function public.get_selected_provider() is
  'Return the caller''s selected provider, whether a credential is
   configured for it, and any pinned model (null = provider default).';

-- ---------------------------------------------------------------------
-- 3. set_selected_provider — optional model pin
--    CREATE OR REPLACE adds p_model WITH a default, so the existing
--    single-arg signature remains callable (same function identity,
--    grants survive the replace — re-granted below anyway).
-- ---------------------------------------------------------------------

create or replace function public.set_selected_provider(
  p_provider text,
  p_model    text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_exists  boolean;
  v_has_key boolean;
  v_model   text := nullif(trim(coalesce(p_model, '')), '');
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

  if v_model is not null and length(v_model) > 120 then
    raise exception 'invalid_model_format' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.user_api_keys k
    where k.user_id = v_user_id and k.provider = p_provider
  ) into v_has_key;

  insert into public.user_llm_prefs (user_id, selected_provider, selected_model, updated_at)
    values (v_user_id, p_provider, v_model, now())
  on conflict (user_id) do update
    set selected_provider = excluded.selected_provider,
        selected_model    = excluded.selected_model,
        updated_at        = excluded.updated_at;

  return jsonb_build_object(
    'selected_provider', p_provider,
    'configured', v_has_key,
    'selected_model', v_model
  );
end;
$$;

revoke execute on function public.set_selected_provider(text, text) from public;
grant execute on function public.set_selected_provider(text, text) to authenticated;

comment on function public.set_selected_provider(text, text) is
  'Set the caller''s active provider (+ optional model pin). The provider
   must be in the enabled catalog. p_model empty/null clears the pin ->
   runs use the catalog default. Errors: not_authenticated,
   unsupported_provider, invalid_model_format.';

-- ---------------------------------------------------------------------
-- 4. resolve_run_prefs — provider AND model for a user's next run
--    Same priority as resolve_run_provider (kept for compat): explicit
--    selection with credential first, else first configured credential
--    in catalog order. Model comes from prefs ONLY on the selection
--    branch (a fallback provider has no pinned model -> default).
-- ---------------------------------------------------------------------

create or replace function public.resolve_run_prefs(
  p_user_id uuid
) returns table (provider text, model text)
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_selected text;
  v_model text;
  v_provider text;
begin
  -- 1. explicit selection with a configured credential
  select p.selected_provider, p.selected_model
    into v_selected, v_model
    from public.user_llm_prefs p
    where p.user_id = p_user_id;

  if v_selected is not null then
    if exists (
      select 1 from public.user_api_keys k
      where k.user_id = p_user_id and k.provider = v_selected
    ) then
      return query select v_selected, v_model;
      return;
    end if;
  end if;

  -- 2. first configured credential in catalog sort order (no pinned model)
  select k.provider into v_provider
    from public.user_api_keys k
    join public.llm_provider_catalog c on c.name = k.provider
    where k.user_id = p_user_id
    order by c.sort_order, c.name
    limit 1;

  return query select v_provider, null::text;
end;
$$;

revoke execute on function public.resolve_run_prefs(uuid) from public;
grant execute on function public.resolve_run_prefs(uuid) to authenticated, service_role;

comment on function public.resolve_run_prefs(uuid) is
  'Resolve (provider, model) for a user''s next run: selected provider +
   its pinned model when a credential exists, else the first configured
   credential with model NULL (= catalog default).';

-- ---------------------------------------------------------------------
-- 5. start_agent_run / start_swarm_run / start_shadow_run — record model
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
  v_provider  text;
  v_model     text;
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

  -- BYOK gate: resolve a configured provider (+ model pin).
  select r.provider, r.model into v_provider, v_model
    from public.resolve_run_prefs(v_user_id) r;
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
     kind, attachments, provider, model)
    values
    (v_user_id, null, p_prompt, p_max_iter, p_idempotency_key, 'queued',
     'single', p_attachments, v_provider, v_model)
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
  'Queue a single-prompt agent run. Gates on active subscription, a
   configured provider credential, and a 30-run/hour soft rate limit.
   Resolves (provider, model) and records both on the run row.
   Errors: not_authenticated, no_active_subscription, no_api_key,
           rate_limited.';

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
  v_model     text;
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

  select r.provider, r.model into v_provider, v_model
    from public.resolve_run_prefs(v_user_id) r;
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
     kind, preset_name, user_vars, provider, model)
    values
    (v_user_id, null,
     format('[swarm:%s] %s', p_preset_name, coalesce(p_user_vars::text, '{}')),
     50, p_idempotency_key, 'queued',
     'swarm', p_preset_name, p_user_vars, v_provider, v_model)
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
   credential (resolved like start_agent_run). Records provider+model.
   Errors: not_authenticated, "No active subscription", plan_gate: ...,
           no_api_key, rate_limited.';

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
  v_model     text;
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

  select r.provider, r.model into v_provider, v_model
    from public.resolve_run_prefs(v_user_id) r;
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
     kind, attachments, provider, model)
    values
    (v_user_id, null, p_prompt, 40, p_idempotency_key, 'queued',
     'shadow', p_journal_paths, v_provider, v_model)
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
   credential (resolved like start_agent_run). Records provider+model.
   Errors: not_authenticated, "No active subscription",
           plan_gate: ..., no_api_key, rate_limited.';

-- ---------------------------------------------------------------------
-- 6. claim_agent_run — surface the model to the worker (additive column)
--    Postgres cannot CHANGE the return type of a table-function in place
--    (OUT-parameter row type), so this is drop + recreate inside the same
--    transaction. The worker is the only caller (service_role) and it
--    re-reads the definition per claim; the window is atomic.
-- ---------------------------------------------------------------------

drop function if exists public.claim_agent_run(text, interval);

create or replace function public.claim_agent_run(
  p_worker_id text,
  p_stale_after interval default '00:15:00'::interval
) returns table (
  run_id uuid, run_user_id uuid, run_prompt text, run_max_iter integer,
  run_kind text, run_attachments jsonb, run_preset_name text,
  run_user_vars jsonb, run_provider text, run_model text
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
            r.kind, r.attachments, r.preset_name, r.user_vars,
            r.provider, r.model;
end;
$$;

commit;

-- ================= ROLLBACK (commented) =================
-- begin;
-- alter table public.agent_runs drop column if exists model;
-- alter table public.user_llm_prefs drop column if exists selected_model;
-- drop function if exists public.resolve_run_prefs(uuid);
-- commit;
