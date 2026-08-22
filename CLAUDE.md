# H~M Trading Institute — Claude Code Memory

## Project

**Brand (customer-facing):** H~M Trading Institute — *never "Vibe-Trading" in user-facing UI.*
**Product/app name:** QuantLab (user app) + QuantLab Admin (control plane).
**Working name (internal docs):** Quant Research OS.

A web-first, multi-user **quantitative research and trading platform** that moves users
through `idea → research → reproducible experiment → validation → backtest → paper → controlled live`.
Today it is a **multi-user subscription SaaS** wrapping HKUDS/Vibe-Trading (MIT) — users sign
up, connect their own DeepSeek key (BYOK), and run AI trading research agents via a web UI.
The platform handles auth, billing, run queueing, artifact storage, and result rendering.
**Research/backtesting only at MVP — no live trading** (mandate-gated, off by default).

Domains: `hmtrade.business` (Vercel alias `hm-ashy-six.vercel.app`).
⚠️ `hmtrade-business.com` does **not** exist — do not use it.
Deployed at: Vercel (frontend) + Railway (worker) + Supabase (backend) + Cloudflare (edge/DNS).

## MVP goal (priority order — do not invert)

1. **The SERVICE loop (prompt → run → result) working end-to-end beats everything.**
   Billing is LAST. Engine bugs that block a run get fixed (explicitly allowed).
2. Realistic validation before promotion — a strategy that cannot survive validation is not success.
3. Launch (Nigeria on Paystack), then iterate the Quant Research OS roadmap.

## Constitution — project docs (read before architecture work)

| Doc | Role |
|---|---|
| `SOUL.md` | Mission, 12 non-negotiable principles, product character, quality bar |
| `FOUNDATIONS.md` | **Project identity** — what we are/aren't, reference-project roles, borrow-concepts-not-identity, data-layer authority |
| `PROJECT.md` | Product definition, inspiration, users, web-first model |
| `DATA.md` | Data strategy: canonical layers, point-in-time, providers, feed health |
| `ARCHITECTURE.md` | Target reference architecture (FastAPI + data plane + infra) |
| `WORKFLOW.md` | Research + engineering + incident + promotion workflows |
| `UPGRADE_ROADMAP.md` | **Harmonized 10-phase migration** — the plan for reaching the target |
| `docs/UNIFIED_SPEC.md` | **THE single source of truth (adopted 2026-08-21)** — 63-section unified spec; wins over earlier reports unless ADR changes it |
| `docs/RECONCILIATION.md` | 18 conflict resolutions: unified spec vs existing ADRs/live stack |
| `docs/REQUIREMENTS.md` | Complete requirements register — all requirements before build (81 IDs, 13 groups) |
| `CLAUDE.md` | THIS FILE — current live system source of truth + session rules |

The constitution describes the **destination**; `UPGRADE_ROADMAP.md` is the **path**;
this file is the **current truth**. Do not implement target-state features without a
roadmap phase saying so (see Roadmap section).

## Tech stack — current live (do not deviate without explicit instruction)

Frontend : React 19 · Vite · TypeScript · Tailwind CSS 3 · react-router 8
           · Zustand · @supabase/supabase-js · ECharts (via echarts-for-react)
           Lives in Tradi/frontend/ (reused from the vendored engine fork)
Backend  : NO traditional backend server at MVP. Supabase is the entire backend:
           · PostgreSQL 17 (data, RLS, SECURITY DEFINER RPCs)
           · Supabase Auth (JWT, email/password, onAuthStateChange)
           · Supabase Storage (agent-artifacts, agent-uploads buckets)
           · Supabase Vault (BYOK key encryption)
           · Supabase Edge Functions (paystack-init, paystack-webhook, stripe-* planned)
           · Supabase Realtime (agent_runs + agent_artifacts live updates)
           Phase 1 (roadmap): a FastAPI modular monolith is introduced for NEW domains
           (research governance first) — same Railway container as the worker.
