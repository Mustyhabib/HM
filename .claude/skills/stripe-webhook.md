---
name: stripe-webhook
description: Correct Stripe webhook handling — raw body, signature verification, idempotent subscription upserts.
---

# Stripe Webhook (common gotchas)

## Critical: raw bytes before parsing
The webhook endpoint must NOT use the normal `get_db` / Pydantic-body pattern.
Read the RAW request bytes first so Stripe signature verification works:

```python
@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()          # raw bytes
    sig = request.headers.get("Stripe-Signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="invalid signature")
    return await billing_svc.handle_webhook(event)
