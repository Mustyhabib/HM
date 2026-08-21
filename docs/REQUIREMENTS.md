# REQUIREMENTS.md — Complete Requirements Register

> **Status:** BASELINED 2026-08-21. Source of truth: `docs/UNIFIED_SPEC.md`
> (verbatim). Conflicts: `docs/RECONCILIATION.md`. **All requirements are
> captured here BEFORE any build** — per project rule: build all requirements,
> then build. Each requirement: ID, statement, spec section, roadmap phase,
> priority (MUST/SHOULD/MAY), status.
>
> Priorities: **MUST** = non-negotiable (spec §61 rules + constitution);
> **SHOULD** = expected at target; **MAY** = optional/scale-gated.
> Status: `P0` planned (Phase 0) · `P1` … `P10` roadmap phase · `LIVE` exists.

---

## FR-1 Product & Experience

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-1.1 | Continuous user workflow: Discover→Research→Data→Features→Strategy→ML/RL→Backtest→Walk-Forward→Stress→Paper→Risk→Live→Monitor→Evaluate→Learn→Improve | §1 | all | MUST | P0 plan |
| FR-1.2 | Product = QuantLab (user) + QuantLab Admin (control plane), brand H~M Trading Institute | §4 | live | MUST | LIVE |
| FR-1.3 | Dashboard must never show fake trading values — empty state + paper-account offer | §5, R17 | 6 | MUST | plan |
| FR-1.4 | Dashboard widgets: Portfolio, P&L, Sharpe, Drawdown, market chart, AI Copilot, Strategy Monitor, Risk Monitor, Market Regime, Recent Research, ML/RL experiments, paper/live status, alerts | §5 | 6 | SHOULD | plan |
| FR-1.5 | UX: professional, data-dense, fast, calm, transparent, AI-native; live controls visually distinct from research/paper | §53 | all | MUST | live |
| FR-1.6 | Research Card (Research→Model→Strategy): living strategy object with backtest metrics, walk-forward/stress badges, paper status, View Research/View Model | UI_VISION + v0 decision | 4 (v0 now) | MUST | plan |

## FR-2 Multi-Tenancy & Auth

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-2.1 | Multi-tenant from day one: Platform→Organization→Users→Projects→(Strategies/Models/Experiments/Accounts) + Personal Workspace | §8 | 1 | MUST | partial (users only) |
| FR-2.2 | Tenant scoping on every tenant-owned resource (tenant_id/organization_id/user_id/project_id); zero cross-tenant access | §8, §61 | 1 | MUST | plan |
| FR-2.3 | Auth: short-lived tokens, refresh/rotation, MFA for privileged, RBAC, tenant isolation, API keys, audit logging | §9 | 1 (MFA 9) | MUST | auth live, RBAC/MFA plan |
| FR-2.4 | Roles: USER, RESEARCHER, QUANT, TRADER, ORG_ADMIN, PLATFORM_ADMIN, SUPER_ADMIN | §9 | 1 | MUST | plan |
| FR-2.5 | Granular permissions (strategy.read, model.train, live.trade, broker.connect, admin.kill_switch, …) | §9 | 1 | SHOULD | plan |

## FR-3 Backend & API

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-3.1 | Modular monolith (not microservices day one) with clear internal boundaries; modules: auth, users, orgs, billing, market_data, research, agents, features, strategies, ml, rl, experiments, models, backtesting, paper_trading, portfolio, risk, execution, brokers, websocket, notifications, audit, monitoring, admin | §10 | 1+ | MUST | plan |
| FR-3.2 | FastAPI backend, Pydantic, SQLAlchemy, Alembic migrations; Python for ML/RL/quant ecosystem | §12, §39 | 1 | MUST | plan |
| FR-3.3 | REST API v1 with documented endpoints (auth, me, markets, strategies, backtests, experiments, models, rl jobs, portfolios, orders, paper, brokers, risk, alerts, usage, billing, admin) | §17 | 1 | MUST | plan |
| FR-3.4 | REST = request/response; WebSocket = real-time events only; never use WS for everything | §18, §51 | 6 | MUST | plan |
| FR-3.5 | API gateway evaluation on every request: auth → tenant → permission → quota → validate → audit | §50 | 1 | MUST | plan |
| FR-3.6 | API versioning (/api/v1); never silently break contracts | §17 | 1 | MUST | plan |
| FR-3.7 | Background jobs: one async queue (Celery OR RQ OR Dramatiq — choose one) with Redis; heavy work never blocks API threads | §19, R4 | 1 (live keeps polling) | MUST | plan |
| FR-3.8 | Job lifecycle: create → queue → worker → Postgres/S3 → WebSocket event | §19 | 1 | MUST | plan |

