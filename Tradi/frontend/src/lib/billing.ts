/**
 * billing.ts — Provider-agnostic subscription checkout utilities.
 *
 * Supported providers:
 *   paystack — NGN billing for Nigeria launch (live, always available)
 *   stripe   — International billing (entity-gated: only available when
 *              VITE_STRIPE_ENABLED=true and the Atlas US LLC entity is set up)
 *
 * Paystack flow:
 *   initiateSubscription(planId, 'paystack')
 *     → paystack-init Edge Function → { authorization_url }
 *     → redirect to Paystack hosted checkout
 *     → /billing/callback?reference=REF&trxref=REF
 *     → paystack-webhook activates subscription
 *
 * Stripe flow (when VITE_STRIPE_ENABLED=true):
 *   initiateSubscription(planId, 'stripe')
 *     → stripe-init Edge Function → { url }
 *     → redirect to Stripe hosted Checkout
 *     → /billing/callback?session_id=SESSION_ID
 *     → stripe-webhook activates subscription
 *
 * Prerequisites:
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — Supabase client (already set)
 *   VITE_STRIPE_ENABLED=true                    — opt-in to Stripe (entity-gated)
 */

import { supabase } from "./supabase";

export type PlanId = "starter" | "pro" | "premium";
export type BillingProvider = "paystack" | "stripe";

/** True when Stripe is available for this deployment (Atlas entity required). */
export const STRIPE_ENABLED = import.meta.env.VITE_STRIPE_ENABLED === "true";

export interface SubscriptionStatus {
  isActive: boolean;
  planId: PlanId | null;
  periodEnd: Date | null;
  status: string | null;
}

/**
 * Initialize a subscription checkout and redirect to the payment provider's
 * hosted page. Returns an error string on failure, null on success
 * (the redirect takes over).
 *
 * @param planId   - The plan tier ('starter' | 'pro' | 'premium')
 * @param provider - Payment provider ('paystack' [default] | 'stripe')
 */
export async function initiateSubscription(
  planId: PlanId,
  provider: BillingProvider = "paystack",
): Promise<string | null> {
  if (provider === "stripe") {
    if (!STRIPE_ENABLED) {
      return "Stripe payments are not yet available. Please use Paystack.";
    }
    return initiateStripeSubscription(planId);
  }
  return initiatePaystackSubscription(planId);
}

// ── Paystack ─────────────────────────────────────────────────────────────────

async function initiatePaystackSubscription(planId: PlanId): Promise<string | null> {
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

  window.location.href = data.authorization_url;
  return null;
}

// ── Stripe ────────────────────────────────────────────────────────────────────

async function initiateStripeSubscription(planId: PlanId): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{
    url: string;
    session_id: string;
  }>("stripe-init", {
    body: { planId },
  });

  if (error) {
    console.error("stripe-init error:", error);
    return error.message || "Failed to initialize Stripe payment. Please try again.";
  }
  if (!data?.url) {
    return "No checkout URL returned. Please contact support.";
  }

  window.location.href = data.url;
  return null;
}

// ── Shared subscription status ────────────────────────────────────────────────

/** Fetch the current user's active subscription (works for both providers). */
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

/** Poll until the subscription is active (after webhook activates it) or
 *  the timeout elapses. Used by BillingCallback. */
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
