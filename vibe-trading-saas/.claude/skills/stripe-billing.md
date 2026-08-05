# Skill: Stripe billing for this project

Three fixed-price subscription tiers (`docs/PROJECT_BRIEF.md` → pricing
table). No metered billing, no add-on purchases at MVP (`CLAUDE.md`
explicitly defers those). Keep the integration boring: Checkout + Portal +
Webhooks, nothing custom.

## Checkout

Create a Checkout Session server-side (Next.js API route, using the secret
key — never the client), redirect the user to it:

```ts
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: profile.stripe_customer_id ?? undefined,
  customer_email: profile.stripe_customer_id ? undefined : user.email,
  line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
  success_url: `${origin}/dashboard?checkout=success`,
  cancel_url: `${origin}/pricing?checkout=cancelled`,
  client_reference_id: user.id, // ties the session back to our user row
});
```

`client_reference_id` (or a `metadata.user_id` on the subscription) is how
the webhook handler maps a Stripe object back to `profiles.id` — don't rely
on email matching, it's fragile across email changes.

## Webhook handler — idempotency is the whole point

Per `CLAUDE.md` rule 9 and `docs/DATABASE_SCHEMA.md`'s `webhook_events`
table:

```ts
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, webhookSecret); // throws on bad sig — let it 400

  const { error: insertError } = await supabaseAdmin
    .from("webhook_events")
    .insert({ stripe_event_id: event.id, type: event.type, payload: event });

  if (insertError?.code === "23505") {
    // unique_violation on stripe_event_id — already processed, no-op.
    return new Response(null, { status: 200 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      // create/update subscriptions row, create the first usage_periods row
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // update subscriptions.status, current_period_end, cancel_at_period_end
      break;
  }

  await supabaseAdmin
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", event.id);

  return new Response(null, { status: 200 });
}
```

Key points, all from `docs/DATABASE_SCHEMA.md`'s `webhook_events` design:
verify the signature before touching anything; insert into `webhook_events`
first and treat a unique-violation as "already handled, return 200" (Stripe
retries on non-2xx, so a silent no-op is correct, not a bug); only mark
`processed_at` after the real work succeeds, so a crash mid-handler leaves
it retryable.

## New billing period → new usage_periods row

`current_period_start`/`current_period_end` on `subscriptions` (updated by
the webhook above) is what should trigger creating the next
`usage_periods` row — do this in the same webhook handler for
`customer.subscription.updated` when the period rolls over, not as a
separate cron job at MVP (simpler, and `CLAUDE.md` says prefer boring).

## Customer Portal

Billing settings page just redirects to a Portal session:

```ts
const portalSession = await stripe.billingPortal.sessions.create({
  customer: profile.stripe_customer_id,
  return_url: `${origin}/settings/billing`,
});
```

Don't build custom plan-change/cancellation UI — the Portal already does
this and keeps `subscriptions` in sync via the same webhook path.

## Test-mode discipline

Always develop against Stripe test-mode keys. Switching to live keys is a
deliberate, explicitly-confirmed step (`CLAUDE.md` rule 2,
`docs/30_DAY_PLAN.md` Day 29) — never something that happens because an env
var was copied from the wrong place.