Billing  : **Paystack (NGN — Nigeria launch) + Stripe (international — planned)**.
           Provider-agnostic subscription model; signed webhooks (HMAC-SHA512 for Paystack,
           Stripe-Signature for Stripe); idempotent via webhook_events UNIQUE.
LLM      : DeepSeek via BYOK — users supply their own API key. Stored encrypted in
           Supabase Vault (vault.secrets). The platform NEVER stores plaintext, NEVER
           proxies LLM calls, NEVER marks them up. Worker decrypts server-side via
           worker_get_user_api_key (service_role only).
Worker   : Python 3.11+ polling loop (hm-worker). Polls agent_runs WHERE status='queued'
           with FOR UPDATE SKIP LOCKED. One subprocess per run (Tradi engine). Railway.
Engine   : Vibe-Trading vendored at Tradi/ — 462 alphas, backtest engines, data sources,
           ReAct agent, swarm orchestration (30 presets), shadow-account + trade-journal
           toolset. Invoked as a subprocess:
           `vibe-trading run -p "<prompt>" --json --no-rich --max-iter N`
           Updated 2026-08-19 to upstream main 1907e47 (0.1.14+) — old fork
           Mustyhabib/vibe-trading-engine is GONE (404); upstream HKUDS is the engine
           source of truth. HM's old engine patch 4f9f969 (DeepSeek reasoning_content)
           is absorbed upstream (llm.py normalizes it).
Data     : Phase 2 (roadmap). Current runs use the engine's own loaders. Target:
           canonical RAW → VALIDATED → NORMALIZED → DERIVED → FEATURE, point-in-time,
           R2 + Parquet lake, dataset registry — see DATA.md.

## Roadmap — Quant Research OS upgrade (UPGRADE_ROADMAP.md, §8)

| Phase | Name | Status |
|---|---|---|
| 0 | Baseline & freeze (inventory, branch strategy, constitution) | **In progress — constitution committed** |
| 1 | Foundation (FastAPI monolith, tenant projects, **research-governance substrate**) | planned |
| 2 | Data (canonical schema, PIT, R2+Parquet lake, dataset registry) | planned |
| 3 | Quant Engine (strategy SDK, ExecutionInterface, walk-forward) | planned |
| 4 | Research AI (hypotheses, experiment workflow, promotion ladder) | planned |
| 5 | ML (baseline first, model registry) | planned |
| 6 | Paper Trading (risk engine, OMS, reconciliation) | planned |
| 7 | RL (optional, research-only) | planned |
| 8 | Controlled Live (broker adapters, mandate-gated) | planned |
| 9 | Scale (observability, quotas, metered billing — only when justified) | planned |
| 10 | Expansion (asset classes, marketplace, enterprise) | planned |

**Upgrade invariant:** the live run loop never breaks. Strangler-fig migration —
new architecture stands up BESIDE the live system; additive-only changes; per-phase
end-to-end gate. The chosen first slice (research governance/experiment registry) lands
as schema + provenance capture in Phase 1, full workflow in Phase 4.

## Directory layout

