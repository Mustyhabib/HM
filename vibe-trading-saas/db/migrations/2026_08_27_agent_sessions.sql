-- 2026_08_27_agent_sessions.sql
-- Introduces multi-turn research sessions: agent_sessions + session_messages tables,
-- session lifecycle RPCs, and an updated claim_agent_run that surfaces run_session_id.
--
-- Apply via Supabase Management API or dashboard SQL editor.
-- Cannot be rolled back safely once agent_runs.session_id has live data.
--
-- Depends on: agent_runs, profiles, subscriptions, llm_provider_catalog,
--             user_api_keys, user_llm_prefs (resolve_run_prefs RPC).

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL DEFAULT 'New Research Session',
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'archived')),
  memory          JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sessions" ON agent_sessions
  FOR ALL USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS session_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  run_id      UUID        REFERENCES agent_runs(id),
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  tool_trail  JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_session_messages" ON session_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM agent_sessions s
      WHERE s.id = session_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- Link agent_runs to sessions. NULL = standalone (legacy) run — existing behaviour preserved.
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES agent_sessions(id);

-- ─── Authenticated RPCs ────────────────────────────────────────────────────────

-- create_agent_session
-- Creates a new research session for the authenticated user.
-- Returns: new session UUID.
CREATE OR REPLACE FUNCTION create_agent_session(p_title TEXT DEFAULT 'New Research Session')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO agent_sessions (user_id, title)
  VALUES (auth.uid(), p_title)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_agent_session(TEXT) TO authenticated;

