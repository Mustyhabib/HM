# H~Mltd — AI Trading Research Platform

> **Bring your own DeepSeek key. Ask trading questions in plain English. Get backtested analysis — no Python, no local setup.**

H~Mltd is a multi-user SaaS that wraps the [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) AI agent engine into a subscription product. Users sign up, connect their DeepSeek API key, and run research agents that backtest strategies, analyse alphas, and produce equity curves, trade logs, and performance metrics — all through a clean web interface.

---

## What it does

- **Natural-language prompts** — describe a strategy or research question; the AI agent handles the rest
- **Backtesting** — 8 engines, 24 data sources (OKX, Binance, yfinance, Tushare, …), 462 built-in alphas
- **Real-time run tracking** — live status (queued → running → completed), streaming progress, artifact downloads
- **Swarm runs** — Pro+ users can dispatch 30 preset multi-agent team configs in parallel
- **Attachment analysis** — Premium users can upload CSV/XLSX/JSON files as run context
- **Full output** — equity curve, metrics (Sharpe, Win Rate, Return), trade log, Pine Script, downloadable report

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 · Vite · TypeScript · Tailwind 3 · react-router 8 · Zustand |
| Backend / DB | Supabase (PostgreSQL 17 · Auth · Storage · RLS · Vault) |
| Billing | Paystack — NGN plans, hosted checkout, webhook idempotency |
| Worker | Python — polls `agent_runs`, subprocess-per-run, isolated `HOME` per job |
| AI Engine | Vibe-Trading (vendored, MIT) — 462 alphas, 8 backtest engines, 24 data sources |
| LLM | DeepSeek (user-supplied key, never stored in plaintext) |
| Hosting | Vercel (frontend) · Railway/Fly.io (worker) |

---

## Architecture

```
Browser
  └─ React SPA (Vercel)
        ├─ Supabase Auth (JWT)
        ├─ startRun() RPC → agent_runs table
        └─ RunView: polls status + streams artifacts

Supabase
  ├─ agent_runs (queued → running → completed/failed)
  ├─ user_api_keys (Vault-backed, service-role decrypt only)
  ├─ subscriptions + plans (Paystack-synced via webhook)
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
- Paystack + NGN billing (D8) — sole MVP provider for Nigerian entity; Stripe parked for future international

---

## Pricing

All plans include **unlimited runs** — you pay DeepSeek directly for tokens.

| Plan | Price / mo | Capabilities |
|------|-----------|--------------|
| **Starter** | ₦70,000 (~$54) | Single-agent runs |
| **Pro** | ₦120,000 (~$92) | + Swarm (30 multi-agent team presets) |
| **Premium** | ₦200,000 (~$154) | + Attachment uploads (CSV / XLSX / JSON) |

---

## Security

- **BYOK keys** stored in Supabase Vault (`vault.secrets`); only an opaque `secret_id` lives in the public schema. Decryption is service-role only via `worker_get_user_api_key()` — the frontend never sees the plaintext key.
- **RLS on every table** — every query is user-scoped; `user_id = auth.uid()` at the DB level, not the application level.
- **SECURITY DEFINER RPCs** use `auth.uid()`, never a client-supplied user ID.
- **`anon` EXECUTE revoked** from all user-facing RPCs; zero RLS policies on `user_api_keys` (belt-and-suspenders: even if a policy were added, the column carrying the secret is never in the public table).
- **Run isolation** — each subprocess gets its own `HOME`, `VIBE_TRADING_HOME`, and `VIBE_TRADING_ALLOWED_RUN_ROOTS`; worker secrets are stripped before the engine env is built.
- **No live trading at MVP** — mandate-gated and off by default; the engine is research/backtesting only.

---

## Repo layout

```
HM/
├── Tradi/                    Vendored Vibe-Trading engine (MIT)
│   ├── agent/                FastAPI server, CLI, ReAct agent, backtest engines
│   ├── frontend/             React 19 + Vite SPA (the production frontend)
│   └── CLAUDE.md             Engine-specific dev notes
│
├── vibe-trading-saas/
│   ├── worker/               Python worker — hm-worker entry point
│   │   ├── hm_worker/        Polling loop, TradiRunner, ArtifactStore
│   │   └── tests/            53 hermetic tests (black-clean)
│   ├── db/migrations/        SQL migrations (applied to Supabase)
│   └── docs/                 Architecture, decisions, 30-day plan
│
└── CLAUDE.md                 Root orchestration rules + domain model
```

---

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
# Worker suite (53 tests)
cd vibe-trading-saas/worker && pytest -q

# Frontend types + build
cd Tradi/frontend && npm run build
```

---

## Engine provenance

The AI engine (`Tradi/`) is a private fork of [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) (MIT licence). The original `LICENSE` and `NOTICE` files are preserved in `Tradi/`. The SaaS wrapper (`vibe-trading-saas/`, frontend pages, worker, billing) is proprietary.

---

## Status

**Sprint Day 8 of 30 — Week 2 in progress.**

- ✅ Auth, dashboard, agent launcher, RunView, live run streaming
- ✅ Worker E2E verified (claim → subprocess → artifacts → Supabase Storage)
- ✅ BYOK pivot — users bring their own DeepSeek key, unlimited runs per tier
- ✅ Swarm dispatch, file attachment mounts, realtime queue viewer
- 🔨 Paystack billing integration (next)
- ⏳ Admin dashboard, monitoring, legal pages, launch prep
