# H~M Trading Institute — Quant Research OS

> **Bring your own DeepSeek key. Ask trading questions in plain English. Get backtested analysis — no Python, no local setup.**

H~M Trading Institute is a **research-first, data-first, AI-native quantitative trading platform** — a *Quant Research OS* — that helps users move from

**idea → research → reproducible experiment → validation → backtest → paper trading → controlled live deployment**

and back again (`observed performance → diagnostics → new research`).

Today it is a multi-user subscription SaaS wrapping the [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) AI agent engine: users sign up, connect their DeepSeek API key, and run research agents that backtest strategies, analyse alphas, and produce equity curves, trade logs, and performance metrics — all through a clean web interface. The platform optimizes for **truth, reproducibility, reliability, and risk control**, not backtest vanity metrics.

---

## What we aim to be (the destination)

A web-first platform that unifies:

- **AI research agents** — hypothesis generation, tool use, multi-agent research
- **Canonical market data** — versioned, point-in-time, licensed, quality-scored
- **Deterministic quant research** — strategy SDK, exchange simulation, realistic costs/slippage
- **ML & RL experimentation** — datasets, feature pipelines, model registry (RL = research-only)
- **Backtesting & validation** — out-of-sample, walk-forward, stress testing, pre-registration
- **Paper trading → controlled live** — OMS, risk engine, reconciliation, promotion ladder
- **Portfolio, observability, audit & billing**

Non-negotiables: no look-ahead, no survivorship shortcuts, no hidden leakage · backtest ≠ proof ·
AI proposes, deterministic systems enforce · paper before live · fail closed · one canonical data model.
Full principles in [`SOUL.md`](SOUL.md).

The path from today's MVP to that destination is the **[10-phase upgrade roadmap](UPGRADE_ROADMAP.md)**.
The project constitution lives in `PROJECT.md · DATA.md · ARCHITECTURE.md · WORKFLOW.md · SOUL.md`.

---

## What it does today

- **Natural-language prompts** — describe a strategy or research question; the AI agent handles the rest
- **Backtesting** — 8 engines, 24 data sources (OKX, Binance, yfinance, Tushare, …), 462 built-in alphas
- **Real-time run tracking** — live status (queued → running → completed), streaming progress, artifact downloads
- **Swarm runs** — Pro+ users dispatch 30 preset multi-agent team configs in parallel
- **Shadow Account** — upload a trade journal → behavioural strategy extraction → backtest → HTML report (Premium)
- **Attachment analysis** — Premium users upload CSV/XLSX/JSON files as run context
- **Full output** — equity curve, metrics (Sharpe, Win Rate, Return), trade log, Pine Script, downloadable report

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 · Vite · TypeScript · Tailwind 3 · react-router 8 · Zustand |
| Backend / DB | Supabase (PostgreSQL 17 · Auth · Storage · RLS · Vault · Realtime) |
| Billing | Paystack (NGN — Nigeria) + Stripe (international — planned), signed webhooks, idempotent |
| Worker | Python — polls `agent_runs`, subprocess-per-run, isolated `HOME` per job |
| AI Engine | Vibe-Trading (vendored, MIT) — 462 alphas, backtest engines, data sources |
| LLM | DeepSeek (user-supplied key, never stored in plaintext) |
| Edge / Hosting | Cloudflare (DNS/WAF) · Vercel (frontend) · Railway (worker) · Supabase (backend) |

## Architecture

```text
Browser
  └─ React SPA (Vercel)  ── Cloudflare (DNS/WAF)
        ├─ Supabase Auth (JWT)
        ├─ startRun() RPC → agent_runs table
        └─ RunView: polls status + streams artifacts

Supabase
  ├─ agent_runs (queued → running → completed/failed)
  ├─ user_api_keys (Vault-backed, service-role decrypt only)
  ├─ subscriptions + plans (Paystack-synced via webhook; Stripe planned)
  └─ agent_artifacts (Storage, owner-scoped RLS)

Python Worker (Railway)
  ├─ polls agent_runs WHERE status='queued' (SKIP LOCKED)
  ├─ fetches user's DeepSeek key from Vault via RPC
  ├─ spawns Tradi subprocess (isolated HOME per run)
  └─ uploads artifacts → Storage → marks completed/failed

Tradi Engine (vendored at Tradi/)
  └─ vibe-trading run -p "<prompt>" --json --max-iter N
```

**Key decisions:**
- Subprocess-per-run (D1) — Tradi's process-global singletons make in-process multi-tenant execution unsafe
- BYOK (D11) — users supply their own DeepSeek key; the platform never proxies or marks up LLM calls
- SQL job claiming with `FOR UPDATE SKIP LOCKED` (D5) — atomic, no Redis, N workers safe in parallel
- Paystack + Stripe billing (D8) — Paystack launches Nigeria; Stripe is entity-gated (Atlas) and planned
- Cloudflare = edge/control plane; Railway = compute plane (D15) — Workers cannot run the engine

