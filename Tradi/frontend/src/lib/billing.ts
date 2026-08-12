/**
 * billing.ts — Paystack subscription checkout utilities.
 *
 * Flow:
 *   initiateSubscription(planId)
 *     → calls paystack-init Edge Function (Supabase auth JWT included automatically)
 *     → Edge Function returns { authorization_url }
 *     → we redirect the browser to Paystack's hosted checkout
 *     → after payment Paystack redirects to /billing/callback?reference=...
 *     → paystack-webhook Edge Function activates the subscription async
 *
 * Prerequisites (set in Vercel env + local .env):
 *   VITE_SUPABASE_URL         — already set
 *   VITE_SUPABASE_ANON_KEY    — already set
 *   (Edge Function uses PAYSTACK_SECRET_KEY secret — never exposed to frontend)
 */

import { supabase } from "./supabase";

export type PlanId = "starter" | "pro" | "premium";

export interface SubscriptionStatus {
  isActive: boolean;
  planId: PlanId | null;
  periodEnd: Date | null;
  status: string | null;
}

/** Initialize a Paystack subscription checkout and redirect to the payment page.
 *  Returns an error string on failure, null on success (redirect takes over). */
export async function initiateSubscription(planId: PlanId): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{
    authorization_url: string;
    reference: string;
  }>("paystack-init", {
    body: { planId },
  });

  if (error) {
    console.error("paystack-init error:", error);
    return error.message || "Failed to initialize payment. Please try again.";
  }
  if (!data?.authorization_url) {
    return "No payment URL returned. Please contact support.";
  }

  // Redirect — this page is left behind; /billing/callback handles the return.
  window.location.href = data.authorization_url;
  return null;
}

/** Fetch the current user's active subscription from Supabase.
 *  Returns null if not subscribed or on error. */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_id, status, current_period_end")
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { isActive: false, planId: null, periodEnd: null, status: null };
  }

  return {
    isActive: true,
    planId: data.plan_id as PlanId,
    periodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
    status: data.status,
  };
}

/** Verify a payment reference on the callback page.
 *  Returns true if the subscription is now active for this user. */
export async function pollSubscriptionActive(
  maxWaitMs = 15_000,
  intervalMs = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const sub = await getSubscriptionStatus();
    if (sub.isActive) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
