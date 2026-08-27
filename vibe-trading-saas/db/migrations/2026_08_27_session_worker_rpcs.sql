-- 2026_08_27_session_worker_rpcs.sql
-- Additive worker-only RPCs for the multi-turn session feature.
-- Depends on: 2026_08_27_agent_sessions.sql (agent_sessions, session_messages,
--             complete_session_turn, claim_agent_run returning run_session_id).
--
-- The hm-worker connects as service_role, where auth.uid() is NULL. The
-- authenticated-only RPCs (get_session_messages) therefore cannot be used by the
-- worker. These two grants/definitions give the worker the minimal, ownership-
-- checked surface it needs:
--   * get_session_history(p_session_id, p_user_id) — prior turns for --history-file
--   * explicit EXECUTE grant for complete_session_turn to service_role
-- Apply via Supabase Management API or dashboard SQL editor.

-- ─── Worker history fetch (service_role, ownership-checked by explicit user_id) ──

CREATE OR REPLACE FUNCTION get_session_history(
  p_session_id UUID,
  p_user_id    UUID,
  p_limit      INT DEFAULT 8
)
RETURNS TABLE(role TEXT, content TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE id = p_session_id AND user_id = p_user_id
  ) THEN
    -- Worker was handed a run whose session it does not own. Return nothing
    -- rather than raising — a missing history just means the engine runs
    -- statelessly for this turn, which is safe.
    RETURN;
  END IF;

  RETURN QUERY
    SELECT m.role, m.content
    FROM session_messages m
    WHERE m.session_id = p_session_id
      AND m.role IN ('user', 'assistant')
    ORDER BY m.created_at ASC
    LIMIT p_limit;
END;
$$;

-- Worker-only — never callable by an end user.
REVOKE ALL ON FUNCTION get_session_history(UUID, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_session_history(UUID, UUID, INT) TO service_role;

-- ─── Explicit worker grant for the assistant-message writer ───────────────────
-- 2026_08_27_agent_sessions.sql REVOKEs complete_session_turn from PUBLIC; the
-- worker must hold an explicit grant (service_role is a separate role).

GRANT EXECUTE ON FUNCTION complete_session_turn(UUID, UUID, TEXT, JSONB) TO service_role;
