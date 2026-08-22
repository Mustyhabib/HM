# UPGRADE_ROADMAP.md — HM → Quant Research OS

> **Status:** Planning artifact. This is the upgrade blueprint, not the live system's
> source of truth.
>
> **Relationship to other docs:** `CLAUDE.md` remains the source of truth for the
> *current live system* until each phase lands. This file owns the *target* and the
> *migration path*. Legacy MVP blueprint and pre-pivot planning docs were
> removed 2026-08-21 (superseded by this roadmap + `docs/UNIFIED_SPEC.md`).
> ADRs in `CLAUDE.md` are updated **only as a phase lands**, never ahead of it.
>
> **Synthesis note:** this roadmap is the harmonization of two inputs — the
> 10-phase build skeleton (`ROADMAP.md`, from the design discussions) and the
> upgrade-specific plan (this file's predecessor, with HM's live-state constraints).
> The skeleton adopted is the 10-phase one; the upgrade invariants (strangler-fig,
> verification gates, provenance-first) are woven into every phase. The one timing
> conflict — where research governance sits — is resolved in Phase 1/Phase 4 below.

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
scientific substrate laid in Phase 1, fully exercised in Phase 4.

---

## 4. Recorded decisions

| Decision | Choice |
|---|---|
| First upgrade slice | **Research governance + experiment registry (reproducibility)** |
| Architecture direction | **Adopt the full `ARCHITECTURE.md` target** — FastAPI app + Redis + data lake + workers |
| Roadmap skeleton | **Harmonized 10-phase skeleton** (Phase 0–10), upgrade invariants woven in |
| Compute hosting | **Railway today** (FastAPI + engine worker, one container, two processes) |
| Edge unification | **Cloudflare unifies the edge, not the compute** — see §6. Workers cannot run the engine |
| Session output | This written roadmap doc, committed (planning only — no code) |

### Decision ledger — grilling session (2026-08-21, batch-grill-me)

All three rounds, settled with the user. Future sessions: these are decisions, not suggestions.

| # | Decision | Resolution |
|---|---|---|
| R1-Q1 | Sequencing | **Launch Nigeria MVP first** → Phase 0 now (read-only) → launch → Phase 1+ after |
| R1-Q2 | Phase 0 executor | **Hermes directly** (verify against files, no guessing); Claude Code pipeline takes Phase 1 builds |
| R1-Q3 | Branch strategy | **Feature branches per phase**; docs commits stay on main |
| R1-Q4 | FastAPI placement | **Same Railway container, two processes** (uvicorn + worker loop) |
| R1-Q5 | Redis timing | **Skeleton in Phase 1 on free tier** (30 MB is ample for a skeleton = KBs) — minimal, measured; Upstash free; principle 9 maintained |
| R1-Q6 | Stripe timing | **Deferred** until entity/Atlas path is real |
| R1-Q7 | First asset class | **Crypto first** |
| R1-Q8 | Tenant model | **Minimal `projects` table**; orgs/roles later |
| R2-Q1 | Inventory depth | Module-level engine (30 modules/869 files/78 tools/90 skills) + file-level our code → `docs/UPGRADE_INVENTORY.md` |
| R2-Q2 | Governance substrate | **Platform-canonical registry in Supabase** (RLS); engine's `governance/hypotheses/strategy_store` modules stay agent-side scratch (per-run isolated HOME) |
| R2-Q3 | Supabase plan | **Stay free** (student; scale later) — mitigations: daily keepalive + manual `pg_dump` |
| R2-Q4 | Registry schema home | **Same Supabase Postgres** |
| R2-Q5 | Provenance capture | **Both**: worker emits lifecycle provenance + FastAPI records API-driven events |
| R2-Q6 | Pre-registration UX | **Capture-first in Phase 1**; pre-registration workflow = Phase 4 |
| R2-Q7 | Crypto RAW layer | **Reuse engine loaders** (OKX/Binance/CCXT fallback); dedicated fanout = Phase 6 |
| R2-Q8 | Lake home | **Supabase Storage first**; R2 billing deferred until real data |
| R2-Q9 | Project scoping | **Auto-create default project** per user |
| R3-Q1 | Compute posture | **Railway $5 through launch**; evaluate Fly.io free at Phase 1 |
| R3-Q2 | First FastAPI surface | **Research domain only** (registry CRUD + provenance API + health), Supabase JWT |
| R3-Q3 | Phase 1 done | **All six criteria** (see §9 / Phase 1 section) |
| R3-Q4 | First dataset | **BTC/ETH/SOL daily OHLCV** — start-narrow discipline |
| R3-Q5 | Email provider | **Resend free tier** (3,000/mo) for auth + transactional |
| R3-Q6 | Phase 2 done | Confirm: quality score + PIT metadata, layers distinguishable, lake in Supabase Storage, catalog answers provenance |

