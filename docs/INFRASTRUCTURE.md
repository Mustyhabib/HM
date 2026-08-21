# INFRASTRUCTURE.md — Final Whole-Infrastructure Architecture (Proposal)

> **Status:** PROPOSED (2026-08-21). Synthesizes the application flow + data
> plane into one target topology. The **live run loop never breaks** (D16
> strangler-fig): everything below stands up BESIDE today's MVP.
> Authority: [[FOUNDATIONS.md]] (identity) · [[ARCHITECTURE.md]] (domain
> boundaries) · [[WORKFLOW.md]] (research pipeline) · [[UPGRADE_ROADMAP.md]]
> (phasing). When external repos conflict with this, **our architecture wins**
> unless a documented ADR changes it.

## 1. Application Flow (proposed)

```text
WEB / PWA
     │
┌────┴─────────┬────────────┐
│              │            │
USER APP    ADMIN APP      API
│              │            │
└──────────────┴────────────┘
              ▼
       API / AUTH LAYER
              │
  ┌───────────┼───────────┐
  ▼           ▼           ▼
RESEARCH   QUANT CORE   PLATFORM
  │           │           │
AI Agents     │       Users/Billing
Skills        │       Quotas/Auth
MCP           │       Audit
Memory        │
  │           │
  └─────┬─────┘
        ▼
   EXPERIMENTS
        │
  ┌─────┼─────┐
  ▼     ▼     ▼
 ML    RL   Baseline
  │     │     │
  └─────┼─────┘
        ▼
    STRATEGY
        │
        ▼
 TESTING ENGINE
        │
  ┌─────┼─────┐
  ▼     ▼     ▼
Backtest Emulator Portfolio
  │     │     │
  └─────┼─────┘
        ▼
    VALIDATE
        │
        ▼
      PAPER
        │
        ▼
      RISK
        │
        ▼
       OMS
        │
        ▼
   EXECUTION
        │
     ┌──┴──┐
     ▼     ▼
   PAPER  LIVE
           │
        BROKER
```

**Key property:** this is a *promotion pipeline* — strategy candidates only
reach LIVE by passing VALIDATE → PAPER → RISK. Nothing bypasses the gate
(AI proposes; deterministic systems enforce).

## 2. Data Plane (proposed)

```text
Exchange / Vendor / Broker
        │
        ▼
   Feed Handlers
        │
 Gap / Sequence / QC
        │
        ▼
  Canonical Events
        │
  ┌──────┴────────┐
  ▼               ▼
Data Lake      Realtime Bus
Parquet/S3         │
  │                ▼
  ▼             Fanout
DuckDB/Polars      │
  │                ▼
  ▼             Clients
Features
  │
  ▼
Research / ML / RL / Backtest
```

Canonical data layer = **our own abstraction** (FOUNDATIONS.md): provider ≠
canonical dataset; every dataset passes Source → Ingestion → Validation →
Normalization → Versioning → Storage.

## 3. Component Ownership & Tech Mapping

