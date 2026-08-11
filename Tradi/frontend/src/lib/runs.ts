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
  /** Plan tier — derived from uses_allowed. Starter=3, Pro=7, Premium=15. */
  tier: "starter" | "pro" | "premium" | "unknown";
}

export interface RunAttachment {
  name: string;
  path: string;
  size: number;
  kind: "csv" | "xlsx" | "json";
}

const ARTIFACT_BUCKET = "agent-artifacts";
const UPLOADS_BUCKET = "agent-uploads";

/** Plan-tier gate derived from monthly allowance. Kept as one place. */
export function tierFromAllowance(uses_allowed: number): UsageSnapshot["tier"] {
  if (uses_allowed >= 15) return "premium";
  if (uses_allowed >= 7)  return "pro";
  if (uses_allowed >= 3)  return "starter";
  return "unknown";
}

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
export async function startRun(
  prompt: string,
  opts: { maxIter?: number; attachments?: RunAttachment[] } = {},
): Promise<string> {
  const { data, error } = await supabase.rpc("start_agent_run", {
    p_prompt: prompt,
    p_max_iter: opts.maxIter ?? 10,
    p_idempotency_key: crypto.randomUUID(),
    p_attachments: opts.attachments ?? [],
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
    tier: tierFromAllowance(data.uses_allowed),
  };
}

/**
 * Upload a research attachment to Supabase Storage. Path is scoped to the
 * caller via RLS: `{auth.uid()}/{yyyy-mm-dd}/{uuid}-{filename}`. The 50 MB
 * limit is enforced client-side AND server-side (bucket policy).
 *
 * @throws Error on validation, network, or auth failure.
 */
export async function uploadAttachment(file: File): Promise<RunAttachment> {
  const MAX = 50 * 1024 * 1024;
  if (file.size > MAX) throw new Error(`File too large — 50 MB max (got ${(file.size / 1024 / 1024).toFixed(1)} MB)`);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = ["csv", "xlsx", "json"] as const;
  if (!(allowed as readonly string[]).includes(ext))
    throw new Error(`Unsupported file type: .${ext}. Allowed: CSV, XLSX, JSON`);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Not authenticated");
  const uid = userData.user.id;

  const today = new Date().toISOString().slice(0, 10);
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(0, 120);
  const path = `${uid}/${today}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(error.message);

  return {
    name: file.name,
    path,
    size: file.size,
    kind: ext as RunAttachment["kind"],
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

/**
 * List the caller's currently active (queued or running) runs — ordered by
 * newest first. Powers the sidebar queue viewer on the RunView page.
 * RLS-scoped: the user only ever sees their own rows.
 */
export async function getActiveRuns(): Promise<AgentRun[]> {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id,prompt,status,max_iter,error_message,refunded,created_at,completed_at")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data as AgentRun[]) ?? [];
}

/**
 * Subscribe to real-time updates for a single agent run. The callback fires
 * on every UPDATE (status transitions, error_message, refunded, completed_at).
 * Returns an unsubscribe function.
 *
 * Realtime is enabled on the agent_runs table (migration
 * `enable_realtime_agent_runs`). RLS still applies — the WS server only
 * publishes rows the current user's JWT can SELECT.
 */
export function subscribeToRun(
  runId: string,
  onUpdate: (run: AgentRun) => void,
): () => void {
  const channel = supabase
    .channel(`run:${runId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
      (payload) => {
        if (payload.new) onUpdate(payload.new as AgentRun);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to real-time artifact inserts for a given run. Fires when the
 * worker uploads a report/CSV/pine/trace file and inserts the row.
 * Returns an unsubscribe function.
 */
export function subscribeToArtifacts(
  runId: string,
  onInsert: (artifact: RunArtifact) => void,
): () => void {
  const channel = supabase
    .channel(`artifacts:${runId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "agent_artifacts", filter: `agent_run_id=eq.${runId}` },
      (payload) => {
        if (payload.new) onInsert(payload.new as RunArtifact);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
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
