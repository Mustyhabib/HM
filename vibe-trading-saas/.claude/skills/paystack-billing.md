# Skill: Paystack billing for this project

How to wire subscription billing for the three tiers with **Paystack** —
the MVP provider. The provider decision + rationale live in `docs/DECISIONS.md`
(D8); this is the code-level how-to. **Stripe is parked** (`stripe-billing.md`);
Flutterwave is only a category-rejection fallback.

## Ground rules

- **Test keys only** until launch: `sk_test_...` / `pk_test_...`. Switching to
  live (`sk_live_`/`pk_live_`) is the explicit, confirmed Day-29 step
  (`CLAUDE.md` rule 2), never a side effect of deploying.
- **Secret key is server-side only** (Next.js API routes, worker). Only the
  **public key** may reach the browser (`VITE_PAYSTACK_PUBLIC_KEY`).
- **Amounts are in kobo.** `plans.price_ngn` stores whole Naira; multiply by 100
  for every Paystack `amount` (₦70,000 → `7000000`). Set `currency: "NGN"`.
- Never trust the client for what was paid — always re-verify server-side.

## Schema mapping (columns already exist, provider-neutral)

| Our column | Paystack value |
|---|---|
| `profiles.billing_customer_id` | customer code (`CUS_...`) |
| `plans.provider_price_id` | plan code (`PLN_...`), one per tier |
| `subscriptions.provider_subscription_id` | subscription code (`SUB_...`) |
| `webhook_events.provider_event_id` | event id / dedupe key |

No migration needed — the live schema is already neutral + `price_ngn`.

## Setup (once)

Create a **Plan** per tier (Dashboard or `POST /plan`): `name`,
`interval: "monthly"`, `amount` (kobo), `currency: "NGN"`. Store each returned
plan code in `plans.provider_price_id`.

## Subscribe flow

1. Client hits our API route `POST /api/checkout` with the chosen `plan_id`.
2. Server (service role) calls `POST https://api.paystack.co/transaction/initialize`
   with `email`, `amount` (kobo), `plan` (plan code), `callback_url`. Returns an
   `authorization_url`.
3. Redirect the user to `authorization_url` (Paystack hosted checkout).
4. Grant nothing until the webhook + verify step below confirms payment.

## Webhook handler — `POST /api/webhooks/paystack`

1. Read the **raw** body and compute `HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY)`;
   compare to the `x-paystack-signature` header. Mismatch → 401, no writes. This
   is *before* any DB write (`SECURITY_CHECKLIST.md`).
2. Idempotency: insert into `webhook_events` (`provider_event_id` UNIQUE); a
   unique-violation means already-seen → 200 no-op. Don't invent a second dedupe
   mechanism (`CLAUDE.md` rule 9).
3. Handle events:
   - `charge.success` — re-verify via `GET /transaction/verify/{reference}` and
     confirm `status === "success"`, `amount`, and `currency` match the plan
     **before** any money-affecting write. Then upsert `subscriptions` (active),
     set `current_period_start/end`, and create the `usage_periods` row that
     grants quota.
   - `subscription.create` — capture `subscription_code` →
     `subscriptions.provider_subscription_id`.
   - `subscription.disable` / `subscription.not_renew` — mark `canceled` /
     `cancel_at_period_end`; quota stops at period end.
   - `invoice.payment_failed` — mark `past_due`; don't extend the period.
4. Set `webhook_events.processed_at` and return 200 only after the handler
   succeeds.

## Billing management

Paystack has **no hosted customer portal** (unlike Stripe). Build cancel /
change-plan as our own API routes calling Paystack (`/subscription/disable`,
new-plan checkout). The `SaasSettings` billing tab links to these, not an
external portal.

## Compliance (do not skip)

Paystack (and Flutterwave) restrict crypto/forex/"trading"/signals businesses.
In the merchant application, describe this as **AI research/education software —
a SaaS subscription**, matching `CLAUDE.md` ("analysis/research only, not live
trading"). If Paystack rejects the category at KYC, **Flutterwave** is the more
permissive fallback (same NGN model; webhook auth via `verif-hash` instead of
`x-paystack-signature`).

## Review checklist (mirrors `security-review.md`)

- Signature verified on the **raw** body, before any DB write?
- Transaction re-verified via `/transaction/verify/{reference}` before granting
  quota or marking paid?
- `webhook_events` unique-violation treated as a no-op (idempotent)?
- Secret key never in the client bundle or logs?
- Amounts in kobo (×100), currency `NGN`?
