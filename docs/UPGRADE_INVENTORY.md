# UPGRADE_INVENTORY.md — Phase 0 module inventory (2026-08-21)

> **Purpose:** the file-level/matrix blueprint for the Quant Research OS upgrade
> (`UPGRADE_ROADMAP.md`). Grounded in an actual tree scan of `/home/aurora/HM`
> (2026-08-21) — every row below was verified against files on disk, not READMEs.
> **Review gate (R2-Q1):** reviewed by the user before Phase 1 starts.
> **Depth:** module-level for the vendored engine (869 py files / ~30 modules /
> 78 tools / 90 skills / 30 swarm presets); file-level for our code.

Legend: **KEEP** · **MODIFY** (adapt in place) · **EXTRACT** (wrap/expose behind an
interface) · **NEW** (platform-owned) · decision is for the phase named.

---

## A. Engine — `Tradi/agent/src` (vendored Vibe-Trading, MIT)

| Module | Current purpose (from code) | Decision | Target role | Phase |
|---|---|---|---|---|
| `agent/` (loop, tools, skills, memory, context, grounding, trace, progress) | ReAct agent loop + tool/skill execution | **KEEP** | Research brain | 0 |
| `api/` (21 files: runs, qveris, live, swarm, attribution, options, scheduled, settings routes) | Engine's own FastAPI server | **KEEP** (engine-internal) | Dev/local + worker subprocess use; **NOT** exposed to the multi-tenant web. Platform FastAPI is a separate app (NEW) | 0 |
| `channels/` (23 files: msteams, whatsapp, email, wecom, weixin, feishu, websocket) | Personal delivery channels | **KEEP** (engine-internal) | Agent-side delivery; not a platform feature | 0 |
| `channelsui/` (gateway_services, mcp_presets_api, transcription, cli_apps_api) | Engine UI/gateway services | **KEEP** | Engine services | 0 |
| `config/` · `core/` · `entities/` | Paths, limits, schema, state, runner, data entities | **KEEP** | Engine foundations | 0 |
| `factors/` (registry, base, bench_runners, factor_analysis_core, compare_runner) | Alpha/factor system + benchmarking | **KEEP → EXTRACT** | Alpha/factor research surface (Alpha Zoo platform-side later) | 3 |
| `goal/` | Goal store/context/policy | **KEEP** | Engine goals | 0 |
| `governance/` (ledger.py, manifest.py) | Research governance ledger (agent-side) | **KEEP** (agent-side scratch) | Per R2-Q2: platform registry is canonical; engine copy stays agent-side | 0 |
| `hypotheses/` (registry.py, cli_handlers.py) | Hypothesis registry (agent-side, SQLite) | **KEEP** (agent-side) | Feeds the platform registry via worker provenance (Phase 1) / research workflow (Phase 4) | 4 |
| `live/` (order_guard, sdk_order_gate, halt, audit, enforcement, classification) | **Bounded-live controls already exist** | **KEEP → MODIFY** | Execution-boundary inputs for Phase 6/8 risk/OMS | 6 |
| `memory/` (persistent, hierarchy, search_index, semantic_links, compression) | Research memory | **KEEP** | Research memory | 0 |
| `openbb_bridge/` (adapter, routes, context_injector) | OpenBB data bridge | **KEEP** | Data bridge (engine) | 0 |
| `providers/` (llm.py, chat, capabilities, content_filter, copilot_auth, openai_codex) | LLM provider layer (BYOK path) | **KEEP** | LLM layer | 0 |
| `quantlib/` (risk, crossvalidation, multipletesting, var_backtest, performance, eventstudy, options, attribution, fundmath, credit, impact) | **Quant library — validation + risk + stats** | **KEEP → EXTRACT** | Platform validation harness (Phase 3 rigor: OOS, multiple testing, walk-forward) — highest-reuse asset | 3 |
| `scheduled_research/` (executor, verdict, playbooks, store) | Research Autopilot | **KEEP → MODIFY** | Scheduled research / autopilot | 4 |
| `security/` (network, workspace_access, scanner, workspace_policy) | Engine sandboxing | **KEEP** | Engine security | 0 |
| `session/` (store, events, search, goal_state, webui_turns) | Sessions | **KEEP** | Research sessions | 0 |
| `shadow_account/` (backtester, reporter, extractor, scanner, codegen, storage) | Shadow Account — **already platform-integrated** | **KEEP** | Shadow Account (shipped) | 0 |
| `strategy_discovery/` (evidence_harness, evidence_store, guard, facade) | Strategy evidence/discovery | **KEEP** (agent-side) | Research discovery; evidence may feed registry later | 4 |
| `strategy_store/` (sqlite_store, metrics, decay, models) | Strategy store (per-run SQLite) | **KEEP** (agent-side scratch) | Per-run isolated HOME ⇒ not persistent; platform registry canonical | 0 |
| `swarm/` (runtime, worker, task_store, presets, grounding) | Multi-agent orchestration (30 presets) | **KEEP** | Research multi-agent | 0 |
| `tools/` (78 files: hypothesis_tool, alpha_bench_tool, qveris_tool, research_papers, fundamentals, cashflow, alpha_zoo, remember, edit_file…) | Research tools | **KEEP** | Research tools | 0 |
| `trading/` (types, profiles, service, tap_forward) + `connectors/` | Broker/account abstraction | **KEEP → MODIFY** | Execution foundation (Phase 6 wraps behind Risk→OMS) | 6 |
| `utils/`, `market_data.py`, `preflight.py`, `ui_services.py` | Utilities / preflight | **KEEP** | 0 |

