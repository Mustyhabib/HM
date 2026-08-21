# UPGRADE_ROADMAP.md — HM → Quant Research OS

> **Status:** Planning artifact. This is the upgrade blueprint, not the live system's
> source of truth.
>
> **Relationship to other docs:** `CLAUDE.md` remains the source of truth for the
> *current live system* until each phase lands. This file owns the *target* and the
> *migration path*. `Build_Plan.md` is the superseded MVP blueprint (kept for
> history). ADRs in `CLAUDE.md` are updated **only as a phase lands**, never ahead of it.

---

## 1. Destination

HM evolves from a **single-purpose AI research SaaS wrapper** (prompt → run → result)
into a **Quant Research OS**: a multi-user, research-first platform that unifies

```text
AI research agents
   → canonical market data
   → strategy development
   → ML/RL experimentation
   → realistic backtesting
   → paper trading
   → risk controls
   → controlled live execution
   → portfolio/accounting
   → observability / audit / billing
```

### The pipeline we are building toward

```text
Question → Research → Hypothesis → Experiment → Validation
   → Backtest → Paper → Shadow → Promotion → Live → Reconciliation → Feedback
```

and the inverse loop:

```text
Observed performance → diagnostics → new research → new experiment
```

### The "five brains" mental model

```text
                ┌─────────────────┐
                │  RESEARCH BRAIN │   LLM / agents (already have: Tradi agent + swarm)
                └────────┬────────┘
                ┌────────▼────────┐
                │  QUANT BRAIN    │   ML / factors / deterministic strategies (NEW)
                └────────┬────────┘
                ┌────────▼────────┐
                │  RL BRAIN       │   Policy / agent — research capability only (NEW, late)
                └────────┬────────┘
                ┌────────▼────────┐
                │  RISK BRAIN     │   Guardrails — AI cannot bypass (NEW, hard boundary)
                └────────┬────────┘
                ┌────────▼────────┐
                │  EXECUTION      │   Paper / Broker (partially have via connectors)
                └─────────────────┘

   wrapped by: DATA PLATFORM · MODEL REGISTRY · EXPERIMENT TRACKING
               · MULTI-USER PLATFORM · OBSERVABILITY
```

---

## 2. Current state (what is live today)

Multi-user subscription SaaS wrapping HKUDS/Vibe-Trading (MIT), vendored at `Tradi/`.

| Concern | Today |
|---|---|
| Frontend | React 19 + Vite SPA (`Tradi/frontend/`), Vercel (`hmtrade.business`) |
| Backend | **Supabase-only** — Postgres 17, Auth, Storage, Vault, Realtime, Edge Functions |
| Worker | Python polling loop (`vibe-trading-saas/worker`), Railway, subprocess-per-run |
| Engine | Vibe-Trading vendored (`Tradi/`, upstream main `1907e47`) — 462 alphas, backtest engines, ReAct agent, swarm, shadow-account |
| Billing | Paystack NGN (test mode), BYOK DeepSeek, unlimited runs per tier |
| Run loop | **LIVE + verified** — prompt → queued → claim → engine → artifacts → completed |
| Safety | Research/backtest only. No live trading. RLS + Vault + service-role isolation |

The run loop is the crown jewel and the #1 thing we must not break.

---

## 3. The gap: rigor, not features

Architecture is strong (≈9.1/10). Scientific rigor is not (≈6.8/10). The upgrade is
primarily about **closing the rigor gap**, not adding surface area.

| Dimension | Today | Target |
|---|---:|---:|
| Product architecture | 9.1 | 9.6 |
| AI/research architecture | 9.0 | 9.6 |
| **Quant research methodology** | **6.8** | 9.3 |
| Data architecture | 7.8 | 9.5 |
| Backtesting realism | 7.8 | 9.4 |
| ML/RL architecture | 7.5 | 9.2 |
| Execution/OMS | 7.5 | 9.5 |
| Multi-user scalability | 7.0 | 9.3 |
| **Reliability / DR** | **5.5** | 9.2 |
| Security | 7.0 | 9.4 |
| Cost architecture | 8.3 | 9.2 |
| **Production readiness** | **6.5** | 9.3 |

**#1 risk = research overfitting.** The seductive loop
`AI → hypothesis → strategy → backtest → "great result" → optimize → "even better" → paper`
produces *beautiful garbage*. Once a result has been seen, the test set is no longer clean.
The fix is **pre-registration + immutable out-of-sample data + full provenance** — the
subject of Phase 1.

