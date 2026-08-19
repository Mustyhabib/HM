H~M Trading Institute — Claude Code Memory

Project
Multi-user subscription SaaS wrapping HKUDS/Vibe-Trading (MIT). Users sign up,
connect their own DeepSeek API key (BYOK), and run AI trading research agents via
a web UI. The platform handles auth, billing, run queueing, artifact storage, and
result rendering. This is research/backtesting only at MVP — no live trading.

Product name: H~M Trading Institute (never "Vibe-Trading" in customer-facing UI).
Domain: hmtrade-business.com
Deployed at: Vercel (frontend) + Railway (worker)

Tech stack (do not deviate without explicit instruction)
Frontend : React 19 · Vite · TypeScript · Tailwind CSS 3 · react-router 8
           · Zustand · @supabase/supabase-js · ECharts (via echarts-for-react)
           Lives in Tradi/frontend/ (reused from the vendored engine fork)
Backend  : NO traditional backend server. Supabase is the entire backend:
           · PostgreSQL 17 (data, RLS, SECURITY DEFINER RPCs)
           · Supabase Auth (JWT, email/password, onAuthStateChange)
           · Supabase Storage (agent-artifacts, agent-uploads buckets)
           · Supabase Vault (BYOK key encryption)
           · Supabase Edge Functions (paystack-init, paystack-webhook)
           · Supabase Realtime (agent_runs + agent_artifacts live updates)
Billing  : Paystack ONLY (Nigerian entity — Stripe cannot onboard; parked for
           future international expansion). Hosted checkout + Plans (recurring)
           + signed webhooks (HMAC-SHA512). Edge Functions handle init + webhook.
LLM      : DeepSeek via BYOK — users supply their own API key. Stored encrypted
           in Supabase Vault (vault.secrets). The platform NEVER stores plaintext,
           NEVER proxies LLM calls, NEVER marks them up. Worker decrypts server-
           side via worker_get_user_api_key (service_role only).
Worker   : Python 3.11+ polling loop (hm-worker). Polls agent_runs WHERE
           status='queued' with FOR UPDATE SKIP LOCKED. One subprocess per run
           (Tradi engine). Deployed on Railway.
Engine   : Vibe-Trading vendored at Tradi/ — 462 alphas, 8 backtest engines,
           24 data sources, ReAct agent, swarm orchestration. Invoked as a
           subprocess: `vibe-trading run -p "<prompt>" --json --no-rich --max-iter N`

