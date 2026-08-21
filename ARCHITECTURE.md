# ARCHITECTURE.md — Reference Architecture

## High-Level

```text
Web / PWA
   ↓
Cloudflare / Edge
   ↓
API + Auth
   ↓
Python/FastAPI Application
   ├── Research
   ├── Quant Core
   ├── ML
   ├── RL
   ├── Strategy
   ├── Risk
   ├── OMS
   ├── Execution
   ├── Portfolio
   ├── Users/Billing
   └── Audit

Data Plane
   ├── Feed handlers
   ├── Quality/sequence validation
   ├── Canonical events
   ├── Realtime fanout
   ├── Data lake (Parquet/object storage)
   └── Feature layer

Infrastructure
   ├── PostgreSQL
   ├── Redis
   ├── Object storage
   ├── Background workers
   ├── Prometheus
   └── Grafana
```

## Technology Direction

### Frontend

- TypeScript
- React / Next.js
- responsive terminal-style workspace
- WebSocket for high-value realtime state
- SSE/streaming for long-running AI/job output
- PWA first

### Backend

- Python
- FastAPI
- typed domain models/schemas
- async I/O where appropriate
- background workers for long-running tasks

### Storage

PostgreSQL is the transactional application source of truth.

Object storage + Parquet is the historical/analytic data layer.

DuckDB/Polars/PyArrow are preferred for local/worker-side analytical processing.

Redis is used for cache, queues, transient state and realtime coordination.

## Domain Boundaries

### Research

Owns:

- agents
- tools
- research sessions
- hypotheses
- research reports

Does not own:

- broker credentials
- order submission
- hard risk limits

### Data

Owns:

- ingestion
- provider routing
- normalization
- provenance
- quality checks
- dataset versions
- realtime fanout

### Quant Core

Owns:

- strategy interfaces
- indicators/features
- order/position abstractions
- exchange simulation
- execution models
- portfolio simulation

### ML

Owns:

- datasets
- feature pipelines
- training
- evaluation
- model registry

### RL

Owns:

- environments
- reward definitions
- training
- policy evaluation
- checkpoints

RL is a research capability and must not be treated as proof of profitability.

### Risk

Owns hard limits and approval/rejection decisions.

The model/agent layer cannot bypass risk.

### OMS / Execution

Owns:

- order intents
- validation
- idempotency
- submission
- acknowledgements
- cancellations
- fills
- broker state
- reconciliation

### Portfolio

Owns:

- accounts
- cash
- positions
- P&L
- fees
- ledger

### Platform

Owns:

- users
- organizations
- roles
- quotas
- billing
- audit

## Execution Safety Boundary

```text
AI / RL / Strategy
      ↓
Trade Intent
      ↓
Risk Engine
      ↓
OMS
      ↓
Execution Adapter
      ↓
Broker / Exchange
```

No AI agent gets direct unrestricted broker access.

## Live Trading Rule

Browser sessions are never the authority for active strategies.

The server-side strategy/execution system owns active state.