---

## 4. Recorded decisions (this planning session)

| Decision | Choice |
|---|---|
| First upgrade slice | **Research governance + experiment registry (reproducibility)** |
| Architecture direction | **Adopt the full `ARCHITECTURE.md` target now** — FastAPI app + Redis + data lake + workers |
| Session output | This written roadmap doc, committed (planning only — no code) |

### How "full target now" and "never break it" reconcile

The destination is the full target. The **migration** is a *strangler fig*: stand up the
new architecture **beside** the live system, move domains into it one at a time, and cut
over only when each domain is proven. The live run loop keeps running on the current
Supabase + worker path until the new experiment pipeline can reproduce it faithfully.

- **Additive only.** New services/tables/buckets. No destructive rewrites.
- **Domain boundaries enforced from Phase 1**, so we never accrete a monolith we later
  have to break apart. Modular-monolith boundaries *within* the target, even though the
  target includes multiple infra pieces.
- **Fail closed, always.** The new layers must refuse unsafe action rather than guess.

---

## 5. Non-negotiables (apply to every phase)

1. **Research validity before feature count.**
2. **Data is infrastructure** — provenance, versioning, point-in-time, licensing are first-class.
3. **AI proposes; deterministic systems enforce.** LLM/RL never bypass risk, execution, accounting, or reconciliation.
4. **Backtest ≠ proof.** Every result records dataset/feature/code version, params, costs, slippage, windows, seed.
5. **No look-ahead, no survivorship shortcuts, no hidden leakage.**
6. **Paper before live.** Live is a promotion state, not a shortcut.
7. **One canonical data model** across research, backtest, paper, live.
8. **Fail closed** on uncertain broker state, stale data, reconciliation mismatch, risk breach.
9. **Measure before optimizing** — profile latency/compute/cost before adding complexity or a second language.
10. **Modular monolith first** — strong domain boundaries, not premature microservices.
11. **Reproducibility is a product feature.**
12. **Security is part of the design** — secrets, broker creds, tenant boundaries never an afterthought.

---

## 6. Target infrastructure mapping

