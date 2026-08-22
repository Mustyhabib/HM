/**
 * stripe-webhook — Idempotent Stripe event handler.
 *
 * Security:
 *   • Stripe-Signature header verification via stripe.webhooks.constructEvent.
 *   • Raw body read before any JSON.parse (Stripe requires the exact raw bytes).
 *   • Event payload re-verified against Stripe API for critical subscription events.
 *
 * Idempotency:
 *   webhook_events.provider_event_id UNIQUE — duplicate events silently accepted
 *   (200) without reprocessing. provider_event_id = "stripe::{event.id}".
 *
 * Events handled:
 *   checkout.session.completed   → new subscription activated (post-Checkout)
 *   customer.subscription.updated → plan change or renewal extension
 *   customer.subscription.deleted → subscription canceled / expired
 *   invoice.payment_succeeded     → renewal paid → keep active + extend period
 *   invoice.payment_failed        → renewal failed → mark past_due
 *
 * Secrets required (set via `supabase secrets set`):
 *   STRIPE_SECRET_KEY          — Stripe secret key (sk_live_… or sk_test_…)
 *   STRIPE_WEBHOOK_SECRET      — Webhook signing secret (whsec_…) from Stripe dashboard
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (bypasses RLS, writes billing tables)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanId = "starter" | "pro" | "premium";

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Guard: refuse requests if secrets aren't configured (prevents silent misuse).
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe secrets not configured");
    return new Response("Service Unavailable", { status: 503 });
  }

  // Read raw body — Stripe signature verification requires the exact bytes.
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" });

  // ── Signature verification (Stripe-Signature header) ──────────────────────
  let event: Stripe.Event;
  try {
    // constructEventAsync is Deno-compatible (uses Web Crypto under the hood).
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    console.error("Stripe signature error:", msg);
    return new Response(msg, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Idempotency — dedupe via webhook_events ────────────────────────────────
  const dedupeKey = `stripe::${event.id}`;

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider_event_id: dedupeKey,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Already processed — idempotent 200 so Stripe stops retrying.
      console.log(`Duplicate Stripe event skipped: ${dedupeKey}`);
      return new Response("Already processed", { status: 200 });
    }
    // Transient DB failure → 500 so Stripe re-delivers.
    console.error("Failed to record Stripe webhook event:", insertError.message);
    return new Response("Internal Server Error", { status: 500 });
  }

  // ── Route events ──────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(stripe, supabase, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(supabase, event.data.object as Stripe.Invoice);
        break;
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error processing Stripe event ${event.type}:`, err);
    // Still 200 — the event is recorded; re-delivery would be a duplicate.
  }

  // Mark processed
  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider_event_id", dedupeKey);

  return new Response("OK", { status: 200 });
});

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * checkout.session.completed — user completed the Stripe Checkout flow.
 * Re-verify the session via API before activating the subscription.
 */
async function handleCheckoutComplete(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "subscription" || session.payment_status !== "paid") {
    console.warn(`Skipping checkout.session.completed: mode=${session.mode} payment_status=${session.payment_status}`);
    return;
  }

  // Re-verify via Stripe API (never trust the webhook payload alone).
  const verified = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["subscription"],
  });

  if (verified.payment_status !== "paid") {
    console.error(`Session ${session.id} payment not confirmed by Stripe API`);
    return;
  }

  const userId: string | undefined = verified.metadata?.user_id;
  const planId: string | undefined = verified.metadata?.plan_id;

  if (!userId || !planId) {
    console.error("Missing user_id or plan_id in Stripe session metadata", verified.metadata);
    return;
  }

  const subscription = verified.subscription as Stripe.Subscription | null;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
  if (!subscriptionId) {
    console.error("No subscription ID on completed checkout session", session.id);
    return;
  }

  const periodStart = subscription && typeof subscription !== "string"
    ? new Date(subscription.current_period_start * 1000)
    : new Date();
  const periodEnd = subscription && typeof subscription !== "string"
    ? new Date(subscription.current_period_end * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d; })();

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId as PlanId,
      provider_subscription_id: subscriptionId,
      provider: "stripe",
      status: "active",
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_subscription_id" },
  );

  if (error) console.error("Failed to upsert Stripe subscription:", error.message);
  else console.log(`Stripe subscription activated: user=${userId} plan=${planId} sub=${subscriptionId}`);
}

/**
 * customer.subscription.updated — plan change, renewal extension, or
 * cancel_at_period_end flag toggled.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionUpdated(supabase: any, sub: Stripe.Subscription) {
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    incomplete_expired: "canceled",
    unpaid: "past_due",
    paused: "past_due",
  };

  const status = statusMap[sub.status] ?? "past_due";
  const periodEnd = new Date(sub.current_period_end * 1000);
  const periodStart = new Date(sub.current_period_start * 1000);

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", sub.id);

  if (error) console.error("Failed to update Stripe subscription:", error.message);
  else console.log(`Stripe subscription updated: ${sub.id} → ${status}`);
}

/**
 * customer.subscription.deleted — subscription ended (not just canceled-at-period-end;
 * Stripe fires this when the sub actually terminates).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionDeleted(supabase: any, sub: Stripe.Subscription) {
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("provider_subscription_id", sub.id);

  if (error) console.error("Failed to cancel Stripe subscription:", error.message);
  else console.log(`Stripe subscription canceled: ${sub.id}`);
}

/**
 * invoice.payment_succeeded — renewal paid → extend period, keep active.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoicePaid(supabase: any, invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subscriptionId) return;

  // Extend the period end if the invoice carries a period.
  const periodEnd = invoice.lines?.data?.[0]?.period?.end
    ? new Date(invoice.lines.data[0].period.end * 1000)
    : null;

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      ...(periodEnd ? { current_period_end: periodEnd.toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", subscriptionId);

  if (error) console.error("Failed to record Stripe renewal:", error.message);
  else console.log(`Stripe renewal succeeded: ${subscriptionId}`);
}

/**
 * invoice.payment_failed — renewal failed → mark past_due.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoiceFailed(supabase: any, invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subscriptionId) return;

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("provider_subscription_id", subscriptionId);

  if (error) console.error("Failed to record Stripe renewal failure:", error.message);
  else console.log(`Stripe renewal failed → past_due: ${subscriptionId}`);
}
