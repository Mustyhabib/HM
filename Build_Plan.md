# Build Plan — H~M Trading Institute (reference)

> ⚠️ **SUPERSEDED — historical MVP blueprint only.**
> The live system's source of truth is `CLAUDE.md`; the Quant Research OS upgrade path is
> `UPGRADE_ROADMAP.md` (harmonized 10-phase plan). This file documents how the MVP got built
> and is kept for history — do not plan new work from it.

This is a reference blueprint for the CURRENT architecture in CLAUDE.md (the
source of truth). The original 10-phase plan (FastAPI + Celery + Redis +
Stripe/Paystack + usage quotas) was superseded by the pivot to: Supabase-only
backend, Paystack-only billing, BYOK unlimited runs, and a Python polling
worker. Phases marked ✅ are shipped; the rest is the remaining roadmap.

Read CLAUDE.md first. After every session: update the "Sprint tracker" in
CLAUDE.md (do NOT maintain a separate phase tracker here).

PHASE 0 — Supabase backend foundation ✅
Prompt:
Read CLAUDE.md. Provision and migrate the Supabase backend (there is NO
traditional backend server — Supabase is the entire backend).
 1. Supabase project (PostgreSQL 17). Enable Auth (email/password), Storage,
    Realtime, Vault.
 2. Storage buckets: `agent-artifacts`, `agent-uploads` (private, owner-scoped
    RLS, signed URLs for downloads).
 3. Apply migrations in vibe-trading-saas/db/migrations/. Canonical schema:
    profiles, plans (starter/pro/premium), subscriptions, agent_runs,
    agent_artifacts, user_api_keys (Vault-backed), webhook_events.
    usage_periods + usage_events are HISTORICAL (BYOK pivot stopped writing
    them) — do not use for access gating.
 4. SECURITY DEFINER RPCs (search_path pinned to 'public'):
    start_agent_run, start_swarm_run, save_user_api_key,
    get_user_api_key_status, delete_user_api_key, worker_get_user_api_key
    (service_role only), upsert_subscription (service_role only).
 5. RLS on every user-facing table (user_id = auth.uid()). user_api_keys has
    ZERO policies + table grants REVOKED from anon/authenticated.
Verify: start_agent_run gates on auth → active sub → DeepSeek key → 30/hr.

PHASE 1 — Frontend (React 19 + Vite, reuse Tradi/frontend) ✅
Prompt:
Read CLAUDE.md. The production frontend lives in Tradi/frontend/ (reused from
the vendored engine). Do NOT create a Next.js app.
 1. lib/supabase.ts (createClient singleton), lib/auth-store.ts (Zustand:
    initialize/signUp/signIn/signOut, session set synchronously — D9).
 2. Router (react-router 8): PublicLayout for public routes, GuestGuard for
    /login /signup, AuthGuard + Layout for authenticated routes.
 3. lib/runs.ts (startRun/getRun/subscribeToRun/signedArtifactUrl/
    uploadAttachment/getActiveSubscription), lib/billing.ts (initiate
    Subscription via paystack-init Edge Function), lib/apikeys.ts (RPCs),
    lib/swarm.ts.
 4. Pages: Landing, Pricing (3 tiers), Login, Signup, Dashboard, Agent
    launcher (one metered prompt box — D10), RunView (live status + progress
    streaming), Teams (swarm presets), Reports, Settings, Profile, Signals,
    legal pages.
Verify: npm run build (type-check + Vite) passes.

PHASE 2 — Worker (Python polling loop, no Celery/Redis) ✅
Prompt:
Read CLAUDE.md. Build the Python 3.11+ worker at vibe-trading-saas/worker/.
 1. hm-worker entry point (pyproject console_scripts).
 2. main.py — polling loop: claim queued run with FOR UPDATE SKIP LOCKED,
    dispatch, update status. SIGINT/SIGTERM drain.
 3. runner.py — TradiRunner (subprocess-per-run, D1) + StubRunner dev fallback.
 4. db.py — service-role Supabase client; worker_get_user_api_key for BYOK.
 5. artifacts.py — ArtifactStore → Supabase Storage; progress.py — tail
    trace.jsonl → progress_message/progress_iter.
 6. Run flow: claim → fetch user's DeepSeek key → spawn
    `vibe-trading run -p "<prompt>" --json --no-rich --max-iter N` with
    isolated HOME/VIBE_TRADING_HOME → upload artifacts → mark completed/failed/
    timeout.
