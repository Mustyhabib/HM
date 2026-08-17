import { supabase } from "./supabase";

/**
 * Admin dashboard RPC wrapper (Phase 7). Every function here calls a
 * SECURITY DEFINER RPC that re-checks `admin_users` membership server-side
 * (`_require_admin()`) — this module never trusts `isAdmin()` as anything
 * more than a UX shortcut. See `2026_08_17_admin_dashboard.sql`.
 *
 * All admin mutations are logged server-side in the same transaction as
 * the mutation (`_log_admin`) — this module never writes to `audit_logs`
 * directly, and there is no client-facing way to.
 */

export interface AdminStats {
  mrr_ngn: number;
  active_subscribers: number;
  total_users: number;
  new_users_30d: number;
  active_runs: number;
  queue_depth: number;
  runs_24h: number;
  runs_by_status: Record<string, number>;
  failed_webhooks: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  plan_id: string | null;
  subscription_status: string | null;
  suspended_at: string | null;
  runs_total: number;
  last_run_at: string | null;
}

export interface AdminUserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
}

export interface AdminUserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  provider_subscription_id: string | null;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUserApiKeyStatus {
  provider: "deepseek";
  last4: string;
  configured_at: string;
}

export interface AdminUserRecentRun {
  id: string;
  prompt: string;
  status: string;
  kind: string;
  created_at: string;
  completed_at: string | null;
}

export interface AuditLogRow {
  id: number;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminUserDetail {
  profile: AdminUserProfile;
  subscription: AdminUserSubscription | null;
  api_key_status: AdminUserApiKeyStatus | null;
  recent_runs: AdminUserRecentRun[];
  audit_trail: AuditLogRow[];
}

export interface AdminRunRow {
  id: string;
  user_email: string;
  display_name: string | null;
  prompt: string;
  status: string;
  kind: string;
  progress_message: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Map the admin RPCs' raise-exception messages to friendly UI copy. */
function friendlyAdminError(message: string): string {
  if (message.includes("not_admin")) return "You don't have admin access.";
  if (message.includes("not_authenticated")) return "Please log in again.";
  if (message.includes("reason_required")) return "A reason is required.";
  if (message.includes("user_not_found")) return "User not found.";
  if (message.includes("plan_not_found")) return "Plan not found.";
  if (message.includes("invalid_price")) return "Enter a valid price.";
  return message;
}

/** true / false / never rejects — a network or RPC error is treated as "not admin". */
async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return Boolean(data);
}

async function getStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc("admin_get_stats");
  if (error) throw new Error(friendlyAdminError(error.message));
  return data as AdminStats;
}

async function listUsers(opts: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: opts.search?.trim() || null,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw new Error(friendlyAdminError(error.message));
  return (data as AdminUserRow[]) ?? [];
}

async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  const { data, error } = await supabase.rpc("admin_get_user_detail", { p_user_id: userId });
  if (error) throw new Error(friendlyAdminError(error.message));
  return data as AdminUserDetail;
}

async function suspendUser(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_suspend_user", {
    p_user_id: userId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(friendlyAdminError(error.message));
}

async function unsuspendUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: userId });
  if (error) throw new Error(friendlyAdminError(error.message));
}

async function overridePlan(userId: string, planId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_override_plan", {
    p_user_id: userId,
    p_plan_id: planId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(friendlyAdminError(error.message));
}

async function updatePlan(planId: string, name: string, priceNgn: number): Promise<void> {
  const { error } = await supabase.rpc("admin_update_plan", {
    p_plan_id: planId,
    p_name: name.trim(),
    p_price_ngn: priceNgn,
  });
  if (error) throw new Error(friendlyAdminError(error.message));
}

async function listAuditLogs(opts: {
  limit?: number;
  offset?: number;
  action?: string;
} = {}): Promise<AuditLogRow[]> {
  const { data, error } = await supabase.rpc("admin_list_audit_logs", {
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
    p_action: opts.action?.trim() || null,
  });
  if (error) throw new Error(friendlyAdminError(error.message));
  return (data as AuditLogRow[]) ?? [];
}

async function listRuns(opts: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminRunRow[]> {
  const { data, error } = await supabase.rpc("admin_list_runs", {
    p_status: opts.status?.trim() || null,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw new Error(friendlyAdminError(error.message));
  return (data as AdminRunRow[]) ?? [];
}

export const admin = {
  isAdmin,
  getStats,
  listUsers,
  getUserDetail,
  suspendUser,
  unsuspendUser,
  overridePlan,
  updatePlan,
  listAuditLogs,
  listRuns,
};
