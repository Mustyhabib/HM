# DATA.md — Data Strategy

> **Reference:** London Strategic Edge (`docs/LSE_IMPORT.md`) is the primary product + data
> architecture reference. Patterns here are adopted from that study (2026-08-22).
> Architecture authority: our canonical layer is our own abstraction — provider ≠ canonical dataset.

---

## Principle

Treat market data as a **versioned product and scientific dependency**, not merely an API response.

One canonical data and feature layer must serve research, ML/RL, backtesting, paper trading,
and live inference wherever technically possible — no separate data definitions per environment.

---

## Storage Format (Parquet-First)

Parquet is the canonical storage format for all historical data.

- Primary storage: Cloudflare R2 (S3-compatible), files in `.parquet`
- Query layer: DuckDB / Polars (in-process, zero-copy over R2)
- CSV is a **secondary export format** — never the canonical layer
- Live data: normalized events on the internal bus; archived to Parquet on flush

---

## Data Taxonomy (Three Layers)

```text
MARKETS
  Raw price + volume across all asset classes.
  OHLCV from tick prints up to monthly candles.
  Latency: milliseconds to minutes.
  PIT: timestamp of print = knowledge time.

MACRO
  Slow-moving context: economic series, sovereign bond yields,
  currency indices, volatility surfaces, economic calendar.
  Updated daily. 220 countries.
  PIT: release date != reference date — must track both.

CORPORATE & ALTERNATIVE
  Point-in-time fundamentals, insider trades, COT positioning,
  corporate actions (dividends, splits), credit series, news.
  Strict PIT: financial statements known at filing date, not period-end.
```

Phase 2 dataset_registry.asset_class uses this taxonomy: market | macro | alternative.

---

## Canonical Layers

```text
RAW                     <- immutable; never overwritten
 |
VALIDATED RAW           <- sequence/gap/QC checks applied
 |
NORMALIZED              <- canonical OHLCV schema, timezone UTC, adj. prices
 |
DERIVED                 <- joins, cross-asset, corporate-action adjustments
 |
FEATURES                <- technical indicators, engineered signals, ML inputs
```

The pipeline is strictly additive — no layer overwrites the one above it.

---

## Dataset Builder (Product Surface, Phase 2)

Users compose datasets visually before starting a research run:

1. **Instrument selection** — Crypto / Equities / FX / Indices / Commodities / Bonds
2. **Date range + resolution** — 1Min to Daily; target 2003+ (twenty years minimum)
3. **Indicator selection** — 50+ technical indicators (RSI, MACD, BB, ATR, Ichimoku, Supertrend)
4. **Feature engineering** — Return, Log Return, Volatility, Z Score, BB %B, Drawdown, Target Direction
5. **Output** — Parquet download, or direct-to-backtest

Feature engineering is a first-class step in the builder — not an afterthought in the agent.

---

## One-Key Access Model

A single credential covers:
- Historical candles: GET /api/v1/data/candles
- Live streaming: /ws/markets
- Dataset builder exports
- Dataset registry browsing

No separate keys per surface.

---

## Dataset Registry (Phase 2 Schema)

Every dataset in the platform is registered with:

| Field | Description |
|---|---|
| provider | Source (exchange, vendor, official statistical agency) |
| venue | Exchange or venue code |
| universe | Instruments covered (JSONB list or glob pattern) |
| asset_class | market / macro / alternative |
| frequency | tick / 1min / 5min / 1h / 1d / etc. |
| timezone | Source timezone (stored UTC, timezone recorded) |
| timestamp_semantics | open / close / print / publication |
| coverage_period | ISO date range |
| adjustment_policy | split_adj / div_adj / raw / total_return |
| corporate_action_policy | How splits/dividends are handled |
| pit_capability | Boolean — does provider support PIT reconstruction? |
| license | Usage rights / redistribution constraints |
| version | Semver; bump on schema change or backfill |
| quality_score | 0-1 composite (freshness, completeness, gap rate) |
| data_hash | SHA-256 of canonical file (reproducibility gate) |
| storage_path | R2 bucket key |

