-- ============================================================
-- 2026_08_21_shadow_account.sql
-- Shadow Account: trade-journal upload → behavior profile → shadow
-- backtest → HTML/PDF report. Surfaced as a first-class run kind.
--
--   * agent_runs.kind CHECK gains 'shadow'
--   * start_shadow_run RPC — mirrors start_swarm_run's gate order but
--     requires the PREMIUM plan (reuses the attachment-upload tier)
--   * default prompt matches the frontend (lib/shadow.ts)
--
-- Applied manually to Supabase (project wqjdumforbalfmtawwpg), per repo rule.
-- ============================================================

-- ── 1. agent_runs.kind CHECK gains 'shadow' ────────────────────────────────
alter table public.agent_runs drop constraint if exists agent_runs_kind_check;

alter table public.agent_runs
  add constraint agent_runs_kind_check
  check (kind in ('single', 'swarm', 'shadow'));

-- ── 2. start_shadow_run ────────────────────────────────────────────────────
create or replace function public.start_shadow_run(
  p_prompt          text,
  p_journal_paths   jsonb,
  p_max_iter        integer default 50,
  p_idempotency_key text default null
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
  v_prompt    text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Journal paths must be a non-empty JSON array of Storage object paths
  -- (agent-uploads bucket). The worker downloads them into the run dir.
  if p_journal_paths is null
     or jsonb_typeof(p_journal_paths) <> 'array'
     or jsonb_array_length(p_journal_paths) = 0 then
    raise exception 'journal_required' using errcode = '22023';
  end if;

  -- Plan-tier gate: Premium only (mirrors the attachment-upload tier).
  select plan_id into v_plan_id
    from public.subscriptions
    where user_id = v_user_id and status in ('active', 'trialing')
    order by current_period_end desc
    limit 1;

  if v_plan_id is null then
    raise exception 'No active subscription' using errcode = 'P0001';
  end if;
  if v_plan_id <> 'premium' then
    raise exception 'plan_gate: shadow account requires the Premium plan' using errcode = 'P0001';
  end if;

  -- BYOK gate: user must have a DeepSeek key configured.
  if not exists (
    select 1 from public.user_api_keys
    where user_id = v_user_id and provider = 'deepseek'
  ) then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Soft rate limit — 30 runs / rolling hour / user, shared with all kinds.
  select count(*) into v_run_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour'
      and idempotency_key is distinct from p_idempotency_key;

  if v_run_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_prompt := coalesce(
    nullif(trim(p_prompt), ''),
    'Analyze my trading behavior, extract my shadow strategy, and compare it with my actual trades'
  );

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments, provider)
    values
    (v_user_id, null, v_prompt, p_max_iter, p_idempotency_key, 'queued',
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

grant execute on function public.start_shadow_run(text, jsonb, integer, text) to authenticated;
revoke execute on function public.start_shadow_run(text, jsonb, integer, text) from anon;

comment on function public.start_shadow_run(text, jsonb, integer, text) is
  'Queue a Shadow Account run (trade-journal analysis). Requires the Premium
   plan and a configured DeepSeek key. p_journal_paths are object paths in the
   agent-uploads bucket. Blank prompt falls back to the canonical shadow prompt.
   Errors: not_authenticated, journal_required, No active subscription,
   plan_gate: ..., no_api_key, rate_limited.';
