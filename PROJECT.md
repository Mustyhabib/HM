# PROJECT.md — Product Definition

## Working Name
Quant Research OS

## Product Vision
A web-first, multi-user quantitative research and trading platform that unifies:

- AI research agents
- canonical market data
- strategy development
- ML/RL experimentation
- realistic backtesting
- paper trading
- risk controls
- controlled live execution
- portfolio/accounting
- observability
- auditability
- usage-aware billing

## Inspiration / Existing Foundations

### Vibe-Trading
Primary source of ideas and reusable foundations for:

- AI research agents
- skills/tools
- multi-agent research
- memory/session concepts
- data routing/fallback concepts
- backtesting foundations
- research workflows
- MCP/tool integration

### OsEngine
Architectural inspiration for:

- deterministic quant engine
- strategy SDK
- exchange emulation
- multi-strategy testing
- optimization/walk-forward workflows
- portfolio simulation
- AI-to-quant tool integration

Do not assume OsEngine code can be commercially embedded. Review its license before reusing source code.

### NOFX
Architectural inspiration for:

- AI trader runtime concepts
- hard execution/risk boundaries
- broker/exchange connector patterns
- strategy/trader lifecycle

NOFX uses Go and is AGPL-3.0. Prefer reimplementing concepts in the platform’s primary Python backend unless a deliberate legal/architectural decision says otherwise.

### London Strategic Edge
Product/data-platform inspiration for:

- data-first philosophy
- historical + realtime market-data consistency
- data lake patterns
- terminal/workspace design
- ML studio concepts
- WebSocket-first experiences

## Primary Product Model

The platform is a pipeline:

**Question → Research → Hypothesis → Experiment → Validation → Backtest → Paper → Promotion → Live → Reconciliation → Feedback**

The platform should also support the inverse loop:

**Observed performance → diagnostics → new research → new experiment**

## Primary Users

1. Quant/research user — explores data, builds strategies and experiments.
2. Strategy developer — creates deterministic, ML, RL or hybrid strategies.
3. Trader — monitors paper/live portfolios, signals and risk.
4. Team/organization — collaborates on datasets, models, strategies and experiments.
5. Platform admin — manages tenants, quotas, billing, infrastructure, security and system health.

## Web-First Product

The primary product is a browser application/PWA.

Desktop packaging may be added later using a lightweight shell such as Tauri if real native requirements emerge.

Live execution must continue server-side even when the user closes the browser.