```
HM/
 ├── PROJECT.md / DATA.md / ARCHITECTURE.md / WORKFLOW.md / SOUL.md   Constitution (target vision)
 ├── UPGRADE_ROADMAP.md              Harmonized 10-phase migration plan
 ├── CLAUDE.md                       THIS FILE — source of truth (current live)
 ├── FOUNDATIONS.md                  Project identity + reference roles + 5-layer platform synthesis
 ├── Tradi/                          Vendored Vibe-Trading engine (MIT)
 │   ├── agent/                      FastAPI server, CLI, ReAct agent, backtest engines
 │   ├── frontend/                   React 19 + Vite SPA (THE production frontend)
 │   │   ├── src/
 │   │   │   ├── pages/              Route components (25+ pages)
 │   │   │   ├── components/         auth/, charts/, chat/, common/, layout/, settings/
 │   │   │   ├── lib/                supabase.ts, auth-store.ts, runs.ts, billing.ts,
 │   │   │   │                       apikeys.ts, swarm.ts, storage.ts, api.ts, etc.
 │   │   │   ├── hooks/              useSSE.ts, useDarkMode.ts
 │   │   │   ├── types/              agent.ts
 │   │   │   └── router.tsx          createBrowserRouter with PublicLayout + AuthGuard
 │   │   └── index.html
 │   └── CLAUDE.md                   Engine-specific dev notes
 │
 ├── vibe-trading-saas/
 │   ├── worker/                     Python worker — hm-worker entry point
 │   │   ├── src/hm_worker/          main.py, runner.py, artifacts.py, config.py,
 │   │   │                           db.py, progress.py, health.py, sentry.py
 │   │   ├── tests/                  74 hermetic tests
 │   │   └── pyproject.toml
 │   ├── db/migrations/              SQL migrations (applied to Supabase manually)
 │   └── docs/                       LEGACY pre-pivot docs (historical only)
 │
 ├── supabase/
 │   └── functions/
 │       ├── paystack-init/          Initialize Paystack checkout (auth'd Edge Function)
 │       └── paystack-webhook/       Idempotent webhook handler (service-role)
 │       └── stripe-init/            (planned) Stripe Checkout init
 │       └── stripe-webhook/         (planned) Idempotent Stripe webhook (service-role)
 │
 ├── infra/
 │   ├── nginx/                      Reverse proxy config
 │   └── tradi-api/                  Tradi API service config
 │
 ├── Dockerfile                      Worker container
 ├── railway.toml                    Railway deployment config
 └── docs/                           UNIFIED_SPEC (single source of truth), RECONCILIATION,
                                     REQUIREMENTS, PHASE1_BRIEF, INFRASTRUCTURE, UI_VISION,
                                     LAUNCH_CHECKLIST, RAILWAY_DEPLOY, CLOUDFLARE_SETUP
```

## DB schema — canonical reference (current LIVE; Supabase PostgreSQL 17)

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
                kind CHECK ('single','swarm','shadow') | attachments JSONB
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
                # HISTORICAL — BYOK pivot stopped writing new rows. Analytics only.

usage_events    id UUID PK | usage_period_id FK→usage_periods
                event_type | agent_run_id | created_at
                # HISTORICAL — same as usage_periods.

webhook_events  id UUID PK | provider_event_id TEXT UNIQUE
                type TEXT | payload JSONB | processed_at | created_at
                # RLS enabled, zero policies. Service-role only.

admin_users / audit_logs    Admin dashboard (2026_08_17_admin_dashboard.sql)

### Planned schema changes (roadmap Phase 1 — DO NOT create until that phase starts)
- `hypotheses`, `experiments`, `dataset_registry`, `promotion_events` tables
  (research-governance substrate; see UPGRADE_ROADMAP.md §9).
- Stripe support: `plans.stripe_price_id TEXT NULL`; `subscriptions.provider TEXT
  DEFAULT 'paystack'` (or a separate stripe_subscriptions table); `provider_event_id`
  stays the idempotency key in webhook_events (namespace per provider).
- `profiles.organization_id` / `projects` table (tenant project model, Phase 1).

## Pricing (Paystack NGN — BYOK model, unlimited runs)

| Tier | price_ngn | Paystack plan code | Stripe (planned USD) | Capabilities |
|------|-----------|--------------------|----------------------|--------------|
| Starter | ₦20,000 | in plans table | ~$15/mo (TBD) | Single-agent runs |
| Pro | ₦35,000 | in plans table | ~$27/mo (TBD) | + Swarm (30 presets) |
| Premium | ₦75,000 | in plans table | ~$58/mo (TBD) | + Attachments (CSV/XLSX/JSON) |
All tiers: unlimited runs. Users pay DeepSeek directly for LLM tokens.
Safety net: 30 runs/rolling hour/user soft rate limit (not a business quota).

## Key RPCs (SECURITY DEFINER, search_path pinned to 'public')

