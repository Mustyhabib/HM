# LAUNCH CHECKLIST — H~M Trading Institute

Production-readiness audit compiled from the code (env-var map: frontend `VITE_*`,
worker `config.py`, Edge Functions `Deno.env.get`) + infra state as of 2026-08-18.
Tick each box as done. **All code is shipped; everything below is manual/infra.**

Legend: 🔴 must do · 🟡 recommended · 🟢 optional
*Status as of 2026-08-18 — MCP-executable Supabase items all closed (see A/H).*

---

## A · Supabase platform (dashboard / CLI)

- [x] 🔴 **Edge Function secrets** — ✅ VERIFIED SET via `supabase secrets list`
      (all 9 incl. `APP_URL` + `PAYSTACK_SECRET_KEY`; key proven TEST by live E2E
      signature checks). (`SUPABASE_URL` / `SUPABASE_ANON_KEY` /
      `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform — never set
      manually.)
- [ ] 🔴 **Auth URLs** — Dashboard → Authentication → URL Configuration:
  Site URL = `https://hmtrade-business.com`; redirect allowlist includes
  `/billing/callback`. (`auth.config` not queryable via MCP — dashboard check.)
- [x] 🔴 **Seed Paystack plan codes** — ✅ ALREADY SEEDED (all 3 tiers, verified
      by SQL). Test codes in place; swap to LIVE codes at launch (B3).
- [x] 🟡 **Realtime** — ✅ VERIFIED: `agent_runs` + `agent_artifacts` both in the
  `supabase_realtime` publication (SQL-confirmed).
- [x] 🟡 **Storage buckets** — ✅ VERIFIED: `agent-artifacts` + `agent-uploads`
  exist with the migration's policies (SQL-confirmed; uploads private, signed
  URLs only).
- [ ] 🔴 **Branded auth emails** — Dashboard → Auth → Emails → Templates: paste
  the 5 templates from `supabase/email-templates/auth/`; Subject fields too.
  Sender: **"H~M Trading Institute <no-reply@hmtrade-business.com>"**.
- [ ] 🔴 **Custom SMTP** — recommended so the sender name is honored: Resend
  (or provider of choice) → Auth → SMTP settings.
- [ ] 🔴 **Admin verify** (after frontend deploy): owner login → `/admin`
  loads; non-admin → redirect; suspend a test user → their next run is blocked
  with the reason banner; audit_logs gains rows.

## B · Paystack (the last 🔨)

- [x] 🔴 **Create 3 test recurring plans + seed** — ✅ DONE (test plans exist,
      `provider_price_id` seeded, verified by SQL).
- [x] 🔴 **Run the E2E harness** — ✅ LIVE-RUN 2026-08-18: **8/9 passed, 0 failed**
      (missing-signature, bad-signature, invalid-json, idempotency,
      subscription-create, disable, renewal, invoice). Caught + fixed [BUG-2]:
      per-attempt idempotency keys for renewal events (v9 deployed). One SKIP
      left:
  ```bash
  cd /home/aurora/HM
  PAYSTACK_SECRET_KEY=<sk_test_...> SUPABASE_URL=https://wqjdumforbalfmtawwpg.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service_role> \
  E2E_TEST_USER_ID=<owner-id> E2E_TEST_USER_EMAIL=mustaphahabib270@gmail.com \
  node scripts/paystack-e2e.mjs --live
  ```
  (Hard-refuses `sk_live_` keys. Never paste these values into chat.)
- [ ] 🔴 **charge case** — needs a REAL completed Paystack TEST transaction:
      run the frontend locally, pay with test card `4084 0840 8408 4081`, then
      re-run with `PAYSTACK_TEST_REFERENCE=<ref>` — exercises paystack-init →
      checkout → webhook → re-verification → activation end-to-end.
- [x] 🟡 **Renewal test** — ✅ PASSED LIVE (past_due on failure, extend on
      success) after the [BUG-2] fix.
- [ ] 🔴 **At launch only**: swap `plans.provider_price_id` to **live** codes +
      `PAYSTACK_SECRET_KEY=sk_live_...` (function secret). Do the full loop once
      with a real card.

