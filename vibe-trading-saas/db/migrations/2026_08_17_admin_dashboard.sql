-- =====================================================================
-- Migration: 2026-08-17 — Admin Dashboard (Phase 7)
-- Author: Auroras
-- Purpose: Server-side backing for the admin dashboard design doc
--   1. admin_users — admin identity table (regular Supabase Auth users
--      listed here; seeded manually at apply-time with the owner's uid)
--   2. audit_logs — tamper-evident log of every admin mutation
--   3. profiles.suspended_at / suspended_reason — account suspension
--   4. _require_admin() / _log_admin() — internal helpers used by every
--      admin RPC below
--   5. 10 public RPCs: is_admin, admin_get_stats, admin_list_users,
--      admin_get_user_detail, admin_suspend_user, admin_unsuspend_user,
--      admin_override_plan, admin_update_plan, admin_list_audit_logs,
--      admin_list_runs
--   6. start_agent_run / start_swarm_run — add a suspension gate
--      (raises 'account_suspended') after the existing subscription gate
--
-- Safety notes:
--   * Every admin RPC (except is_admin) calls _require_admin() as its
--     first statement — grants to `authenticated` alone are NOT the
--     enforcement boundary, the in-body check is. A non-admin calling any
--     admin_* RPC gets errcode 42501 regardless of what the frontend does.
--   * audit_logs: RLS enabled, ZERO policies, table grants revoked from
--     anon + authenticated. The only INSERT path is _log_admin(), a
--     SECURITY DEFINER function — a client can never write or backdate an
--     audit row directly.
--   * _require_admin() / _log_admin() are internal-only: no EXECUTE grant
--     to authenticated/anon. They're reachable solely from other
--     SECURITY DEFINER functions owned by the same (migration-applying)
--     role, which retains implicit EXECUTE on functions it owns
--     regardless of the `revoke all from public` below.
--   * Every SECURITY DEFINER function pins `search_path to 'public'` —
--     no function-hijack surface.
--   * Mirrors the anon-grant gotcha fix from
--     2026_08_12_byok_revoke_anon_execute.sql: CREATE FUNCTION
--     auto-grants EXECUTE to PUBLIC (which anon inherits), so every admin
--     RPC below explicitly `revoke execute ... from anon` after granting
--     to `authenticated`.
--   * admin_override_plan does NOT rely on an ON CONFLICT (user_id)
--     upsert — public.subscriptions has no unique constraint on user_id
--     (a user can accumulate historical rows), so it updates the user's
--     most recent subscription row if one exists, else inserts a new one
--     with provider_subscription_id = 'manual-<uuid>'. Functionally the
--     same "upsert" intent as the design doc, safe under the real schema.
--   * Suspension is enforced in start_agent_run / start_swarm_run only
--     (paid actions) — sign-in stays open per D-A4, so a suspended user
--     can still reach the UI and see why they're blocked.
--   * churn is intentionally NOT computed here (out of scope for
--     admin_get_stats per the design doc) — MRR/active/queue/runs only.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. admin_users — admin identity (seeded manually post-apply)
-- ---------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- No policies at all — default-deny. Membership is only ever read through
-- is_admin() / _require_admin() (SECURITY DEFINER), never a direct SELECT.
revoke all on public.admin_users from anon, authenticated;

comment on table public.admin_users is
  'Admin identity — user_id of a regular Supabase Auth / profiles row that
   has admin access. Seeded manually at migration-apply time (owner''s
   auth uid). RLS enabled, zero policies; all reads go through is_admin()
   or the internal _require_admin() guard.';


-- ---------------------------------------------------------------------
-- 2. audit_logs — tamper-evident admin action ledger
-- ---------------------------------------------------------------------

create table if not exists public.audit_logs (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references public.profiles(id) on delete set null,
  action         text not null,
  target_type    text not null,
  target_id      text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx      on public.audit_logs (action);
create index if not exists audit_logs_target_idx      on public.audit_logs (target_type, target_id);

alter table public.audit_logs enable row level security;
-- No policies at all — default-deny. The only INSERT path is
-- _log_admin() (SECURITY DEFINER); the only read path is
-- admin_list_audit_logs() (SECURITY DEFINER, admin-gated).
revoke all on public.audit_logs from anon, authenticated;

comment on table public.audit_logs is
  'Every admin mutation, one row per action, written in the same
   transaction as the mutation by _log_admin(). RLS enabled, zero
   policies, table grants revoked from anon/authenticated — the frontend
   can never write or read this table directly, only via
   admin_list_audit_logs() / admin_get_user_detail().';


-- ---------------------------------------------------------------------
-- 3. profiles — suspension columns
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text;

comment on column public.profiles.suspended_at is
  'Set by admin_suspend_user, cleared by admin_unsuspend_user. Non-null
   blocks start_agent_run / start_swarm_run with account_suspended.
   Sign-in itself is never blocked.';
comment on column public.profiles.suspended_reason is
  'Required free-text reason captured on suspend, shown back to the admin
   (and, eventually, the suspended user) as context.';

create index if not exists profiles_suspended_idx
  on public.profiles (suspended_at) where suspended_at is not null;


-- ---------------------------------------------------------------------
-- 4. Internal helpers — not reachable from the frontend
-- ---------------------------------------------------------------------

create or replace function public._require_admin() returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users where user_id = auth.uid()
  ) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._require_admin() from public;

comment on function public._require_admin() is
  'Internal guard — raises 42501 unless the caller is an authenticated
   admin_users member. Called as the first statement of every admin_*
   RPC below (except is_admin). Not granted to authenticated/anon: only
   reachable from other SECURITY DEFINER functions owned by this role.';


create or replace function public._log_admin(
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_metadata    jsonb default '{}'::jsonb
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public._log_admin(text, text, text, jsonb) from public;

comment on function public._log_admin(text, text, text, jsonb) is
  'Internal — inserts one audit_logs row with actor_user_id = auth.uid().
   Called inside every mutating admin_* RPC, in the same transaction as
   the mutation it logs. Not granted to authenticated/anon.';


-- ---------------------------------------------------------------------
-- 5. is_admin() — the one admin RPC that does NOT call _require_admin
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
  language sql
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon;

comment on function public.is_admin() is
  'Returns true iff the caller is an admin_users member. Safe to call from
   any authenticated user — used by AdminGuard (UX only). The actual
   enforcement boundary is _require_admin() inside every other admin_*
   RPC, not this function.';


-- ---------------------------------------------------------------------
-- 6. admin_get_stats — business + queue-health snapshot
-- ---------------------------------------------------------------------

create or replace function public.admin_get_stats() returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_mrr_ngn            numeric;
  v_active_subscribers integer;
  v_total_users        integer;
  v_new_users_30d      integer;
  v_active_runs        integer;
  v_queue_depth        integer;
  v_runs_24h           integer;
  v_runs_by_status     jsonb;
  v_failed_webhooks    integer;
begin
  perform public._require_admin();

  select coalesce(sum(p.price_ngn), 0) into v_mrr_ngn
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status = 'active';

  select count(*) into v_active_subscribers
    from public.subscriptions where status = 'active';

  select count(*) into v_total_users from public.profiles;

  select count(*) into v_new_users_30d
    from public.profiles where created_at > now() - interval '30 days';

  select count(*) into v_active_runs
    from public.agent_runs where status in ('queued', 'running');

  select count(*) into v_queue_depth
    from public.agent_runs where status = 'queued';

  select count(*) into v_runs_24h
    from public.agent_runs where created_at > now() - interval '24 hours';

  select coalesce(jsonb_object_agg(t.status, t.cnt), '{}'::jsonb) into v_runs_by_status
    from (
      select status, count(*) as cnt
      from public.agent_runs
      group by status
    ) t;

  -- webhook_events.type carries the raw Paystack event name, e.g.
  -- 'charge.failed'. ILIKE-prefixed so any future 'subscription.failed'-
  -- style event is caught too without a migration.
  select count(*) into v_failed_webhooks
    from public.webhook_events where type ilike '%failed%';

  return jsonb_build_object(
    'mrr_ngn',            v_mrr_ngn,
    'active_subscribers', v_active_subscribers,
    'total_users',        v_total_users,
    'new_users_30d',      v_new_users_30d,
    'active_runs',        v_active_runs,
    'queue_depth',        v_queue_depth,
    'runs_24h',           v_runs_24h,
    'runs_by_status',     v_runs_by_status,
    'failed_webhooks',    v_failed_webhooks
  );
end;
$$;

revoke all on function public.admin_get_stats() from public;
grant execute on function public.admin_get_stats() to authenticated;
revoke execute on function public.admin_get_stats() from anon;

comment on function public.admin_get_stats() is
  'Admin-only business/queue snapshot: MRR (sum of active plans''
   price_ngn), active subscribers, total/new-30d users, active+queued run
   counts, runs in the last 24h, a status breakdown, and a failed-webhook
   count. Errors: not_admin (42501).';


-- ---------------------------------------------------------------------
-- 7. admin_list_users — search + paginate
-- ---------------------------------------------------------------------

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
) returns table (
  id                   uuid,
  email                text,
  display_name         text,
  created_at           timestamptz,
  plan_id              text,
  subscription_status  text,
  suspended_at         timestamptz,
  runs_total           bigint,
  last_run_at          timestamptz
)
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  perform public._require_admin();

  return query
    select
      pr.id,
      pr.email,
      pr.display_name,
      pr.created_at,
      sub.plan_id,
      sub.status,
      pr.suspended_at,
      coalesce(runs.cnt, 0) as runs_total,
      runs.last_at
    from public.profiles pr
    left join lateral (
      select s.plan_id, s.status
        from public.subscriptions s
        where s.user_id = pr.id
        order by s.current_period_end desc nulls last, s.created_at desc
        limit 1
    ) sub on true
    left join lateral (
      select count(*) as cnt, max(ar.created_at) as last_at
        from public.agent_runs ar
        where ar.user_id = pr.id
    ) runs on true
    where p_search is null or length(trim(p_search)) = 0
       or pr.email ilike '%' || p_search || '%'
       or pr.display_name ilike '%' || p_search || '%'
    order by pr.created_at desc
    limit greatest(coalesce(p_limit, 50), 0)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_users(text, int, int) from public;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
