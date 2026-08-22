/**
 * paystack-init — Initialize a Paystack subscription checkout.
 *
 * Called by the authenticated frontend when a user clicks "Subscribe".
 * Flow:
 *   1. Verify Supabase JWT → get caller's user_id + email
 *   2. Look up the Paystack plan code from plans.provider_price_id
 *   3. Call Paystack transaction/initialize API
 *   4. Return { authorization_url, reference } to the frontend
 *
 * The frontend redirects the user to authorization_url.
 * After payment, Paystack redirects to APP_URL/billing/callback?reference=...
 * The paystack-webhook function handles the actual subscription activation.
 *
 * Secrets required (set via `supabase secrets set`):
 *   PAYSTACK_SECRET_KEY — Paystack secret key (sk_live_… or sk_test_…)
 *   APP_URL             — Frontend URL, e.g. https://hmtrade.business
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://hmtrade.business";

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

  // ── Auth ───────────────────────────────────────────────────────────────────
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

  // ── Parse body ─────────────────────────────────────────────────────────────
  let planId: string;
  try {
    ({ planId } = await req.json());
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: CORS });
  }
  if (!planId) {
    return new Response("planId required", { status: 400, headers: CORS });
  }

  // ── Resolve Paystack plan code ─────────────────────────────────────────────
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, price_ngn, provider_price_id")
    .eq("id", planId)
    .single();

  if (planError || !plan) {
    return json({ error: "Plan not found" }, 404);
  }
  if (!plan.provider_price_id) {
    return json(
      { error: "Billing not yet configured for this plan. Contact support." },
      422,
    );
  }

  // ── Initialize Paystack transaction ───────────────────────────────────────
  const paystackRes = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        // Amount in kobo. Plans use Paystack's configured amount.
        // Passing the amount here as a consistency check; Paystack still
        // uses the plan's amount when a plan code is present.
        amount: plan.price_ngn * 100,
        plan: plan.provider_price_id,
        callback_url: `${APP_URL}/billing/callback`,
        metadata: {
          // These fields are echoed back in charge.success webhook data.metadata
          user_id: user.id,
          plan_id: planId,
          email: user.email,
          cancel_action: `${APP_URL}/pricing`,
        },
      }),
    },
  );

  const result = await paystackRes.json();

  if (!result.status) {
    console.error("Paystack initialization failed:", result.message);
    return json({ error: result.message ?? "Payment initialization failed" }, 502);
  }

  return json({
    authorization_url: result.data.authorization_url,
    access_code: result.data.access_code,
    reference: result.data.reference,
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
