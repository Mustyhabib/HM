-- =====================================================================
-- Migration: 2026-08-19 — Worker RPC hardening (repo hygiene + BYOK crash fix)
-- Author: Auroras
-- Purpose:
--   1. Repo hygiene: claim_agent_run, heartbeat_agent_run, fail_agent_run,
--      and complete_agent_run exist only in the live DB (added ad hoc during
--      the worker build-out) with no migration file to show for them. This
--      migration captures their current, already-live definitions verbatim
--      so `db/migrations/` is once again the source of truth. It is a no-op
--      against production (CREATE OR REPLACE of what's already there).
--   2. Live-observed crash fix: fail_agent_run(..., p_refund => true) calls
--      refund_agent_run(), which unconditionally inserted into
--      public.usage_events (usage_period_id NOT NULL) and updated
--      public.usage_periods keyed on agent_runs.usage_period_id. Since the
--      2026-08-12 BYOK pivot (D11), agent_runs.usage_period_id is NULL for
--      every current-model run — usage_periods/usage_events are historical
--      accounting tables the pivot stopped writing to (see the BYOK
--      migration's own safety notes). A system-caused failure on a BYOK run
--      (worker crash, timeout, infra error) calls fail(..., refund=True) →
--      refund_agent_run() → INSERT ... usage_period_id = NULL → 23502
--      not-null violation, uncaught, propagating out of fail_agent_run and
--      killing the worker process (live-observed 2026-08-18).
--
--      Fix: refund_agent_run() now only touches usage_periods/usage_events
--      when the run actually has a usage_period_id (legacy pre-pivot rows).
--      BYOK runs still get agent_runs.refunded = true (so they can't be
--      double-refunded later) but skip the historical bookkeeping entirely.
--      claim_agent_run/heartbeat_agent_run/complete_agent_run never touched
--      usage_periods/usage_events and are included unchanged, for the record.
--
-- Safety notes:
--   * All five functions are SECURITY DEFINER with search_path pinned to
--     '' (empty) and every reference fully schema-qualified — matches the
--     live definitions' existing hardening, unchanged here.
--   * No grants change in this migration — EXECUTE privileges were already
--     set when these functions were first created live.
--   * Idempotent: safe to re-run, CREATE OR REPLACE throughout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- claim_agent_run — unchanged, captured for repo hygiene only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_agent_run(p_worker_id text, p_stale_after interval DEFAULT '00:15:00'::interval)
 RETURNS TABLE(run_id uuid, run_user_id uuid, run_prompt text, run_max_iter integer, run_kind text, run_attachments jsonb, run_preset_name text, run_user_vars jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
            r.kind, r.attachments, r.preset_name, r.user_vars;
end;
$function$;

-- ---------------------------------------------------------------------
-- heartbeat_agent_run — unchanged, captured for repo hygiene only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.heartbeat_agent_run(p_run_id uuid, p_worker_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.agent_runs
     SET claimed_at = now()
   WHERE id = p_run_id
     AND claimed_by = p_worker_id
     AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

-- ---------------------------------------------------------------------
-- complete_agent_run — unchanged, captured for repo hygiene only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_agent_run(p_run_id uuid, p_worker_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.agent_runs
     SET status       = 'completed',
         completed_at = now(),
         error_message = NULL
   WHERE id = p_run_id
     AND claimed_by = p_worker_id
     AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

-- ---------------------------------------------------------------------
-- fail_agent_run — unchanged, captured for repo hygiene only. The actual
-- usage_events/usage_periods write it can trigger lives one level down,
-- in refund_agent_run (below) — fixed there.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fail_agent_run(p_run_id uuid, p_worker_id text, p_error text, p_status text DEFAULT 'failed'::text, p_refund boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated  integer;
  v_refunded boolean;
BEGIN
  IF p_status NOT IN ('failed', 'timeout') THEN
    RAISE EXCEPTION 'fail_agent_run: invalid status %', p_status;
  END IF;

  UPDATE public.agent_runs
     SET status        = p_status,
         completed_at  = now(),
         error_message = p_error
   WHERE id = p_run_id
     AND claimed_by = p_worker_id
     AND status = 'running'
  RETURNING refunded INTO v_refunded;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 AND p_refund AND NOT v_refunded THEN
    PERFORM public.refund_agent_run(p_run_id);
  END IF;

  RETURN v_updated = 1;
END;
$function$;

-- ---------------------------------------------------------------------
-- refund_agent_run — THE FIX. Guard the usage_periods/usage_events write:
-- only run the historical-accounting path when the run actually has a
-- usage_period_id (legacy pre-pivot rows). BYOK runs (usage_period_id
-- IS NULL) still get agent_runs.refunded = true so they can't be
-- double-refunded, but skip the NOT NULL insert that was crashing the
-- worker.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_agent_run(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period_id uuid;
  v_user_id   uuid;
  v_refunded  boolean;
BEGIN
  SELECT usage_period_id, user_id, refunded
    INTO v_period_id, v_user_id, v_refunded
    FROM public.agent_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF v_refunded THEN
    RAISE EXCEPTION 'Run % already refunded', p_run_id;
  END IF;

  -- Mark run as refunded regardless of period_id — this flag's only job is
  -- to prevent a double-refund on a second fail() call; it does not by
  -- itself imply usage_periods bookkeeping happened.
  UPDATE public.agent_runs
     SET refunded = true
   WHERE id = p_run_id;

  -- Historical accounting only: usage_periods/usage_events stopped being
  -- written for new runs after the BYOK pivot (D11) and both
  -- usage_period_id columns are NOT NULL. Guard so BYOK runs (no period)
  -- never hit the constraint; legacy rows that DO have a period_id keep
  -- getting the decrement + refund event exactly as before.
  IF v_period_id IS NOT NULL THEN
    UPDATE public.usage_periods
       SET uses_consumed = uses_consumed - 1
     WHERE id = v_period_id;

    INSERT INTO public.usage_events (user_id, usage_period_id, agent_run_id, kind, reason)
    VALUES (v_user_id, v_period_id, p_run_id, 'refund', 'system_failure');
  END IF;
END;
$function$;