Verify: 53 hermetic tests — cd vibe-trading-saas/worker && pytest -q.

PHASE 3 — BYOK DeepSeek keys (Supabase Vault) ✅
Prompt:
Read CLAUDE.md. Users bring their own DeepSeek key. Store encrypted in
Supabase Vault (vault.secrets); public schema holds only an opaque secret_id.
 1. user_api_keys table + save/get_status/delete RPCs (authenticated).
 2. worker_get_user_api_key (service_role only) — worker decrypts before spawn.
 3. Frontend NEVER sees plaintext. Platform never proxies/marks up LLM calls.
Verify: save key → Vault → worker decrypts → run completes. No plaintext leak.

PHASE 4 — Swarm + file attachments ✅
Prompt:
Read CLAUDE.md. Pro/Premium capabilities.
 1. start_swarm_run RPC gated on plan_id IN ('pro','premium'). 30 preset YAML
    team configs in Tradi/agent/src/swarm/presets/.
 2. Premium attachment uploads (CSV/XLSX/JSON) to agent-uploads bucket, 50 MB
    limit, paths {uid}/{date}/{uuid}-{filename}, passed as JSONB attachments.
Verify: swarm run dispatches; Premium uploads, lower tiers blocked.

PHASE 5 — Paystack billing (Supabase Edge Functions) ✅ / 🔨 E2E
Prompt:
Read CLAUDE.md. Billing is Paystack ONLY (Nigerian entity; Stripe parked — D8).
 1. supabase/functions/paystack-init — validate auth, look up
    plans.provider_price_id, call Paystack initialize → {authorization_url}.
 2. supabase/functions/paystack-webhook — verify x-paystack-signature
    (HMAC-SHA512, constant-time), re-verify via Paystack API, upsert
    subscription via upsert_subscription RPC. Idempotent via
    webhook_events.provider_event_id UNIQUE.
 3. BillingCallback page polls getSubscriptionStatus() until active.
Verify: init → hosted checkout → charge.success webhook → subscription active.

PHASE 6 — Deployment (Docker + Railway + Vercel + Cloudflare) 🔨 / ⏳
Prompt:
Read CLAUDE.md. Deploy: Vercel (frontend) + Railway (worker).
 1. Dockerfile + railway.toml (hm-worker). infra/nginx + infra/tradi-api configs.
 2. Cloudflare: hmtrade-business.com / www → Vercel, api.hmtrade-business.com →
    Railway tradi-api. Full (strict) SSL, cache bypass for SSE.
Verify: worker /health passes; billing E2E with Paystack test card.

PHASE 7 — Admin dashboard + monitoring ⏳
Prompt:
Read CLAUDE.md. Admin is internal staff. NO TOTP 2FA at MVP (deferred).
 1. Admin dashboard: user management (search, suspend/unsuspend, manual plan
    override — logged), MRR/active subscribers, audit logs.
 2. Monitoring: Sentry, structured logs, uptime.
Verify: non-admin cannot reach admin surfaces; audit_log for every mutation.

PHASE 8 — Launch prep ⏳
Prompt:
Read CLAUDE.md. Transactional email templates (branded sender), legal review,
footer contact/registrant block, Paystack live-mode switch (explicit step).

DEFERRED (not in MVP — do not start without explicit instruction)
Stripe (international billing) · live trading (mandate-gated, off by default) ·
admin TOTP 2FA · advanced analytics (per-user P&L) · public API · mobile-
optimized views.

SESSION WORKFLOW (read before every session)
Start: "Read CLAUDE.md. Continue from the sprint tracker. Today's task: [...]."
Debug: "Read CLAUDE.md. Bug: [...]. Error: [...]. File(s): [...]. Fix only what's
broken." End: update the sprint tracker in CLAUDE.md and commit CLAUDE.md.
