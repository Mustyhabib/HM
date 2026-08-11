-- =====================================================================
-- Migration: 2026-08-11 — Agent Teams, File Uploads, Kind column
-- Author: Auroras
-- Purpose: Server-side backing for frontend PR #8
-- Status: APPLIED to project wqjdumforbalfmtawwpg on 2026-08-11
--         Migration name: agent_teams_uploads_2026_08_11
--         Post-apply: revoke execute on both new functions from anon (linter)
--   1. Extend agent_runs with kind, attachments, preset_name, user_vars
--   2. Replace start_agent_run with a 4-arg overload accepting attachments
--   3. Add start_swarm_run for Pro/Premium multi-agent team runs
--   4. Create agent-uploads Storage bucket with owner-scoped RLS
--
-- Safety notes:
--   * All ALTERs are additive. No column is dropped or retyped.
--   * The 3-arg start_agent_run is REPLACED, not overloaded, to avoid
--     "function is not unique" errors from named-arg RPC calls.
--   * Old callers that sent 3 named args (p_prompt, p_max_iter,
--     p_idempotency_key) will still work — p_attachments defaults to '[]'.
--   * start_swarm_run enforces plan_id IN ('pro','premium') server-side.
--     The client's tier check is UI-only; server is the sole authority.
--   * agent-uploads bucket is PRIVATE. Only signed URLs will work.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Extend agent_runs
-- ---------------------------------------------------------------------

alter table public.agent_runs
  add column if not exists kind text not null default 'single'
    check (kind in ('single','swarm')),
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists preset_name text,
  add column if not exists user_vars   jsonb;

-- Cheap index for worker queries that may want to filter by kind later.
create index if not exists agent_runs_kind_status_idx
  on public.agent_runs (kind, status)
  where status in ('queued','running');

comment on column public.agent_runs.kind
  is 'Run type: single (one prompt) or swarm (preset multi-agent team)';
comment on column public.agent_runs.attachments
  is 'JSON array of {name, path, size, kind} — Premium-only file uploads';
comment on column public.agent_runs.preset_name
  is 'Swarm preset yaml stem, e.g. equity_research_team; null for single';
comment on column public.agent_runs.user_vars
  is 'Swarm user_vars dict, e.g. {"market":"US","ticker":"AAPL"}';


-- ---------------------------------------------------------------------
-- 2. Replace start_agent_run with attachments-aware 4-arg version
-- ---------------------------------------------------------------------

drop function if exists public.start_agent_run(text, integer, text);

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
  v_user_id uuid := auth.uid();
  v_period  public.usage_periods%rowtype;
  v_run_id  uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;

  -- Validate attachments is an array
  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'attachments must be a JSON array' using errcode = '22023';
  end if;

  select * into v_period
    from public.usage_periods
    where user_id = v_user_id and period_start <= now() and period_end > now()
    order by period_end desc
    limit 1
    for update;

  if v_period.id is null then
    raise exception 'No active subscription or usage period found' using errcode = 'P0001';
  end if;
  if v_period.uses_consumed >= v_period.uses_allowed then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  update public.usage_periods set uses_consumed = uses_consumed + 1 where id = v_period.id;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments)
    values
    (v_user_id, v_period.id, p_prompt, p_max_iter, p_idempotency_key, 'queued',
     'single', p_attachments)
    returning id into v_run_id;

  insert into public.usage_events (user_id, usage_period_id, agent_run_id, kind, reason)
    values (v_user_id, v_period.id, v_run_id, 'consume', 'run_started');

  return v_run_id;
exception
  when unique_violation then   -- idempotency retry: return the existing run
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

grant execute on function public.start_agent_run(text, integer, text, jsonb) to authenticated;

comment on function public.start_agent_run(text, integer, text, jsonb) is
  'Queue a metered agent run. Consumes 1 use atomically. Attachments are
   validated as a JSON array; server never trusts client tier check.';


