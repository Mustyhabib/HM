# FOUNDATIONS.md

## Project Identity

We are building an AI-native quantitative research,
simulation, paper-trading, and eventually live-trading
multi-user platform.

We are NOT building a clone of Vibe-Trading, OsEngine,
or NOFX.

## Reference Projects

### Vibe-Trading
Role: Primary AI/research foundation.

**Source:** github.com/Mustyhabib/HM (vendored engine lives at `Tradi/`; upstream HKUDS/vibe-trading)

Use for:
- research agents
- research workflows
- skills/tools
- MCP concepts
- backtesting integration
- experiment workflows

Do not assume:
- its architecture is our final architecture
- its data layer is our canonical data layer
- its code should be copied blindly

### OsEngine
Role: Quant-engine reference.

**Source:** github.com/AlexWan/OsEngine

Study:
- strategy engine
- exchange emulator
- multi-strategy testing
- optimization
- walk-forward
- portfolio simulation
- trading infrastructure

Do not treat it as our backend automatically.

### NOFX
Role: AI trading/execution reference.

**Source:** github.com/NoFxAiOS/nofx

Study:
- AI trading workflow
- execution architecture
- risk boundaries
- broker integration

### London Strategic Edge
Role: Product/data architecture reference.

**Source:** www.londonstrategicedge.com
**Studied:** 2026-08-22. Full import: `docs/LSE_IMPORT.md`.

What LSE is: free open-source market data platform — 403B ticks, 22,851 instruments,
27 asset classes, 208 countries, history since 1905. Parquet-first storage.
One API key for history (HTTP) + live (WebSocket) + dataset exports.

Concepts adopted into HM:
- **Parquet-first** data lake (confirms R2 + Parquet plan)
- **Three-layer data taxonomy**: Markets / Macro / Corporate & Alternative
- **Dataset builder** as a product surface (instrument × date × resolution × indicators → Parquet)
- **One-key access model**: single credential covers history + live + exports
- **Deep history targets**: 2003+ minimum, crypto 2010+, FX 1971+
- **Preview-in-place** before dataset download
- **Data Assistant** (AI chat over the databank — Phase 4 Copilot integration)
- **hm-data** open-source Python client (mirrors LSE's lse-data pattern)
- **COT data** (Commitment of Traders) as alternative data source (Phase 3)
- **Macro layer**: economic calendar, bond yields, inflation — first-class, not afterthought
- **My Layouts / My Backtests / My Alerts** — user workspace concept (saved state per user)

See `DATA.md` for the updated architecture patterns and `docs/LSE_IMPORT.md` for the
full product surface map, adoption table, and what we explicitly do not copy.

## How We Relate to External Projects

| Project | Relationship |
|---|---|
| Vibe-Trading | **BUILD ON / ADAPT** |
| OsEngine | **LEARN FROM / CONCEPTUAL REFERENCE** |
| NOFX | **LEARN FROM / CONCEPTUAL REFERENCE** |
| London Strategic Edge | **PRODUCT + DATA ARCHITECTURE REFERENCE** |
| External providers | **DATA SOURCES** |
| Our code | **ORIGINAL INTEGRATION** |

"Data layer" is an architectural concept, not a single product.

## Our Data Layer

Our canonical data layer is OUR OWN abstraction.

It must support multiple providers.

Provider ≠ canonical dataset.

All data must pass through:
Source → Ingestion → Validation → Normalization → Versioning → Storage.

"Data layer" is an architectural concept, not a single product — it is a
**data stack**, not one tool:

```text
DATA SOURCES
  ├── Exchange feeds
  ├── Broker feeds
  └── Commercial vendors
          │
          ▼
  INGESTION LAYER
  sequence/gap validation
          │
          ▼
  CANONICAL DATA
  ├── RAW
  ├── NORMALIZED
  └── DERIVED
          │
          ▼
  OBJECT STORAGE
  S3-compatible lake (Parquet/Iceberg)
          │
  ┌───────┴───────┐
  ▼               ▼
DuckDB/Polars  Feature Layer
  └───────┬───────┘
          ▼
  RESEARCH / ML / RL
          │
          ▼
  BACKTEST ENGINE
```

## Core Principle

Borrow concepts, not identity.

Every external project must be evaluated before code is adopted.

## Architecture Authority

When external repositories conflict with our architecture,
our architecture wins unless a documented ADR changes it.

## Proposed Platform Structure (Synthesis)

Our platform synthesizes the reference projects above into five layers.
Each layer names the references whose concepts inform it — the integration
itself is **OUR OWN** (ORIGINAL INTEGRATION).

```text
OUR PLATFORM
│
├── 1. DATA LAYER
│     │
│     ├── Raw market data
│     ├── Normalized canonical data
│     ├── Point-in-time datasets
│     ├── Historical data lake
│     ├── Realtime market streams
│     ├── Feature datasets
│     └── Dataset registry / provenance
│
│     Reference concepts:
│       ├── London Strategic Edge
│       ├── Vibe-Trading
│       ├── Databento-style data model
│       ├── Exchange-native feeds
│       └── Broker feeds
│
├── 2. AI RESEARCH LAYER
│     │
│     ├── Research agents
│     ├── Hypothesis generation
│     ├── Experiment management
│     ├── ML
│     ├── RL
│     ├── MCP/tools
│     └── Research memory
│
│     Reference:
│       └── Vibe-Trading
│
├── 3. QUANT ENGINE
│     │
│     ├── Strategy SDK
│     ├── Indicators
│     ├── Backtesting
│     ├── Market simulation
│     ├── Multi-strategy testing
│     ├── Portfolio simulation
│     └── Optimization / walk-forward
│
│     Reference:
│       └── OsEngine
│
├── 4. RISK + EXECUTION
│     │
│     ├── Risk engine
│     ├── OMS
│     ├── Execution gateway
│     ├── Paper trading
│     ├── Shadow trading
│     ├── Live trading
│     └── Broker reconciliation
│
│     Reference concepts:
│       └── NOFX + OsEngine
│
└── 5. PLATFORM / SaaS
      │
      ├── Multi-tenancy
      ├── Auth
      ├── Billing
      ├── Quotas
      ├── Admin
      ├── Observability
      └── Security
```

### Roadmap mapping

| Layer | Roadmap phase |
|-------|---------------|
| 1. Data | Phase 2 (canonical schema, PIT, R2+Parquet lake, dataset registry) |
| 2. AI Research | Phase 4 (hypotheses, experiment workflow, promotion ladder) |
| 3. Quant Engine | Phase 3 (strategy SDK, ExecutionInterface, walk-forward) |
| 4. Risk + Execution | Phases 6–8 (paper → controlled live) |
| 5. Platform / SaaS | Live today; Phases 9–10 (scale, expansion) |
