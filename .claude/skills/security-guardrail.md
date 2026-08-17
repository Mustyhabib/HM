---
name: security-guardrails
description: Non-negotiable security rules for every backend feature. Load before writing any route, service, or DB query.
---

# Security Guardrails (enforce in EVERY feature, no exceptions)

Before writing any backend code, confirm all of these hold. Violations are blockers.

1. **Row isolation** — every DB query that touches user data MUST filter:
   `WHERE user_id = current_user.id`. Never trust a client-supplied user_id.
2. **Exchange keys** — AES-256-GCM encrypt (key=`ENCRYPTION_KEY`) BEFORE insert.
   Never log, never return ciphertext, never return plaintext via any API.
3. **Quota check** — call `check_quota(user, action)` BEFORE invoking Vibe-Trading.
   Actions: "run" | "backtest" | "bot". `-1` = unlimited. Over limit → HTTP 429.
4. **Admin gate** — every `/admin/*` route requires `role == "admin"` AND 2FA,
   enforced by the `require_admin` dependency. Non-admin → 403.
5. **Stripe webhook** — reject if `Stripe-Signature` header is invalid. Verify
   BEFORE parsing the body.
6. **Rate limiting** — `fastapi-limiter` on all endpoints, per-plan Redis keys.
   `/auth/login` max 10/min per IP.
7. **CORS** — whitelist the frontend domain only. Never `allow_origins=["*"]`
   with credentials.
8. **Suspended users** — `get_current_user` returns 403 if `is_suspended`.

## Checklist before finishing any backend task
- [ ] Every SELECT/UPDATE/DELETE scoped to current user
- [ ] No plaintext secrets in logs, responses, or DB
- [ ] Quota checked before engine call
- [ ] Admin routes behind require_admin
- [ ] Webhook signature verified
