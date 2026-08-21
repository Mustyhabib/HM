# LAUNCH CHECKLIST — H~M Trading Institute

Production-readiness audit compiled from the code (env-var map: frontend `VITE_*`,
worker `config.py`, Edge Functions `Deno.env.get`) + infra state.
**Status as of 2026-08-21** — deploys are LIVE (frontend, worker, Cloudflare); the
remaining items are billing/email/legal/cleanup + the pre-launch hardening decided in
the Quant Research OS grilling (see UPGRADE_ROADMAP.md §4 decision ledger).

Legend: 🔴 must do · 🟡 recommended · 🟢 optional
Domain correction: **`hmtrade.business`** is live (Vercel alias `hm-ashy-six.vercel.app`).
`hmtrade-business.com` does NOT exist — do not use it anywhere.

---

## A · Supabase platform (dashboard / CLI)

- [x] 🔴 **Edge Function secrets** — ✅ VERIFIED SET (9 secrets incl. `APP_URL` +
      `PAYSTACK_SECRET_KEY`; proven by live E2E signature checks).
- [ ] 🔴 **Auth URLs** — Dashboard → Authentication → URL Configuration:
      Site URL = **`https://hmtrade.business`**; redirect allowlist includes
      `/billing/callback`. ⚠️ older checklists said `hmtrade-business.com` — wrong domain.
- [x] 🔴 **Seed Paystack plan codes** — ✅ seeded (test codes; swap to LIVE at B4).
- [x] 🟡 **Realtime / Storage buckets** — ✅ VERIFIED (publication + policies SQL-confirmed).
- [ ] 🔴 **Branded auth emails** — Dashboard → Auth → Emails: paste the 5 templates from
      `supabase/email-templates/auth/`. Sender: **"H~M Trading Institute <no-reply@hmtrade.business>"**.
- [ ] 🟡 **Custom SMTP** — **decision (R3-Q5): Resend free tier** (3,000/mo) for auth +
      transactional. Dashboard → Auth → SMTP settings with Resend creds.
- [ ] 🔴 **Admin verify** — owner login → `/admin` loads; non-admin → redirect; suspend a
      test user → next run blocked with reason; `audit_logs` gains rows.
- [x] 🟡 **Supabase plan decision (R2-Q3)** — ✅ **STAY FREE** (student budget). Mitigations:
      🔴 **daily keepalive** (below) + 🟡 **manual `pg_dump` backups** on a schedule.

## B · Paystack (the last 🔨)

- [x] 🔴 **Test plans + seed + E2E harness** — ✅ 8/9 PASS, 0 FAIL live (2026-08-18);
      [BUG-2] renewal idempotency fixed. Remaining harness gap:
  ```bash
  cd /home/aurora/HM
  PAYSTACK_SECRET_KEY=<sk_test_...> SUPABASE_URL=https://wqjdumforbalfmtawwpg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service_role> \
  E2E_TEST_USER_ID=<owner-id> E2E_TEST_USER_EMAIL=mustaphahabib270@gmail.com \
  node scripts/paystack-e2e.mjs --live
  ```
  (Hard-refuses `sk_live_` keys. Never paste these values into chat.)
- [ ] 🔴 **charge case** — real completed Paystack TEST transaction: run the frontend
      locally, pay with test card `4084 0840 8408 4081`, re-run with
      `PAYSTACK_TEST_REFERENCE=<ref>` — exercises init → checkout → webhook →
      re-verification → activation end-to-end.
- [x] 🟡 **Renewal test** — ✅ PASSED LIVE (past_due on failure, extend on success).
- [ ] 🔴 **At launch only**: swap `plans.provider_price_id` to **live** codes +
      `PAYSTACK_SECRET_KEY=sk_live_...` (function secret). Full loop once with a real card.
- [ ] 🟢 **Stripe** — **DEFERRED** (R1-Q6) until the entity/Atlas path is real. Design
      recorded in CLAUDE.md + roadmap; do not build yet.

## C · Frontend → Vercel

