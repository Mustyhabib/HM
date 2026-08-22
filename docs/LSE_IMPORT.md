# LSE_IMPORT.md — London Strategic Edge: Formal Study & Concept Import

> **Status:** Adopted 2026-08-22.
> **Source:** www.londonstrategicedge.com — "The Largest Free Archive of Market Data"
> **Role in HM:** PRODUCT + DATA ARCHITECTURE REFERENCE (per FOUNDATIONS.md §2).
> **Rule:** Borrow concepts, not identity. Every pattern below is adopted as an
> architectural principle, not as a code copy. HM's data layer is our own abstraction.

---

## 1. What LSE Is

London Strategic Edge is a free, open-source market data platform and research environment:

| Stat | Value |
|---|---|
| Recorded ticks | 403B+ |
| Instruments & series | 22,851 |
| Asset classes | 27 |
| Countries | 208 |
| History | Since 1905 |
| Storage format | Parquet (primary) |
| Access model | One API key: history + live + export |

**Product tagline:** "Built by quants. For traders."

---

## 2. Product Surface Map

```text
DATABANK
  ├── Browse catalogue (preview in-place)
  ├── Download → Parquet
  ├── HTTP API (candles, series, options, reference)
  ├── WebSocket (live ticks, same key)
  ├── Dataset Builder (instrument × date × resolution × indicators → CSV/Parquet)
  └── Data Assistant (AI chat: "which bond yield series are available?")

MARKETS
  ├── Stocks, ETFs, FX, FX derivatives
  ├── Crypto, Options (full chain + greeks + IV)
  ├── Indices, Commodities, Futures

MACRO
  ├── Economics (18,694 series, 220 countries — updated daily)
  ├── Bond Yields (sovereign by country + maturity)
  ├── Currency Index
  └── Volatility

CORPORATE & ALTERNATIVE
  ├── Fundamentals (110k+ financial statements)
  ├── Insider Trading
  ├── COT Data (Commitment of Traders — futures positioning)
  ├── Dividends + Stock Splits
  ├── Economic Calendar
  └── Credit Series

BACKTESTING
  ├── Automated backtester
  ├── Manual backtester
  └── ML backtester

TOOLS
  ├── Machine Learning (25 models, train in browser)
  ├── Model Visualisation
  ├── Screeners (stock, fundamentals, insider, dividends)
  ├── Heatmap + Correlations
  └── Ship Tracking (alternative data)

MY ACCOUNT (user workspace)
  ├── Dashboard
  ├── My Layouts (saved chart configurations)
  ├── My Backtests (saved backtest results)
  ├── My Alerts (price/signal alerts)
  └── Databank (personal data catalogue)

EDUCATION
  ├── Parquet → CSV guide
  ├── Load in Python guide
  ├── Train a model guide
  └── Stream live prices guide
```

---

## 3. Data Architecture Patterns (import to HM Phase 2)

### 3.1 Parquet-First Storage

LSE stores all data as Parquet and makes Parquet the primary download format.
This **validates** HM's planned R2 + Parquet data lake (INFRASTRUCTURE.md, Phase 2).

**HM adoption:** R2 + Parquet as primary storage. DuckDB for in-process querying.
CSV is a secondary export format, not the canonical layer.

### 3.2 One-Key Unified Access

Same API key for:
- Historical candles over HTTP
- Live streaming over WebSocket
- Dataset builder exports

**HM adoption:** Phase 2 data plane should expose one credential that covers:
`GET /api/v1/data/candles` (history) + `/ws/markets` (live) + dataset export.
No separate keys per service.

### 3.3 Dataset Builder as a Product Surface

LSE's dataset builder lets users:
1. Select instruments (Stocks / Crypto / Forex / ETFs / Indices / Commodities)
2. Set date range and resolution (1Min → Daily)
3. Select technical indicators (50+ including RSI, MACD, BB, ATR, Ichimoku, etc.)
4. Select feature engineering outputs (Return, Log Return, Volatility, Z Score, BB %B, etc.)
5. Download as CSV with timestamp + OHLCV + selected columns

**HM adoption (Phase 2 Data page):** Dataset builder UI in the `/data` page.
Users compose a dataset visually → download Parquet for offline research or send to backtest.
Feature engineering baked into the builder (not a separate step).

### 3.4 Data Taxonomy (three-layer)

```text
MARKETS
  Raw price + volume data across all asset classes.
  OHLCV from trade prints up to monthly candles.

MACRO
  Slow-moving context: economic series, bond yields,
  currency index, volatility surfaces.
  Updated daily.

CORPORATE & ALTERNATIVE
  Point-in-time fundamentals, insider data, COT,
  corporate actions, economic calendar.
  Requires PIT handling (know-at time ≠ publish time).
```

**HM adoption:** Phase 2 dataset_registry.asset_class uses this three-layer taxonomy:
`market | macro | alternative`. Each layer has different latency, PIT requirements, and
storage policies.

### 3.5 Preview-in-Place Before Download