Directory layout
HM/
 ├── Tradi/                        Vendored Vibe-Trading engine (MIT)
 │   ├── agent/                    FastAPI server, CLI, ReAct agent, backtest engines
 │   ├── frontend/                 React 19 + Vite SPA (THE production frontend)
 │   │   ├── src/
 │   │   │   ├── pages/            Route components (25+ pages)
 │   │   │   ├── components/       auth/, charts/, chat/, common/, layout/, settings/
 │   │   │   ├── lib/              supabase.ts, auth-store.ts, runs.ts, billing.ts,
 │   │   │   │                     apikeys.ts, swarm.ts, storage.ts, api.ts, etc.
 │   │   │   ├── hooks/            useSSE.ts, useDarkMode.ts
 │   │   │   ├── types/            agent.ts
 │   │   │   └── router.tsx        createBrowserRouter with PublicLayout + AuthGuard
 │   │   └── index.html
 │   └── CLAUDE.md                 Engine-specific dev notes
 │
 ├── vibe-trading-saas/
 │   ├── worker/                   Python worker — hm-worker entry point
 │   │   ├── src/hm_worker/        main.py, runner.py, artifacts.py, config.py,
 │   │   │                         db.py, progress.py
 │   │   ├── tests/                5 test files (53 tests, hermetic)
 │   │   └── pyproject.toml
 │   ├── db/migrations/            SQL migrations (applied to Supabase manually)
 │   │   ├── 2026_08_11_agent_teams_uploads.sql
 │   │   ├── 2026_08_12_byok_api_keys.sql
 │   │   ├── 2026_08_12_byok_revoke_anon_execute.sql
 │   │   └── 2026_08_12_paystack_billing.sql
 │   └── docs/                     Architecture, decisions
 │
 ├── supabase/
 │   └── functions/
 │       ├── paystack-init/        Initialize Paystack checkout (auth'd Edge Function)
 │       └── paystack-webhook/     Idempotent webhook handler (service-role)
 │
 ├── infra/
 │   ├── nginx/                    Reverse proxy config
 │   └── tradi-api/                Tradi API service config
 │
 ├── Build_Plan.md                 Original 10-phase architect blueprint (reference only)
 ├── Design_Flow_Prompt.md         Full UI/UX design spec (User + Admin personas)
 ├── CLAUDE.md                     THIS FILE — source of truth
 ├── Dockerfile                    Worker container
 └── railway.toml                  Railway deployment config

DB schema — canonical reference (Supabase PostgreSQL 17)
profiles        id UUID PK (= auth.uid()) | email | display_name
                avatar_url | created_at | updated_at
                # Supabase Auth owns credentials. This is the public profile.

plans           id TEXT PK ('starter'|'pro'|'premium')
                name | price_ngn INT | provider_price_id TEXT (Paystack plan code)
                # No run limits — BYOK model, unlimited runs per tier.

subscriptions   id UUID PK | user_id FK→profiles | plan_id FK→plans
                provider_subscription_id TEXT UNIQUE
                status CHECK ('active','trialing','past_due','canceled','incomplete')
                current_period_start | current_period_end
                cancel_at_period_end BOOL | created_at | updated_at

agent_runs      id UUID PK | user_id FK→profiles | usage_period_id FK NULL
                prompt TEXT | max_iter INT | idempotency_key TEXT UNIQUE
                status CHECK ('queued','running','completed','failed','cancelled','timeout')
                kind CHECK ('single','swarm') | attachments JSONB
                preset_name TEXT NULL | user_vars JSONB NULL
                provider TEXT DEFAULT 'deepseek'
                error_message TEXT NULL | refunded BOOL | celery_task_id TEXT NULL
                progress_message TEXT NULL | progress_iter INT NULL | progress_at TIMESTAMPTZ NULL
                created_at | completed_at

agent_artifacts id UUID PK | agent_run_id FK→agent_runs
                kind TEXT | storage_path TEXT | created_at

user_api_keys   id UUID PK | user_id FK→profiles | provider CHECK ('deepseek')
                secret_id UUID (→ vault.secrets, NOT a FK)
                key_last4 TEXT (4 chars) | configured_at | updated_at
                UNIQUE(user_id, provider)
                # RLS enabled, ZERO policies (default deny). All access via RPCs.
                # Table grants REVOKED from anon + authenticated.

usage_periods   id UUID PK | user_id FK→profiles | plan_id FK→plans
                period_start | period_end | uses_allowed | uses_consumed
                # HISTORICAL — BYOK pivot stopped writing new rows. Kept for
                # analytics. Do NOT use for access gating.

usage_events    id UUID PK | usage_period_id FK→usage_periods
                event_type | agent_run_id | created_at
                # HISTORICAL — same as usage_periods.

webhook_events  id UUID PK | provider_event_id TEXT UNIQUE
                type TEXT | payload JSONB | processed_at | created_at
                # RLS enabled, zero policies. Service-role only (webhook handler).

subscriptions   (see above — RLS: users can SELECT own rows)

Pricing (Paystack NGN plans — BYOK model, unlimited runs)
| Tier      | price_ngn | Paystack plan code | Capabilities                     |
|-----------|-----------|--------------------|---------------------------------|
| Starter   | ₦20,000   | set in plans table  | Single-agent runs               |
| Pro       | ₦35,000   | set in plans table  | + Swarm (30 multi-agent presets) |
| Premium   | ₦75,000   | set in plans table  | + Attachment uploads (CSV/XLSX/JSON) |
All tiers: unlimited runs. Users pay DeepSeek directly for LLM tokens.
Safety net: 30 runs/rolling hour/user soft rate limit (not a business quota).

Key RPCs (SECURITY DEFINER, search_path pinned to 'public')
start_agent_run(p_prompt, p_max_iter, p_idempotency_key, p_attachments)
  Gates: authenticated → active subscription → DeepSeek key configured → 30/hr rate limit
  Returns: run UUID | Errors: not_authenticated, no_active_subscription, no_api_key, rate_limited

start_swarm_run(p_preset_name, p_user_vars, p_idempotency_key)
  Gates: same as above + plan_id IN ('pro','premium')
  Returns: run UUID | Errors: same + plan_gate

save_user_api_key(p_provider, p_api_key)
  Validates sk-... format, encrypts via Vault, upserts user_api_keys row.
  NEVER returns plaintext. Granted to: authenticated.

get_user_api_key_status()
  Returns {provider, last4, configured_at} or null. Granted to: authenticated.

delete_user_api_key(p_provider)
  Deletes metadata row + vault secret. Granted to: authenticated.

worker_get_user_api_key(p_user_id, p_provider)
  Decrypts and returns plaintext. Granted to: service_role ONLY.
  Called by the worker before spawning the Tradi subprocess.

upsert_subscription(p_user_id, p_plan_id, p_provider_subscription_id, p_status, p_period_start, p_period_end)
  Upserts a subscription row. Granted to: service_role ONLY.
  Called by the paystack-webhook Edge Function.

Security rules — enforce in EVERY feature, no exceptions
Row isolation   — RLS on every user-facing table: user_id = auth.uid()
BYOK keys       — stored in Supabase Vault (vault.secrets); public schema only
                  holds an opaque secret_id. Decryption is service_role only via
                  worker_get_user_api_key. Frontend NEVER sees plaintext.
Auth gate       — Supabase Auth JWT on every protected route. AuthGuard component
                  wraps all authenticated routes in the router.
Subscription gate — start_agent_run / start_swarm_run check for active sub +
                    configured key server-side. Client checks are UI-only.
BYOK key RPCs   — ZERO RLS policies on user_api_keys (default deny). Table grants
                  REVOKED from anon + authenticated. All access via SECURITY
                  DEFINER RPCs that use auth.uid() internally.
Webhooks        — Paystack events verified via x-paystack-signature HMAC-SHA512
                  with constant-time comparison. Re-verified via Paystack API
                  before activating a subscription.
Webhook idempotency — webhook_events.provider_event_id UNIQUE constraint.
                      Duplicate events silently accepted (200).
Run isolation   — each subprocess gets its own HOME, VIBE_TRADING_HOME, and
                  VIBE_TRADING_ALLOWED_RUN_ROOTS. Worker secrets stripped from
                  engine env.
Artifact access — Supabase Storage with owner-scoped RLS. Signed URLs for
                  private downloads (5 min TTL).
No live trading — mandate-gated and off by default at MVP.

Frontend architecture
Router: createBrowserRouter (react-router 8)
  Public (PublicLayout): /, /pricing, /docs, /terms, /privacy, /billing/callback
  Guest (GuestGuard + PublicLayout): /login, /signup
  Auth'd (AuthGuard + Layout): /dashboard, /agent, /teams, /run/:runId, /reports,
    /settings, /profile, /signals, /runtime, /scheduled, /compare, /correlation,
    /alpha-zoo, /about

Auth: Zustand store (useAuth) — supabase.auth.getSession + onAuthStateChange.
  signUp / signInWithPassword / signOut. Session set synchronously (fixed race).

Data fetching:
  Supabase client direct (supabase.from / supabase.rpc / supabase.storage)
  Realtime: supabase.channel().on('postgres_changes') for agent_runs + artifacts
  NO SWR/React Query — direct async calls in useEffect / event handlers

Key frontend libs:
  lib/runs.ts       — startRun, getRun, getActiveRuns, subscribeToRun,
                      subscribeToArtifacts, signedArtifactUrl, uploadAttachment,
                      getActiveSubscription
  lib/billing.ts    — initiateSubscription (→ paystack-init Edge Function),
                      getSubscriptionStatus, pollSubscriptionActive
  lib/apikeys.ts    — saveApiKey, getApiKeyStatus, deleteApiKey (all via RPCs)
  lib/auth-store.ts — Zustand store: initialize, signUp, signIn, signOut
  lib/supabase.ts   — createClient singleton
  lib/swarm.ts      — swarm preset metadata + dispatch

Worker architecture (vibe-trading-saas/worker/)
Entry: `hm-worker` CLI (pyproject.toml console_scripts)
Modules:
  main.py     — polling loop: claim queued run → dispatch → update status
  runner.py   — TradiRunner (subprocess-per-run) + StubRunner (dev fallback)
  artifacts.py — ArtifactStore: upload results to Supabase Storage
  db.py       — Supabase client (service-role key, bypasses RLS)
  config.py   — env var loading (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
  progress.py — tail trace.jsonl, update progress_message/progress_iter on run row

Run flow:
  1. Worker polls: SELECT ... FROM agent_runs WHERE status='queued'
     FOR UPDATE SKIP LOCKED LIMIT 1
  2. Claims run: UPDATE status='running'
  3. Fetches user's DeepSeek key: worker_get_user_api_key(user_id, 'deepseek')
  4. Spawns subprocess: vibe-trading run -p "<prompt>" --json --no-rich --max-iter N
     with isolated HOME/VIBE_TRADING_HOME per run
  5. Tails trace.jsonl for live progress streaming → updates run row
  6. On completion: uploads artifacts to Supabase Storage, marks status='completed'
  7. On failure: status='failed', stores error_message
  8. On timeout: status='timeout'

Env vars required
# Supabase (frontend — VITE_ prefix, public)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# Supabase (worker / Edge Functions — private, never in frontend)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# Paystack (Edge Function secrets, set via `supabase secrets set`)
PAYSTACK_SECRET_KEY
APP_URL                      # e.g. https://hmtrade-business.com

# Worker
WORKER_EXECUTE_TRADI         # true to use real engine, false for stub
WORKER_TRADI_COMMAND         # path to vibe-trading binary
WORKER_RUNS_ROOT             # writable dir for per-run HOME dirs

# Engine (set in Tradi/agent/.env, NOT worker/.env)
DEEPSEEK_API_KEY             # only for local dev — production uses BYOK per-user

Billing flow (Paystack)
1. Frontend: user clicks "Subscribe" on Pricing → billing.ts initiateSubscription(planId)
2. Frontend → Edge Function (paystack-init): validates auth, looks up plans.provider_price_id,
   calls Paystack transaction/initialize API → returns {authorization_url}
3. Frontend redirects to Paystack hosted checkout
4. After payment, Paystack redirects to /billing/callback?reference=...
5. Paystack fires charge.success webhook → Edge Function (paystack-webhook):
   verifies HMAC signature → re-verifies with Paystack API → upserts subscription row
6. BillingCallback page polls getSubscriptionStatus() until active

Swarm runs (Pro/Premium only)
30 preset YAML team configs in Tradi/agent/src/swarm/presets/.
start_swarm_run RPC gates on plan_id IN ('pro','premium').
Worker dispatches swarm runs via the same subprocess mechanism.

File attachments (Premium only)
Premium users upload CSV/XLSX/JSON to agent-uploads Storage bucket.
50 MB limit enforced client + server. Paths: {uid}/{date}/{uuid}-{filename}.
Attachments passed as JSONB array in agent_runs.attachments column.
Worker mounts files into the subprocess's working directory.

Sprint tracker — UPDATE AT END OF EVERY SESSION
Sprint day : 8 of 30
Status     : Week 2 in progress

Shipped (merged to main, live):
  ✅ Supabase Auth (email/password, AuthGuard, Zustand store)
  ✅ Dashboard (analytics, recent runs, active bots count)
  ✅ Agent launcher (NLP prompt box, exchange selector)
  ✅ RunView (live status polling, artifact rendering, progress streaming)
  ✅ Worker E2E (claim → subprocess → artifacts → Storage)
  ✅ BYOK pivot (Supabase Vault, save/get/delete RPCs, worker decrypt)
  ✅ Swarm dispatch (30 presets, Pro/Premium gate)
  ✅ File attachment uploads (Premium gate, 50 MB, CSV/XLSX/JSON)
  ✅ Realtime queue viewer (postgres_changes on agent_runs)
  ✅ Live progress streaming (trace.jsonl tail → progress columns)
  ✅ Paystack billing Edge Functions (init + webhook, idempotent)
  ✅ Billing callback page (polls subscription status)
  ✅ Pricing page (3 tiers, Paystack checkout CTA)
  ✅ Landing page, Login, Signup
  ✅ Settings, Profile, Signals, Reports, Compare, AlphaZoo pages
  ✅ Teams page (swarm presets UI)
  ✅ Legal pages (Terms, Privacy, Docs)
  ✅ UI redesign (aurora-fire palette)
  ✅ Brand mark component
  ✅ Docker + Railway deployment config
  ✅ Nginx reverse proxy config
  ✅ 53 hermetic worker tests

In progress / next:
  ✅ MVP RUN LOOP VERIFIED 2026-08-19 — FIRST REAL END-TO-END RUN COMPLETED
      (prompt → queued → worker claim → engine → completed, 24 artifacts in
      Storage, progress streamed). Fixed en route: [BUG-ENG-1] DeepSeek
      reasoning_content echo (capability flags + auto→OpenAI-compatible
      adapter routing; native adapter opt-in only), [BUG-ENG-2] worker RPC
      usage_events NULL crash (RPCs captured into
      2026_08_19_worker_rpc_hardening.sql + BYOK guard), [BUG-ENG-3] realtime
      sync-client noise (polling fallback). Worker runs locally
      (WORKER_EXECUTE_TRADI=true, Tradi/.venv engine); Railway deploy pending.
  ⏳ Paystack billing E2E — HARNESS SHIPPED + LIVE-VERIFIED 2026-08-18:
      scripts/paystack-e2e.mjs --live → 8/9 PASS, 0 FAIL (signature guards,
      idempotency, create, disable, renewal, invoice). [BUG-2] caught live and
      fixed: renewal events (subscription.charge/invoice.update) had
      event::code dedupe keys collapsing every attempt → failed renewals never
      marked past_due; now per-attempt (::attemptId), v9 deployed, fixtures +
      harness mirror synced. Remaining: charge case needs a real TEST checkout
      (test card 4084 0840 8408 4081) → PAYSTACK_TEST_REFERENCE; at launch swap
      plans + key to live. Supabase checklist MCP-items CLOSED (realtime,
      storage, plans, RLS audit + webhook_events grant revoke, audit_logs_legacy
      dropped, secrets verified). Dashboard-only: auth URLs, email templates.
  ⏳ Admin dashboard — CODE SHIPPED + MIGRATION APPLIED 2026-08-18 (admin RPCs
      live, owner seeded, audit_logs default-deny; audit_logs_legacy renamed
      then dropped — empty foreign table). Browser verify pending frontend
      deploy: /admin loads for owner, redirects non-admins, suspend blocks runs.
  ⏳ Monitoring — CODE SHIPPED + Sentry projects CREATED 2026-08-18
      (hmtrade-frontend + hmtrade-worker, DSNs in /tmp/hm_pipeline/infra_output.txt).
      Activation remaining: set VITE_SENTRY_DSN / SENTRY_DSN at deploy time
      (no-op without them); Railway dashboard → Settings → Networking → Health
      Check port 9100 (railway.toml carries healthcheckPath).
  ⏳ Email templates — CODE SHIPPED via pipeline (supabase/email-templates/:
      5 Supabase Auth + 3 transactional, branded H~M lockup/footer/registrant
      block; scripts/email-templates-check.mjs enforces palette + brand).
      Inert until: create support@hmtrade-business.com mailbox → paste auth
      templates in Supabase Dashboard → Auth → Emails (sender "H~M Trading
      Institute <no-reply@hmtrade-business.com>", custom SMTP recommended) →
      pick a transactional provider for the 3 [bracket]-placeholder templates.
  ⏳ Cloudflare domain + SSL setup
  ✅ Worker Railway deployment 2026-08-19 — LIVE on Railway service "HM"
      (project dynamic-tranquility). Deploy b014355f SUCCESS, worker polling
      Supabase, health endpoint /health responding. Fixed en route:
      [BUG-RW-1] health.py bound 127.0.0.1 — Railway probes from outside the
      container so loopback is unreachable (health.py + config.py + main.py:
      default 0.0.0.0 with WORKER_HEALTH_HOST override); [BUG-RW-2] Railway
      dashboard drift — dockerfilePath was "/hm-worker" (bogus) instead of
      "Dockerfile"; [BUG-RW-3] Railway healthcheck probes the PORT env var by
      convention — was unset so probe hit the wrong port ("service
      unavailable"); fixed by setting PORT=9100 via set-variables. Sprint
      commit 162f178.
  ⏳ Launch prep — CODE SHIPPED via pipeline (ownership & contact footprint:
      lib/company.ts registrant source, SiteFooter on every page, Terms §14 +
      Privacy §12 registrant blocks, RunView operator line, admin About/System
      screen). Remaining manual: legal review fills SUPPORT_PHONE/MAILING_ADDRESS
      in lib/company.ts, create support@hmtrade-business.com mailbox.

Not started (deferred):
  🔲 Stripe (international billing — parked, no US/UK entity)
  🔲 Live trading (mandate-gated, off by default)
  🔲 Admin 2FA (TOTP gate for /admin/* routes)
  🔲 Advanced analytics (per-user P&L, portfolio tracking)
  🔲 Public API
  🔲 Mobile-optimized views

Key decisions (ADRs)
D1  — Subprocess-per-run: Tradi's process-global singletons make in-process multi-tenant unsafe
D3  — Reuse Tradi frontend (React, not Next.js) — saves rewrite, inherits 462 alpha UI
D5  — SQL job claiming with FOR UPDATE SKIP LOCKED — atomic, no Redis, N workers safe
D8  — Paystack + NGN billing only (Nigerian entity, Stripe can't onboard)
D9  — Auth store sets session synchronously (fixed signup/login race)
D10 — One metered prompt box on Agent page (not a chat-style multi-turn UI)
D11 — BYOK pivot: users supply their own DeepSeek key, unlimited runs per tier
D12 — Supabase Vault for key storage (not AES-256-GCM with app-managed ENCRYPTION_KEY)
D13 — Edge Functions for Paystack (not a FastAPI backend)
D14 — No Celery/Redis — Python polling loop is simpler and sufficient for MVP scale

Testing requirements
Worker   : 53 hermetic tests (pytest, black-clean) — cd vibe-trading-saas/worker && pytest -q
Frontend : npm run build (type-check + Vite build) — cd Tradi/frontend && npm run build
Engine   : pytest --ignore=agent/tests/e2e_backtest -q — cd Tradi
Webhook  : Paystack signature verification (constant-time HMAC-SHA512)
Auth     : signUp → signIn → protected route → signOut happy path
BYOK     : save key → key stored in Vault → worker decrypts → run completes
Billing  : Paystack init → hosted checkout → webhook → subscription active

Session workflow (read before every session)
Start: "Read CLAUDE.md. Continue from the sprint tracker. Today's task: [describe]."
Debug: "Read CLAUDE.md. Bug: [...]. Error: [...]. File(s): [...]. Fix only what's broken."
Add feature: "Read CLAUDE.md. Add: [feature]. Fits in: [component]. Rules that apply: [quote]."
End: Update sprint tracker + commit CLAUDE.md.