start_agent_run(p_prompt, p_max_iter, p_idempotency_key, p_attachments)
  Gates: authenticated → active subscription → DeepSeek OR Ollama key configured → 30/hr rate limit
  Returns: run UUID | Errors: not_authenticated, no_active_subscription, no_api_key, rate_limited
start_swarm_run(p_preset_name, p_user_vars, p_idempotency_key)
  Gates: same as above + plan_id IN ('pro','premium') | Errors: same + plan_gate
start_shadow_run(p_journal_file...)   # shadow account kind (2026_08_21_shadow_account.sql)
save_user_api_key(p_provider, p_api_key)          # Vault encrypt, upsert, never returns plaintext
get_user_api_key_status()                          # {provider, last4, configured_at} | null  (deepseek only — backward compat)
list_user_api_key_statuses()                       # [{provider, last4, configured_at}] all providers (2026_08_22_ollama_byok)
delete_user_api_key(p_provider)
worker_get_user_api_key(p_user_id, p_provider)     # service_role ONLY — decrypts for the worker
upsert_subscription(p_user_id, p_plan_id, p_provider_subscription_id, p_status, p_period_start, p_period_end)
                                                   # service_role ONLY — called by webhook handlers
# Phase 2 — data plane RPCs (SECURITY DEFINER, search_path = public)
list_platform_datasets(p_asset_class TEXT DEFAULT NULL, p_frequency TEXT DEFAULT NULL)
  Returns platform datasets from dataset_registry WHERE is_platform_dataset = TRUE.
  GRANT to authenticated. Authenticated users can call directly.
list_feed_status()
  Returns sanitised rows from data_feeds (name, provider, status, last_run_at, last_error,
  config jsonb). GRANT to authenticated. Service-role manages data_feeds rows.

## Security rules — enforce in EVERY feature, no exceptions

Row isolation   — RLS on every user-facing table: user_id = auth.uid()
BYOK keys       — Supabase Vault; public schema holds only an opaque secret_id.
                  Decryption is service_role only via worker_get_user_api_key.
Auth gate       — Supabase Auth JWT on every protected route (AuthGuard).
Subscription gate — start_*_run RPCs check active sub + configured key server-side.
Webhooks        — Paystack: x-paystack-signature HMAC-SHA512 constant-time + API re-verify.
                  Stripe: Stripe-Signature (Ed25519 via SDK) + API re-verify. Never trust
                  the raw event payload alone.
Webhook idempotency — webhook_events.provider_event_id UNIQUE. Duplicates → 200.
Run isolation   — subprocess gets own HOME, VIBE_TRADING_HOME, VIBE_TRADING_ALLOWED_RUN_ROOTS.
                  Worker secrets stripped from engine env.
Artifact access — Supabase Storage, owner-scoped RLS, signed URLs (5 min TTL).
No live trading — mandate-gated and off by default at MVP.
Fail closed     — uncertain broker state / stale data / recon mismatch / risk breach
                  blocks unsafe actions (roadmap Phases 6–8).

## Frontend architecture

Router: createBrowserRouter (react-router 8)
  Public (PublicLayout): /, /pricing, /docs, /terms, /privacy, /billing/callback
  Guest (GuestGuard + PublicLayout): /login, /signup
  Auth'd (AuthGuard + Layout): /dashboard, /agent, /run/:runId, /reports, /settings,
    /profile, /signals, /runtime, /scheduled, /compare, /correlation, /alpha-zoo, /about
Auth: Zustand store (useAuth) — supabase.auth.getSession + onAuthStateChange. Session set
  synchronously (D9, fixed race).
Data fetching: direct Supabase client (supabase.from / .rpc / .storage) + Realtime
  postgres_changes. NO SWR/React Query.
Key libs: lib/runs.ts, lib/billing.ts (initiateSubscription → provider Edge Function),
  lib/apikeys.ts, lib/auth-store.ts, lib/supabase.ts, lib/swarm.ts.

## Worker architecture (vibe-trading-saas/worker/)

