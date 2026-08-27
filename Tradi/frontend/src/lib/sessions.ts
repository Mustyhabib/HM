// Tradi/frontend/src/lib/sessions.ts
// Session API layer for the multi-turn research session feature.
// Typed wrappers around the session RPCs + a realtime subscription to
// session_messages inserts. Mirrors the shape of runs.ts.
import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  title: string;
  status: "active" | "archived";
  last_active_at: string;
  turn_count: number;
}

export interface ToolTrailEntry {
  tool: string;
  status: "ok" | "error";
  elapsed_ms: number | null;
  iter: number | null;
  preview: string;
}

export interface SessionMessage {
  id: string;
  session_id: string;
  run_id: string | null;
  role: "user" | "assistant";
  content: string;
  tool_trail: ToolTrailEntry[];
  created_at: string;
}

export interface StartTurnResult {
  run_id: string;
  message_id: string;
}

// ─── RPCs ────────────────────────────────────────────────────────────────────

export async function createSession(title = "New Research Session"): Promise<string> {
  const { data, error } = await supabase.rpc("create_agent_session", { p_title: title });
  if (error) throw error;
  return data as string;
}

export async function listSessions(limit = 20): Promise<AgentSession[]> {
  const { data, error } = await supabase.rpc("list_agent_sessions", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as AgentSession[];
}

export async function getSessionMessages(sessionId: string, limit = 50): Promise<SessionMessage[]> {
  const { data, error } = await supabase.rpc("get_session_messages", {
    p_session_id: sessionId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as SessionMessage[];
}

// Friendly error codes the backend raises; surfaced to the UI as plain messages.
export type SessionStartError =
  | "not_authenticated"
  | "session_not_found"
  | "no_api_key"
  | "rate_limited";

export async function startSessionTurn(
  sessionId: string,
  content: string,
  idempotencyKey: string,
  attachments: Array<{ name: string; path: string; size: number; kind: string }> = [],
): Promise<StartTurnResult> {
  const { data, error } = await supabase.rpc("start_session_turn", {
    p_session_id: sessionId,
    p_content: content,
    p_idempotency_key: idempotencyKey,
    p_attachments: attachments,
  });
  if (error) {
    const msg = error.message ?? "";
    for (const code of [
      "not_authenticated",
      "session_not_found",
      "no_api_key",
      "rate_limited",
    ] as SessionStartError[]) {
      if (msg.includes(code)) {
        const err = new Error(code) as Error & { code: SessionStartError };
        err.code = code;
        throw err;
      }
    }
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as StartTurnResult;
}

export async function archiveSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("archive_agent_session", { p_session_id: sessionId });
  if (error) throw error;
}

// ─── Realtime ────────────────────────────────────────────────────────────────

export function subscribeToSessionMessages(
  sessionId: string,
  onInsert: (msg: SessionMessage) => void,
): () => void {
  const channel = supabase
    .channel(`session-messages-${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "session_messages",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        const newRow = payload.new as Record<string, unknown>;
        onInsert({
          id: newRow.id as string,
          session_id: newRow.session_id as string,
          run_id: (newRow.run_id as string | null) ?? null,
          role: newRow.role as "user" | "assistant",
          content: newRow.content as string,
          tool_trail: (newRow.tool_trail as ToolTrailEntry[]) ?? [],
          created_at: newRow.created_at as string,
        });
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