## B. Engine backtest layer — `Tradi/agent/backtest`

| Component | Count | Decision | Target role | Phase |
|---|---|---|---|---|
| `engines/` (base, crypto, forex, global_equity, global_futures, china_a, india_equity, korea_equity, vietnam_equity, options_portfolio, composite, futures_base…) | 16 | **KEEP → EXTRACT** | Behind the common `ExecutionInterface` (BacktestExecutor) | 3 |
| `loaders/` (binance, ccxt, okx, yfinance, yahoo, tushare, akshare, eastmoney, finnhub, fmp, stooq, tiingo, sec_edgar_client, futu, mt5, longbridge, local_loader…) | 40 | **KEEP** | Market-data RAW sources. **Phase 2 reuses only the crypto chain** (okx / binance / ccxt fallback) per R2-Q7 | 2 |
| `optimizers/` (mean_variance, risk_parity, max_diversification, equal_volatility, turnover_aware) | 7 | **KEEP → EXTRACT** | Portfolio optimization | 3 |
| `validation.py` · `run_card.py` · `metrics.py` · `regime.py` · `risk_xray.py` · `correlation.py` · `constraints.py` · `benchmark.py` | — | **KEEP** | Validation-harness assets; Phase 3 wires them into the experiment registry | 3 |

## C. Engine top-level — `Tradi/agent`

| File / dir | Decision | Notes | Phase |
|---|---|---|---|
| `api_server.py` / `mcp_server.py` | **KEEP** | Engine API + MCP server (dev/local; worker invokes CLI, not API) | 0 |
| `cli/` (commands, `_legacy.py`, intro, input, completer) | **KEEP** | `vibe-trading run -p … --json --no-rich` is the worker's invocation | 0 |

## D. Our code (platform-owned)