Entry: `hm-worker` CLI. Modules: main.py (poll loop), runner.py (TradiRunner/StubRunner),
artifacts.py (ArtifactStore), db.py (service-role client), config.py, progress.py
(tail trace.jsonl), health.py (GET /health :9100), sentry.py (fail-open + PII scrubber),
logging_config.py (JSON logs + run_id).
Run flow: poll queued (FOR UPDATE SKIP LOCKED) → claim → fetch BYOK key via RPC →
spawn subprocess (isolated HOME) → tail progress → upload artifacts → completed/failed/timeout.

## Env vars required

# Supabase (frontend — VITE_ prefix, public)
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SENTRY_DSN

# Supabase (worker / Edge Functions — private)
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

# Paystack (Edge Function secrets)
PAYSTACK_SECRET_KEY / APP_URL

# Stripe (Edge Function secrets — planned)
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO / STRIPE_PRICE_PREMIUM

# Worker
WORKER_EXECUTE_TRADI / WORKER_TRADI_COMMAND / WORKER_RUNS_ROOT / WORKER_ID
poll/backoff/heartbeat/timeout tunables / LOG_LEVEL / SENTRY_DSN / WORKER_HEALTH_PORT

# Engine (Tradi/agent/.env — local dev only; production is BYOK)
DEEPSEEK_API_KEY

# Phase 2 — data plane (Railway HM service; NOT per-user BYOK)
LSE_API_KEY                                    # London Strategic Edge platform API key (required by hm-ingest)
LSE_API_BASE                                   # optional override; default https://api.londonstrategicedge.com

## Billing flows

### Paystack (live, test mode)
1. Frontend "Subscribe" → billing.ts → paystack-init Edge Function → authorization_url
2. Redirect to hosted checkout → /billing/callback?reference=...
3. charge.success webhook → paystack-webhook: HMAC verify → Paystack API re-verify →
   upsert_subscription (service_role) → webhook_events dedupe (::attemptId per attempt)
4. BillingCallback polls getSubscriptionStatus() until active
E2E harness: scripts/paystack-e2e.mjs --live (8/9 PASS, 0 FAIL — see sprint tracker).

### Stripe (planned — mirrors Paystack)
1. Frontend "Subscribe" (international tier) → stripe-init Edge Function → Checkout Session
2. Redirect to Stripe hosted checkout → success/cancel URLs
3. checkout.session.completed / customer.subscription.* / invoice.* webhooks → stripe-webhook:
   verify Stripe-Signature → re-verify via Stripe API → upsert_subscription (provider='stripe')
   → webhook_events dedupe
4. Frontend polls getSubscriptionStatus() until active
Entity note: Stripe cannot onboard a Nigerian entity directly — activation requires
Stripe Atlas (US LLC) or a foreign entity. NOT a blocker for MVP (Nigeria launches on
Paystack); international tier activates when the entity is ready.

## Swarm runs (Pro/Premium) & attachments (Premium)

30 preset YAML team configs in Tradi/agent/src/swarm/presets/. start_swarm_run gates
plan. Attachments: CSV/XLSX/JSON → agent-uploads bucket, 50 MB cap, paths
{uid}/{date}/{uuid}-{filename}, JSONB on agent_runs, mounted into subprocess cwd.

## Sprint tracker — UPDATE AT END OF EVERY SESSION

Sprint day : 8 of 30   Status: Week 2 in progress — Ollama BYOK + landing page v2 on branch, pending merge