## FR-4 Data Plane

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-4.1 | One canonical data+feature layer serving research, ML/RL, backtest, paper, live — no training-serving skew | §1, §15 | 2 | MUST | plan |
| FR-4.2 | Data lake: S3 (R2-compatible) with market-data/features/training/models/checkpoints/backtests/reports/exports; Parquet; DuckDB/Polars/PyArrow; Postgres holds catalog/metadata only | §14 | 2 | MUST | plan |
| FR-4.3 | Market data: connectors → normalizer → historical (S3) + realtime stream (Redis/broker) → fanout to charts/ML/RL/strategies | §16 | 2 | MUST | plan |
| FR-4.4 | Data categories: equities, ETFs, indices, FX, crypto, futures, options, macro, fundamentals, news/sentiment, alternative data | §16 | 2 | SHOULD | plan |
| FR-4.5 | Licensing/redistribution rights checked for every provider/data product | §16, DATA.md | 2 | MUST | plan |
| FR-4.6 | Feature registry + versioned feature pipeline (feature: rsi_14 v3, dataset_version) — same definition in training/backtest/paper/live | §15 | 2 | MUST | plan |
| FR-4.7 | Dataset registry: every dataset versioned (dataset_version), PIT capability, provenance | §14, §47, DATA.md | 2 | MUST | plan |
| FR-4.8 | PostgreSQL never stores huge historical tick datasets | §13, §61 | 2 | MUST | plan |

## FR-5 Research & Agents

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-5.1 | AI Research Copilot + agent orchestrator over Vibe-Trading foundation | §20 | 3 | MUST | partial (engine loop) |
| FR-5.2 | Tool registry: market data, search, database, feature engine, backtester, ML, RL, portfolio, report generator | §20 | 3 | SHOULD | plan |
| FR-5.3 | Research jobs, history, durable reports (research output never disappears in chat) | §20, §48 | 3 | MUST | partial (artifacts) |
| FR-5.4 | Research reproducibility: user/tenant/prompt/agent version/tool versions/dataset/feature/strategy/model versions/code commit/params/results/artifacts/timestamps | §48 | 1 (schema) + 3 | MUST | plan |
| FR-5.5 | Agent tool permissions: least privilege; Research Agent = read data/create research/run backtest/create draft; Live Execution NOT reachable by generic agent | §49 | 3 | MUST | plan |
| FR-5.6 | LLM gateway/router: route by cost/capability, failover, token tracking, per-user limits, provider-agnostic | §30, R5 | 3 | SHOULD | plan (BYOK live) |

## FR-6 Quant Engine & Backtesting

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-6.1 | Strategy engine + strategy registry with lifecycle DRAFT→BACKTESTED→VALIDATED→PAPER→LIVE_ELIGIBLE→LIVE→PAUSED→RETIRED | §47 | 3 | MUST | plan |
| FR-6.2 | Strategy references model version + feature version + dataset version + risk policy + execution policy (reproducibility) | §47 | 3 | MUST | plan |
| FR-6.3 | Backtest engine: historical data, transaction costs, slippage, latency assumptions, position sizing, risk rules, market regimes, walk-forward, out-of-sample | §23 | 3 | MUST | partial (engine) |
| FR-6.4 | Backtest outputs: CAGR, Sharpe, Sortino, Max DD, Win Rate, Profit Factor, Turnover, Exposure, Volatility, # trades | §23 | 3 | MUST | partial |
| FR-6.5 | Validation + stress testing stage between backtest and paper | §23, §25 | 4 | MUST | plan |
| FR-6.6 | Backtests reproducible + never presented as guarantees of future performance | §23, §61 | 3 | MUST | plan |
| FR-6.7 | Custom Python indicators (strategy SDK) | UI_VISION #7 | 3 | SHOULD | plan |

## FR-7 ML & RL

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-7.1 | ML Studio: XGBoost → LightGBM → Random Forest → LSTM → Transformers (baseline first) | §21 | 5 | MUST | plan |
| FR-7.2 | ML workflow: dataset → feature selection → train → validation → walk-forward → backtest → stress → registry; track dataset/feature/model version, hyperparams, training time, metrics, backtest results, seeds, code version, artifact location | §21 | 5 | MUST | plan |
| FR-7.3 | RL Studio: PPO/SAC/DQN; env = market state → observation → policy → action → risk constraints → simulated execution → reward | §22 | 6/7 | MUST | plan |
| FR-7.4 | RL output: BUY/SELL/HOLD/position target/allocation target — risk engine decides permission; raw RL actions never bypass risk | §22, §61 | 6/7 | MUST | plan |
| FR-7.5 | Model registry: model_id/version/type/dataset_version/feature_version/training_run/code_commit/metrics/status/artifact_uri; lifecycle TRAINED→EVALUATED→VALIDATED→PAPER→APPROVED→LIVE→RETIRED | §46 | 5 | MUST | plan |
| FR-7.6 | Never deploy arbitrary latest.pkl to live | §46, §61 | 5 | MUST | plan |
| FR-7.7 | MLflow (self-hosted) for experiment tracking + model versions (adopted candidate, R6) | §30 | 5 | SHOULD | plan |