Users can preview any dataset in the browser before downloading.

**HM adoption:** Dataset registry UI shows a 10-row preview of any dataset before
the user starts a research run against it. Reduces wasted agent runs on bad data.

### 3.6 Data Assistant (AI Interface to the Databank)

LSE has an AI chat interface embedded in the databank:
- "What crypto candle data do you have?"
- "How far back does AAPL 1-minute history go?"
- "Which bond yield series are available?"

The AI answers with code to pull the data.

**HM adoption (Phase 4):** The AI Research Copilot (`/agent`) gains dataset-awareness.
Research agents can query the dataset registry and recommend datasets before starting a run.
Phase 2 lays the registry; Phase 4 wires the Copilot to it.

### 3.7 Deep History Ambition

LSE offers data since 1905. This sets the market standard for backtesting depth.

**HM adoption:** Phase 2 data plane targets:
- Crypto: 2010+ (exchange inception)
- Equities: 1990+ (20+ years minimum)
- FX: 1971+ (post-Bretton Woods floating era)
- Macro/bonds: full sovereign yield history

Start with 2003+ (aligns with INFRASTRUCTURE.md "twenty years of history" target).

---

## 4. Product Features to Adopt (by phase)

| Feature | LSE reference | HM phase | Notes |
|---|---|---|---|
| Parquet data lake | Parquet-first storage | Phase 2 | Already planned; confirmed by LSE |
| Dataset builder UI | Dataset Builder product surface | Phase 2 | `/data` page (stub exists) |
| One-key access | Unified API key | Phase 2 | Single credential, history + live |
| Instrument registry | Databank catalogue | Phase 2 | `dataset_registry` table |
| Preview-in-place | In-browser dataset preview | Phase 2 | 10-row preview before run |
| Feature engineering | Builder's indicator selection | Phase 2 | 50+ indicators baked in |
| Macro data layer | Economics / bonds / vol | Phase 2 | Separate macro schema |
| COT data | Commitment of Traders | Phase 3 | Alternative data for futures |
| Economic calendar | Calendar data source | Phase 2 | Macro events for research |
| My Backtests | Saved backtest workspace | Phase 3 | Per-user backtest persistence |
| My Alerts | Price/signal alerting | Phase 6 | After paper trading lands |
| Data Assistant AI | AI chat over databank | Phase 4 | Research Copilot + registry |
| Model Visualisation | ML model inspection | Phase 5 | ML Studio surface |
| Insider trading | Alternative data | Phase 2+ | Regulatory data feed |
| COT positioning | Alternative data | Phase 3 | Futures positioning context |
| Ship tracking | Alternative data | Phase 4+ | Macro signal source |

---

## 5. Python Client Pattern (lse-data → hm-data)

LSE's Python client:
```python
pip install lse-data

from lse import LSE
client = LSE(api_key="your_key")

# stream live ticks over websocket
for tick in client.stream(["BTC/USD", "AAPL"]):
    print(tick.symbol, tick.price)

# download history over HTTP
candles = client.candles("BTC/USD", "1d", start="2026-01-01")
```

**HM adoption (Phase 2):** Publish `hm-data` as an open-source Python client:
```python
pip install hm-data   # or: pip install quantlab-data

from hmdata import QuantLab
client = QuantLab(api_key="your_key")   # same key as platform

candles = client.candles("BTC/USD", "1d", start="2024-01-01")
for tick in client.stream(["BTC/USD", "ETH/USD"]):
    print(tick)
```

This doubles as a developer acquisition channel (open-source, free, leads users to QuantLab).

---

## 6. What We Do NOT Adopt

| LSE pattern | Why we don't copy |
|---|---|
| Free / open data model | HM is commercial SaaS; data is a competitive moat |
| 403B tick archive from day one | Start narrow (Phase 2), prove the pipeline |
| 27 asset classes at launch | Phase 2 = crypto + equities first; expand to FX, bonds, futures by Phase 3 |
| Browser-based ML training | Our ML runs server-side (Phase 5) for reproducibility + provenance |
| Ship tracking at launch | Alternative data is Phase 4+ |

The rule: borrow concepts, not scope. LSE is a reference for *what the destination looks like*,
not a feature checklist to implement immediately.

---

## 7. Impact on Existing Architecture Docs

| Doc | Change triggered by this import |
|---|---|
| `DATA.md` | Add: Parquet-first rule, three-layer taxonomy (market/macro/alternative), dataset builder as product surface, deep history targets, one-key access model |
| `ARCHITECTURE.md` | No structural change — confirms existing Phase 2 data plane plan |
| `INFRASTRUCTURE.md` | No change — R2 + Parquet already confirmed |
| `UPGRADE_ROADMAP.md` | Phase 2 deliverable list: add dataset builder UI, macro layer, COT, economic calendar |
| `UNIFIED_SPEC.md` | No change — spec already references LSE as a data model source |
| `FOUNDATIONS.md` | LSE section: update with this study's summary |

See DATA.md for the updated architecture patterns.