revoke execute on function public.admin_list_users(text, int, int) from anon;

comment on function public.admin_list_users(text, int, int) is
  'Admin-only paginated user list. p_search matches email/display_name
   (ILIKE, case-insensitive substring). Plan/status come from each user''s
   most recent subscription row; runs_total/last_run_at are aggregated
   from agent_runs. Errors: not_admin (42501).';


-- ---------------------------------------------------------------------
-- 8. admin_get_user_detail — single-user drill-down
-- ---------------------------------------------------------------------

create or replace function public.admin_get_user_detail(p_user_id uuid) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_profile      jsonb;
  v_subscription jsonb;
  v_api_key      jsonb;
  v_recent_runs  jsonb;
  v_audit_trail  jsonb;
begin
  perform public._require_admin();

  select to_jsonb(pr) into v_profile
    from public.profiles pr where pr.id = p_user_id;

  if v_profile is null then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  select to_jsonb(s) into v_subscription
    from public.subscriptions s
    where s.user_id = p_user_id
    order by s.current_period_end desc nulls last, s.created_at desc
    limit 1;

  select jsonb_build_object(
      'provider', k.provider,
      'last4', k.key_last4,
      'configured_at', k.configured_at
    ) into v_api_key
    from public.user_api_keys k
    where k.user_id = p_user_id and k.provider = 'deepseek';

  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into v_recent_runs
    from (
      select id, prompt, status, kind, created_at, completed_at
        from public.agent_runs
        where user_id = p_user_id
        order by created_at desc
        limit 10
    ) r;

  select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb) into v_audit_trail
    from (
      select id, actor_user_id, action, target_type, target_id, metadata, created_at
        from public.audit_logs
        where target_id = p_user_id::text
        order by created_at desc
        limit 20
    ) a;

  return jsonb_build_object(
    'profile',      v_profile,
    'subscription', v_subscription,
    'api_key_status', v_api_key,
    'recent_runs',  v_recent_runs,
    'audit_trail',  v_audit_trail
  );