## FR-8 Paper, Risk, OMS, Execution

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-8.1 | Paper trading: strategy → signal → risk → paper OMS → execution simulator → paper portfolio → P&L; same interfaces as live | §24 | 6/7 | MUST | plan |
| FR-8.2 | Paper→live promotion pipeline: BACKTEST→VALIDATION→STRESS→PAPER→PERFORMANCE CHECK→RISK APPROVAL→LIVE ELIGIBILITY→LIVE; no bare [GO LIVE] button | §25 | 6–8 | MUST | plan |
| FR-8.3 | Risk engine independent of AI/strategy/model logic; checks: max position, exposure, daily loss, drawdown, leverage, concentration, restrictions, order/account/platform limits | §26, §61 | 6 | MUST | plan |
| FR-8.4 | Risk hierarchy: User → Strategy → Account → Platform → Global Emergency Control (kill switch) | §26 | 6 | MUST | plan |
| FR-8.5 | OMS: strategy signal → risk → order manager → execution adapter → broker; adapters behind BrokerInterface (never hard-code a broker) | §27 | 6–8 | MUST | plan |
| FR-8.6 | Order lifecycle: created/submitted/filled/cancelled; audit every live trading action | §18, §29, §61 | 6–8 | MUST | plan |
| FR-8.7 | WebSocket-first realtime plane: /ws/markets/{symbol}, /ws/portfolio, /ws/orders, /ws/strategies, /ws/research, /ws/jobs, /ws/notifications | §18, R11/D17 | 6 | MUST | plan (D17 recorded) |

## FR-9 SaaS Platform

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-9.1 | Billing: subscription + usage metering; BillingProvider abstraction (Paystack live, Stripe planned — D8) | §36 | 9 | MUST | partial (Paystack) |
| FR-9.2 | Usage metering: LLM tokens/requests, research runs, backtests, ML/RL training time, GPU seconds, CPU, dataset downloads, API requests, WS usage, storage, data-provider usage, exports | §38 | 9 | MUST | plan |
| FR-9.3 | Quotas + credits enforcement server-side; do not promise unlimited compute | §37 | 9 | MUST | plan (rate limit live) |
| FR-9.4 | Cost attribution per tenant/user/job (tenant_id, user_id, job_id, resource, duration, estimated/actual cost); admin gross margin per user | §57 | 9 | MUST | plan |
| FR-9.5 | Budget alerts ($100 INFO … $300 CRITICAL) + forecasted month-end spend + cost by service/tenant/job | §35 | 9 | MUST | plan |
| FR-9.6 | Admin plane: users, orgs, roles, billing, usage, infrastructure, data, AI/ML/RL jobs, trading, security, audit, system health; RBAC/MFA protected | §4.2, §7 | 9 | MUST | partial (admin live) |
| FR-9.7 | Notifications: in-app, email, optional webhook (backtest/training complete, signal, risk warning, broker disconnect, billing, security) | §45 | 6 | SHOULD | plan |
| FR-9.8 | Tiers: Free/Pro ~$29/Quant ~$99/Enterprise — starting concepts; live NGN tiers stand until international tier (R3) | §37 | 9 | MAY | live NGN |

## FR-10 Observability & Audit

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-10.1 | Metrics→Prometheus, dashboards→Grafana, structured logs, audit→durable storage | §44 | 1 (skeleton) + 9 | MUST | Sentry live; Prometheus plan |
| FR-10.5 | **Sentry** — error/exception monitoring for worker + frontend + admin surfaces (live now; required for admin monitoring) | §44 | live | MUST | LIVE |
| FR-10.6 | **Stripe billing status in admin monitoring** — provider status + revenue/usage panels (Paystack live, Stripe planned, entity-gated) | §7, §36 | 9 | SHOULD | Paystack live; Stripe plan |
| FR-10.2 | Monitor: CPU/RAM/disk, API latency/rate/errors, WS connections, queue length, job duration, inference latency, RL training, DB/Redis health, broker connectivity, order latency, execution errors, P&L, risk events | §28 | 9 | SHOULD | plan |
| FR-10.3 | Audit events (USER_LOGIN, MODEL_PROMOTED, LIVE_ENABLED, RISK_APPROVED, ORDER_FILLED, KILL_SWITCH, …) with event_id/timestamp/actor/tenant/type/resource/action/metadata/ip; append-oriented, hard to alter | §29 | 1 (schema) + 8 | MUST | audit_logs live (partial) |
| FR-10.4 | Alerts: API down, DB/Redis unavailable, queue growing, broker disconnected, order failures, risk breach, GPU runaway, LLM cost spike, budget spike, unusual auth | §44 | 9 | SHOULD | plan |