---

## Point-in-Time Requirement

For information released over time, record both:

- **Event time** — the period the data describes (e.g. Q4 2025 earnings)
- **Knowledge/publication time** — when the information became available (e.g. filing date)

Historical experiments must only use information knowable at the simulated time.
Violation = look-ahead bias = contaminated research.

Macro and alternative data are the highest-risk layers for PIT violation.

---

## Deep History Targets (Phase 2)

| Asset class | Target depth | Rationale |
|---|---|---|
| Crypto | 2010+ | Exchange inception (BTC on MtGox) |
| Equities | 2000+ | Dot-com through GFC through COVID |
| FX | 1971+ | Post-Bretton Woods floating era |
| Macro / bonds | Full sovereign history | Regime context for strategy validation |
| Minimum usable | 2003+ | Twenty years of history (INFRASTRUCTURE.md target) |

Start narrow: prove the pipeline on one asset class (crypto/BTC) before expanding.

---

## Provider Strategy

Use multiple provider categories rather than one source for everything:

- Exchange-native / realtime feeds — for live execution alignment
- Specialized historical data provider — for deep backtesting history
- Broker-native data — for paper/live execution alignment
- Official macro / economic sources (central banks, IMF, BLS, ONS) — for macro layer
- Official regulatory sources (SEC EDGAR, FCA) — for fundamentals + insider data
- Alternative data — COT (CFTC), ship tracking, economic calendar, credit — Phase 3+
- Licensed commercial data — only where commercially permitted and budget justified

Do not purchase large amounts of data merely because it is available.

---

## Feed Health

Track per-instrument, per-provider:

| Metric | Alert threshold |
|---|---|
| Latency | > expected delivery window |
| Freshness | > 2x expected update frequency |
| Sequence gaps | Any gap > 1 missing bar |
| Reconnects | > 3 in 1 hour |
| Dropped messages | > 0.01% of ticks |
| Stale symbols | 24h without a print |
| Coverage | < 95% of expected instruments |
| Normalization errors | Any |

---

## Realtime Architecture

One upstream feed serves many downstream consumers:

```text
Exchange / Vendor / Broker
         |
   Feed Handler (sequence / gap / QC)
         |
  Canonical Stream (UTC, normalized OHLCV)
         |
     Event Bus (Redis Streams / NATS - Phase 6 decision)
         |
     Fanout
       |- Research agents (live context)
       |- Paper trading execution
       |- ML / RL inference
       |- Risk Monitor (dashboard widget)
       +- User WebSocket clients (/ws/markets)
```

Historical path:

```text
Canonical Stream -> Parquet flush (R2) -> DuckDB / Polars query -> Backtest / Dataset Builder
```

---

## Python Client Target (Phase 2)

Publish hm-data as an open-source Python client — developer acquisition channel:

```python
pip install hm-data

from hmdata import QuantLab
client = QuantLab(api_key="your_quantlab_key")

# historical candles
candles = client.candles("BTC/USD", "1d", start="2024-01-01")

# live streaming
for tick in client.stream(["BTC/USD", "ETH/USD"]):
    print(tick.symbol, tick.price, tick.timestamp)
```

Same key as the QuantLab platform. Mirrors the LSE lse-data client pattern.
Open-source; leads data-focused users to the QuantLab platform.

---

## What Changes at Each Phase

| Phase | Data deliverable |
|---|---|
| 0 (now) | Engine's own loaders — no canonical layer |
| 2 | Canonical schema, dataset_registry, Parquet lake (R2), dataset builder UI, DuckDB query, feed health |
| 3 | COT data integration, cross-asset derived features |
| 4 | AI Research Copilot wired to dataset registry (agents recommend datasets) |
| 5 | Feature store wired to ML training pipeline |
| 6 | Real-time bus fully live; paper/live feed alignment |