-- list_agent_sessions
-- Lists the authenticated user's sessions ordered by most-recently active.
-- Returns: id, title, status, last_active_at, turn_count (number of user messages).
CREATE OR REPLACE FUNCTION list_agent_sessions(p_limit INT DEFAULT 20)
RETURNS TABLE(
  id              UUID,
  title           TEXT,
  status          TEXT,
  last_active_at  TIMESTAMPTZ,
  turn_count      BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT s.id,
           s.title,
           s.status,
           s.last_active_at,
           COUNT(m.id) FILTER (WHERE m.role = 'user') AS turn_count
    FROM agent_sessions s
    LEFT JOIN session_messages m ON m.session_id = s.id
    WHERE s.user_id = auth.uid()
    GROUP BY s.id
    ORDER BY s.last_active_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION list_agent_sessions(INT) TO authenticated;

-- get_session_messages
-- Returns ordered messages for a session the caller owns.
-- Raises session_not_found if the session does not belong to the caller.
CREATE OR REPLACE FUNCTION get_session_messages(
  p_session_id  UUID,
  p_limit       INT DEFAULT 50
)
RETURNS TABLE(
  id          UUID,
  session_id  UUID,
  run_id      UUID,
  role        TEXT,
  content     TEXT,
  tool_trail  JSONB,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE id = p_session_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT m.id, m.session_id, m.run_id, m.role, m.content, m.tool_trail, m.created_at
    FROM session_messages m
    WHERE m.session_id = p_session_id
    ORDER BY m.created_at ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_session_messages(UUID, INT) TO authenticated;

-- start_session_turn
-- Enqueues an agent_run for a session turn and records the user message.
-- Beta mode: subscription check reads plan_id but does NOT raise if null (open beta).
-- Raises: not_authenticated, session_not_found, no_api_key, rate_limited.
-- Returns: run_id (UUID of the queued agent_run), message_id (UUID of the user message).
CREATE OR REPLACE FUNCTION start_session_turn(
  p_session_id      UUID,
  p_content         TEXT,
  p_idempotency_key TEXT,
  p_attachments     JSONB DEFAULT '[]'
)
RETURNS TABLE(run_id UUID, message_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_run_id       UUID;
  v_msg_id       UUID;
  v_provider     TEXT;
  v_model        TEXT;
  v_plan_id      TEXT;
  v_recent_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Verify session exists and belongs to the caller.
  IF NOT EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE id = p_session_id AND user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Subscription gate — read plan but do not block in beta mode.
  -- Remove the comment and add a NOT NULL check here post-beta.
  SELECT sub.plan_id INTO v_plan_id
  FROM subscriptions sub
  WHERE sub.user_id = v_uid AND sub.status = 'active'
  ORDER BY sub.created_at DESC
  LIMIT 1;

  -- Resolve provider + model pin via resolve_run_prefs (returns TABLE(provider, model)).
  -- resolve_run_provider only returns TEXT; resolve_run_prefs is the correct RPC here.
  SELECT rp.provider, rp.model INTO v_provider, v_model
  FROM resolve_run_prefs(v_uid) rp;

  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'no_api_key' USING ERRCODE = 'P0001';
  END IF;

  -- 30 runs per rolling hour (same cap as standalone runs).
  SELECT COUNT(*) INTO v_recent_count
  FROM agent_runs
  WHERE user_id = v_uid
    AND created_at > now() - INTERVAL '1 hour'
    AND status != 'cancelled';

  IF v_recent_count >= 30 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  -- Record user message.
  INSERT INTO session_messages (session_id, role, content)
  VALUES (p_session_id, 'user', p_content)
  RETURNING id INTO v_msg_id;

  -- Queue the agent_run linked to this session.
  -- max_iter = 15 matches the default in the frontend agent launcher.
  INSERT INTO agent_runs (
    user_id, session_id, prompt, max_iter, idempotency_key,
    status, kind, attachments, provider, model
  ) VALUES (
    v_uid, p_session_id, p_content, 15, p_idempotency_key,
    'queued', 'single', p_attachments, v_provider, v_model
  )
  RETURNING id INTO v_run_id;

  -- Bump session activity timestamp.
  UPDATE agent_sessions SET last_active_at = now() WHERE id = p_session_id;

  RETURN QUERY SELECT v_run_id, v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION start_session_turn(UUID, TEXT, TEXT, JSONB) TO authenticated;

-- archive_agent_session
-- Soft-deletes a session by marking it 'archived'. Runs remain queryable.
-- Silently succeeds (no error) when the session does not exist or belongs to another user.
CREATE OR REPLACE FUNCTION archive_agent_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  UPDATE agent_sessions
  SET status = 'archived'
  WHERE id = p_session_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION archive_agent_session(UUID) TO authenticated;

-- ─── Service-role RPC (worker only) ───────────────────────────────────────────

-- complete_session_turn
-- Called by the worker after a session run finishes. Appends the assistant message
-- and bumps last_active_at. No authentication check — service_role only via REVOKE.
CREATE OR REPLACE FUNCTION complete_session_turn(
  p_run_id      UUID,
  p_session_id  UUID,
  p_content     TEXT,
  p_tool_trail  JSONB DEFAULT '[]'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO session_messages (session_id, run_id, role, content, tool_trail)
  VALUES (p_session_id, p_run_id, 'assistant', p_content, p_tool_trail);

  UPDATE agent_sessions SET last_active_at = now() WHERE id = p_session_id;
END;
$$;

-- Lock down to service_role — the worker is the only legitimate caller.
REVOKE ALL ON FUNCTION complete_session_turn(UUID, UUID, TEXT, JSONB) FROM PUBLIC;

-- ─── Update claim_agent_run to return session_id ──────────────────────────────
-- PostgreSQL cannot alter the return-type of a TABLE-returning function in place.
-- The worker is the sole caller (service_role) and re-reads the definition per
-- claim; the drop+recreate window is atomic within the same transaction.
--
-- Default stale_after updated from 15 min to 5 min to match worker heartbeat cadence.

DROP FUNCTION IF EXISTS public.claim_agent_run(TEXT, INTERVAL);

CREATE OR REPLACE FUNCTION claim_agent_run(
  p_worker_id   TEXT,
  p_stale_after INTERVAL DEFAULT '5 minutes'
)
RETURNS TABLE(
  run_id          UUID,
  run_user_id     UUID,
  run_prompt      TEXT,
  run_max_iter    INT,
  run_kind        TEXT,
  run_attachments JSONB,
  run_preset_name TEXT,
  run_user_vars   JSONB,
  run_provider    TEXT,
  run_model       TEXT,
  run_session_id  UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row agent_runs;
BEGIN
  -- Claim the oldest queued run, or the oldest stale running run.
  SELECT *
  INTO v_row
  FROM agent_runs ar
  WHERE ar.status = 'queued'
     OR (ar.status = 'running' AND ar.claimed_at < now() - p_stale_after)
  ORDER BY ar.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE agent_runs
  SET status     = 'running',
      claimed_by = p_worker_id,
      claimed_at = now(),
      started_at = COALESCE(started_at, now())
  WHERE id = v_row.id;

  RETURN QUERY SELECT
    v_row.id,
    v_row.user_id,
    v_row.prompt,
    v_row.max_iter,
    v_row.kind,
    v_row.attachments,
    v_row.preset_name,
    v_row.user_vars,
    v_row.provider,
    v_row.model,
    v_row.session_id;
END;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default on newly created functions.
-- The DROP above removed the previous migration's grants, so this must be
-- re-locked explicitly or any authenticated user could claim worker runs.
REVOKE ALL ON FUNCTION claim_agent_run(TEXT, INTERVAL) FROM PUBLIC;