## FR-11 Security (non-negotiable — spec §61 + constitution)

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-11.1 | No secrets in frontend code; no broker secrets/LLM keys in browser; no DB credentials in source | §41, §61 | all | MUST | live |
| FR-11.2 | No live trading directly from a generic AI agent | §20, §61 | all | MUST | live (no live) |
| FR-11.3 | Risk engine independent of strategy/model logic | §61 | 6 | MUST | plan |
| FR-11.4 | Paper and live share interfaces | §61 | 6–8 | MUST | plan |
| FR-11.5 | Every model/strategy/dataset/feature versioned; backtests reproducible; heavy jobs async; WS=REST boundary; Postgres≠tick lake; S3 holds artifacts; Redis≠system of record; tenant-scoped; live auditable; GPU burst; usage metered; cost attributable | §61 | all | MUST | mixed |
| FR-11.6 | No complex infra before justified by scale (no K8s/Kafka/SageMaker/large GPU fleet at MVP) | §58, §61 | 10 | MUST | live |

## FR-12 CI/CD & Testing

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-12.1 | CI: lint, type check, unit, integration, security checks, build → review → merge → deploy → smoke → monitor; envs local/dev/staging/prod | §42 | 1 | MUST | partial (Vercel auto-deploy) |
| FR-12.2 | No experimental RL/live-execution code straight to production | §42 | 8 | MUST | plan |
| FR-12.3 | Test layers: unit (risk/feature/portfolio/billing/API), integration (API↔DB/Redis/workers, agent↔tools, strategy↔backtester, risk↔execution), ML (feature consistency, leakage, train-serve consistency), trading (order lifecycle, partial fills, cancellations, broker failures, duplicates, reconnection, risk rejection, kill switch), E2E (login→research→strategy→backtest→paper→risk→execution) | §43 | 1+ | MUST | partial (74 worker tests) |
| FR-12.4 | Docker Compose local dev (Postgres, Redis, API, workers, MLflow) | §31 | 1 | SHOULD | plan |

## FR-13 Infrastructure & Cost

| ID | Requirement | Spec | Phase | Pri | Status |
|----|-------------|------|-------|-----|--------|
| FR-13.1 | MVP infra budget $150–250/mo; health score A–D; cost/active-user and per-job metrics | §34, §56 | all | MUST | ~$100 live target |
| FR-13.2 | GPU = burst/on-demand; save checkpoints to S3, terminate | §35 | 5 | MUST | plan |
| FR-13.3 | Cloudflare (DNS/TLS/CDN/WAF/rate limit) + one frontend host (Vercel OR Cloudflare Pages — not both) | §30, §58 | live | MUST | live (Vercel + CF) |
| FR-13.4 | Redis: cache/queue/transient/rate-limit/realtime coordination — never system of record | §30 | 1+ | MUST | plan |
| FR-13.5 | Caching rules with invalidation; never cache sensitive account state indefinitely | §40 | 1+ | SHOULD | plan |

## Traceability summary

| Roadmap phase | Primary requirements |
|---------------|----------------------|
| P0 Baseline | FR-1.1, FR-13.1, FR-11.x baseline |
| P1 Foundation | FR-2.x, FR-3.x, FR-10.3 schema, FR-12.x, FR-13.4 |
| P2 Data | FR-4.x |
| P3 Research | FR-5.x, FR-6.1–6.2 |
| P4 Backtesting/Validation + Research Card | FR-6.3–6.6, FR-1.6 (v0 now) |
| P5 ML | FR-7.1–7.2, FR-7.5–7.7 |
| P6 RL | FR-7.3–7.4 |
| P6/P7 Paper | FR-8.1–8.4, FR-1.3–1.4 |
| P8 Live | FR-8.5–8.6, FR-11.2 |
| P9 SaaS | FR-9.x, FR-10.x |
| P10 Scale | FR-11.6, FR-13.x scale |

## Definition of done (per project rule)

A build phase is DONE when every MUST requirement in its row has: a working
implementation, a test, an observable metric, and a recorded provenance
(commit + data/feature versions where applicable). See constitution quality
bar (SOUL.md) — every important feature answers: problem, domain owner,
source of truth, test, observation, failure mode, 10x cost, reproducibility.