end;
$$;

revoke all on function public.admin_get_user_detail(uuid) from public;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
revoke execute on function public.admin_get_user_detail(uuid) from anon;

comment on function public.admin_get_user_detail(uuid) is
  'Admin-only drill-down: {profile, subscription, api_key_status,
   recent_runs (10), audit_trail (20, target_id = p_user_id)}.
   Errors: not_admin (42501), user_not_found.';


-- ---------------------------------------------------------------------
-- 9. admin_suspend_user / admin_unsuspend_user
-- ---------------------------------------------------------------------

create or replace function public.admin_suspend_user(p_user_id uuid, p_reason text) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  perform public._require_admin();

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.profiles
    set suspended_at = now(), suspended_reason = p_reason
    where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  perform public._log_admin('user.suspend', 'user', p_user_id::text, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function public.admin_suspend_user(uuid, text) from public;
grant execute on function public.admin_suspend_user(uuid, text) to authenticated;
revoke execute on function public.admin_suspend_user(uuid, text) from anon;

comment on function public.admin_suspend_user(uuid, text) is
  'Admin-only. Sets profiles.suspended_at/suspended_reason and logs
   user.suspend. A required, non-empty p_reason. Suspension blocks new
   agent runs (start_agent_run/start_swarm_run), not sign-in.
   Errors: not_admin (42501), reason_required, user_not_found.';


create or replace function public.admin_unsuspend_user(p_user_id uuid) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  perform public._require_admin();

  update public.profiles
    set suspended_at = null, suspended_reason = null
    where id = p_user_id;

  if not found then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  perform public._log_admin('user.unsuspend', 'user', p_user_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_unsuspend_user(uuid) from public;
grant execute on function public.admin_unsuspend_user(uuid) to authenticated;
revoke execute on function public.admin_unsuspend_user(uuid) from anon;

comment on function public.admin_unsuspend_user(uuid) is
  'Admin-only. Clears profiles.suspended_at/suspended_reason and logs
   user.unsuspend. Errors: not_admin (42501), user_not_found.';


-- ---------------------------------------------------------------------
-- 10. admin_override_plan — manual plan grant, bypasses Paystack
-- ---------------------------------------------------------------------

create or replace function public.admin_override_plan(
  p_user_id uuid,
  p_plan_id text,
  p_reason  text
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_existing_provider_sub text;
begin
  perform public._require_admin();

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  -- subscriptions has no unique constraint on user_id (a user may
  -- accumulate historical rows), so this is a manual "update most recent
  -- row, else insert" upsert rather than an ON CONFLICT (user_id) one.
  select provider_subscription_id into v_existing_provider_sub
    from public.subscriptions
    where user_id = p_user_id
    order by current_period_end desc nulls last, created_at desc
    limit 1;

  if v_existing_provider_sub is not null then
    update public.subscriptions
      set plan_id               = p_plan_id,
          status                = 'active',
          current_period_start  = now(),
          current_period_end    = now() + interval '30 days',
          cancel_at_period_end  = false,
          updated_at            = now()
      where provider_subscription_id = v_existing_provider_sub;
  else
    insert into public.subscriptions (
      user_id, plan_id, provider_subscription_id, status,
      current_period_start, current_period_end, cancel_at_period_end
    ) values (
      p_user_id, p_plan_id, 'manual-' || gen_random_uuid()::text, 'active',
      now(), now() + interval '30 days', false
    );
  end if;

  perform public._log_admin('billing.plan_override', 'user', p_user_id::text,
    jsonb_build_object('plan', p_plan_id, 'reason', p_reason));
end;
$$;

revoke all on function public.admin_override_plan(uuid, text, text) from public;
grant execute on function public.admin_override_plan(uuid, text, text) to authenticated;
revoke execute on function public.admin_override_plan(uuid, text, text) from anon;

comment on function public.admin_override_plan(uuid, text, text) is
  'Admin-only. Grants p_user_id an active p_plan_id subscription for 30
   days, bypassing Paystack entirely. Updates the user''s most recent
   subscription row if one exists, else inserts one with
   provider_subscription_id = ''manual-<uuid>''. Always logs
   billing.plan_override with {plan, reason} — the audit trail is what
   makes this bypass non-repudiable. Errors: not_admin (42501),
   reason_required, plan_not_found.';


-- ---------------------------------------------------------------------
-- 11. admin_update_plan — edit plan name/price without a deploy
-- ---------------------------------------------------------------------

create or replace function public.admin_update_plan(
  p_plan_id   text,
  p_name      text,
  p_price_ngn int
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  perform public._require_admin();

  if p_price_ngn is null or p_price_ngn < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  update public.plans
    set name      = coalesce(nullif(trim(p_name), ''), name),
        price_ngn = p_price_ngn
    where id = p_plan_id;

  if not found then
    raise exception 'plan_not_found' using errcode = 'P0001';
  end if;

  perform public._log_admin('billing.plan_update', 'plan', p_plan_id,
    jsonb_build_object('name', p_name, 'price_ngn', p_price_ngn));
end;
$$;

revoke all on function public.admin_update_plan(text, text, int) from public;
grant execute on function public.admin_update_plan(text, text, int) to authenticated;
revoke execute on function public.admin_update_plan(text, text, int) from anon;

comment on function public.admin_update_plan(text, text, int) is
  'Admin-only. Updates plans.name/price_ngn for p_plan_id — the one
   platform-config-without-deploy surface (D-A8). Logs
   billing.plan_update with {name, price_ngn}. Does NOT touch Paystack;
   the provider plan code (provider_price_id) is unaffected.
   Errors: not_admin (42501), invalid_price, plan_not_found.';


-- ---------------------------------------------------------------------
-- 12. admin_list_audit_logs — filterable, paginated audit trail
-- ---------------------------------------------------------------------

create or replace function public.admin_list_audit_logs(
  p_limit  int  default 100,
  p_offset int  default 0,
  p_action text default null
) returns table (
  id            bigint,
  actor_user_id uuid,
  actor_email   text,
  action        text,
  target_type   text,
  target_id     text,
  metadata      jsonb,
  created_at    timestamptz
)
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  perform public._require_admin();

  return query
    select
      al.id, al.actor_user_id, pr.email as actor_email,
      al.action, al.target_type, al.target_id, al.metadata, al.created_at
    from public.audit_logs al
    left join public.profiles pr on pr.id = al.actor_user_id
    where p_action is null or length(trim(p_action)) = 0 or al.action = p_action
    order by al.created_at desc
    limit greatest(coalesce(p_limit, 100), 0)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_audit_logs(int, int, text) from public;
grant execute on function public.admin_list_audit_logs(int, int, text) to authenticated;
revoke execute on function public.admin_list_audit_logs(int, int, text) from anon;

comment on function public.admin_list_audit_logs(int, int, text) is
  'Admin-only. The one read path for audit_logs (RLS default-deny +
   revoked grants make this the only way to see it). Optional exact-match
   p_action filter. Errors: not_admin (42501).';


-- ---------------------------------------------------------------------
-- 13. admin_list_runs — cross-user run monitoring
-- ---------------------------------------------------------------------

create or replace function public.admin_list_runs(
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
) returns table (
  id                uuid,
  user_email        text,
  display_name      text,
  prompt            text,
  status            text,
  kind              text,
  progress_message  text,
  created_at        timestamptz,
  completed_at      timestamptz
)
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  perform public._require_admin();

  return query
    select
      ar.id, pr.email as user_email, pr.display_name,
      ar.prompt, ar.status, ar.kind, ar.progress_message,
      ar.created_at, ar.completed_at
    from public.agent_runs ar
    join public.profiles pr on pr.id = ar.user_id
    where p_status is null or length(trim(p_status)) = 0 or ar.status = p_status
    order by ar.created_at desc
    limit greatest(coalesce(p_limit, 50), 0)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_list_runs(text, int, int) from public;
grant execute on function public.admin_list_runs(text, int, int) to authenticated;
revoke execute on function public.admin_list_runs(text, int, int) from anon;

comment on function public.admin_list_runs(text, int, int) is
  'Admin-only cross-user run monitor. Optional exact-match p_status
   filter. Errors: not_admin (42501).';


-- ---------------------------------------------------------------------
-- 14. start_agent_run / start_swarm_run — add the suspension gate
--
-- Replaces the current (2026_08_12_byok_api_keys) bodies verbatim, plus
-- one new gate inserted right after the subscription check per the
-- design doc: suspension wins over an otherwise-active subscription.
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

  -- Gate 2b: account suspension (Admin Dashboard, Phase 7). Checked after
  -- the subscription gate — a suspended user with an otherwise-active
  -- subscription is still blocked. Sign-in is never gated; only run
  -- creation is.
  if exists (
    select 1 from public.profiles pr
    where pr.id = v_user_id and pr.suspended_at is not null
  ) then
    raise exception 'account_suspended' using errcode = 'P0001';
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
   gates on active subscription, account not suspended, a configured
   DeepSeek key, and a 30-run/hour soft rate limit. Server is the sole
   authority; client tier/key/suspension checks are UI only.
   Errors: not_authenticated, no_active_subscription, account_suspended,
   no_api_key, rate_limited.';


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

  -- Account suspension (Admin Dashboard, Phase 7) — checked after the
  -- subscription/plan gate, same rule as start_agent_run.
  if exists (
    select 1 from public.profiles pr
    where pr.id = v_user_id and pr.suspended_at is not null
  ) then
    raise exception 'account_suspended' using errcode = 'P0001';
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
  'Queue a swarm (multi-agent team) run. Requires Pro or Premium plan, an
   account not suspended, and a configured DeepSeek key. BYOK pivot: no
   quota consumption, 30-run/hour soft rate limit shared with single runs.
   Errors: not_authenticated, "No active subscription", plan_gate: ...,
   account_suspended, no_api_key, rate_limited.';

commit;

-- =====================================================================
-- POST-APPLY (manual, not part of this file):
--   Seed the owner as an admin —
--     insert into public.admin_users (user_id) values ('<owner-auth-uid>');
--   TOTP 2FA for /admin/* is explicitly deferred (out of scope, see
--   design doc §1) — this migration does not gate is_admin() behind MFA.
-- =====================================================================

-- =====================================================================
-- ROLLBACK (paste separately if needed)
-- =====================================================================
-- begin;
--   drop function if exists public.admin_list_runs(text, int, int);
--   drop function if exists public.admin_list_audit_logs(int, int, text);
--   drop function if exists public.admin_update_plan(text, text, int);
--   drop function if exists public.admin_override_plan(uuid, text, text);
--   drop function if exists public.admin_unsuspend_user(uuid);
--   drop function if exists public.admin_suspend_user(uuid, text);
--   drop function if exists public.admin_get_user_detail(uuid);
--   drop function if exists public.admin_list_users(text, int, int);
--   drop function if exists public.admin_get_stats();
--   drop function if exists public.is_admin();
--   drop function if exists public._log_admin(text, text, text, jsonb);
--   drop function if exists public._require_admin();
--   drop table if exists public.audit_logs;
--   drop table if exists public.admin_users;
--   alter table public.profiles
--     drop column if exists suspended_reason,
--     drop column if exists suspended_at;
--   -- Restore the pre-suspension-gate start_agent_run / start_swarm_run
--   -- bodies from 2026_08_12_byok_api_keys.sql if needed.
-- commit;