Cost posture: total stack ≈ $5/mo (Vercel free · Supabase free + keepalive · Cloudflare free · Paystack test · Resend free · Railway $5).

### How "full target now" and "never break it" reconcile

The destination is the full target. The **migration** is a *strangler fig*: stand up the
new architecture **beside** the live system, move domains into it one at a time, and cut
over only when each domain is proven. The live run loop keeps running on the current
Supabase + worker path until the new pipeline can reproduce it faithfully.

- **Additive only.** New services/tables/buckets. No destructive rewrites.
- **Domain boundaries enforced from Phase 1**, so we never accrete a monolith we later
  have to break apart — modular-monolith boundaries *within* the target.
- **Fail closed, always.** The new layers refuse unsafe action rather than guess.

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

## 6. Target infrastructure — two planes, one control plane

The target, mapped onto the existing Supabase / Vercel / Railway / Cloudflare stack
(no AWS lock-in; consistent with the team's infra posture).

| Plane | Provider | Pieces |
|---|---|---|
| **Control plane (edge)** | Cloudflare | DNS/WAF/SSL (live) · Workers API gateway (Phase 1+) · Queues (when justified) · R2 data lake (Phase 2) |
| **Compute plane** | Railway (today) → VPS/Fly.io *only when justified* | FastAPI app + engine worker — **one container, two processes** |
| **Data plane (transactional)** | Supabase | Postgres 17, Auth, Storage, Vault, Realtime (all live) |
| **Frontend** | Vercel | `Tradi/frontend` SPA (live) |
| **Observability** | Sentry (live) → + Grafana Cloud (Phase 9) | errors now; metrics later |
| **Billing** | Paystack | test mode until launch |

### Why Cloudflare Workers cannot host the engine (recorded decision)

Cloudflare Workers run in **V8 isolates**: JavaScript/Wasm only (Python exists only via
experimental Pyodide — no C-extension deps, no subprocess, no arbitrary filesystem),
hard **CPU-time caps** (≈30 s on paid plans, far less on free) per invocation, and no
long-lived processes. The Tradi engine is a **multi-minute Python subprocess per run**
(LLM agent loop, backtests, isolated HOME dirs, heavy data loaders). It cannot run there —
every run would hit the CPU cap.

**Cloudflare unifies the edge, not the compute.** What Cloudflare genuinely *should* own:
DNS/WAF/SSL (already live), a thin Workers API gateway in front of the FastAPI app,
Cloudflare Queues as the job queue (enqueue at the edge, consume in the Python worker),
and R2 as the Parquet data lake. The FastAPI app + engine worker stay on the compute plane
(Railway at ~$5/mo today; a VPS/Fly.io only when cost or constraints justify the move —
**not** for unification aesthetics while the deploy is working).

### Deferred on purpose

Do not buy large data packages · do not migrate ticks into the lake · do not stand up
Kafka/Redpanda · do not move compute off Railway until a phase justifies it.

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
| `vibe-trading-saas/worker` | **KEEP → MODIFY** | Compute-plane runner (gains provenance capture) |
| Research governance (hypotheses, experiment registry, dataset registry, promotion) | **NEW** | Substrate in Phase 1, workflow in Phase 4 |
| Canonical versioned data + point-in-time | **NEW** | Data platform — Phase 2 |
| Deterministic quant engine (strategy SDK, exchange simulator, execution models) | **NEW** | Quant core — Phase 3 |
| Risk engine (strategy/platform/venue limits) | **NEW** | Hard boundary — Phase 6 |
| OMS (order intents, idempotency, reconciliation) | **NEW** | Execution safety — Phase 6 |
| ML / RL platform (datasets, training, eval, registry) | **NEW** | Phases 5 / 7 — research-only |
| Workers API gateway, Queues, R2 lake | **NEW** | Control plane — Phases 1–2 |
| Observability, quotas, metered billing | **NEW** | Cross-cutting → Phase 9 |

---

## 8. Harmonized phased migration (Phase 0–10)

Each phase is **independently shippable and reversible**. The gate for every phase:
**the live run loop (prompt → run → result) must still pass end-to-end after the phase lands.**
Status marks refer to the HM repo today.

### Phase 0 — Baseline & freeze [~80% done]
- **Delivers:** fork/clone ✅ (Tradi vendored) · running ✅ · commit recorded ✅ (`1907e47`)
  · inventory 🔲 (exhaustive file-level `KEEP / MODIFY / MOVE / DELETE / NEW` matrix +
    migration order) · branch strategy 🔲 (upgrade work on feature branches off `main`)
  · project constitution 🔲 (commit `PROJECT.md / DATA.md / ARCHITECTURE.md / WORKFLOW.md`
    + this roadmap into the repo).
- **Must not touch:** any live path. Read-only inventory + docs.
- **Gate:** matrix + constitution committed and reviewed before Phase 1.

### Phase 1 — Foundation (typed schemas · auth · tenants · jobs · **provenance substrate**)
- **Delivers:** FastAPI modular monolith stood up (same Railway container as the worker,
  two processes); typed Pydantic domain schemas; Supabase Auth JWT validation in FastAPI;
  **tenant projects/orgs model** (projects scope experiments/datasets/strategies);
  **research-governance substrate**: `hypotheses`, `experiments`, `dataset_registry`,
  `promotion_events` tables + provenance fields on runs (the chosen first slice — schema
  + capture now, full workflow in Phase 4); audit events extended; job system keeps
  `agent_runs` + poll loop, gains typed kinds; observability start (structured logs +
  Sentry already live); Redis skeleton **only if queue contention is measured** (default:
  defer).
- **Must not break:** `start_agent_run / start_swarm_run / start_shadow_run` RPCs, worker
  claim loop, artifact upload, Realtime UI. Provenance is written *alongside* the loop,
  not instead of it.
- **Gate:** run loop E2E green · every completed run carries a full provenance record ·
  new schema RLS-scoped · FastAPI health behind auth.

### Phase 2 — Data (canonical market data)
- **Delivers:** canonical market-data schema · feed adapters · raw/normalized layers ·
  data-quality checks · dataset registry (substrate from P1) · **Parquet pipeline to R2** ·
  initial Feature layer · **point-in-time / bitemporal** (`event_time` + `knowledge_time`) ·
  data catalog with license/entitlement metadata · **one asset class first**; do not buy
  large data packages.
- **Must not break:** existing engine data loaders keep working; catalog is additive.
- **Gate:** PIT invariant enforced at the data layer (`knowledge_time ≤ decision time`) ·
  catalog answers dataset provenance · loop green.

### Phase 3 — Quant Engine (deterministic quant core)
- **Delivers:** strategy SDK (rule-based / ML / RL / hybrid) · execution simulator ·
  order/position abstractions · portfolio accounting · cost/slippage model · multi-strategy
  testing · walk-forward evaluation · **one `ExecutionInterface`** with
  `BacktestExecutor / PaperExecutor / BrokerExecutor` sharing
  `submit_order / cancel_order / get_order / get_positions / get_account` — existing Tradi
  engines wrapped behind it.
- **Rigor:** out-of-sample, parameter perturbation, regime analysis, stress testing — wired
  into the Phase 1 registry.
- **Gate:** same strategy runs identically across engines · validation harness reproducible
  from the registry.

### Phase 4 — Research AI (the governance substrate becomes the workflow)
- **Delivers:** agent tools · research sessions · **formal hypothesis/spec generation**
  (the AI produces specifications, not arbitrary behavior) · experiment creation ·
  reports · provenance end-to-end · promotion ladder
  (`candidate → validated → paper → shadow → approved → live`).
- **Must not break:** the research brain (Tradi agent) keeps running; it gains the
  governance layer, not a rewrite.
- **Gate:** pre-registered experiments · immutable, untouched test sets · *"why was model
  v47 promoted?"* is answerable from the registry.

### Phase 5 — ML (baseline first)
- **Delivers:** dataset builder · feature pipelines · **baseline models before ML** ·
  training/evaluation · model registry (versioned, immutable once promoted).
- **Gate:** baseline beats naive · no model promoted without a registry entry
  (dataset/feature version, windows, seed, cost model).

### Phase 6 — Paper Trading (risk · OMS · reconciliation)
- **Delivers:** realtime data · paper execution · OMS (order intent → validation →
  idempotency → ack → fills) · **two-level risk engine** (strategy + platform + venue) ·
  **reconciliation as a first-class subsystem** (internal vs broker state, alert on
  mismatch, fail closed) · live monitoring · **server-side state authority** (browser is
  never the source of truth).
- **Gate:** recon parity · fail-closed on injected uncertain state · loop green.

### Phase 7 — RL (optional; research-only)
- **Delivers:** market/portfolio environments · reward design · PPO/SAC/DQN experimentation
  as appropriate · offline evaluation · paper evaluation.
- **Explicit:** RL is a *research capability*, **not** proof of profitability. Only after
  the deterministic/ML pipeline is trustworthy.

### Phase 8 — Controlled Live (mandate-gated)
- **Delivers:** broker adapters · live account management · hardened risk controls ·
  reconciliation · promotion/approval workflow · emergency controls (kill switch).
- **Gate:** explicit approval, hard limits, fail-closed, recon parity. Off by default.

### Phase 9 — Scale (only after real usage justifies it)
- **Delivers:** observability hardening (Prometheus/Grafana) · **resource quotas + metered
  billing** · separate heavy workers · autoscaling · analytical DB / event bus *if needed* ·
  multi-AZ · stronger tenant isolation · cost-aware workload scheduling.
- **Gate:** each step justified by measured demand. No speculative infra.

### Phase 10 — Expansion
- **Delivers:** more asset classes · richer alternatives data · options · marketplace /
  collaboration · desktop shell (Tauri, only if native needs emerge) · enterprise APIs /
  data products.

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
hypotheses        id, user_id, project_id, statement, falsifiable_criterion, status, created_at
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
| Overfitting / test-set contamination | Phase 1 substrate + Phase 4 pre-registration, immutable out-of-sample, provenance |
| Breaking the live run loop | Strangler-fig, additive-only, per-phase end-to-end gate |
| Look-ahead bias | Phase 2 point-in-time (bitemporal) data as a hard invariant |
| AI bypassing risk/execution | Phase 6 deterministic risk engine as a hard boundary (fail closed) |
| Data-licensing landmines (SaaS redistribution ≠ personal use) | Phase 2 data catalog with license/entitlement fields |
| Reconciliation drift | Phase 6 reconciliation subsystem; alert + controlled transition, never silent fix |
| Engine forced into the wrong runtime | §6 decision: Cloudflare = edge only; engine stays on the compute plane |
| Cost blow-up | Defer data purchases; quotas + metering (Phase 9); one asset class first |
| Premature microservices | Modular-monolith boundaries; Redis/Queues/Kafka only when a phase requires it |

---

## 11. How we verify

- **Run loop regression** (every phase): the existing `CLAUDE.md` verification recipe
  (worker tests, frontend build, engine tests) plus a real end-to-end run.
- **Reproducibility:** pick any completed experiment, replay from its recorded
  `code_commit` + `data_hash` + params + seed, and require identical results.
- **No-look-ahead:** assert `knowledge_time <= simulated decision time` at the data layer.
- **Fail-closed:** inject uncertain broker/recon state and require refusal, not a guess.
- **Deploy checks:** `gh api repos/Mustyhabib/HM/commits/<sha>/status` (Vercel + Railway)
  as the single source of deploy truth (note: `gh` CLI must be installed — it is absent
  from this machine's PATH today).

---

## 12. Immediate next step

This session produced this doc (planning only, per decision). The next execution step is
**Phase 0 — the exhaustive module inventory + constitution commit** — which converts §7's
directional matrix into the concrete file-level `KEEP / MODIFY / MOVE / NEW` blueprint and
migration order.