| Path | Decision | Target role | Phase |
|---|---|---|---|
| `vibe-trading-saas/worker/` (main, runner, artifacts, db, config, progress, health, sentry, logging_config) | **KEEP → MODIFY** | Compute-plane runner; **gains provenance capture** (R2-Q5: worker emits lifecycle + input hashes) | 1 |
| `vibe-trading-saas/worker/tests/` (9 files, 74 tests) | **KEEP → EXTEND** | + provenance tests | 1 |
| `Tradi/frontend/src/` — pages (25), components, lib (28), hooks, types, router, i18n | **KEEP → MODIFY** | Platform UI; research-registry UI = Phase 4 (capture-first, R2-Q6) | 0/4 |
| `supabase/functions/` (paystack-init, paystack-webhook) | **KEEP** | Billing edge; `stripe-*` **NEW deferred** until entity/Atlas (R1-Q6) | 0 |
| `vibe-trading-saas/db/migrations/` (9 files) | **KEEP → EXTEND** | New migrations (manual-apply convention): registry + projects + provenance (Phase 1) | 1 |
| `infra/` (nginx, tradi-api) | **KEEP** | Verify `tradi-api` service actually runs (pending fact — Railway access) | 0 |
| `Dockerfile` + `railway.toml` | **MODIFY** | Second process in the same container: uvicorn + worker loop (R1-Q4) | 1 |
| `scripts/` (paystack-e2e, paystack-fixtures, email-templates-check) | **KEEP** | Launch/test tooling | 0 |
| `samples/` (gen_shadow_journal.py, shadow_journal_sample.csv) | **KEEP** | Demo data | 0 |
| `docs/` (LAUNCH_CHECKLIST, RAILWAY_DEPLOY, CLOUDFLARE_SETUP) | **KEEP → UPDATE** | Ops docs (LAUNCH_CHECKLIST refreshed 2026-08-21) | 0 |
| Constitution + roadmap (SOUL/PROJECT/DATA/ARCHITECTURE/WORKFLOW/UPGRADE_ROADMAP/CLAUDE) | **KEEP** | Done | 0 |

## E. NEW — platform-owned (not yet built)

| Piece | Where | Phase |
|---|---|---|
| **FastAPI modular monolith** — Research domain only: hypotheses / experiments / dataset_registry / promotion_events APIs + provenance API + health; Supabase JWT auth | Same Railway container, second process (R1-Q4) | 1 |
| **Registry tables** (hypotheses, experiments, dataset_registry, promotion_events + provenance fields) — Supabase Postgres, RLS, tenant-scoped | `vibe-trading-saas/db/migrations/` | 1 |
| **`projects` table + auto-created default** per user | Supabase | 1 |
| **Provenance capture** — worker-side (lifecycle + hashes) AND FastAPI-side (API events) | worker + FastAPI | 1 |
| **Redis skeleton** (Upstash free) — queue/cache, minimal + measured | new env/conn | 1 |
| **Data lake + catalog** — Supabase Storage first; RAW→VALIDATED→NORMALIZED→FEATURE + PIT + quality score; R2 later (R2-Q8) | Supabase Storage | 2 |
| **ExecutionInterface** (backtest/paper/live executors) | platform quant core | 3 |
| Risk engine · OMS · reconciliation | platform | 6 |
| ML platform · model registry | platform | 5 |
| RL environments (research-only) | platform | 7 |

## F. Migration order

1. **Phase 0 (now):** this inventory + branch strategy (`upgrade/phase-1-*` feature branches; docs on main). No code changes.
2. **Launch (current stack):** close the launch gates (LAUNCH_CHECKLIST.md) — Paystack live switch, Resend email, keepalive, cleanup. **No upgrade code ships before launch** (R1-Q1).
3. **Phase 1:** migrations (projects + registry + provenance) → worker provenance capture → FastAPI research domain → container 2-process → Redis skeleton. Gate = all six done-criteria.
4. **Phase 2+:** per roadmap.

## G. Dependencies & risks

- **Vendored engine:** upstream HKUDS syncs can overwrite `Tradi/` — keep the vendored-engine-sync discipline; never hand-patch engine internals without a sync-aware path.
- **Two FastAPI servers:** the engine's `api/` must stay out of the multi-tenant web path (worker subprocess only); the platform FastAPI is the only web-exposed API after Phase 1.
- **quantlib/ is the biggest reuse asset** — Phase 3 validation should wrap it before building anything from scratch.
- **loaders (40) ≠ platform data:** Phase 2 consumes only the crypto chain; the catalog records licensing for anything redistributed.
- **`live/` controls already exist engine-side** — Phase 6 should lift/reuse their semantics (order guards, halt, audit) rather than reinvent.
