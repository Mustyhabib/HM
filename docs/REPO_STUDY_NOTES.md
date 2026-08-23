# REPO_STUDY_NOTES.md — Full Repository Study (2026-08-22)

> **Purpose:** Record that the entire constitution + live-system documentation set
> has been read, cross-checked, and adopted as source of truth for this and all
> future development sessions on this repo. This file is a durable, committed
> substitute for external memory (no MeM0 available in this environment) — read
> it alongside `CLAUDE.md` at the start of any session that needs full context
> fast, without re-reading all ~20 source docs.
>
> **Authority stays with the source documents.** This file is a study record and
> quick-reference index, not a new source of truth — if anything here conflicts
> with `CLAUDE.md`, `docs/UNIFIED_SPEC.md`, or `docs/RECONCILIATION.md`, those win.

## Documents read and cross-referenced

Root constitution + current-truth docs:
`CLAUDE.md` · `SOUL.md` · `FOUNDATIONS.md` · `PROJECT.md` · `ARCHITECTURE.md` ·
`DATA.md` · `WORKFLOW.md` · `README.md` · `UPGRADE_ROADMAP.md`

`docs/` (spec, requirements, reconciliation, infra, phase planning):
`docs/UNIFIED_SPEC.md` · `docs/RECONCILIATION.md` · `docs/REQUIREMENTS.md` ·
`docs/INFRASTRUCTURE.md` · `docs/UI_VISION.md` · `docs/UPGRADE_INVENTORY.md` ·
`docs/PHASE1_BRIEF.md` · `docs/LAUNCH_CHECKLIST.md` · `docs/RAILWAY_DEPLOY.md`

A synthesized single-page reference (all sections below, in visual/browsable
form) was authored as a Claude Artifact during this study session.

## What this repo is (locked understanding)

- **Brand:** H~M Trading Institute (customer-facing). **Never** "Vibe-Trading" in
  user-facing UI — that's the vendored open-source engine underneath.
- **Products:** QuantLab (user app) + QuantLab Admin (control plane). Internal
  working name for the overall system: **Quant Research OS**.
- **What it is today:** a multi-user subscription SaaS wrapping HKUDS/Vibe-Trading
  (MIT) — users BYOK their own DeepSeek key and run AI trading-research agents
  through a web UI. Research/backtesting only at MVP; **no live trading**
  (mandate-gated, off by default).
- **What it is becoming:** a full quantitative research platform moving users
  through `idea → research → reproducible experiment → validation → backtest →
  paper → controlled live`, per the 10-phase `UPGRADE_ROADMAP.md`, governed by a
  strangler-fig migration principle — **the live run loop never breaks**; new
  architecture stands up beside the live system, additive-only, gated per phase.
- **Domain:** `hmtrade.business` is live (Vercel alias `hm-ashy-six.vercel.app`).
  `hmtrade-business.com` does **not exist** — never use it.

## Current live stack (do not deviate without explicit instruction)

React 19 + Vite + TypeScript + Tailwind 3 + react-router 8 + Zustand +
@supabase/supabase-js + ECharts, living in `Tradi/frontend/`. No traditional
backend server — Supabase (Postgres 17, Auth, Storage, Vault, Edge Functions,
Realtime) is the entire backend. Python polling worker (`hm-worker`) on Railway
claims `agent_runs` rows (`FOR UPDATE SKIP LOCKED`) and spawns the vendored
Vibe-Trading engine as an isolated subprocess. Billing: Paystack (NGN, live in
test mode) now, Stripe (international) planned once an entity exists. LLM:
DeepSeek via BYOK only — the platform never proxies or marks up LLM calls; keys
live encrypted in Supabase Vault, decrypted only by the service-role-only RPC
`worker_get_user_api_key`. Cloudflare fronts DNS/WAF/SSL.

## 5-layer platform model (FOUNDATIONS.md) and the "five brains"

