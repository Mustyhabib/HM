#!/usr/bin/env node
/**
 * paystack-e2e.mjs — Paystack billing webhook harness.
 *
 * Zero dependencies: native fetch + node:crypto + node:assert only.
 * Targets node v22.
 *
 * Modes:
 *   node scripts/paystack-e2e.mjs --fixtures
 *     Offline. Builds + signs every fixture, asserts payload shape and
 *     signature format. NEVER touches the network. Safe to run anywhere,
 *     any time, with no env vars set.
 *
 *   node scripts/paystack-e2e.mjs --live [--only case1,case2,...]
 *     Posts signed fixtures at a DEPLOYED paystack-webhook function and
 *     asserts HTTP responses + resulting DB state via the Supabase REST
 *     API (service-role key). Requires env vars — see README.md.
 *
 * Hard safety rule: refuses to run (any mode) if PAYSTACK_SECRET_KEY is set
 * and looks like a live key (starts with "sk_live_"). This harness must
 * only ever be pointed at Paystack TEST keys.
 */

import assert from "node:assert/strict";
import { fixtures, signPayload } from "./paystack-fixtures.mjs";

// ── CLI parsing ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { mode: null, only: null, help: false };
  for (const a of argv) {
    if (a === "--fixtures") args.mode = "fixtures";
    else if (a === "--live") args.mode = "live";
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--only=")) args.only = a.slice("--only=".length).split(",");
    else if (a === "--only") args.only = "NEXT"; // consume next token below
    else if (args.only === "NEXT") args.only = a.split(",");
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/paystack-e2e.mjs --fixtures
  node scripts/paystack-e2e.mjs --live [--only case1,case2,...]

Live cases: missing-signature, bad-signature, invalid-json, idempotency,
            subscription-create, disable, renewal, invoice, charge

Live mode env (required): PAYSTACK_SECRET_KEY (TEST key), SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
Live mode env (optional): FUNCTION_BASE_URL (default \${SUPABASE_URL}/functions/v1),
  E2E_TEST_USER_ID, E2E_TEST_USER_EMAIL, E2E_TEST_PLAN_ID,
  PAYSTACK_TEST_REFERENCE (enables the "charge" case)
`);
}

// ── Hard live-key guard ──────────────────────────────────────────────────
// Applies in BOTH modes: an sk_live_ key sitting in the environment while
// this harness runs is itself a hazard, even in --fixtures mode where it's
// never used for a network call. Refuse outright rather than silently
// ignoring it.
function guardAgainstLiveKey() {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (key.startsWith("sk_live_")) {
    console.error(
      "REFUSING TO RUN: PAYSTACK_SECRET_KEY starts with sk_live_ (a LIVE Paystack key). " +
        "This harness must only be run against a TEST key (sk_test_...). Aborting.",
    );
    process.exit(1);
  }
}

// ── Shape assertions (offline) ───────────────────────────────────────────
function assertChargeSuccessShape(evt) {
  assert.equal(evt.event, "charge.success");
  assert.ok(typeof evt.data.reference === "string" && evt.data.reference.length > 0);
  assert.equal(evt.data.status, "success");
  assert.ok(evt.data.metadata?.user_id);
  assert.ok(evt.data.metadata?.plan_id);
  assert.ok(evt.data.subscription_data?.subscription_code);
  assert.ok(evt.data.subscription_data?.next_payment_date);
}

function assertSubscriptionCreateShape(evt) {
  assert.equal(evt.event, "subscription.create");
  assert.ok(evt.data.subscription_code);
  assert.ok(evt.data.customer?.email);
  assert.ok(evt.data.plan?.plan_code);
  assert.ok(evt.data.createdAt);
}

function assertSubscriptionDisableShape(evt) {
  assert.equal(evt.event, "subscription.disable");
  assert.ok(evt.data.subscription_code);
}

function assertSubscriptionChargeShape(evt) {
  assert.equal(evt.event, "subscription.charge");
  assert.ok(evt.data.subscription_code);
  assert.ok(typeof evt.data.status === "string");
}

function assertInvoiceUpdateShape(evt) {
  assert.equal(evt.event, "invoice.update");
  assert.ok(typeof evt.data.paid === "boolean");
  assert.ok(evt.data.subscription?.subscription_code);
}

// Mirrors the webhook's own dedupe key derivation — used to sanity-check
// idempotency behavior offline, and to build REST filters live.
// Must stay in sync with index.ts: subscription codes may be nested
// (invoice.update carries data.subscription.subscription_code), and
// subscription.charge / invoice.update need an attempt component (data.id)
// so each renewal attempt gets its own key — see index.ts for why.
function deriveDedupeKey(evt) {
  const subCode =
    evt.data?.subscription_code ??
    evt.data?.subscription?.subscription_code ??
    evt.data?.id ??
    "unknown";
  const attemptId =
    evt.data?.id ?? evt.data?.invoice?.id ?? evt.data?.transaction?.id ?? null;
  return (
    evt.data?.reference ??
    `${evt.event}::${subCode}${attemptId ? `::${attemptId}` : ""}`
  );
}

// ── --fixtures mode ──────────────────────────────────────────────────────
async function runFixtures() {
  // A real secret is never required offline — fall back to a clearly-fake
  // placeholder if none is set, purely to exercise the HMAC math. This is
  // NOT a credential and is never sent anywhere.
  const secret = process.env.PAYSTACK_SECRET_KEY || "offline_placeholder_not_a_real_key";

  const cases = [
    ["charge.success", fixtures.chargeSuccess("11111111-1111-1111-1111-111111111111", "starter", "ref_e2e_001"), assertChargeSuccessShape],
    ["subscription.create", fixtures.subscriptionCreate("test-user@example.com", "PLN_test_starter", "SUB_e2e_002"), assertSubscriptionCreateShape],
    ["subscription.disable", fixtures.subscriptionDisable("SUB_e2e_003"), assertSubscriptionDisableShape],
    ["subscription.charge (paid)", fixtures.subscriptionChargePaid("SUB_e2e_004"), assertSubscriptionChargeShape],
    ["subscription.charge (failed)", fixtures.subscriptionChargeFailed("SUB_e2e_005"), assertSubscriptionChargeShape],
    ["invoice.update (paid)", fixtures.invoiceUpdatePaid("SUB_e2e_006"), assertInvoiceUpdateShape],
    ["invoice.update (failed)", fixtures.invoiceUpdateFailed("SUB_e2e_007"), assertInvoiceUpdateShape],
  ];

  console.log("── paystack-e2e --fixtures (offline, no network) ──\n");

  let failures = 0;
  for (const [label, evt, shapeAssert] of cases) {
    try {
      shapeAssert(evt);
      const raw = JSON.stringify(evt);
      const sig = signPayload(secret, raw);
      assert.equal(sig.length, 128, "HMAC-SHA512 hex digest must be 128 chars");
      assert.match(sig, /^[0-9a-f]{128}$/, "signature must be lowercase hex");
      const dedupeKey = deriveDedupeKey(evt);
      assert.ok(
        dedupeKey && !dedupeKey.endsWith("::unknown"),
        `dedupe key must not collapse (got ${dedupeKey})`,
      );
      console.log(`  PASS  ${label}`);
      console.log(`        dedupeKey=${dedupeKey}`);
      console.log(`        signature=${sig.slice(0, 16)}...${sig.slice(-8)} (${sig.length} hex chars)`);
    } catch (err) {
      failures++;
      console.log(`  FAIL  ${label}`);
      console.log(`        ${err.message}`);
    }
  }

  console.log(`\n${cases.length - failures}/${cases.length} fixtures passed shape + signature checks.`);

  // ── Renewal-attempt collision regression (BUG-2) ──────────────────────
  // The bug this guards against: subscription.charge and invoice.update fire
  // once per renewal ATTEMPT (paid or failed) for the SAME subscription code.
  // Reusing "${event}::${subCode}" as the dedupe key made every attempt for
  // a subscription collapse onto one webhook_events row, so a failed renewal
  // after a paid one was silently dropped as "already processed". Exercise
  // the exact collision shape here — same code, paid then failed — and
  // assert the derived keys differ.
  console.log("\n── renewal-attempt dedupe key collision check (same subscription code) ──");
  const collisionCode = "SUB_e2e_collision_check";
  const collisionPairs = [
    ["subscription.charge", fixtures.subscriptionChargePaid(collisionCode), fixtures.subscriptionChargeFailed(collisionCode)],
    ["invoice.update", fixtures.invoiceUpdatePaid(collisionCode), fixtures.invoiceUpdateFailed(collisionCode)],
  ];
  for (const [label, paidEvt, failedEvt] of collisionPairs) {
    const paidKey = deriveDedupeKey(paidEvt);
    const failedKey = deriveDedupeKey(failedEvt);
    console.log(`  ${label}: paid=${paidKey}`);
    console.log(`  ${label}: failed=${failedKey}`);
    try {
      assert.notEqual(paidKey, failedKey, `${label}: paid and failed attempts must not share a dedupe key`);
      console.log(`  PASS  ${label} paid/failed keys differ`);
    } catch (err) {
      failures++;
      console.log(`  FAIL  ${label}`);
      console.log(`        ${err.message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} fixture check(s) failed.`);
    process.exit(1);
  }
  console.log("\nOK — zero network access used.");
  process.exit(0);
}

// ── --live mode helpers ──────────────────────────────────────────────────
function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    console.error(`Missing required env var(s) for --live: ${missing.join(", ")}`);
    console.error("See scripts/README.md for the full list.");
    process.exit(1);
  }
}

function restHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function restSelect(supabaseUrl, serviceKey, table, query) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: restHeaders(serviceKey, { Accept: "application/json" }),
  });
  if (!res.ok) throw new Error(`REST select ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function restInsert(supabaseUrl, serviceKey, table, row) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: restHeaders(serviceKey, { Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`REST insert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function restDelete(supabaseUrl, serviceKey, table, query) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: restHeaders(serviceKey),
  });
  if (!res.ok) console.error(`  (cleanup) REST delete ${table} failed: ${res.status}`);
}

async function pollUntil(fn, { tries = 10, intervalMs = 1000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

async function postWebhook(functionBase, rawBody, signature) {
  const headers = { "Content-Type": "application/json" };
  if (signature !== null) headers["x-paystack-signature"] = signature;
  const res = await fetch(`${functionBase}/paystack-webhook`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const text = await res.text();
  return { status: res.status, text };
}

// ── --live mode ───────────────────────────────────────────────────────────
async function runLive(only) {
  requireEnv(["PAYSTACK_SECRET_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const functionBase = (process.env.FUNCTION_BASE_URL || `${supabaseUrl}/functions/v1`).replace(/\/+$/, "");

  const results = []; // {name, status: 'pass'|'fail'|'skip', detail}
  const cleanup = []; // async () => void, run in reverse order at the end
  const runId = `E2E_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  function report(name, status, detail = "") {
    results.push({ name, status, detail });
    const tag = status === "pass" ? "PASS" : status === "skip" ? "SKIP" : "FAIL";
    console.log(`  ${tag}  ${name}${detail ? `\n        ${detail}` : ""}`);
  }

  async function seedSubscription(code, extra = {}) {
    const userId = process.env.E2E_TEST_USER_ID;
    const planId = process.env.E2E_TEST_PLAN_ID || "starter";
    if (!userId) return null; // caller must handle skip
    const row = await restInsert(supabaseUrl, serviceKey, "subscriptions", {
      user_id: userId,
      plan_id: planId,
      provider_subscription_id: code,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
      cancel_at_period_end: false,
      ...extra,
    });
    cleanup.push(() =>
      restDelete(supabaseUrl, serviceKey, "subscriptions", `provider_subscription_id=eq.${encodeURIComponent(code)}`),
    );
    return row;
  }

  const CASES = {
    async "missing-signature"() {
      const evt = fixtures.subscriptionDisable(`${runId}_missing_sig`);
      const raw = JSON.stringify(evt);
      const { status } = await postWebhook(functionBase, raw, null);
      assert.equal(status, 400, `expected 400, got ${status}`);
    },

    async "bad-signature"() {
      const evt = fixtures.subscriptionDisable(`${runId}_bad_sig`);
      const raw = JSON.stringify(evt);
      const valid = signPayload(secret, raw);
      const tampered = (valid[0] === "0" ? "1" : "0") + valid.slice(1);
      const { status } = await postWebhook(functionBase, raw, tampered);
      assert.equal(status, 401, `expected 401, got ${status}`);
    },

    async "invalid-json"() {
      const raw = "{ this is not valid json ";
      const sig = signPayload(secret, raw);
      const { status } = await postWebhook(functionBase, raw, sig);
      assert.equal(status, 400, `expected 400, got ${status}`);
    },

    async idempotency() {
      const code = `${runId}_idem`;
      const evt = fixtures.subscriptionDisable(code);
      const raw = JSON.stringify(evt);
      const sig = signPayload(secret, raw);

      const first = await postWebhook(functionBase, raw, sig);
      assert.equal(first.status, 200, `first delivery expected 200, got ${first.status}`);

      const second = await postWebhook(functionBase, raw, sig);
      assert.equal(second.status, 200, `duplicate delivery expected 200, got ${second.status}`);

      const dedupeKey = deriveDedupeKey(evt);
      const rows = await restSelect(
        supabaseUrl,
        serviceKey,
        "webhook_events",
        `provider_event_id=eq.${encodeURIComponent(dedupeKey)}&select=id`,
      );
      assert.equal(rows.length, 1, `expected exactly 1 webhook_events row, found ${rows.length}`);
      cleanup.push(() =>
        restDelete(supabaseUrl, serviceKey, "webhook_events", `provider_event_id=eq.${encodeURIComponent(dedupeKey)}`),
      );
    },

    async "subscription-create"() {
      const email = process.env.E2E_TEST_USER_EMAIL;
      if (!email) {
        report("subscription-create", "skip", "set E2E_TEST_USER_EMAIL (an existing profiles.email) to enable");
        return "handled";
      }
      const plans = await restSelect(
        supabaseUrl,
        serviceKey,
        "plans",
        "provider_price_id=not.is.null&select=id,provider_price_id&limit=1",
      );
      if (plans.length === 0) {
        report("subscription-create", "skip", "no plans row has provider_price_id set — seed one first");
        return "handled";
      }
      const { id: planId, provider_price_id: planCode } = plans[0];
      const code = `${runId}_subcreate`;
      const evt = fixtures.subscriptionCreate(email, planCode, code);
      const raw = JSON.stringify(evt);
      const sig = signPayload(secret, raw);

      const { status } = await postWebhook(functionBase, raw, sig);
      assert.equal(status, 200, `expected 200, got ${status}`);
      cleanup.push(() =>
        restDelete(supabaseUrl, serviceKey, "subscriptions", `provider_subscription_id=eq.${encodeURIComponent(code)}`),
      );

      const result = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `provider_subscription_id=eq.${encodeURIComponent(code)}&select=status,plan_id`,
        );
        return { ok: rows.length === 1 && rows[0].status === "active", rows };
      });
      assert.ok(result.ok, `subscription row never reached status=active (last seen: ${JSON.stringify(result.rows)})`);
      assert.equal(result.rows[0].plan_id, planId);
    },

    async disable() {
      const code = `${runId}_disable`;
      const seeded = await seedSubscription(code);
      if (!seeded) {
        report("disable", "skip", "set E2E_TEST_USER_ID (an existing profiles.id) to enable");
        return "handled";
      }
      const evt = fixtures.subscriptionDisable(code);
      const raw = JSON.stringify(evt);
      const sig = signPayload(secret, raw);
      const { status } = await postWebhook(functionBase, raw, sig);
      assert.equal(status, 200, `expected 200, got ${status}`);

      const result = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `provider_subscription_id=eq.${encodeURIComponent(code)}&select=status`,
        );
        return { ok: rows.length === 1 && rows[0].status === "canceled", rows };
      });
      assert.ok(result.ok, `expected status=canceled, last seen: ${JSON.stringify(result.rows)}`);
    },

    async renewal() {
      const code = `${runId}_renewal`;
      const seeded = await seedSubscription(code);
      if (!seeded) {
        report("renewal", "skip", "set E2E_TEST_USER_ID (an existing profiles.id) to enable");
        return "handled";
      }
      const nextDate = "2027-01-17T10:00:00.000Z";

      const paidEvt = fixtures.subscriptionChargePaid(code, nextDate);
      const paidRaw = JSON.stringify(paidEvt);
      const paidSig = signPayload(secret, paidRaw);
      const paidRes = await postWebhook(functionBase, paidRaw, paidSig);
      assert.equal(paidRes.status, 200, `paid: expected 200, got ${paidRes.status}`);

      const paidResult = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `provider_subscription_id=eq.${encodeURIComponent(code)}&select=status,current_period_end`,
        );
        return {
          ok: rows.length === 1 && rows[0].status === "active" && rows[0].current_period_end?.startsWith("2027-01-17"),
          rows,
        };
      });
      assert.ok(paidResult.ok, `paid: expected active + extended period, last seen: ${JSON.stringify(paidResult.rows)}`);

      const failedEvt = fixtures.subscriptionChargeFailed(code);
      const failedRaw = JSON.stringify(failedEvt);
      const failedSig = signPayload(secret, failedRaw);
      const failedRes = await postWebhook(functionBase, failedRaw, failedSig);
      assert.equal(failedRes.status, 200, `failed: expected 200, got ${failedRes.status}`);

      const failedResult = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `provider_subscription_id=eq.${encodeURIComponent(code)}&select=status`,
        );
        return { ok: rows.length === 1 && rows[0].status === "past_due", rows };
      });
      assert.ok(failedResult.ok, `failed: expected past_due, last seen: ${JSON.stringify(failedResult.rows)}`);
    },

    async invoice() {
      const code = `${runId}_invoice`;
      const seeded = await seedSubscription(code);
      if (!seeded) {
        report("invoice", "skip", "set E2E_TEST_USER_ID (an existing profiles.id) to enable");
        return "handled";
      }
      const nextDate = "2027-02-17T10:00:00.000Z";

      const paidEvt = fixtures.invoiceUpdatePaid(code, nextDate);
      const paidRaw = JSON.stringify(paidEvt);
      const paidSig = signPayload(secret, paidRaw);
      const paidRes = await postWebhook(functionBase, paidRaw, paidSig);
      assert.equal(paidRes.status, 200, `paid: expected 200, got ${paidRes.status}`);

      const paidResult = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `provider_subscription_id=eq.${encodeURIComponent(code)}&select=status,current_period_end`,
        );
        return {
          ok: rows.length === 1 && rows[0].status === "active" && rows[0].current_period_end?.startsWith("2027-02-17"),
          rows,
        };
      });
      assert.ok(paidResult.ok, `paid: expected active + extended period, last seen: ${JSON.stringify(paidResult.rows)}`);

      const failedEvt = fixtures.invoiceUpdateFailed(code);
      const failedRaw = JSON.stringify(failedEvt);
      const failedSig = signPayload(secret, failedRaw);
      const failedRes = await postWebhook(functionBase, failedRaw, failedSig);
      assert.equal(failedRes.status, 200, `failed: expected 200, got ${failedRes.status}`);

      const failedResult = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `provider_subscription_id=eq.${encodeURIComponent(code)}&select=status`,
        );
        return { ok: rows.length === 1 && rows[0].status === "past_due", rows };
      });
      assert.ok(failedResult.ok, `failed: expected past_due, last seen: ${JSON.stringify(failedResult.rows)}`);
    },

    async charge() {
      const reference = process.env.PAYSTACK_TEST_REFERENCE;
      const userId = process.env.E2E_TEST_USER_ID;
      const planId = process.env.E2E_TEST_PLAN_ID || "starter";
      if (!reference || !userId) {
        report(
          "charge",
          "skip",
          "set PAYSTACK_TEST_REFERENCE (a real completed Paystack TEST transaction reference) " +
            "and E2E_TEST_USER_ID to enable — the function re-verifies against the live Paystack API",
        );
        return "handled";
      }
      const evt = fixtures.chargeSuccess(userId, planId, reference);
      const raw = JSON.stringify(evt);
      const sig = signPayload(secret, raw);
      const { status } = await postWebhook(functionBase, raw, sig);
      assert.equal(status, 200, `expected 200, got ${status}`);

      const result = await pollUntil(async () => {
        const rows = await restSelect(
          supabaseUrl,
          serviceKey,
          "subscriptions",
          `user_id=eq.${encodeURIComponent(userId)}&select=status,plan_id&order=updated_at.desc&limit=1`,
        );
        return { ok: rows.length === 1 && rows[0].status === "active" && rows[0].plan_id === planId, rows };
      });
      assert.ok(result.ok, `expected active subscription for user, last seen: ${JSON.stringify(result.rows)}`);
    },
  };

  const caseNames = only && only.length > 0 ? only : Object.keys(CASES);
  const unknown = caseNames.filter((n) => !CASES[n]);
  if (unknown.length > 0) {
    console.error(`Unknown --only case(s): ${unknown.join(", ")}`);
    console.error(`Valid cases: ${Object.keys(CASES).join(", ")}`);
    process.exit(1);
  }

  console.log(`── paystack-e2e --live (${functionBase}) ──\n`);

  try {
    for (const name of caseNames) {
      try {
        const handled = await CASES[name]();
        if (handled !== "handled") report(name, "pass");
      } catch (err) {
        report(name, "fail", err.message);
      }
    }
  } finally {
    for (const fn of cleanup.reverse()) {
      try {
        await fn();
      } catch {
        // best-effort cleanup; already logged inside restDelete
      }
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(`\n${passed} passed, ${skipped} skipped, ${failed} failed (${results.length} total).`);

  process.exit(failed > 0 ? 1 : 0);
}

// ── Entry point ───────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.mode) {
    printHelp();
    process.exit(args.mode ? 0 : 1);
  }

  guardAgainstLiveKey();

  if (args.mode === "fixtures") {
    await runFixtures();
  } else {
    await runLive(Array.isArray(args.only) ? args.only : null);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