| Node | Domain owner | Current LIVE (today) | Target (roadmap) |
|------|-------------|----------------------|------------------|
| WEB/PWA | — | React 19 SPA (`Tradi/frontend/`, Vercel) | PWA (service worker later) |
| USER APP | Platform | SPA routes + Supabase direct | FastAPI-backed |
| ADMIN APP | Platform | Protected `/admin` route in SPA (D13) | Same (no separate deploy) |
| API | API layer | Supabase RPCs + Edge Functions | **FastAPI modular monolith** (Phase 1) |
| AUTH | Platform | Supabase Auth (JWT) | Supabase Auth, verified at API edge |
| RESEARCH | Research | Vibe-Trading subprocess (agents, tools, MCP) | Research domain + registry (Phases 1, 4) |
| QUANT CORE | Quant Core | Tradi engine backtests | Strategy SDK, ExecutionInterface (Phase 3) |
| PLATFORM | Platform | profiles/subscriptions/plans/webhook_events/audit | + projects (Phase 1), quotas (Phase 9) |
| EXPERIMENTS | Research/ML | `agent_runs` + artifacts (today's runs) | `hypotheses`/`experiments`/`promotion_events` (Phase 1 schema, Phase 4 workflow) |
| ML | ML | — | Baseline first, model registry (Phase 5) |
| RL | RL | — | Research-only, envs/rewards/checkpoints (Phase 7) |
| STRATEGY | Quant Core | Engine prompts → backtest | Deterministic strategy code (Phase 3) |
| TESTING ENGINE | Quant Core | `vibe-trading run --json` (engine backtest) | Backtest + emulator + portfolio sim (Phase 3) |
| VALIDATE | Research/Quant | — | Walk-forward, OOS, perturbation, stress (Phase 4) |
| PAPER | Risk/OMS | — | Sim execution on realtime data (Phase 6) |
| RISK | Risk | — | Hard limits, approval/rejection, fail closed (Phase 6) |
| OMS | OMS/Execution | — | Order intents, idempotency, state (Phase 6) |
| EXECUTION | OMS/Execution | — | Adapters, ack/fill/cancel, recon (Phases 6–8) |
| BROKER | Execution | — | Adapters (Phase 8, mandate-gated) |
| DATA PLANE | Data | Engine's own loaders | Phase 2 (canonical schema, PIT, R2+Parquet lake, registry) |

## 4. Deployment Topology (target)

```text
Cloudflare (edge / control plane — D15)
 ├── DNS/WAF  (hmtrade.business)
 ├── Workers gateway (API routing, auth edge, rate limits)
 ├── R2 (data lake: Parquet/Iceberg; cold artifacts)
 └── Queues (async coordination; realtime fanout where justified)
        │
Vercel: SPA (User App + Admin App routes) ─────────┐
        │                                          │
Railway container (FastAPI modular monolith) ◄─────┘
 ├── Process 1: API  (research / quant / platform domains; REST + SSE/WS)
 ├── Process 2: worker (run queue → engine subprocess; background jobs)
 └── Redis (cache, queues, transient state, realtime coordination)
        │
Supabase (PostgreSQL — transactional source of truth)
 ├── Auth (JWT) · Vault (BYOK) · Storage (artifacts)
 ├── RLS + SECURITY DEFINER RPCs (today's run-loop gates — kept)
 └── Realtime (live progress today; superseded by bus as needed)
```

**Execution safety boundary (unchanged, constitution):**
`AI / RL / Strategy → Trade Intent → Risk Engine → OMS → Execution Adapter → Broker`.
No AI agent gets direct unrestricted broker access. Browser sessions are never
the authority for active strategies — the server-side strategy/execution system
owns active state.

## 5. Roadmap Mapping

| Layer | Roadmap phase | Deliverable |
|-------|---------------|-------------|
| API/Auth + monolith | 1 | FastAPI modular monolith, projects, research-governance schema |
| Data plane | 2 | Canonical schema, PIT, R2+Parquet lake, dataset registry |
| Quant Core / Testing Engine | 3 | Strategy SDK, ExecutionInterface, walk-forward |
| Research + Experiments | 4 | Hypotheses, experiment workflow, promotion ladder |
| ML | 5 | Baseline first, model registry |
| Paper (Risk + OMS + Portfolio) | 6 | Risk engine, OMS, reconciliation |
| RL | 7 | Research-only |
| Execution adapters (live) | 8 | Broker adapters, mandate-gated |
| Scale (obs/quotas/billing) | 9 | Prometheus/Grafana, metered billing — only when justified |
| Expansion | 10 | Asset classes, marketplace, enterprise |

## 6. Principles Applied

1. **Fail closed** — uncertain broker state, stale data, recon mismatch, risk
   breach, missing dependency → block, never guess (constitution #8).
2. **Paper before live** — live is a promotion state, not a shortcut (#6).
3. **No look-ahead** — every experiment consumes only point-in-time data (#5).
4. **Backtest ≠ proof** — VALIDATE stage records data version, feature version,
   code commit, params, costs, slippage, windows, seed (#4).
5. **AI proposes; deterministic enforces** — research agents stop at Trade
   Intent; Risk/OMS/Execution are deterministic (#3).
6. **Reproducibility is a product feature** — experiments rerunnable from
   recorded artifacts (#11).
7. **One canonical data model** — research/backtest/paper/live share semantics (#7).

## 7. Open Questions (decide when their phase starts)

| # | Question | Where it lands |
|---|----------|----------------|
| 1 | Iceberg vs plain Parquet for the lake (transactions/time-travel vs simplicity) | Phase 2 |
| 2 | Realtime bus: Redis Streams vs NATS vs Cloudflare Queues | Phase 6 (Phase 1 = Redis skeleton) |
| 3 | Broker adapters: which first (Alpaca / IBKR / local brokers)? | Phase 8 |
| 4 | Experiment results in Postgres vs analytics store (DuckDB over lake)? | Phase 4 |
| 5 | PWA offline/service-worker timeline | Post-launch, pre-Phase 9 |
| 6 | Databento-style data model adoption in provider strategy (DATA.md) | Phase 2 |
