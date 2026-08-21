/**
 * Shadow Account — trade-journal analysis runs (Premium tier).
 *
 * Surface for the engine's shadow-account toolset: upload a broker journal,
 * the agent profiles the user's behavior, extracts an explicit strategy, and
 * backtests the "shadow" against the real trades. Server RPC `start_shadow_run`
 * enforces the Premium gate (mirrors the attachment-upload tier), the active
 * subscription, the BYOK key, and the 30-run/hour rate limit.
 */
import { supabase } from "./supabase";

/** Canonical Shadow Account prompt — must match the RPC's server-side default. */
export const SHADOW_DEFAULT_PROMPT =
  "Analyze my trading behavior, extract my shadow strategy, and compare it with my actual trades";

/**
 * Start a Shadow Account run.
 *
 * @param journalPath object path inside the agent-uploads bucket (as returned
 *   by `uploadAttachment()`).
 * @param prompt optional; blank falls back to the canonical shadow prompt.
 * @returns the new run id.
 * @throws Error with a friendly message on validation/auth/gate failures.
 */
export async function startShadowRun(
  journalPath: string,
  prompt?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("start_shadow_run", {
    p_prompt: prompt?.trim() || undefined,
    p_journal_paths: [journalPath],
    p_max_iter: 50,
    p_idempotency_key: crypto.randomUUID(),
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("journal_required"))
      throw new Error("Please attach a trade journal file first.");
    if (msg.includes("plan_gate"))
      throw new Error("Shadow Account requires the Premium plan.");
    if (msg.includes("no_api_key"))
      throw new Error("Add your DeepSeek API key in Settings first.");
    if (msg.includes("rate_limited"))
      throw new Error("You've hit the 30-runs/hour limit. Try again shortly.");
    if (msg.includes("not_authenticated"))
      throw new Error("Please sign in again.");
    throw new Error(msg);
  }
  return data as string;
}
