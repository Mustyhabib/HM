/**
 * paystack-fixtures.mjs — Realistic Paystack webhook payload fixtures + the
 * HMAC-SHA512 signing helper used to compute the x-paystack-signature header.
 *
 * Zero dependencies: native node:crypto only. No network access, ever.
 *
 * IMPORTANT: the signature must be computed over the EXACT raw bytes that get
 * POSTed to the function. Callers must serialize a fixture ONCE (JSON.stringify)
 * and sign that exact string — do not re-serialize before/after signing, or the
 * signature will silently drift from the posted body (object key order is
 * stable in V8 for string keys, but re-stringifying is still the wrong pattern
 * to teach, so both paystack-e2e.mjs and this file follow this discipline).
 */

import { createHmac } from "node:crypto";

// ── Signing ──────────────────────────────────────────────────────────────
/**
 * Computes the Paystack webhook signature: hex-encoded HMAC-SHA512 of the
 * raw request body, keyed by the Paystack secret key. Mirrors
 * supabase/functions/paystack-webhook/index.ts verifySignature().
 *
 * @param {string} secret - Paystack secret key (test key in this harness).
 * @param {string} rawBody - The exact string that will be POSTed as the body.
 * @returns {string} lowercase hex digest.
 */
export function signPayload(secret, rawBody) {
  return createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
}

export const RAW_JSON_NOTE =
  "fixtures serialize with JSON.stringify; the signature is computed over the EXACT raw bytes posted";

// ── Fixtures ─────────────────────────────────────────────────────────────
// Each fixture returns a plain object shaped like a real Paystack webhook
// event. Field casing intentionally varies across fixtures (snake_case and
// camelCase) to exercise the webhook's pickDate() normalization.

export const fixtures = {
  /**
   * charge.success — first-time subscription payment. The webhook re-verifies
   * this against Paystack's transaction/verify API before trusting it, so the
   * live harness only exercises this path in --live mode (mocking verify is
   * out of scope for --fixtures, which stays fully offline).
   */
  chargeSuccess(userId, planId, ref) {
    return {
      event: "charge.success",
      data: {
        reference: ref,
        status: "success",
        amount: 2000000, // NGN 20,000.00 in kobo
        paid_at: "2026-08-17T10:00:00.000Z",
        metadata: {
          user_id: userId,
          plan_id: planId,
          email: "test-user@example.com",
        },
        subscription_data: {
          subscription_code: `SUB_${ref}`,
          next_payment_date: "2026-09-17T10:00:00.000Z",
        },
      },
    };
  },

  /**
   * subscription.create — fired alongside charge.success for new
   * subscriptions. Resolves the user via customer.email, the plan via
   * plan.plan_code. Uses camelCase createdAt to exercise pickDate.
   */
  subscriptionCreate(email, planCode, code) {
    return {
      event: "subscription.create",
      data: {
        subscription_code: code,
        customer: { email },
        plan: { plan_code: planCode },
        createdAt: "2026-08-17T10:00:00.000Z",
        next_payment_date: "2026-09-17T10:00:00.000Z",
      },
    };
  },

  /** subscription.disable — cancellation. */
  subscriptionDisable(code) {
    return {
      event: "subscription.disable",
      data: {
        subscription_code: code,
      },
    };
  },

  /**
   * subscription.charge — renewal succeeded (modern Paystack renewal event).
   * data.id is a distinct id per renewal ATTEMPT (Paystack fires one of these
   * per attempt over a subscription's lifetime) — required so the paid and
   * failed attempts below don't collapse onto the same dedupe key. Defaults
   * to a value derived from `code` but callers can pass a real attempt id.
   */
  subscriptionChargePaid(code, nextDate = "2026-10-17T10:00:00.000Z", id = `evt_${code}_charge_paid`) {
    return {
      event: "subscription.charge",
      data: {
        id,
        subscription_code: code,
        status: "success",
        next_payment_date: nextDate,
      },
    };
  },

  /** subscription.charge — renewal failed. See subscriptionChargePaid re: data.id. */
  subscriptionChargeFailed(code, id = `evt_${code}_charge_failed`) {
    return {
      event: "subscription.charge",
      data: {
        id,
        subscription_code: code,
        status: "failure",
      },
    };
  },

  /**
   * invoice.update — renewal paid (nested under data.subscription, legacy
   * shape). data.id is a distinct id per renewal ATTEMPT — see
   * subscriptionChargePaid re: why this must vary across attempts.
   */
  invoiceUpdatePaid(code, nextDate = "2026-10-17T10:00:00.000Z", id = `evt_${code}_invoice_paid`) {
    return {
      event: "invoice.update",
      data: {
        id,
        paid: true,
        subscription: {
          subscription_code: code,
          next_payment_date: nextDate,
        },
      },
    };
  },

  /** invoice.update — renewal failed. See invoiceUpdatePaid re: data.id. */
  invoiceUpdateFailed(code, id = `evt_${code}_invoice_failed`) {
    return {
      event: "invoice.update",
      data: {
        id,
        paid: false,
        subscription: {
          subscription_code: code,
        },
      },
    };
  },
};
