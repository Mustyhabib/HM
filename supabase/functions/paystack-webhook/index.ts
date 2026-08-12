/**
 * paystack-webhook — Idempotent Paystack event handler.
 *
 * Security: HMAC-SHA512 signature verification (x-paystack-signature header).
 * Idempotency: webhook_events.provider_event_id UNIQUE — duplicate events
 *   are silently accepted (200) without reprocessing.
 *
 * Events handled:
 *   charge.success        → re-verify transaction → upsert subscription
 *   subscription.create   → supplement charge.success if fired separately
 *   subscription.disable  → mark subscription canceled
 *   invoice.update        → handle renewal / payment failure
 *
 * Secrets required (set via `supabase secrets set`):
 *   PAYSTACK_SECRET_KEY        — Paystack secret key
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (bypasses RLS, writes billing tables)
 *
 * Safety rules satisfied:
 *   Rule 9: webhook idempotency via webhook_events table
 *   Rule 6: service-role writes only (RLS bypassed for billing tables only)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── HMAC-SHA512 verification ───────────────────────────────────────────────
async function verifySignature(body: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(PAYSTACK_SECRET),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hashHex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time comparison (timing-safe)
  if (hashHex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) {
    diff |= hashHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ── Re-verify transaction via Paystack API ─────────────────────────────────
async function reVerify(reference: string): Promise<PaystackTransaction | null> {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
  );
  const result = await res.json();
  if (!result.status || result.data?.status !== "success") return null;
  return result.data as PaystackTransaction;
}

interface PaystackTransaction {
  reference: string;
  status: string;
  amount: number;
  paid_at: string;
  metadata?: {
    user_id?: string;
    plan_id?: string;
    email?: string;
  };
  plan_object?: { plan_code?: string; interval?: string };
  subscription_data?: {
    subscription_code?: string;
    next_payment_date?: string;
  };
}

// ── Main handler ───────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const signature = req.headers.get("x-paystack-signature");
  if (!signature) return new Response("Missing x-paystack-signature", { status: 400 });

  const body = await req.text();

  const valid = await verifySignature(body, signature);
  if (!valid) {
    console.error("Paystack signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event: { event: string; data: any } = JSON.parse(body);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Idempotency key ──────────────────────────────────────────────────────
  // Paystack doesn't guarantee a unique event ID, so we derive one.
  // For charge events: use the transaction reference (globally unique).
  // For subscription events: event_type + subscription_code.
  const dedupeKey =
    event.data?.reference ??
    `${event.event}::${event.data?.subscription_code ?? event.data?.id ?? "unknown"}`;

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider_event_id: dedupeKey,
    type: event.event,
    payload: event,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Unique violation — already processed
      console.log(`Duplicate webhook skipped: ${dedupeKey}`);
      return new Response("Already processed", { status: 200 });
    }
    console.error("Failed to record webhook event:", insertError.message);
    // Don't 500 — return 200 so Paystack stops retrying on a DB transient error
    return new Response("OK", { status: 200 });
  }

  // ── Route events ─────────────────────────────────────────────────────────
  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(supabase, event.data);
        break;
      case "subscription.create":
        await handleSubscriptionCreate(supabase, event.data);
        break;
      case "subscription.disable":
      case "subscription.not_renew":
        await handleSubscriptionDisable(supabase, event.data);
        break;
      case "invoice.update":
        await handleInvoiceUpdate(supabase, event.data);
        break;
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }
  } catch (err) {
    console.error(`Error processing ${event.event}:`, err);
    // Still return 200 — the event is recorded; a re-delivery would be a duplicate
  }

  // Mark as processed
  await supabase
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider_event_id", dedupeKey);

  return new Response("OK", { status: 200 });
});

// ── Event handlers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleChargeSuccess(supabase: any, data: any) {
  const reference: string = data.reference;
  if (!reference) {
    console.error("charge.success missing reference");
    return;
  }

  // Re-verify with Paystack (never trust the webhook payload alone)
  const tx = await reVerify(reference);
  if (!tx) {
    console.error(`Transaction verify failed for reference ${reference}`);
    return;
  }

  const userId: string | undefined = tx.metadata?.user_id;
  const planId: string | undefined = tx.metadata?.plan_id;

  if (!userId || !planId) {
    console.error("Missing user_id or plan_id in transaction metadata:", tx.metadata);
    return;
  }

  const subscriptionCode =
    tx.subscription_data?.subscription_code ?? reference;

  const now = new Date(tx.paid_at || new Date().toISOString());
  const periodEnd = tx.subscription_data?.next_payment_date
    ? new Date(tx.subscription_data.next_payment_date)
    : (() => {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        return d;
      })();

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: planId,
      provider_subscription_id: subscriptionCode,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_subscription_id" },
  );

  if (error) {
    console.error("Failed to upsert subscription:", error.message);
    return;
  }

  console.log(
    `Subscription activated: user=${userId} plan=${planId} code=${subscriptionCode}`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCreate(supabase: any, data: any) {
  // Paystack fires this alongside charge.success for new subscriptions.
  // If charge.success already ran, this is a no-op (upsert on conflict).
  const subscriptionCode: string = data.subscription_code;
  if (!subscriptionCode) return;

  // Try to find user via customer email
  const email: string | undefined = data.customer?.email;
  if (!email) {
    console.warn("subscription.create missing customer email");
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (!profile) {
    console.warn(`No profile for email ${email}`);
    return;
  }

  // Look up plan by Paystack plan code
  const planCode: string | undefined = data.plan?.plan_code;
  if (!planCode) {
    console.warn("subscription.create missing plan_code");
    return;
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("provider_price_id", planCode)
    .single();

  if (!plan) {
    console.warn(`No plan for Paystack plan code ${planCode}`);
    return;
  }

  const periodStart = data.createdAt ? new Date(data.createdAt) : new Date();
  const periodEnd = data.next_payment_date
    ? new Date(data.next_payment_date)
    : (() => {
        const d = new Date(periodStart);
        d.setMonth(d.getMonth() + 1);
        return d;
      })();

  await supabase.from("subscriptions").upsert(
    {
      user_id: profile.id,
      plan_id: plan.id,
      provider_subscription_id: subscriptionCode,
      status: "active",
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_subscription_id" },
  );

  console.log(`Subscription created: user=${profile.id} plan=${plan.id}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionDisable(supabase: any, data: any) {
  const subscriptionCode: string = data.subscription_code;
  if (!subscriptionCode) return;

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("provider_subscription_id", subscriptionCode);

  if (error) console.error("Failed to cancel subscription:", error.message);
  else console.log(`Subscription canceled: ${subscriptionCode}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoiceUpdate(supabase: any, data: any) {
  // Fires on renewal attempt.
  // status: "success" (renewal paid) → keep active + extend period
  // status: "failed"  (renewal failed) → mark past_due
  const subscriptionCode: string = data.subscription?.subscription_code;
  if (!subscriptionCode) return;

  if (data.paid) {
    const periodEnd = data.subscription?.next_payment_date
      ? new Date(data.subscription.next_payment_date)
      : null;

    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        ...(periodEnd ? { current_period_end: periodEnd.toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_subscription_id", subscriptionCode);

    console.log(`Renewal succeeded: ${subscriptionCode}`);
  } else {
    await supabase
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("provider_subscription_id", subscriptionCode);

    console.log(`Renewal failed (past_due): ${subscriptionCode}`);
  }
}
