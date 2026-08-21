# UNIFIED_SPEC.md — Single Source of Truth

> **Adoption note (2026-08-21):** This document is the **unified, authoritative
> specification** for the platform. It consolidates and supersedes earlier
> proposals from this project's planning conversation (FOUNDATIONS.md,
> INFRASTRUCTURE.md, WORKFLOW.md, UI_VISION.md, roadmap content). Where any
> earlier report conflicts with this document, **THIS DOCUMENT WINS** unless a
> documented ADR ([[architecture-decisions]]) changes it — per the
> Architecture Authority rule in FOUNDATIONS.md.
>
> **Terminology lock (keep consistent everywhere):**
> - Customer-facing brand: **H~M Trading Institute** (never "Vibe-Trading" in UI).
> - Product/app name: **QuantLab** (user app) · **QuantLab Admin** (control plane).
> - Working name (internal): **Quant Research OS**.
> - "Vibe-Trading" in this spec = the vendored engine foundation (HKUDS,
>   at `Tradi/`) that the HM platform is built on / adapted from. It is the
>   **AI/research foundation** — never a customer-facing label.
> - References: **LSE** = London Strategic Edge (product + data architecture
>   reference); **OsEngine** + **NOFX** = learn-from / conceptual references.
> - Conflicts register: `docs/RECONCILIATION.md`.
> - Requirements register (all requirements, before build): `docs/REQUIREMENTS.md`.

---

