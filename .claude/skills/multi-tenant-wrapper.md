
---

## 7. `.claude/skills/multi-tenant-testing.md`
```markdown
---
name: multi-tenant-testing
description: Test patterns that must pass before advancing a phase — isolation, quota, auth, webhooks.
---

# Multi-Tenant + Security Tests

Write these with pytest + pytest-asyncio. They are gating requirements.

## Required test cases
1. **Auth happy path** — register → verify → login → refresh → logout.
2. **Multi-tenant isolation** — user A GET/DELETE on user B's strategy,
   backtest, or bot → **403**. (Use 403, not 404.)
3. **Quota** — exceed plan limit → **429**. Unlimited plan (`-1`) never blocks.
4. **Stripe webhook** — tampered body / bad signature → **400**.
5. **Admin gate** — non-admin on any `/admin/*` route → **403**.
6. **Encryption** — stored `ciphertext != plaintext` for exchange keys.

## Isolation test skeleton
```python
async def test_user_a_cannot_access_user_b(client, user_a, user_b, strategy_b):
    r = await client.get(f"/api/v1/strategy/{strategy_b.id}",
                         headers=auth_header(user_a))
    assert r.status_code == 403