- [x] 🔴 **Deploy** — ✅ **LIVE** (`hmtrade.business` / `hm-ashy-six.vercel.app`, verified
      2026-08-19). Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`.
- [ ] 🟡 **Env-var purge** — remove Supabase-integration junk vars on Vercel (keep the 3 `VITE_*`).

## D · Worker → Railway

- [x] 🔴 **Deploy** — ✅ **LIVE** (service "HM", deploy b014355f, `/health` :9100,
      `WORKER_EXECUTE_TRADI=true`, Sentry on). Env: `SUPABASE_URL`,
      `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_EXECUTE_TRADI`, `WORKER_RUNS_ROOT`, `LOG_LEVEL`,
      `SENTRY_DSN`, `WORKER_ID`.
- [ ] 🔴 **Engine smoke test through the deployed worker** — one real run E2E (BYOK key
      injection + artifacts + progress streaming). (Local loop was verified; confirm on the
      deployed service.)
- [ ] 🟡 **`tradi-api` service** — confirm whether it actually runs; if idle, kill it
      (≈$5/mo) or repurpose it for the Phase 1 FastAPI app. (Pending fact — Railway access.)
- [ ] 🟡 **`gh` CLI** — install (`apt install gh` + auth) for deploy-check verification
      (`gh api repos/Mustyhabib/HM/commits/<sha>/status`).

## E · Cloudflare

- [x] 🔴 **Zone + DNS + SSL** — ✅ **LIVE** (zone `hmtrade.business`, proxied CNAMEs,
      Full strict, GTS cert). Recommended: turn **Browser Integrity Check OFF** (server
      clients get 1010 otherwise).
- [ ] 🟡 **Revoke the surplus `cfut_` token** — keep `cfat_` (DNS:Edit only).

## F · Email

- [ ] 🔴 **Create the `support@hmtrade.business` mailbox.**
- [ ] 🔴 **Resend free tier setup (R3-Q5)** — API key → Supabase Auth SMTP; transactional
      provider for the 3 bracket-placeholder templates in
      `supabase/email-templates/transactional/`.
- [ ] 🟡 Run `node scripts/email-templates-check.mjs` after template edits.

## G · Legal / launch prep

- [ ] 🔴 Legal review fills `SUPPORT_PHONE` + `MAILING_ADDRESS` in
      `Tradi/frontend/src/lib/company.ts` (single source — footer, Terms §14, Privacy §12,
      admin About/System update automatically).
- [ ] 🔴 ToS/Privacy registrant blocks reviewed (Nigerian jurisdiction lines).
- [ ] 🟢 Verify `tel:` link activates in SiteFooter once phone has real digits.

## H · Reliability / cleanup (new, from the grilling)

- [ ] 🔴 **Supabase free-tier keepalive** — free projects pause after 7 days of no API
      activity. Add a **daily keepalive** (e.g., Vercel cron hitting the Supabase API, or a
      Railway scheduled job) so a live product never pauses. (R2-Q3 mitigation.)
- [ ] 🟡 **Manual `pg_dump` schedule** — no automated backups on the free tier; script a
      periodic dump (Supabase CLI or dashboard export) to local/Storage.
- [ ] 🟡 **Sentry smoke** — trigger a frontend error + a worker error → both appear in
      sentry.io.
- [ ] 🟡 **Rate-limit safety net** (30 runs/hour/user) behaves under load.
- [ ] 🔴 **Cleanup test accounts** — `admin.tester@hmtest.local` + `user.tester@hmtest.local`
      (creds at `/tmp/hm_admin_creds.json`) before launch.

---

## Critical path (to launch)

1. **B2 (charge case) + B4 (live switch)** — closes Paystack.
2. **A (Auth URLs + branded emails via Resend SMTP)** + **F (support mailbox)**.
3. **H (keepalive + cleanup)** — the free-tier safety net.
4. **G (legal fields)** — registrant blocks + company.ts.

Generated by the HM pipeline + Quant Research OS planning (2026-08-21). Update this file
as items complete — it is the single launch-tracking artifact.
