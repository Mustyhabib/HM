# Paystack billing — E2E test scripts

Zero-dependency Node.js (v22) harness that exercises the `paystack-webhook`
Edge Function end-to-end: signature verification, idempotency, and every
event type the function handles (`charge.success`, `subscription.create`,
`subscription.disable` / `subscription.not_renew`, `subscription.charge`,
`invoice.update`).

Two files:

- `paystack-fixtures.mjs` — realistic Paystack webhook payloads + the
  HMAC-SHA512 signing helper (`node:crypto` only).
- `paystack-e2e.mjs` — the runner. `--fixtures` mode is fully offline;
  `--live` mode posts to a deployed function and asserts DB state via the
  Supabase REST API.

No npm dependencies. No secrets are ever written to a file — everything
sensitive comes from the environment at run time.

## 1. `--fixtures` mode (offline, run this first)

```bash
node scripts/paystack-e2e.mjs --fixtures
```

Builds and signs every fixture, asserts payload shape and signature format
(128-char lowercase hex HMAC-SHA512). **Makes zero network calls.** No env
vars required. This is the in-repo automated check — it must exit 0.

## 2. Deploy the function

The Edge Function can't be run locally (Deno isn't installed on this box).
Deploy it, then verify with `--live`.

```bash
supabase functions deploy paystack-init paystack-webhook
```

(or via Claude Code's Supabase MCP `deploy_edge_function` tool.)

## 3. Set secrets

```bash
supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx \
  APP_URL=https://hmtrade-business.com
```

Use a **TEST** key here. Never a `sk_live_` key while testing.

## 4. Seed `plans.provider_price_id`

`subscription.create` and `charge.success` resolve a plan by Paystack plan
code, so at least one row in `plans` needs a real (test-mode) Paystack plan
code in `provider_price_id` before those paths can be exercised live.

## 5. Run the live suite

```bash
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx \
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/paystack-e2e.mjs --live
```

Optional env:

| Var | Purpose |
|---|---|
| `FUNCTION_BASE_URL` | Defaults to `${SUPABASE_URL}/functions/v1`. Override to test against a different environment. |
| `E2E_TEST_USER_ID` | An existing `profiles.id`. Enables `disable`, `renewal`, `invoice`, and `charge` — these seed/mutate a `subscriptions` row and need a real `user_id` to satisfy the FK. Without it, those cases are **skipped**, not failed. |
| `E2E_TEST_USER_EMAIL` | An existing `profiles.email`. Enables `subscription-create`. Skipped without it. |
| `E2E_TEST_PLAN_ID` | Defaults to `starter`. Used when seeding rows for `disable` / `renewal` / `invoice` / `charge`. |
| `PAYSTACK_TEST_REFERENCE` | A real, completed Paystack **test-mode** transaction reference. Enables `charge` — the function re-verifies `charge.success` against Paystack's live `transaction/verify` API, so this can't be faked offline. Skipped without it. |

Run a subset:

```bash
node scripts/paystack-e2e.mjs --live --only bad-signature,idempotency
```

**Hard guard:** the harness refuses to run (exit 1, both modes) if
`PAYSTACK_SECRET_KEY` starts with `sk_live_`. Use a throwaway/dev Supabase
project or branch, never production, for your first `--live` run.

The harness cleans up any `subscriptions` / `webhook_events` rows it seeds
or creates as part of its own test cases (best-effort, on exit).

## Expected results

| Case | What it checks | Requires |
|---|---|---|
| `missing-signature` | POST with no `x-paystack-signature` header → 400 | — |
| `bad-signature` | POST with a tampered signature → 401 | — |
| `invalid-json` | Valid signature over unparseable body → 400 | — |
| `idempotency` | Same event posted twice → 200 both times, exactly 1 `webhook_events` row | — |
| `subscription-create` | `subscription.create` → active `subscriptions` row, correct `plan_id` | `E2E_TEST_USER_EMAIL`, a plan with `provider_price_id` set |
| `disable` | `subscription.disable` → `status = 'canceled'` | `E2E_TEST_USER_ID` |
| `renewal` | `subscription.charge` paid → `active` + extended `current_period_end`; failed → `past_due` | `E2E_TEST_USER_ID` |
| `invoice` | `invoice.update` paid → `active` + extended period; failed → `past_due` | `E2E_TEST_USER_ID` |
| `charge` | `charge.success` (re-verified against Paystack) → active subscription for the user | `E2E_TEST_USER_ID`, `PAYSTACK_TEST_REFERENCE` |

Exit code is 0 iff every non-skipped case passes. Skips are reported but do
not fail the run — set the relevant env vars to turn a skip into a real
assertion.

## Known upstream quirk (not fixed by this pass, flagged for follow-up)

`invoice.update` events derive their idempotency key from
`event.data.subscription_code`, which does not exist at the top level of an
`invoice.update` payload (the code lives at `event.data.subscription.subscription_code`
instead). Every `invoice.update` event therefore dedupes under the same key
(`invoice.update::unknown`), so a second renewal's `invoice.update` for a
*different* subscription would be silently dropped as a "duplicate" of the
first. This existed before this change set and is out of scope here (the
design doc's fix list is D-P1..D-P4, none of which touch dedupe-key
derivation) — flagging for the next pass.
