# DATA.md — Data Strategy

## Principle
Treat market data as a versioned product and scientific dependency, not merely an API response.

## Canonical Layers

```text
RAW
 ↓
VALIDATED RAW
 ↓
NORMALIZED
 ↓
DERIVED
 ↓
FEATURES
```

Never overwrite raw data.

## Required Metadata

Every dataset should identify:

- provider
- venue
- symbols/instruments
- asset class
- frequency
- timezone
- timestamp semantics
- coverage period
- adjustment policy
- corporate-action policy
- point-in-time capability
- license/usage rights
- version
- quality score

## Point-in-Time Requirement

For information released over time, preserve both:

- event time
- knowledge/publication time

Historical experiments must only use information that was knowable at the simulated time.

## Provider Strategy

Use multiple categories rather than one provider for everything:

- exchange-native/realtime feeds where justified
- specialized historical market-data provider
- broker-native data for execution alignment
- official macro/economic sources
- official regulatory/fundamental sources
- licensed alternative/news data only where commercially permitted

## Feed Health

Track:

- latency
- freshness
- sequence gaps
- reconnects
- dropped messages
- stale symbols
- coverage
- normalization errors

## Realtime Architecture

One upstream feed should serve many downstream users when possible.

```text
Provider
  ↓
Feed Handler
  ↓
Sequence / Quality Validation
  ↓
Canonical Stream
  ↓
Cache / Event Bus
  ↓
Fanout
  ├── Strategies
  ├── Paper trading
  ├── ML/RL inference
  └── User clients
```

## Initial Data Scope

Start narrow. Prove the data and research pipeline on one asset class before adding many markets.

The platform should not purchase large amounts of data merely because the data is available.