(AI-Native Quantitative Trading & Research Platform
## Unified Product, Architecture, Infrastructure, SaaS, API, Billing & Full-Stack Design Specification

> **Purpose:** This document is the single source of truth for an AI coding/architecture agent working on our platform.
>
> **Foundation:** We are building on top of `HKUDS/Vibe-Trading`, but we are decoupling it into a modular, production-oriented, multi-user quantitative research and trading platform.
>
> **Product concept:** An AI-native Quant Research OS combining market data, AI research agents, ML, reinforcement learning, strategy development, backtesting, paper trading, risk management, and controlled live execution.

---

# 1. Product Vision

The platform should allow a user to move through one continuous workflow:

```text
Discover
  ↓
Research
  ↓
Collect / Query Data
  ↓
Engineer Features
  ↓
Create Strategy
  ↓
Train ML / RL Model
  ↓
Backtest
  ↓
Walk-Forward Validation
  ↓
Stress / Risk Testing
  ↓
Paper Trade
  ↓
Risk Approval
  ↓
Live Trading
  ↓
Monitor
  ↓
Evaluate
  ↓
Learn From Results
  ↓
Improve Strategy / Model
```

The central architectural principle is:

> One canonical data and feature layer must serve research, ML/RL, backtesting, paper trading, and live inference wherever technically possible.

Avoid separate definitions of market data/features for each environment because this creates research/live inconsistencies and training-serving skew.

# 2. Product Positioning

The platform combines ideas from:

- Vibe-Trading: agentic trading/research foundation
- Modern quant terminals: market workspace, charts, data, backtesting
- ML platforms: experiment tracking, model registry, reproducibility
- RL platforms: environments, training, evaluation and policy deployment
- Trading systems: portfolio, risk, OMS/execution
- SaaS platforms: multi-tenancy, billing, quotas and administration

The product should feel like:

```text
TradingView/Bloomberg-style workspace
        +
AI Research Copilot
        +
ML Studio
        +
RL Studio
        +
Quant Backtesting
        +
Paper Trading
        +
Controlled Live Execution
        +
Multi-user SaaS
```

Do NOT turn the system into a random collection of microservices. Every service must have a clear responsibility, API contract, data ownership and measurable infrastructure cost.

# 3. High-Level Architecture

```text
                                      INTERNET
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │     CLOUDFLARE      │
                              │ DNS / TLS / CDN/WAF │
                              │ Rate Limits / Edge  │
                              └──────────┬──────────┘
                                         │
                              HTTPS REST / WebSocket
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │   FRONTEND / WEB    │
                              │ Next.js / React      │
                              │ Quant Workspace     │
                              └──────────┬──────────┘
                                         │
                                  REST + WebSocket
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │     API LAYER       │
                              │ FastAPI / Python    │
                              │ Auth / RBAC / API   │
                              │ orchestration       │
                              └──────────┬──────────┘
                                         │
             ┌───────────────────────────┼───────────────────────────┐
             │                           │                           │
             ▼                           ▼                           ▼
      RESEARCH / AGENTS             MARKET DATA                 PORTFOLIO
             │                           │                           │
             ▼                           ▼                           ▼
       Agent Orchestrator          Data Router                 Accounts
       Vibe-Trading                 Normalizer                  Positions
       AI Research                  WebSocket                   P&L
       Tool Calling                 Data Lake                   Risk
             │                           │
             ▼                           ▼
       ┌──────────────┐            ┌──────────────┐
       │ Feature      │            │ Object       │
       │ Store        │            │ Storage      │
       │ / Registry   │            │ S3 + Parquet │
       └──────┬───────┘            └──────┬───────┘
              │                           │
       ┌──────┴───────────┐               │
       ▼                  ▼               ▼
      ML                 RL          Historical Data
       │                  │
       └────────┬─────────┘
                ▼
        EXPERIMENT TRACKING
             MLflow
                │
                ▼
         MODEL REGISTRY
                │
                ▼
          STRATEGY ENGINE
                │
                ▼
           BACKTEST ENGINE
                │
       ┌────────┴─────────┐
       ▼                  ▼
   VALIDATION          STRESS TEST
       │                  │
       └────────┬─────────┘
                ▼
          PAPER TRADING
                │
                ▼
           RISK ENGINE
                │
                ▼
        ORDER MANAGEMENT
             / OMS
                │
          ┌─────┴──────┐
          ▼            ▼
       PAPER          LIVE
          │            │
          │       Broker/Exchange
          │            │
          └─────┬──────┘
                ▼
          EXECUTION EVENTS
                │
                ▼
          PORTFOLIO/P&L
                │
                ▼
        MONITORING + AUDIT
                │
                ▼
          BILLING / USAGE
```

# 4. Two Major Application Planes

## 4.1 User Plane

The user-facing product.

```text
User
 ↓
Web App
 ↓
Quant Workspace
 ↓
Research / Data / ML / RL / Backtest / Paper / Live
```

## 4.2 Admin Control Plane

The platform operations and governance layer.

```text
Admin
 ↓
Admin Web App
 ↓
Control Plane
 ├── Users
 ├── Organizations
 ├── Roles
 ├── Billing
 ├── Usage
 ├── Infrastructure
 ├── Data
 ├── AI/ML/RL Jobs
 ├── Trading
 ├── Security
 ├── Audit
 └── System Health
```

The admin plane must be separated logically and protected by stronger RBAC/MFA/audit controls.

# 5. User Dashboard

After login, the user lands on a personalized Quant Command Center.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Logo | Search / Command | Market Status | Notifications | Profile │
├──────────────┬──────────────────────────────────────────────────────┤
│ Dashboard    │ Portfolio Value | Today P&L | Sharpe | Drawdown     │
│ Markets      ├──────────────────────────┬───────────────────────────┤
│ Research AI  │                          │                           │
│ Strategies   │       Market Chart       │    AI Research Copilot    │
│ ML Studio    │                          │                           │
│ RL Studio    │                          │                           │
│ Backtests    ├──────────────────────────┴───────────────────────────┤
│ Paper        │                    Strategy Monitor                  │
│ Portfolio    ├─────────────────────────┬────────────────────────────┤
│ Data         │ Risk Monitor             │ Market Regime              │
│ Models       ├─────────────────────────┼────────────────────────────┤
│ Live         │ Recent Research          │ ML / RL Experiments        │
│ Settings     │                           │                            │
└──────────────┴─────────────────────────┴────────────────────────────┘
```

Core dashboard widgets:

- Portfolio Value
- Today's P&L
- Total Return
- Sharpe
- Max Drawdown
- Market chart
- AI Research Copilot
- Strategy Monitor
- Risk Monitor
- Market Regime
- Recent Research
- ML/RL experiments
- Paper/live status
- Alerts

The dashboard must not display fake trading values. If the user has no account, show an empty state and offer paper-account creation.

# 6. User Navigation

```text
Dashboard
Markets
Research AI
Strategies
ML Studio
RL Studio
Backtests
Paper Trading
Portfolio
Data
Models
Live Trading
Settings
```

# 7. Admin Dashboard

Admin sees the whole platform rather than one user's portfolio.

```text
ADMIN
├── Overview
├── Users
├── Organizations
├── Roles & Permissions
├── Billing
├── Plans
├── Credits / Usage
├── AI / Models
├── ML / RL Jobs
├── Research Jobs
├── Market Data
├── Datasets
├── Data Providers
├── Infrastructure
├── Cloud Resources
├── Workers
├── GPU Jobs
├── Storage
├── Trading
├── Brokers
├── Orders
├── Accounts
├── Risk Controls
├── Monitoring
├── Alerts
├── Audit Logs
├── Security
└── Platform Settings
```

Admin overview should show:

- Total users
- Active users
- Research jobs
- Backtests
- ML/RL jobs
- Infrastructure cost
- Revenue
- Gross infrastructure margin
- Current vs forecasted monthly spend
- API health
- Database health
- Redis health
- Worker health
- WebSocket health
- Security alerts
- Paper/live account counts
- Broker connectivity

# 8. Multi-Tenant SaaS Model

The system must be multi-user from the beginning.

Recommended hierarchy:

```text
Platform
 ├── Organization
 │    ├── Users
 │    ├── Projects
 │    ├── Strategies
 │    ├── Models
 │    ├── Experiments
 │    └── Accounts
 │
 └── Personal Workspace
```

Core tenancy fields:

- `tenant_id`
- `organization_id`
- `user_id`
- `project_id`

Every tenant-owned resource must be scoped.

Never allow a user to access another tenant's:

- strategies
- models
- research
- datasets
- API keys
- accounts
- portfolios
- orders
- billing
- audit records

# 9. Authentication and Authorization

Recommended:

- Managed authentication or secure application auth
- Short-lived access tokens/session
- Refresh/session rotation
- MFA for privileged users
- RBAC
- tenant isolation
- API keys for programmatic access
- audit logging

Roles:

```text
USER
RESEARCHER
QUANT
TRADER
ORG_ADMIN
PLATFORM_ADMIN
SUPER_ADMIN
```

Permissions should be granular.

Example:

```text
strategy.read
strategy.create
strategy.backtest
model.train
rl.train
paper.trade
live.trade
broker.connect
billing.read
admin.users
admin.infrastructure
admin.kill_switch
```

# 10. Core Backend Services

Start as a modular monolith where practical, with clear internal service boundaries.

Do NOT split everything into independent microservices on day one.

Recommended modules:

```text
backend/
├── auth/
├── users/
├── organizations/
├── billing/
├── market_data/
├── research/
├── agents/
├── features/
├── strategies/
├── ml/
├── rl/
├── experiments/
├── models/
├── backtesting/
├── paper_trading/
├── portfolio/
├── risk/
├── execution/
├── brokers/
├── websocket/
├── notifications/
├── audit/
├── monitoring/
└── admin/
```

Extract heavy workloads into workers/services later.

# 11. Recommended Full-Stack Technology

## Frontend

Recommended:

- Next.js
- React
- TypeScript
- Tailwind CSS
- component library
- TanStack Query
- Zustand or equivalent lightweight client state
- TradingView Lightweight Charts or another charting library
- WebSocket client
- REST client

Frontend responsibilities:

- UI
- routing
- authentication state
- workspace state
- charts
- real-time display
- forms
- strategy builder
- research interface
- admin UI

Do not put secrets or broker credentials in frontend code.

# 12. Backend

Primary backend:

```text
Python
FastAPI
Pydantic
SQLAlchemy
Alembic
```

Why Python:

- ML
- RL
- quant ecosystem
- data science
- Vibe-Trading integration
- PyTorch
- XGBoost
- Polars
- DuckDB

Node.js can be used where useful, but do not create Node + Python duplication without a clear reason.

# 13. Data Layer

## PostgreSQL

Use PostgreSQL for transactional/relational data.

Tables/modules include:

```text
users
organizations
memberships
roles
permissions
subscriptions
usage_records
billing_records

strategies
strategy_versions

experiments
experiment_runs

models
model_versions
model_deployments

backtests
backtest_runs

portfolios
accounts
positions
orders
fills

risk_events
audit_events

notifications
API_keys
broker_connections
```

Do NOT store huge historical tick datasets in PostgreSQL.

# 14. Data Lake

Use object storage for large datasets.

```text
S3
└── quant-platform/
    ├── market-data/
    │   ├── equities/
    │   ├── forex/
    │   ├── crypto/
    │   ├── futures/
    │   ├── options/
    │   └── macro/
    ├── features/
    ├── training/
    ├── models/
    ├── checkpoints/
    ├── backtests/
    ├── reports/
    └── exports/
```

Preferred analytical formats:

```text
Parquet
```

Preferred local/query engines:

```text
DuckDB
Polars
PyArrow
```

PostgreSQL stores metadata/catalog information about datasets.

# 15. Feature Store / Feature Registry

Feature engineering must be versioned.

Example:

```text
feature:
    rsi_14

version:
    3

definition:
    RSI over 14 periods

dataset_version:
    market-data-v17
```

The same feature definition should be available to:

- Training
- Backtesting
- Paper
- Live inference

This reduces training-serving skew.

A full dedicated feature-store product is not required initially. Build a feature registry and versioned feature pipeline first.

# 16. Market Data Architecture

```text
Market Data Providers
        │
        ▼
Data Connectors
        │
        ▼
Normalizer
        │
        ├──────────────► Historical Data → S3/Parquet
        │
        └──────────────► Real-Time Stream
                              │
                              ▼
                           Redis/
                        Stream Broker
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
              Charts        ML/RL       Strategies
```

Data categories:

- equities
- ETFs
- indices
- FX
- crypto
- futures
- options
- macroeconomic data
- fundamentals
- news/sentiment
- alternative data

Licensing and redistribution rights must be checked for every provider/data product.

# 17. REST API

REST is the primary request/response API.

Base: `https://api.example.com/api/v1`

Example endpoints:

```text
POST   /auth/login
POST   /auth/logout
GET    /me

GET    /markets
GET    /markets/{symbol}
GET    /markets/{symbol}/history

GET    /strategies
POST   /strategies
GET    /strategies/{id}
PUT    /strategies/{id}

POST   /strategies/{id}/backtests
GET    /backtests
GET    /backtests/{id}

POST   /experiments
GET    /experiments/{id}

POST   /models/train
GET    /models
GET    /models/{id}

POST   /rl/jobs
GET    /rl/jobs/{id}

GET    /portfolios
GET    /positions
GET    /orders
POST   /orders
DELETE /orders/{id}

POST   /paper/accounts
GET    /paper/accounts

POST   /brokers/connect
GET    /brokers

GET    /risk
GET    /alerts

GET    /usage
GET    /billing

GET    /admin/users
GET    /admin/infrastructure
GET    /admin/audit
```

API versioning: `/api/v1`

Do not break clients by silently changing existing endpoint contracts.

# 18. WebSocket Architecture

WebSocket is for real-time events.

Endpoint: `wss://api.example.com/ws`

Possible channels:

```text
/ws/markets/{symbol}
/ws/portfolio/{portfolio_id}
/ws/orders/{account_id}
/ws/strategies/{strategy_id}
/ws/research/{job_id}
/ws/jobs/{job_id}
/ws/notifications
```

Events:

```text
market.tick
market.bar

portfolio.updated
position.updated
pnl.updated

order.created
order.updated
order.filled
order.cancelled

strategy.signal

backtest.started
backtest.progress
backtest.completed

training.started
training.progress
training.completed

research.started
research.progress
research.completed

risk.warning
risk.breach

system.alert
```

Use REST for: "Give me the current state."
Use WebSocket for: "Tell me when the state changes."

# 19. Background Jobs

Heavy work must never block the API request thread.

Examples:

- Backtesting
- ML training
- RL training
- Dataset ingestion
- Feature computation
- Research agents
- Report generation
- Model evaluation
- Large exports

Initial architecture:

```text
FastAPI
   ↓
Redis queue
   ↓
Worker
   ↓
Job
   ↓
PostgreSQL/S3
   ↓
WebSocket event
```

Candidate tools: Celery · RQ · Dramatiq

**Choose one. Do not install all three.**

# 20. AI Research Agent

The Vibe-Trading agent layer becomes the foundation.

Architecture:

```text
User
 ↓
Research Copilot
 ↓
Agent Orchestrator
 ↓
Tools
 ├── Market Data
 ├── Search
 ├── Database
 ├── Feature Engine
 ├── Backtester
 ├── ML
 ├── RL
 ├── Portfolio
 └── Report Generator
```

The agent should not directly execute live trades just because it can generate a strategy.

Live execution must go through:

```text
Agent
 ↓
Strategy
 ↓
Validation
 ↓
Risk Engine
 ↓
Execution Policy
 ↓
OMS
 ↓
Broker
```

# 21. ML Studio

Initial models:

```text
XGBoost
LightGBM
Random Forest
LSTM
Transformers
```

Typical workflow:

```text
Dataset
 ↓
Feature Selection
 ↓
Train
 ↓
Validation
 ↓
Walk Forward
 ↓
Backtest
 ↓
Stress Test
 ↓
Model Registry
```

Track:

- dataset version
- feature version
- model version
- hyperparameters
- training time
- metrics
- backtest results
- random seeds
- code version
- artifact location

# 22. RL Studio

RL is a separate subsystem.

Initial candidates:

```text
PPO
SAC
DQN
```

Environment:

```text
Market State
    ↓
Observation
    ↓
RL Policy
    ↓
Action
    ↓
Risk Constraints
    ↓
Simulated Execution
    ↓
Reward
    ↓
Next State
```

Never let raw RL actions bypass the risk engine.

RL output:

```text
BUY
SELL
HOLD
position target
allocation target
```

Risk engine determines whether that action is permitted.

# 23. Backtesting

Backtesting must support:

- historical data
- transaction costs
- slippage
- latency assumptions
- position sizing
- risk rules
- market regimes
- walk-forward evaluation
- out-of-sample testing

Outputs:

```text
CAGR
Sharpe
Sortino
Max Drawdown
Win Rate
Profit Factor
Turnover
Exposure
Volatility
Number of trades
```

Never present backtest results as guarantees of future performance.

# 24. Paper Trading

Pipeline:

```text
Strategy
 ↓
Signal
 ↓
Risk Engine
 ↓
Paper OMS
 ↓
Paper Execution Simulator
 ↓
Paper Portfolio
 ↓
P&L
```

Paper trading should use the same strategy/risk interfaces as live trading wherever possible.

Difference:

```text
Paper → simulated broker/execution
Live  → real broker/exchange
```

This creates a clean promotion path.

# 25. Paper → Live Promotion

Required pipeline:

```text
BACKTEST
   ↓
VALIDATION
   ↓
STRESS TEST
   ↓
PAPER
   ↓
PAPER PERFORMANCE CHECK
   ↓
RISK APPROVAL
   ↓
LIVE ELIGIBILITY
   ↓
LIVE
```

Do not provide a simple `[GO LIVE]` button with no controls.

Use:

- strategy status
- model status
- risk status
- account status
- broker status
- approval status

# 26. Risk Engine

Risk must be independent of the AI agent.

Checks can include:

- max position size
- max portfolio exposure
- max daily loss
- max drawdown
- max leverage
- concentration
- asset restrictions
- strategy restrictions
- order limits
- account limits
- global platform limits

Hierarchy:

```text
User Risk
 ↓
Strategy Risk
 ↓
Account Risk
 ↓
Platform Risk
 ↓
Global Emergency Control
```

# 27. Execution / OMS

```text
Strategy Signal
      ↓
Risk Engine
      ↓
Order Manager
      ↓
Execution Adapter
      ↓
Broker / Exchange
      ↓
Order/Fills
      ↓
Portfolio
```

Broker integrations must be adapters.

Example:

```text
BrokerInterface
├── BrokerAAdapter
├── BrokerBAdapter
└── BrokerCAdapter
```

Do not hard-code a broker throughout the application.

# 28. Monitoring

Use:

- Prometheus
- Grafana
- Structured logs

Monitor:

- CPU
- RAM
- disk
- API latency
- request rate
- error rate
- WebSocket connections
- worker queue length
- job duration
- ML inference latency
- RL training
- database connections
- Redis health
- broker connectivity
- order latency
- execution errors
- portfolio P&L
- risk events

# 29. Audit System

Record important events.

Examples:

```text
USER_LOGIN
STRATEGY_CREATED
MODEL_TRAINED
MODEL_PROMOTED
BACKTEST_STARTED
BACKTEST_COMPLETED
PAPER_STARTED
LIVE_ENABLED
RISK_APPROVED
RISK_REJECTED
ORDER_CREATED
ORDER_SUBMITTED
ORDER_FILLED
ORDER_CANCELLED
BROKER_CONNECTED
API_KEY_CREATED
ADMIN_ACTION
KILL_SWITCH
```

Audit record:

```text
event_id
timestamp
actor_id
tenant_id
event_type
resource_type
resource_id
action
metadata
ip/session metadata where appropriate
```

Audit records should be append-oriented and difficult for normal users/admins to alter.

# 30. SaaS / External Infrastructure

## Cloudflare

Use for:

- DNS
- TLS
- CDN
- WAF
- DDoS protection
- rate limiting
- edge controls

Potential: Cloudflare Pages / Workers for frontend/edge workloads if appropriate.

## AWS

Primary cloud infrastructure.

Use:

- EC2
- RDS PostgreSQL
- S3
- Secrets Manager
- CloudWatch where useful
- SQS later if needed
- GPU instances on demand

Do NOT start with:

- EKS/Kubernetes
- Kafka
- SageMaker
- large GPU cluster

unless actual workload requires them.

## GitHub

Use for:

- source control
- issues
- pull requests
- CI/CD
- code review
- release tags
- GitHub Actions

Repository structure should eventually resemble:

```text
platform/
├── apps/
│   ├── web/
│   └── admin/
├── services/
│   └── api/
├── workers/
├── packages/
├── ml/
├── rl/
├── backtesting/
├── infrastructure/
├── docs/
└── tests/
```

## Vercel OR Cloudflare Pages

Use one primary frontend deployment platform.

Recommended initial choice:

```text
Next.js
    ↓
Vercel
```

Cloudflare remains in front/around the platform for DNS/WAF/CDN where appropriate.

Alternatively:

```text
Next.js
 ↓
Cloudflare Pages
```

Do not unnecessarily pay for both frontend hosting services.

## LLM Providers

Use an LLM gateway/router abstraction.

Architecture:

```text
Research Agent
 ↓
LLM Gateway
 ↓
Provider A
Provider B
Provider C
Provider D
```

This lets us:

- route by cost
- route by capability
- fail over
- track token usage
- impose per-user limits
- change providers without rewriting the agent

Do not hard-code one LLM vendor throughout the application.

## MLflow

Use for:

- experiment tracking
- model versions
- metrics
- artifacts
- model registry

Initially self-host it.

## Redis

Use for:

- cache
- job queue
- temporary state
- rate limiting
- real-time coordination

Do not treat Redis as the system of record.

# 31. Infrastructure Topology

## Development

```text
Developer Laptop
     │
     ├── Docker
     │    ├── PostgreSQL
     │    ├── Redis
     │    ├── API
     │    ├── Workers
     │    └── MLflow
     │
     └── Next.js
```

Use Docker Compose for local development.

# 32. MVP Production Topology

```text
Internet
   ↓
Cloudflare
   ↓
Vercel / Frontend
   │
   └──────→ AWS
              │
              ├── EC2
              │    ├── FastAPI
              │    ├── Workers
              │    ├── Redis initially
              │    ├── Prometheus
              │    └── Grafana
              │
              ├── RDS PostgreSQL
              │
              ├── S3
              │
              └── Secrets Manager

GPU:
On-demand / temporary
```

# 33. Future Production Topology

Only when justified:

```text
Cloudflare
    ↓
Load Balancer
    ↓
API replicas
    ↓
Service/worker layer
    ↓
Queue
    ├── Research workers
    ├── ML workers
    ├── RL workers
    ├── Backtest workers
    └── Data workers
    ↓
RDS PostgreSQL
Redis
S3
Model Registry
Monitoring
```

Kubernetes/EKS is a later optimization, not an MVP requirement.

# 34. Infrastructure Budget

Initial target:

```text
MVP target: $150–$250/month
```

Approximate categories:

```text
Cloudflare          $5–20
AWS compute         $50–100
RDS PostgreSQL      $25–50
S3                  $2–10
Redis               $0–20
Monitoring          $0–20
Frontend            $0–20
LLM APIs            $20–200
GPU training        $0–200
Market data         $0–200+
```

Actual cost depends heavily on usage, provider, region and data licensing.

The target is not a hard technical limit. It is an economics target for MVP.

# 35. Cost Optimization Rules

## Rule 1 — GPU is burst infrastructure

```text
Do not keep GPU instances running 24/7.

Need GPU
 ↓
Start GPU
 ↓
Train
 ↓
Save checkpoint to S3
 ↓
Terminate GPU
```

## Rule 2 — Heavy jobs are asynchronous

Never block API servers with:

- RL training
- large backtests
- dataset processing
- large ML jobs

## Rule 3 — Track cost per tenant

Every expensive job should contain:

```text
tenant_id
user_id
job_id
resource_type
estimated_cost
actual_cost where available
```

## Rule 4 — Budget alerts

```text
$100  INFO
$150  NOTICE
$200  WARNING
$225  HIGH
$250  TARGET LIMIT
$300  CRITICAL
```

## Rule 5 — Forecast

Admin should show:

- current spend
- forecasted month-end spend
- budget
- cost by service
- cost by tenant
- cost by job

# 36. Billing Architecture

Billing must support both subscription and usage.

```text
User
 ↓
Plan
 ↓
Entitlements
 ↓
Usage Metering
 ↓
Quota Enforcement
 ↓
Billing Provider
 ↓
Invoice / Payment
```

Recommended billing provider should be abstracted behind:

```text
BillingProvider
```

so the application isn't coupled to one vendor.

Potential billing provider: Stripe

If regional payment requirements make another provider more appropriate, use an adapter rather than changing business logic.

# 37. Example Billing Tiers

These are starting product concepts, not final commercial prices.

```text
Free
$0
Basic market data
Limited AI research
Basic backtesting
Paper trading
Limited datasets
Limited API usage

Pro
~$29/month
More research runs
More backtests
Advanced datasets
ML experiments
Higher AI limits
Paper trading

Quant
~$99/month
Advanced ML
RL experiments
GPU credits
Large datasets
Higher API limits
Advanced research

Enterprise
Custom
Dedicated infrastructure
Private datasets
Dedicated models
High API limits
Broker integrations
SLA
```

Do not promise unlimited compute.

# 38. Usage Metering

Track:

- LLM tokens
- LLM requests
- research runs
- backtests
- ML training time
- RL training time
- GPU seconds/minutes
- CPU compute
- dataset downloads
- API requests
- WebSocket usage where relevant
- storage
- data-provider usage
- exports

Example:

```text
User
 ↓
Research Agent
 ↓
LLM request
 ↓
Usage Meter
 ↓
tenant_id + tokens + model + cost
```

This lets admin calculate:

- revenue/user
- cost/user
- gross margin/user
- cost/research
- cost/backtest
- cost/training

# 39. Database Design Principles

Use relational integrity for transactional data.

Important patterns:

- UUID/ULID identifiers
- created_at
- updated_at
- tenant_id
- soft deletion where appropriate
- version fields where needed
- foreign keys
- indexes
- unique constraints

Use migrations: Alembic

Never manually edit production schemas without migrations.

# 40. Caching

Cache:

- market metadata
- frequently requested market snapshots
- public datasets metadata
- feature metadata
- model metadata
- user dashboard aggregates

Do not cache sensitive account state indefinitely.

Use cache invalidation rules.

# 41. Security Architecture

```text
Cloudflare WAF
      ↓
HTTPS
      ↓
API authentication
      ↓
RBAC
      ↓
Tenant isolation
      ↓
Application validation
      ↓
Database authorization
```

Secrets:

- Secrets Manager / encrypted environment secrets

Never:

- API keys in Git
- broker secrets in frontend
- LLM keys in browser
- database credentials in source code

# 42. CI/CD

```text
Developer
 ↓
Git branch
 ↓
Pull Request
 ↓
CI
 ├── lint
 ├── type check
 ├── unit tests
 ├── integration tests
 ├── security checks
 └── build
 ↓
Review
 ↓
Merge
 ↓
Deployment
 ↓
Smoke tests
 ↓
Monitoring
```

Environments:

```text
local
development
staging
production
```

Do not deploy experimental RL/live-execution code directly to production.

# 43. Testing Strategy

## Unit

- risk calculations
- feature calculations
- portfolio calculations
- billing calculations
- API functions

## Integration

- API ↔ database
- API ↔ Redis
- API ↔ workers
- agent ↔ tools
- strategy ↔ backtester
- risk ↔ execution

## ML tests

- feature consistency
- data leakage
- training-serving consistency
- model loading
- inference

## Trading tests

- order lifecycle
- partial fills
- cancellations
- broker failures
- duplicate orders
- reconnection
- risk rejection
- kill switch

## End-to-end

```text
login
 → research
 → strategy
 → backtest
 → paper
 → risk
 → execution
```

# 44. Observability Architecture

```text
Application
    │
    ├── Metrics → Prometheus
    ├── Dashboards → Grafana
    ├── Logs → Log system
    └── Audit → PostgreSQL / durable audit storage
```

Important alerts:

- API down
- database unavailable
- Redis unavailable
- worker queue growing
- broker disconnected
- order failures
- risk breach
- GPU job runaway
- LLM cost spike
- monthly budget spike
- unusual authentication activity

# 45. Notification System

Support:

- in-app notifications
- email
- optional webhook

Events:

- backtest completed
- training completed
- strategy signal
- risk warning
- paper performance threshold
- broker disconnected
- billing limit reached
- security event

# 46. Model Registry

Each model must have:

```text
model_id
version
model_type
dataset_version
feature_version
training_run
code_commit
metrics
status
artifact_uri
created_at
```

Lifecycle:

```text
TRAINED
 ↓
EVALUATED
 ↓
VALIDATED
 ↓
PAPER
 ↓
APPROVED
 ↓
LIVE
 ↓
RETIRED
```

Never deploy an arbitrary `latest.pkl` directly to live.

# 47. Strategy Registry

Strategy lifecycle:

```text
DRAFT
 ↓
BACKTESTED
 ↓
VALIDATED
 ↓
PAPER
 ↓
LIVE_ELIGIBLE
 ↓
LIVE
 ↓
PAUSED
 ↓
RETIRED
```

A strategy references:

- model version
- feature version
- dataset version
- risk policy
- execution policy

This creates reproducibility.

# 48. Research Reproducibility

Every research run should be reproducible.

Store:

```text
user
tenant
prompt
agent version
tool versions
dataset version
feature version
strategy version
model version
code commit
parameters
results
artifacts
timestamps
```

Research output should become a durable research record, not disappear inside chat history.

# 49. AI Agent Tool Permissions

Use least privilege.

Example:

```text
Research Agent:
READ market data
READ datasets
CREATE research
RUN backtest
CREATE draft strategy

ML Agent:
READ datasets
CREATE experiment
TRAIN model
REGISTER model

Paper Agent:
READ strategy
SUBMIT paper order
READ paper portfolio

Live Execution:
NOT directly controlled by generic research agent
```

Live trading should require explicit system-level permissions and risk checks.

# 50. API Gateway Rules

Every request should be evaluated for:

- authentication
- tenant
- authorization
- rate limit
- quota
- input validation
- audit requirements

Example:

```text
POST /api/v1/backtests
```

Flow:

```text
Request
 ↓
Auth
 ↓
Tenant
 ↓
Permission
 ↓
Quota
 ↓
Validate
 ↓
Create job
 ↓
Return job_id
```

Then `GET /api/v1/backtests/{id}` returns status.

# 51. REST vs WebSocket Rule

Use REST when:

- creating resources
- fetching resources
- updating resources
- deleting resources
- starting jobs
- requesting historical data

Use WebSocket when:

- market ticks
- live prices
- P&L updates
- order events
- training progress
- backtest progress
- agent job progress
- notifications

Do not use WebSocket for everything.

# 52. Frontend State Model

Separate:

- Server state
- Client/UI state
- Real-time state

Example:

- TanStack Query: API/server state
- Zustand: workspace/UI state
- WebSocket: live event stream

Avoid storing the entire backend database inside frontend global state.

# 53. UX Design Principles

The product should feel:

- Professional
- Data-dense
- Fast
- Calm
- Transparent
- AI-native

Avoid:

- generic SaaS cards everywhere
- excessive gradients
- fake financial numbers
- overly animated interfaces
- confusing trading buttons

Live trading controls should be visually distinct from research/paper controls.

# 54. Main User Workflow

```text
LOGIN
 ↓
DASHBOARD
 ↓
MARKETS
 ↓
AI RESEARCH
 ↓
DATA
 ↓
FEATURES
 ↓
STRATEGY
 ↓
ML/RL
 ↓
BACKTEST
 ↓
WALK-FORWARD
 ↓
STRESS TEST
 ↓
PAPER
 ↓
RISK
 ↓
LIVE ELIGIBILITY
 ↓
LIVE
 ↓
MONITOR
 ↓
AUDIT
```

# 55. Main Admin Workflow

```text
ADMIN LOGIN
 ↓
ADMIN DASHBOARD
 ↓
SYSTEM HEALTH
 ↓
USERS / TENANTS
 ↓
BILLING / USAGE
 ↓
DATA
 ↓
AI/ML/RL JOBS
 ↓
INFRASTRUCTURE
 ↓
TRADING
 ↓
SECURITY
 ↓
AUDIT
 ↓
COST OPTIMIZATION
```

# 56. Billing and Infrastructure Health Score

Target MVP: `$150–$250/month`

```text
Grade:
A: $150–$250   healthy infrastructure, good cost attribution, no runaway jobs
B: $250–$400   acceptable but optimize
C: $400–$700   investigate resource usage
D: $700–$1,000+ too expensive for early beta unless user/revenue growth justifies it
```

Important metric:

```text
Infrastructure Cost / Active User
```

Also:

```text
Infrastructure Cost / Research Run
Infrastructure Cost / Backtest
Infrastructure Cost / ML Job
Infrastructure Cost / RL Job
```

# 57. Cost Attribution

Every heavy operation should be traceable:

```text
tenant_id
user_id
job_id
service
resource
duration
estimated_cost
actual_cost if available
```

Example:

```text
User 123
 ├── LLM research       $0.12
 ├── Backtest            $0.03
 ├── GPU training        $1.82
 ├── Storage             $0.01
 └── Data usage          $0.08
                       -------
                         $2.06
```

Admin can then compare:

```text
Subscription revenue: $29
Infrastructure cost:  $2.06
Gross infra margin:   $26.94
```

# 58. Initial Infrastructure Decision

Use:

```text
Cloudflare
AWS
GitHub
Vercel OR Cloudflare Pages
PostgreSQL
Redis
S3
MLflow
Prometheus
Grafana
Docker
GitHub Actions
FastAPI
Next.js
Python ML/RL stack
```

Do not initially require:

```text
Kubernetes
EKS
Kafka
SageMaker
large GPU fleet
OpenSearch
multiple queues
multiple frontend hosts
```

Add them only when scale or requirements justify them.

# 59. Recommended Repository Architecture

```text
quant-platform/
│
├── apps/
│   ├── web/                    # User application
│   └── admin/                  # Admin control plane
│
├── services/
│   └── api/                    # FastAPI
│
├── workers/
│   ├── research/
│   ├── backtest/
│   ├── ml/
│   ├── rl/
│   └── data/
│
├── packages/
│   ├── shared-types/
│   ├── api-client/
│   └── ui/
│
├── trading/
│   ├── strategies/
│   ├── risk/
│   ├── portfolio/
│   ├── execution/
│   └── brokers/
│
├── data/
│   ├── ingestion/
│   ├── normalization/
│   ├── features/
│   └── schemas/
│
├── ai/
│   ├── agents/
│   ├── tools/
│   └── prompts/
│
├── ml/
│   ├── training/
│   ├── evaluation/
│   └── inference/
│
├── rl/
│   ├── environments/
│   ├── training/
│   └── evaluation/
│
├── backtesting/
│
├── infrastructure/
│   ├── docker/
│   ├── terraform/
│   └── deployment/
│
├── migrations/
│
├── tests/
│
├── docs/
│
└── docker-compose.yml
```

Terraform can be introduced early for repeatable infrastructure, but don't over-engineer the cloud deployment before the application architecture stabilizes.

# 60. Build Phases

## Phase 0 — Understand and Decouple Vibe-Trading

Tasks:

- clone/fork repository
- map existing modules
- identify agents
- identify tools
- identify backtesting
- identify data connectors
- identify trading connectors
- identify reusable code
- identify tightly coupled code

Do not rewrite everything immediately.

## Phase 1 — Foundation

Build:

- Next.js frontend
- FastAPI backend
- PostgreSQL
- Redis
- Docker Compose
- authentication
- multi-tenancy
- RBAC
- basic CI/CD

## Phase 2 — Data

Build:

- market data abstraction
- data normalization
- S3/Parquet
- DuckDB/Polars
- dataset registry
- feature registry

## Phase 3 — Research

Build:

- Vibe-Trading agent
- AI Research Copilot
- tool registry
- research jobs
- research history
- reports

## Phase 4 — Backtesting

Build:

- strategy registry
- backtest engine
- walk-forward
- metrics
- stress testing
- experiment tracking

## Phase 5 — ML

Build:

- ML Studio
- training jobs
- model registry
- model evaluation
- inference

## Phase 6 — RL

Build:

- RL Studio
- PPO
- SAC
- DQN where appropriate
- environments
- reward design
- training jobs
- evaluation

## Phase 7 — Paper Trading

Build:

- paper accounts
- paper OMS
- execution simulator
- portfolio
- P&L
- risk engine

## Phase 8 — Live Trading

Only after the previous layers are stable:

- broker adapters
- live account
- OMS
- risk
- execution
- audit
- kill switch
- promotion workflow

## Phase 9 — SaaS

Build:

- plans
- subscriptions
- usage metering
- quotas
- credits
- billing
- cost attribution
- admin billing

## Phase 10 — Scale

Only when required:

- service extraction
- separate worker pools
- managed Redis
- SQS
- Kafka/Redpanda
- Kubernetes/EKS
- autoscaling
- GPU orchestration
- multi-region

# 61. Non-Negotiable Architecture Rules

- No secrets in frontend code.
- No live trading directly from a generic AI agent.
- Risk engine must be independent of strategy/model logic.
- Paper and live should share interfaces.
- Every model is versioned.
- Every strategy is versioned.
- Every dataset is versioned.
- Features are versioned.
- Backtests must be reproducible.
- Heavy jobs are asynchronous.
- WebSocket is for real-time events; REST is for request/response.
- PostgreSQL is not the historical tick-data lake.
- S3/object storage holds large artifacts/datasets.
- Redis is not the system of record.
- Every tenant-owned resource is tenant-scoped.
- Every live trading action is auditable.
- GPU resources should be burstable/on-demand.
- Usage must be metered.
- Infrastructure cost must be attributable.
- Do not introduce complex infrastructure before it is justified by scale.

# 62. Definition of the Finished Product

The finished platform should allow a user to:

```text
LOGIN
 ↓
open dashboard
 ↓
inspect markets
 ↓
ask AI to research an idea
 ↓
query historical data
 ↓
generate features
 ↓
create a strategy
 ↓
train ML/RL model
 ↓
run reproducible backtest
 ↓
walk-forward validate
 ↓
stress test
 ↓
paper trade
 ↓
monitor performance
 ↓
pass risk controls
 ↓
request/enable live eligibility
 ↓
execute through broker adapter
 ↓
monitor live positions/P&L
 ↓
review audit/research history
```

And the admin should simultaneously be able to:

```text
monitor users
monitor tenants
monitor AI usage
monitor ML/RL jobs
monitor market data
monitor brokers
monitor infrastructure
monitor costs
monitor security
monitor billing
monitor trading risk
monitor audit events
```

# 63. Final Mental Model for the Coding Agent

The agent implementing this platform should think in layers, not individual features:

```text
┌───────────────────────────────────────────────┐
│                  EXPERIENCE                   │
│ User Dashboard + Admin Dashboard              │
├───────────────────────────────────────────────┤
│                  APPLICATION                  │
│ Research / Strategy / Portfolio / Billing     │
├───────────────────────────────────────────────┤
│                   INTELLIGENCE                │
│ AI Agents / ML / RL / Models                  │
├───────────────────────────────────────────────┤
│                    QUANT                     │
│ Features / Backtesting / Validation / Risk    │
├───────────────────────────────────────────────┤
│                     DATA                      │
│ Market Data / Feature Registry / Data Lake    │
├───────────────────────────────────────────────┤
│                  EXECUTION                    │
│ Paper / OMS / Broker / Live                   │
├───────────────────────────────────────────────┤
│                INFRASTRUCTURE                 │
│ AWS / Cloudflare / Redis / PostgreSQL / S3    │
├───────────────────────────────────────────────┤
│                 OBSERVABILITY                 │
│ Prometheus / Grafana / Logs / Audit           │
└───────────────────────────────────────────────┘
```

The core loop is:

```text
DATA
 ↓
RESEARCH
 ↓
FEATURES
 ↓
ML / RL
 ↓
STRATEGY
 ↓
BACKTEST
 ↓
VALIDATE
 ↓
PAPER
 ↓
RISK
 ↓
LIVE
 ↓
OBSERVE
 ↓
LEARN
 ↓
RESEARCH AGAIN
```