Shipped (merged to main, live):
  ✅ MVP run loop VERIFIED end-to-end (prompt → queued → claim → engine → completed,
     24 artifacts, progress streamed). Fixed en route: [BUG-ENG-1] reasoning_content
     echo, [BUG-ENG-2] usage_events NULL crash, [BUG-ENG-3] realtime sync noise.
  ✅ Auth, Dashboard, Agent launcher, RunView, BYOK pivot (Vault), Swarm dispatch,
     attachments, realtime queue viewer, live progress streaming, Shadow Account
     (journal → backtest → HTML report, Premium), 83 hermetic worker tests.
  ✅ Paystack billing Edge Functions + E2E harness (8/9 PASS, 0 FAIL) — test mode.
  ✅ Admin dashboard (suspend/unsuspend, audit logs, plan override).
  ✅ Monitoring: Sentry worker + frontend live. Railway healthcheck wired.
  ✅ Frontend production deploy LIVE (hmtrade.business / hm-ashy-six.vercel.app).
  ✅ Cloudflare domain + SSL (zone hmtrade.business, Full strict, BIC off recommended).
  ✅ Email templates shipped (inert until support@ mailbox + SMTP configured).
  ✅ Launch prep code shipped (company.ts registrant, footer, legal blocks).
  ✅ QUANT RESEARCH OS UPGRADE PLANNING 2026-08-21 — constitution committed
     (PROJECT/DATA/ARCHITECTURE/WORKFLOW/SOUL.md), UPGRADE_ROADMAP.md harmonized
     (10-phase, commits 5a5b42c 5e69d3c). Next: Phase 0 inventory + branch strategy.
  ✅ UNIFIED SPEC ADOPTED 2026-08-21 — docs/UNIFIED_SPEC.md (63-section single
     source of truth) + docs/RECONCILIATION.md (18 conflicts resolved) +
     docs/REQUIREMENTS.md (81 requirements before build). D17 WebSocket-first
     recorded. Brand locked: H~M Trading Institute + QuantLab/QuantLab Admin.
  ✅ QUANTLAB DASHBOARD REDESIGN 2026-08-22 — renamed Agent→Research in nav, full
     grouped sidebar (5 sections), dashboard with live agent_runs + Research Copilot,
     Phase 2–8 feature stubs wired. PR #14 merged (ae16b53).
  ✅ LSE IMPORT 2026-08-22 — London Strategic Edge formally adopted as product +
     data architecture reference; 7 patterns imported; docs committed (6b12d49).
     ADR D18 recorded: LSE promoted from reference to live Phase 2 data provider.

