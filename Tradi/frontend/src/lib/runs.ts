import { supabase } from "./supabase";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export interface AgentRun {
  id: string;
  prompt: string;
  status: RunStatus;
  max_iter: number;
  error_message: string | null;
  refunded: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface RunArtifact {
  id: string;
  kind: string;
  storage_path: string;
  created_at: string;
}

export interface UsageSnapshot {
  uses_allowed: number;
  uses_consumed: number;
  remaining: number;
  period_end: string;
}

const ARTIFACT_BUCKET = "agent-artifacts";

/** Map the RPC's raise-exception messages to friendly UI copy. */
function friendlyStartError(message: string): string {
  if (message.includes("quota_exceeded"))
    return "You've used all your runs for this billing period. Upgrade your plan to run more.";
  if (message.includes("usage period") || message.includes("subscription"))
    return "No active plan found — subscribe to start running the agent.";
  if (message.includes("not authenticated")) return "Please log in again.";
  return message;
}

/**
 * Create a queued run via the atomic quota RPC and return its id. The RPC
 * (SECURITY DEFINER) derives the user from auth.uid() and consumes a use in
 * the same transaction — the client never writes agent_runs directly.
 */
export async function startRun(prompt: string, maxIter = 10): Promise<string> {
  const { data, error } = await supabase.rpc("start_agent_run", {
    p_prompt: prompt,
    p_max_iter: maxIter,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error(friendlyStartError(error.message));
  return data as string;
}

/**
 * Read-only snapshot of the caller's active billing period (RLS-scoped to the
 * user). The quota decrement is owned by `start_agent_run` server-side — this
 * is display/gating only, never a second write. Returns null when there is no
 * active period (e.g. no subscription).
 */
export async function getActiveUsage(): Promise<UsageSnapshot | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("usage_periods")
    .select("uses_allowed,uses_consumed,period_end")
    .lte("period_start", nowIso)
    .gt("period_end", nowIso)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const remaining = Math.max(0, data.uses_allowed - data.uses_consumed);
  return {
    uses_allowed: data.uses_allowed,
    uses_consumed: data.uses_consumed,
    remaining,
    period_end: data.period_end,
  };
}

export async function getRun(runId: string): Promise<AgentRun | null> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id,prompt,status,max_iter,error_message,refunded,created_at,completed_at")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AgentRun) ?? null;
}

export async function getRunArtifacts(runId: string): Promise<RunArtifact[]> {
  const { data, error } = await supabase
    .from("agent_artifacts")
    .select("id,kind,storage_path,created_at")
    .eq("agent_run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as RunArtifact[]) ?? [];
}

/** Short-lived signed URL for a private artifact object (RLS-scoped to owner). */
export async function signedArtifactUrl(
  storagePath: string,
  expiresIn = 300,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