## C · Frontend → Vercel

- [ ] 🔴 Deploy `Tradi/frontend` (`vercel.json` SPA rewrites already in repo).
- [ ] 🔴 Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable).
- [ ] 🟡 `VITE_SENTRY_DSN` (hmtrade-frontend project — see infra output).
- [ ] 🟢 `VITE_APP_NAME`.

## D · Worker → Railway

- [ ] 🔴 Deploy repo root (`Dockerfile` + `railway.toml` already in repo; image
      pre-builds Tradi[deepseek] + worker, pre-creates `/var/vibe-runs` 777).
- [ ] 🔴 Env vars:
  | Var | Value |
  |---|---|
  | `SUPABASE_URL` | https://wqjdumforbalfmtawwpg.supabase.co |
  | `SUPABASE_SERVICE_ROLE_KEY` | service_role (never in frontend/git) |
  | `WORKER_EXECUTE_TRADI` | **`true`** (default is `false` = stub runner!) |
  | `WORKER_RUNS_ROOT` | `/var/vibe-runs` (pre-created in image) |
  | `LOG_LEVEL` | `INFO` |
  | 🟡 `SENTRY_DSN` | hmtrade-worker project |
  | 🟢 `WORKER_ID` | e.g. `worker-1` |
- [ ] 🔴 **Networking → Health Check: port 9100** (`healthcheckPath=/health` is
      in railway.toml; the PORT is dashboard-only).
- [ ] 🟡 Graceful Shutdown Timeout ≥ run-timeout headroom (worker drains on
      SIGTERM).
- [ ] 🔴 Engine smoke test: one real run through the deployed worker (verifies
      Tradi agent/.env provider config; BYOK key injected per-run).

## E · Cloudflare (manual per decision)

- [ ] 🔴 Add `hmtrade-business.com` as a zone (cfat_ token covers DNS records).
- [ ] 🔴 DNS: point frontend host → Vercel; worker subdomain (if any) → Railway.
- [ ] 🔴 SSL mode: **Full (strict)**; verify cert issuance.

## F · Email

- [ ] 🔴 Create the **support@hmtrade-business.com** mailbox.
- [ ] 🔴 Pick a transactional provider (Resend/Brevo/Postmark) for the 3
      bracket-placeholder templates in `supabase/email-templates/transactional/`.
- [ ] 🟡 Run `node scripts/email-templates-check.mjs` after any template edit
      (palette + brand enforcement).

## G · Legal / launch prep

- [ ] 🔴 Legal review fills `SUPPORT_PHONE` + `MAILING_ADDRESS` in
      `Tradi/frontend/src/lib/company.ts` (single source — footer, Terms §14,
      Privacy §12, admin About/System all update automatically).
- [ ] 🔴 ToS/Privacy registrant blocks reviewed (Nigerian jurisdiction lines).
- [ ] 🟢 Verify `tel:` link activates in SiteFooter once phone has real digits.

## H · Cleanup / security

- [x] 🟡 Drop the renamed legacy table — ✅ DONE 2026-08-18 (0 rows, foreign
      shape; `drop table public.audit_logs_legacy` + `to_regclass` → null).
- [ ] 🟡 Revoke the surplus `cfut_` Cloudflare token (broader scopes, rejected
      by the MCP endpoint; keep `cfat_`).
- [ ] 🟡 Post-deploy Sentry smoke: trigger a frontend error + a worker error →
      both appear in sentry.io.
- [ ] 🟡 Confirm rate-limit safety net (30 runs/hour/user) behaves under load.

---

## Critical path
1. **A1 + A3 + B1 + B2** — the Paystack loop (blocked on: your `sk_test_` key +
   plan codes; then the last 🔨 closes).
2. **C + D** — the two deploys, with D's `WORKER_EXECUTE_TRADI=true` + health
   port 9100 as the classic foot-guns.
3. **E** — domain/SSL last (needs deploys live first).

Generated by the HM pipeline (Architect compile, 2026-08-18). Update this file
as items complete — it is the single launch-tracking artifact.