Data Layer → AI Research Layer → Quant Engine → Risk + Execution →
Platform/SaaS. Mental model: Research Brain → Quant Brain → RL Brain →
Risk Brain → Execution, wrapped by Data Platform, Model Registry, Experiment
Tracking, Multi-user Platform, and Observability. Reference-project roles:
Vibe-Trading = build on/adapt (today's engine); OsEngine and NOFX = learn from;
London Strategic Edge = product + data architecture reference. Our own data
stack (not any single vendor's): Source → Ingestion → Validation →
Normalization → Versioning → Storage, feeding DuckDB/Polars → Features →
Research/ML/RL → Backtest.

## Research workflow pipeline (WORKFLOW.md)

`Question → Formal Hypothesis → Experiment Spec → Data Validation → Data
Snapshot → Feature Pipeline → Baseline/ML/RL → Backtest → Walk-Forward →
Untouched Test Set → PASS/FAIL → Paper → Risk Approval → Live →
Reconciliation → Feedback` — a closed loop back to new research. Nothing
bypasses the promotion gate: AI proposes, deterministic systems (Risk/OMS)
enforce. Model promotion ladder: Candidate → Validated → Paper → Shadow →
Approved → Live.

## Execution safety boundary (constitutional, unchanged across all phases)

`AI / RL / Strategy → Trade Intent → Risk Engine → OMS → Execution Adapter →
Broker`. No AI agent ever gets direct unrestricted broker access. Fail closed
on uncertain broker state, stale data, reconciliation mismatch, or risk
breach — block, never guess.

## 10-phase upgrade roadmap (UPGRADE_ROADMAP.md §8)

| Phase | Name | Status |
|---|---|---|
| 0 | Baseline & freeze | Done — constitution + inventory + launch gates shipped 2026-08-21 |
| 1 | Foundation (FastAPI monolith, tenant projects, research-governance substrate) | Planned — brief drafted (`docs/PHASE1_BRIEF.md`), starts after launch |
| 2 | Data (canonical schema, PIT, R2+Parquet lake, dataset registry) | Planned |
| 3 | Quant Engine (strategy SDK, ExecutionInterface, walk-forward) | Planned |
| 4 | Research AI (hypotheses, experiment workflow, promotion ladder) | Planned |
| 5 | ML (baseline first, model registry — MLflow candidate per R6) | Planned |
| 6 | Paper Trading (risk engine, OMS, reconciliation) | Planned |
| 7 | RL (research-only) | Planned |
| 8 | Controlled Live (broker adapters, mandate-gated) | Planned |
| 9 | Scale (observability, quotas, metered billing) | Planned |
| 10 | Expansion (asset classes, marketplace, enterprise) | Planned |

Phase 1 schema (do not create early): `hypotheses`, `experiments`,
`dataset_registry`, `promotion_events`, plus `profiles.organization_id` /
`projects` for the tenant model. Full DDL sketch lives in
`docs/PHASE1_BRIEF.md` and `UPGRADE_ROADMAP.md` §9.

## Reconciliation register (docs/RECONCILIATION.md) — how to resolve spec-vs-live conflicts

The unified spec (`docs/UNIFIED_SPEC.md`, adopted 2026-08-21) is the single
source of truth and wins over earlier reports **unless a documented ADR
changes it**. 18 conflicts are pre-resolved (R1–R18); the pattern is
consistent: **keep the live ADR/stack for the current MVP, adopt the spec's
richer model as the target for the roadmap phase where it's scoped to land.**
Notable ones to remember before building anything:
- R1/R14: keep React/Vite SPA + direct Supabase client now; Next.js/TanStack
  Query are a future frontend-refactor decision, not before Phase 1's API exists.
- R3: keep Paystack now (D8); Stripe activates when the entity (Atlas) exists.
- R4/R7: keep Python-polling + Postgres rate-limit now (D14); Redis/queue
  enters with the Phase 1 FastAPI skeleton, never becomes the system of record.
- R11/D17: WebSocket-first is a recorded commitment; implementation is Phase 6;
  REST stays request/response, run-status polling stays until then.
- R13: new code (Phase 1+) follows the target repo layout (`apps/ services/
  workers/ packages/`); live directories (`Tradi/`, `vibe-trading-saas/`,
  `supabase/`, `infra/`) stay untouched until each is migrated deliberately.
- R17: no fake numbers on the dashboard — empty states + a paper-account offer
  when there's no live/paper data yet (also FR-1.3 in REQUIREMENTS.md).
- R18: **our** 10-phase roadmap stays authoritative for execution order; the
  spec's own phase numbering maps onto it, not the reverse.

## Infrastructure topology (docs/INFRASTRUCTURE.md)

Target: Cloudflare (DNS/WAF, Workers gateway, R2 lake, Queues) in front of
Vercel (SPA) and a Railway container running a FastAPI modular monolith
(API process + worker process + Redis), backed by Supabase Postgres as the
transactional source of truth (Auth, Vault, Storage, RLS + SECURITY DEFINER
RPCs kept as today's run-loop gates). **D15 is load-bearing:** Cloudflare
Workers cannot host the engine — V8 isolates, hard CPU-time caps, no
subprocess/Python — so compute stays on Railway, edge/control-plane stays on
Cloudflare. Component-ownership table in that doc maps every node (WEB/PWA,
API, RESEARCH, QUANT CORE, EXPERIMENTS, ML, RL, STRATEGY, TESTING ENGINE,
VALIDATE, PAPER, RISK, OMS, EXECUTION, BROKER, DATA PLANE) to its current-live
owner and its target-phase owner — use it before assuming a component doesn't
exist yet.

## QuantLab UI vision (docs/UI_VISION.md)

**QuantLab (user app):** sidebar nav mapped to the 5-layer model — dashboard
widgets for Portfolio, P&L, Sharpe, Drawdown, Market Chart, AI Research
Copilot, Strategy Monitor, Risk Monitor, Market Regime, Recent Research, and
ML/RL Experiments. **QuantLab Admin:** Overview (4 KPI tiles), Infrastructure
cost panel, System Health, Active Jobs, Security, Trading Control — a
protected `/admin` route inside the same SPA (D13), not a separate deploy.
Design system: dark navy ground, blue→violet gradient accent, Inter (UI) +
JetBrains Mono (data/code).

## Security invariants (enforce in every feature, no exceptions)

RLS on every user-facing table (`user_id = auth.uid()`) · BYOK keys live only
in Supabase Vault, public schema holds an opaque `secret_id`, decryption is
service-role-only via `worker_get_user_api_key` · Supabase Auth JWT gate on
every protected route · `start_*_run` RPCs check active subscription +
configured key server-side · Paystack webhooks verified via HMAC-SHA512
constant-time compare + API re-verify (Stripe: `Stripe-Signature` + API
re-verify, planned) · webhook idempotency via `webhook_events
.provider_event_id UNIQUE` · each run subprocess gets its own `HOME` /
`VIBE_TRADING_HOME` / `VIBE_TRADING_ALLOWED_RUN_ROOTS`, worker secrets are
stripped from the engine's environment · artifact access via owner-scoped RLS
+ signed URLs (5 min TTL) · no live trading at MVP, mandate-gated and off by
default · fail closed on uncertain state everywhere it matters (Phases 6–8).

## Requirements register (docs/REQUIREMENTS.md)

81 requirements across 13 groups (FR-1 Product/Experience … FR-13
Infrastructure/Cost), each tagged with spec section, roadmap phase, priority
(MUST/SHOULD/MAY), and status (LIVE or P0–P10). Two worth remembering by ID
because they constrain UI work directly: **FR-1.3** — no fake/simulated
trading values ever shown on the dashboard; **FR-8.2** — no bare "GO LIVE"
button (live is a gated promotion state, not a switch); **FR-11.2** — no live
trading is ever reachable from a generic/unrestricted AI agent path.

## Practical takeaway for future sessions

Before any build task: check `CLAUDE.md` for current live truth, then
`docs/RECONCILIATION.md` if the task touches something the unified spec also
describes, then the relevant roadmap phase in `UPGRADE_ROADMAP.md` before
building anything the phase table marks as not-yet-started. Do not create
Phase 1+ schema, infra, or directory structure early — additive-only,
strangler-fig, live run loop never breaks (D16).