The `ARCHITECTURE.md` target, mapped onto the existing Supabase / Vercel / Railway /
Cloudflare stack (no AWS lock-in; consistent with the team's infra posture).

| ARCHITECTURE.md concern | Target mapping |
|---|---|
| Web / PWA | Vercel (`Tradi/frontend/`) — already live |
| Edge / WAF | Cloudflare — already live |
| API + Auth | **New FastAPI application** (modular monolith, domain boundaries) on Railway; Supabase Auth stays |
| PostgreSQL (transactional truth) | Supabase Postgres — already live |
| Redis (queue/cache/realtime coord) | **New** — Upstash or Railway Redis (replaces `FOR UPDATE SKIP LOCKED` polling when scale demands) |
| Object storage + Parquet (data lake) | **New** — Cloudflare R2 (or Supabase Storage initially); DuckDB/Polars worker-side |
| Background workers | Railway — existing `hm-worker` evolves into the experiment/backtest/paper job runner |
| Prometheus / Grafana | **New** — Grafana Cloud free tier; Sentry (already live) covers errors |

**Deferred on purpose:** do not buy large data packages, do not migrate ticks into the
lake, do not stand up Kafka/Redpanda — until a phase actually requires it (Phase 2+).

---

## 7. KEEP / MODIFY / MOVE / NEW

Directional matrix (the exhaustive file-level inventory is Phase 0's first deliverable).

| Existing | Decision | Target role |
|---|---|---|
| `Tradi/agent` — ReAct agent, skills, tools, providers | **KEEP** | Research brain |
| `Tradi/agent` — swarm | **KEEP → MODIFY** | Multi-agent research |
| `Tradi/agent` — memory / session | **KEEP → MODIFY** | Research memory |
| `Tradi/frontend/` React SPA | **KEEP** | Platform UI |
| `Tradi/` backtest engines / loaders / optimizers | **KEEP → EXTRACT** | Behind a common `ExecutionInterface` |
| `Tradi/` broker connectors / paper / shadow account | **KEEP → MODIFY** | Behind Risk → OMS → Execution boundary |
| Supabase (auth/billing/storage/realtime) | **KEEP** | Transactional truth + control plane |
| `vibe-trading-saas/worker` | **KEEP → MODIFY** | Job/experiment runner (gains provenance capture) |
| Research governance (hypotheses, experiment registry, dataset registry, promotion) | **NEW** | The #1 missing piece — Phase 1 |
| Canonical versioned data + point-in-time | **NEW** | Data platform — Phase 2 |
| Deterministic quant engine (strategy SDK, exchange simulator, execution models) | **NEW** | Quant core — Phase 3 |
| Risk engine (strategy/platform/venue limits) | **NEW** | Hard boundary — Phase 4 |
| OMS (order intents, idempotency, reconciliation) | **NEW** | Execution safety — Phase 4 |
| ML / RL platform (datasets, training, eval, registry) | **NEW** | Late, research-only — Phase 3+ / deferred |
| Observability, quotas, technical billing | **NEW** | Phase 5 |

---

## 8. Phased migration

Each phase is **independently shippable and reversible**. The gate for every phase:
**the live run loop (prompt → run → result) must still pass end-to-end after the phase lands.**

### Phase 0 — Recon & freeze (blueprint)
- **Goal:** produce the concrete migration order, not guesses from the README.
- **Deliverable:** file/module inventory → `KEEP / MODIFY / MOVE / DELETE / NEW` matrix with
  target location, dependencies, and migration order.
- **Scope:** `agent/`, `backtest/`, broker connectors, MCP, frontend, storage, swarm,
  tests, Docker/deploy, existing security boundaries.
- **Must not touch:** any live path. Read-only inventory.
- **Verify:** the matrix is committed and reviewed before Phase 1 starts.

### Phase 1 — Research governance + experiment registry (FIRST SLICE)
- **Goal:** make every experiment reproducible and pre-registrable. Attack overfitting.
- **What lands:**
  - **FastAPI application** (modular monolith) stood up as a *new* Railway service, owning
    the **Research** domain: hypotheses, experiment registry, dataset registry, validation,
    promotion, rejection, provenance.
  - **New Postgres schema** (additive, in Supabase): `hypotheses`, `experiments`,
    `dataset_registry`, promotion/validation event tables. Link to existing `agent_runs`
    via a non-breaking reference (new mapping table / nullable FK) — **no change to existing
    RPCs or worker critical path.**
  - **Provenance capture** on every run (see §9 for the exact field list).
  - **Redis** skeleton (queue/cache) and **data lake** skeleton (R2 bucket + Parquet layout)
    stood up but minimally populated — proving the infra shape, not moving data yet.
- **Must not break:** `start_agent_run` / `start_swarm_run` / `start_shadow_run` RPCs,
  worker claim loop, artifact upload, Realtime UI. The existing loop keeps running unchanged;
  provenance is written *alongside* it, not instead of it.
- **Verify:**
  - Live loop passes end-to-end (the existing verification recipe).
  - A completed run carries a full provenance record that can be re-read 6 months later.
  - New schema has RLS on every user-facing table; registry access is tenant-scoped.
  - FastAPI service is up, health-checked, and behind the existing auth boundary.

### Phase 2 — Canonical data + point-in-time
- **Goal:** treat market data as a versioned scientific dependency.
- **What lands:** versioned dataset store (object storage + Parquet), data catalog
  (provider / venue / coverage / timezone / timestamp semantics / adjustment policy /
  corporate-action policy / PIT capability / license / version / quality score),
  bitemporal fields (`event_time` + `knowledge_time`).
- **Scope:** **one asset class first.** Prove quality + pipeline before expanding.
- **Must not break:** existing engine data loaders keep working; the catalog is additive.

### Phase 3 — Quant core + realistic backtest
- **Goal:** a deterministic quant engine that exists independently of AI.
- **What lands:** strategy SDK (rule-based / ML / RL / hybrid), exchange simulator,
  execution models, **one `ExecutionInterface`** with `BacktestExecutor / PaperExecutor /
  BrokerExecutor` sharing `submit_order / cancel_order / get_order / get_positions / get_account`.
- **Rigor:** cost + slippage models, walk-forward, out-of-sample, parameter perturbation,
  regime analysis, stress testing — wired into the Phase 1 registry.

### Phase 4 — Risk → OMS → Execution → reconciliation → paper
- **Goal:** the hard safety boundary. AI/RL/strategy proposes; risk enforces.
- **What lands:** two-level risk engine (strategy + platform + venue limits), OMS lifecycle
  (order intent → validation → idempotency → ack → fills → reconciliation), reconciliation
  as a first-class subsystem (internal vs broker state, alert on mismatch, fail closed),
  server-side strategy state (browser is never the authority).
- **Promotion ladder:** candidate → validated → paper → shadow → approved → live.

### Phase 5 — Observability + quotas + technical billing
- **Goal:** scale safely and meter honestly.
- **What lands:** Prometheus/Grafana, structured logs, resource quotas (CPU/GPU/RAM/storage/
  LLM tokens/backtest/concurrency/WebSocket), usage metering → billing engine.

### Deferred (do not start without explicit instruction)
RL platform as an edge source (it is a *research capability*, not proof of profit) ·
Kafka/Redpanda · second+ asset classes · AWS migration · Stripe (international).

---

## 9. Phase 1 detail — experiment registry contract

Every experiment/run records, at minimum:

```text
experiment_id          # stable, immutable once created
hypothesis_id          # the pre-registered falsifiable hypothesis
dataset_version        # which canonical dataset snapshot
feature_version        # which feature definitions
strategy_version       # which strategy/model
model_version          # which trained artifact (if any)
parameter_set          # exact params
train_period           # explicit, frozen
validation_period
test_period            # untouched out-of-sample
cost_model             # fees/commission assumptions
slippage_model         # execution assumptions
random_seed            # where applicable
code_commit            # git sha
data_hash              # content hash of inputs
status                 # candidate → validated → paper → shadow → approved → live → rejected
result                 # metrics + artifacts
created_at / actor     # audit
```

**Invariants:**
- The test set is **immutable and untouched** by the fitting loop. Once a result is
  recorded against it, re-using it for fitting is a violation, not a feature.
- Promotion is a **recorded, audited state transition**, never a silent flag flip.
- A model is **versioned and immutable once promoted**.
- The registry answers, months later: *"why was model v47 promoted?"* with a reproducible
  trace, not a memory.

**Schema sketch (additive, tenant-scoped RLS):**

```text
hypotheses        id, user_id, org_id?, statement, falsifiable_criterion, status, created_at
experiments       id, hypothesis_id, agent_run_id (nullable link), <all provenance fields above>, created_at
dataset_registry  id, provider, venue, universe, coverage, timezone, timestamp_semantics,
                  adjustment_policy, corporate_action_policy, pit_capability, license,
                  version, quality_score
promotion_events  experiment_id, from_status, to_status, actor, reason, created_at
```

---

## 10. Risk register

| Risk | Mitigation |
|---|---|
| Overfitting / test-set contamination | Phase 1 pre-registration + immutable out-of-sample + provenance |
| Breaking the live run loop | Strangler-fig, additive-only, per-phase end-to-end gate |
| Look-ahead bias | Phase 2 point-in-time (bitemporal) data as a hard invariant |
| AI bypassing risk/execution | Phase 4 deterministic risk engine as a hard boundary (fail closed) |
| Data-licensing landmines (SaaS redistribution ≠ personal use) | Phase 2 data catalog with license/entitlement fields |
| Reconciliation drift | Phase 4 reconciliation subsystem; alert + controlled transition, never silent fix |
| Cost blow-up | Defer data purchases; quotas + metering (Phase 5); one asset class first |
| Premature microservices | Modular-monolith boundaries; Redis/Kafka only when a phase requires it |

---

## 11. How we verify

- **Run loop regression** (every phase): the existing `CLAUDE.md` verification recipe
  (worker tests, frontend build, engine tests) plus a real end-to-end run.
- **Reproducibility:** pick any completed experiment, replay from its recorded
  `code_commit` + `data_hash` + params + seed, and require identical results.
- **No-look-ahead:** assert `knowledge_time <= simulated decision time` at the data layer.
- **Fail-closed:** inject uncertain broker/recon state and require refusal, not a guess.
- **Deploy checks:** `gh api repos/Mustyhabib/HM/commits/<sha>/status` (Vercel + Railway)
  as the single source of deploy truth.

---

## 12. Immediate next step

This session produced this doc (planning only, per decision). The next execution step is
**Phase 0 — the exhaustive module inventory** — which converts §7's directional matrix into
the concrete file-level `KEEP / MODIFY / MOVE / NEW` blueprint and migration order.