In progress / next:
  ✅ OLLAMA BYOK (2026-08-22) — branch feat/landing-page-v2, commit 51be48f:
     • DB migration 2026_08_22_ollama_byok.sql — expand provider CHECK on
       user_api_keys + agent_runs; URL validation in save_user_api_key; new
       list_user_api_key_statuses() RPC; updated start_*_run gates (deepseek|ollama).
       ⚠ NOT YET APPLIED to Supabase — apply before this branch lands.
     • Worker: ollama_model field (WORKER_OLLAMA_MODEL, default qwen2.5:32b);
       execute() resolves deepseek-first/ollama-fallback; _build_env() provider-aware.
     • Frontend apikeys.ts: Provider = 'deepseek'|'ollama'; URL pattern validation;
       listApiKeyStatuses() RPC; Profile.tsx OllamaSection (Globe icon, type=url input).
     • Tests: 83/83 pass; frontend build clean.
     NEXT: apply migration → merge PR → (optionally) add WORKER_OLLAMA_MODEL to Railway.
  ✅ Landing page v2 (2026-08-22) — branch feat/landing-page-v2, PR #18:
     trading-chart.mp4 hero video, Quant Research OS positioning, institutional copy.
     ⚠ Not yet merged to main (same branch as Ollama BYOK).
     NEXT: apply Supabase migration → merge this branch.
  ✅ Shadow Account migration 2026_08_21_shadow_account.sql — APPLIED to Supabase
     2026-08-22 (Management API; kind constraint already present, start_shadow_run
     RPC created + grants verified: PUBLIC execute only, no anon row).
  ✅ BUG-ENG-4 (2026-08-22) — engine >= 1907e47 hard-requires LANGCHAIN_PROVIDER/
     LANGCHAIN_MODEL_NAME but the worker only injected DEEPSEEK_API_KEY and the
     container ships no agent/.env → every run failed "LANGCHAIN_MODEL_NAME is
     not set" since 2026-08-19. Fixed: worker injects both (deepseek /
     deepseek-v4-pro, env-overridable). VERIFIED LIVE via smoke run (claimed,
     engine started).
  ✅ BUG-ENG-5 (2026-08-22) — start_shadow_run stores attachments as a plain
     string array but ClaimedRun.from_row only accepted dicts → "missing journal
     attachment". Fixed: worker accepts both shapes. VERIFIED LIVE.
  ⏳ PHASE 2 DATA PLANE (2026-08-22) — branch feat/phase2-data-plane, PR pending:
     • Migration 2026_08_22_phase2_data_plane.sql APPLIED to Supabase: dataset_registry
       table, data_feeds table (lse-ohlcv-daily seed row), hm-datalake bucket,
       list_platform_datasets() + list_feed_status() RPCs, full RLS.
     • Worker: httpx + pyarrow + websockets deps; hm-ingest CLI entry point; config.py
       with lse_api_key/lse_api_base; lse_adapter.py (HTTP OHLCV → Parquet →
       hm-datalake); lse_ws.py (WebSocket skeleton, Phase 6 target); ingestion.py.
     • Frontend: DataCatalog.tsx (/data — real dataset registry + feed health page),
       lazy-loaded in router.tsx; DataPage stub retired.
     • LSE_API_KEY added to Railway HM service (platform-managed; NOT per-user BYOK).
     • Tests: 74/74 worker pass, frontend build clean.
     NEXT: open PR → merge → Railway redeploys with new deps → run hm-ingest --dry-run
     to validate LSE API connectivity; replace DeepSeek key (last4 ca63 is invalid).
  ⏳ SMOKE TEST NOTE (2026-08-22): worker path proven E2E; owner's DeepSeek BYOK
     key (last4 ca63) is INVALID per api.deepseek.com (401) — replace in Profile
     → Settings before any real run can complete. Test row/artifacts cleaned.
  ⏳ Paystack charge.success E2E with test card (PAYSTACK_TEST_REFERENCE); swap to live
     plans + key at launch.
  ⏳ Stripe: onboarding (entity/Atlas) + stripe-init/stripe-webhook Edge Functions + plans.
  ⏳ Email: support@hmtrade-business.com mailbox, Auth templates, transactional provider.
  ⏳ Upgrade Phase 0: ✅ DONE 2026-08-21 — inventory (docs/UPGRADE_INVENTORY.md), decision
     ledger (UPGRADE_ROADMAP.md §4), launch gates shipped (keepalive + backup workflows).
     ⏳ Phase 1: brief drafted (docs/PHASE1_BRIEF.md) — build starts AFTER launch (R1-Q1);
     branch upgrade/phase-1-foundation.
  ⏳ Cleanup before launch: test accounts (admin.tester/user.tester), env-var purge on Vercel.

