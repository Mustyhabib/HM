/**
 * stripe-init — Create a Stripe Checkout Session for a subscription.
 *
 * Entity gate: this function only runs when STRIPE_SECRET_KEY is set.
 * Without it, every call returns 503 "Stripe not yet enabled" — preventing
 * accidental charges against a key that doesn't exist yet.
 *
 * Flow:
 *   1. Verify Supabase JWT → get caller's user_id + email
 *   2. Look up the Stripe price ID for the requested plan from plans.stripe_price_id
 *   3. Create a Stripe Checkout Session (subscription mode)
 *   4. Return { url } — the frontend redirects the user to Stripe's hosted page
 *
 * After checkout:
 *   • Success → Stripe redirects to APP_URL/billing/callback?session_id={CHECKOUT_SESSION_ID}
 *   • Cancel  → Stripe redirects to APP_URL/pricing
 *
 * Subscription activation happens async via stripe-webhook (checkout.session.completed).
 *
 * Secrets required (supabase secrets set):
 *   STRIPE_SECRET_KEY          — Stripe secret key (sk_live_… or sk_test_…)
 *   APP_URL                    — Frontend URL, e.g. https://hmtrade.business
 *
 * Env also required (set when Stripe plans are configured):
 *   STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO / STRIPE_PRICE_PREMIUM
 *   (Used only as a fallback if plans.stripe_price_id is not yet populated.)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://hmtrade.business";

// Env-var price fallbacks (populated once Stripe plans are created via dashboard/CLI).
const PRICE_BY_PLAN: Record<string, string | undefined> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER"),
  pro: Deno.env.get("STRIPE_PRICE_PRO"),
  premium: Deno.env.get("STRIPE_PRICE_PREMIUM"),
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ── Entity gate ─────────────────────────────────────────────────────────────
  if (!STRIPE_SECRET) {
    return json(
      {
        error:
          "Stripe is not yet enabled for this account. Please use Paystack for payment.",
      },
      503,
    );
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let planId: string;
  try {
    ({ planId } = await req.json());
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: CORS });
  }
  if (!planId) {
    return json({ error: "planId required" }, 400);
  }

  // ── Resolve Stripe price ID ──────────────────────────────────────────────────
  // Prefer the DB column; fall back to env var (useful during initial Stripe setup
  // before price IDs have been entered into the plans table).
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, stripe_price_id")
    .eq("id", planId)
    .single();

  if (planError || !plan) {
    return json({ error: "Plan not found" }, 404);
  }

  const stripePriceId: string | undefined =
    plan.stripe_price_id ?? PRICE_BY_PLAN[planId];

  if (!stripePriceId) {
    return json(
      {
        error:
          "Stripe pricing not yet configured for this plan. Please contact support.",
      },
      422,
    );
  }

  // ── Create Stripe Checkout Session ───────────────────────────────────────────
  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: stripePriceId, quantity: 1 }],
      customer_email: user.email,
      success_url: `${APP_URL}/billing/callback?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
      // Metadata is echoed in checkout.session.completed — used by the webhook
      // handler to activate the right subscription without a DB lookup.
      metadata: {
        user_id: user.id,
        plan_id: planId,
        email: user.email,
      },
      // Allow promotion codes (e.g. for launch discounts).
      allow_promotion_codes: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    console.error("Stripe session creation failed:", message);
    return json({ error: message }, 502);
  }

  if (!session.url) {
    return json({ error: "No checkout URL returned by Stripe" }, 502);
  }

  return json({ url: session.url, session_id: session.id });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