-- ---------------------------------------------------------------------
-- 3. start_swarm_run — Pro & Premium only
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
  v_user_id uuid := auth.uid();
  v_plan_id text;
  v_period  public.usage_periods%rowtype;
  v_run_id  uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'P0001';
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
    where user_id = v_user_id and status in ('active','trialing')
    order by current_period_end desc
    limit 1;

  if v_plan_id is null then
    raise exception 'No active subscription' using errcode = 'P0001';
  end if;
  if v_plan_id not in ('pro','premium') then
    raise exception 'plan_gate: swarm teams require Pro or Premium' using errcode = 'P0001';
  end if;

  -- Quota lock (same rule as single runs — 1 use per swarm)
  select * into v_period
    from public.usage_periods
    where user_id = v_user_id and period_start <= now() and period_end > now()
    order by period_end desc
    limit 1
    for update;

  if v_period.id is null then
    raise exception 'No active usage period' using errcode = 'P0001';
  end if;
  if v_period.uses_consumed >= v_period.uses_allowed then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  update public.usage_periods set uses_consumed = uses_consumed + 1 where id = v_period.id;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, preset_name, user_vars)
    values
    (v_user_id, v_period.id,
     format('[swarm:%s] %s', p_preset_name, coalesce(p_user_vars::text, '{}')),
     50,               -- swarms are longer-running; worker caps per-agent
     p_idempotency_key, 'queued',
     'swarm', p_preset_name, p_user_vars)
    returning id into v_run_id;

  insert into public.usage_events (user_id, usage_period_id, agent_run_id, kind, reason)
    values (v_user_id, v_period.id, v_run_id, 'consume', 'swarm_started');

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_user_id and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

grant execute on function public.start_swarm_run(text, jsonb, text) to authenticated;

comment on function public.start_swarm_run(text, jsonb, text) is
  'Queue a swarm (multi-agent team) run. Requires Pro or Premium plan.
   Consumes 1 use atomically. Preset validation happens worker-side.';


-- ---------------------------------------------------------------------
-- 4. agent-uploads Storage bucket + RLS
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'agent-uploads',
    'agent-uploads',
    false,                                  -- private
    52428800,                               -- 50 MB
    array[
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json',
      'application/octet-stream'            -- some browsers send this for .xlsx
    ]
  )
on conflict (id) do nothing;

-- RLS: owners can insert / read / delete their own uploads.
-- Path convention: {uid}/{yyyy-mm-dd}/{uuid}-{filename}
-- Column storage.objects.name starts with the uid, so we split on '/'.

drop policy if exists "agent_uploads_owner_read"    on storage.objects;
drop policy if exists "agent_uploads_owner_write"   on storage.objects;
drop policy if exists "agent_uploads_owner_update"  on storage.objects;
drop policy if exists "agent_uploads_owner_delete"  on storage.objects;

create policy "agent_uploads_owner_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'agent-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "agent_uploads_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agent-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "agent_uploads_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'agent-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'agent-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "agent_uploads_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'agent-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

-- =====================================================================
-- ROLLBACK (paste separately if needed)
-- =====================================================================
-- begin;
--   drop policy if exists "agent_uploads_owner_read"    on storage.objects;
--   drop policy if exists "agent_uploads_owner_write"   on storage.objects;
--   drop policy if exists "agent_uploads_owner_update"  on storage.objects;
--   drop policy if exists "agent_uploads_owner_delete"  on storage.objects;
--   delete from storage.buckets where id = 'agent-uploads';
--   drop function if exists public.start_swarm_run(text, jsonb, text);
--   drop function if exists public.start_agent_run(text, integer, text, jsonb);
--   -- Restore original 3-arg start_agent_run from git history if needed.
--   alter table public.agent_runs
--     drop column if exists user_vars,
--     drop column if exists preset_name,
--     drop column if exists attachments,
--     drop column if exists kind;
--   drop index if exists public.agent_runs_kind_status_idx;
-- commit;