Not started (deferred):
  🔲 Live trading (mandate-gated, off by default) — roadmap Phase 8
  🔲 Admin 2FA (TOTP for /admin/*)
  🔲 Advanced analytics (per-user P&L, portfolio tracking)
  🔲 Public API — roadmap Phase 10
  🔲 Mobile-optimized views

## Key decisions (ADRs)

D1  — Subprocess-per-run: Tradi's process-global singletons make in-process multi-tenant unsafe
D3  — Reuse Tradi frontend (React, not Next.js) — saves rewrite, inherits alpha UI
D5  — SQL job claiming with FOR UPDATE SKIP LOCKED — atomic, no Redis, N workers safe
D8  — **Paystack (NGN, Nigeria launch) + Stripe (international, entity-gated, planned)** —
      provider-agnostic subscriptions; webhooks signed + idempotent
D9  — Auth store sets session synchronously (fixed signup/login race)
D10 — One metered prompt box on Agent page (not a chat-style multi-turn UI)
D11 — BYOK pivot: users supply their own LLM credential — DeepSeek (sk-…) or
      Ollama (base URL, self-hosted). Both encrypted in Supabase Vault. Worker
      resolves provider per-user at run time: DeepSeek first, Ollama fallback.
D12 — Supabase Vault for key storage (not AES-256-GCM with app-managed key)
D13 — Edge Functions for payment webhooks (not a FastAPI backend at MVP)
D14 — No Celery/Redis — Python polling loop is simpler and sufficient for MVP scale
D15 — **Cloudflare = edge/control plane (DNS/WAF, Workers gateway, Queues, R2); compute =
      Railway container (FastAPI + engine worker, two processes). Workers CANNOT run the
      engine (V8 isolates, CPU caps, no subprocess/Python)**
D16 — **Harmonized 10-phase roadmap (UPGRADE_ROADMAP.md) governs the Quant Research OS
      upgrade; strangler-fig migration; the live run loop never breaks**
D17 — **WebSocket-first architecture commitment (unified spec §18/§51)**: market data,
      orders, fills, P&L, job progress, notifications over WS channels
      (/ws/markets, /ws/portfolio, /ws/orders, /ws/strategies, /ws/jobs…);
      REST stays request/response. Implementation Phase 6; recorded 2026-08-21.
D18 — **LSE (London Strategic Edge) as Phase 2 primary data provider** (overrides R2-Q7
      which said "reuse engine loaders OKX/Binance/CCXT"). One API key covers HTTP
      historical OHLCV + WebSocket live. Platform-managed key (LSE_API_KEY in Railway HM
      service — NOT per-user BYOK). WebSocket skeleton wired in Phase 2, productionized
      in Phase 6 per D17. Direct httpx calls — no `lse-data` PyPI package dependency.
D19 — **Phase 2 Path B** — dataset_registry schema built directly in Supabase SQL
      (not gated on Phase 1 FastAPI monolith). Strangler-fig: FastAPI can sit in front
      later without touching the data layer. hm-ingest is a separate CLI entry point —
      the live agent-run poll loop never changes (D16 invariant preserved).

## Testing requirements

Worker   : 74 hermetic tests (pytest, black-clean) —
           cd vibe-trading-saas/worker && env -u PYTHONPATH -u VIRTUAL_ENV .venv/bin/python -m pytest -q
           (the env -u prefix is required on this machine — Hermes shell leaks both)
Frontend : npm run build (type-check + Vite) AND npm run test:run →
           expect exit 0, 261/265 passing; the 4 failures are the PRE-EXISTING
           Layout.test.tsx flake — do NOT chase it
Engine   : pytest --ignore=agent/tests/e2e_backtest -q — cd Tradi
Webhook  : Paystack HMAC-SHA512 constant-time; Stripe Stripe-Signature; both re-verify via API
Auth     : signUp → signIn → protected route → signOut happy path
BYOK     : save key → Vault → worker decrypts → run completes
Billing  : init → hosted checkout → webhook → subscription active (Paystack harness: 8/9)

## Environment pitfalls (this machine)

- **Slow Airtel 64kbps WAN**: GitHub slow (generous timeouts), npm ETIMEDOUT → npmmirror
  via npm_config_registry; big downloads off-peak (6 AM) + retry.
- **PEP 668 + Hermes shell leaks PYTHONPATH/VIRTUAL_ENV**: venv pythons need
  `env -u PYTHONPATH -u VIRTUAL_ENV` or pip skips deps. User pkgs: `pip install --user --break-system-packages`.
- **pkill -f self-matches** — use `pkill -x <comm>`.
- **sudo needs a password** — root ops via pkexec (KDE polkit).
- Supabase service-role key + Paystack test key live in `~/.hm-test.env` — never print tokens.
- `gh` CLI is NOT installed on this machine — deploy checks need it (apt install gh + auth).

## Session workflow (read before every session)

Start: "Read CLAUDE.md. Continue from the sprint tracker. Today's task: [describe]."
Debug: "Read CLAUDE.md. Bug: [...]. Error: [...]. File(s): [...]. Fix only what's broken."
Add feature: "Read CLAUDE.md. Add: [feature]. Fits in: [component]. Rules that apply: [quote]."
Upgrade work: "Read CLAUDE.md + UPGRADE_ROADMAP.md. Phase: [N]. Task: [...]."
End: Update sprint tracker + commit CLAUDE.md (and roadmap if it changed).