## Pricing

All plans include **unlimited runs** — you pay DeepSeek directly for tokens.

| Plan | Paystack / mo | Stripe (planned) | Capabilities |
|------|---------------|------------------|--------------|
| **Starter** | ₦20,000 (~$15) | ~$15 | Single-agent runs |
| **Pro** | ₦35,000 (~$27) | ~$27 | + Swarm (30 multi-agent team presets) |
| **Premium** | ₦75,000 (~$58) | ~$58 | + Attachment uploads (CSV / XLSX / JSON) + Shadow Account |

## Security

- **BYOK keys** stored in Supabase Vault (`vault.secrets`); only an opaque `secret_id` lives in the public schema. Decryption is service-role only via `worker_get_user_api_key()` — the frontend never sees the plaintext key.
- **RLS on every table** — user-scoped at the DB level (`user_id = auth.uid()`), not the application level.
- **SECURITY DEFINER RPCs** use `auth.uid()`, never a client-supplied user ID.
- **Webhooks verified before trust** — Paystack HMAC-SHA512 (constant-time) + API re-verify; Stripe signature + API re-verify (planned); idempotent via `webhook_events.provider_event_id UNIQUE`.
- **Run isolation** — each subprocess gets its own `HOME`, `VIBE_TRADING_HOME`, and `VIBE_TRADING_ALLOWED_RUN_ROOTS`; worker secrets are stripped before the engine env is built.
- **No live trading at MVP** — mandate-gated and off by default; live is a promotion state, not a shortcut.

## Repo layout

```text
HM/
├── SOUL.md · PROJECT.md · DATA.md · ARCHITECTURE.md · WORKFLOW.md   Constitution
├── UPGRADE_ROADMAP.md    Harmonized 10-phase migration plan
├── CLAUDE.md             Source of truth (current live system) + session rules
├── Session.md            Session prompt templates
├── Build_Plan.md         SUPERSEDED MVP blueprint (reference only)
├── Tradi/                Vendored Vibe-Trading engine (MIT)
│   ├── agent/            FastAPI server, CLI, ReAct agent, backtest engines
│   ├── frontend/         React 19 + Vite SPA (the production frontend)
│   └── CLAUDE.md         Engine-specific dev notes
├── vibe-trading-saas/
│   ├── worker/           Python worker — hm-worker entry point (74 hermetic tests)
│   ├── db/migrations/    SQL migrations (applied to Supabase manually)
│   └── docs/             Legacy pre-pivot docs (historical)
├── supabase/functions/   paystack-init · paystack-webhook (stripe-* planned)
├── infra/                nginx · tradi-api configs
└── docs/                 LAUNCH_CHECKLIST, RAILWAY_DEPLOY, CLOUDFLARE_SETUP
```

## Development

### Prerequisites

- Node ≥ 22, Python ≥ 3.11
- A [Supabase](https://supabase.com) project
- A [DeepSeek](https://platform.deepseek.com) API key (your own — BYOK)

### Frontend

```bash
cd Tradi/frontend
cp .env.example .env          # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev                   # http://localhost:5899
```

### Worker

```bash
cd vibe-trading-saas/worker
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env          # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
hm-worker                     # polls agent_runs
```

### Engine (Tradi)

```bash
cd Tradi
pip install -e ".[dev]"
cp agent/.env.example agent/.env   # set DEEPSEEK_API_KEY
vibe-trading                        # interactive CLI
```

### Tests

```bash
# Worker suite (74 tests)
cd vibe-trading-saas/worker && env -u PYTHONPATH -u VIRTUAL_ENV .venv/bin/python -m pytest -q

# Frontend types + build + unit tests
cd Tradi/frontend && npm run build && npm run test:run
```

## Engine provenance

The AI engine (`Tradi/`) is a vendored copy of [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) (MIT licence). The original `LICENSE` and `NOTICE` files are preserved in `Tradi/`. The SaaS wrapper (`vibe-trading-saas/`, frontend pages, worker, billing) is proprietary.

## Status

**Sprint Day 8 of 30 — Week 2 in progress. Quant Research OS upgrade planning underway (roadmap Phase 0).**

- ✅ Live MVP: auth, agent launcher, RunView streaming, worker E2E, BYOK, swarm, attachments, Shadow Account
- ✅ Paystack billing Edge Functions + E2E harness (8/9, test mode) · Admin dashboard · Sentry · Cloudflare SSL
- ⏳ Stripe onboarding (entity/Atlas) + stripe-init/stripe-webhook · email templates · launch checklist
- ⏳ Upgrade Phase 0: module inventory → KEEP/MODIFY/MOVE/NEW matrix → branch strategy
