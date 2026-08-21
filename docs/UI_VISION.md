# UI_VISION.md — QuantLab Product UI Vision (Proposed)

> **Status:** PROPOSED (2026-08-21). The target user-facing product surface
> for Quant Research OS. Two apps: **QUANTLAB** (user) and **QUANTLAB ADMIN**
> (platform operations). Mockups below are the spec — preserved verbatim from
> the design session. Companion docs: [[FOUNDATIONS.md]] (identity),
> [[INFRASTRUCTURE.md]] (architecture), [[WORKFLOW.md]] (pipeline),
> [[ARCHITECTURE.md]] (domains). MVP-era prompt (H~M brand, Vibe-Trading
> surface) remains in `Design_Flow_Prompt.md` for reference — this supersedes it.

> **Design-system rule (locked):** ONE design system, ONE palette, ONE
> typography. Never propose alternatives, never lighten the dark theme.
> See wiki [[design-system]] for tokens.

## 1. QUANTLAB — User App

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ QUANTLAB        Search markets, strategies, research...     ● LIVE   👤 Musty │
├───────────────┬──────────────────────────────────────────────────────────────┤
│               │                                                              │
│  OVERVIEW     │  GOOD AFTERNOON, MUSTY                                      │
│               │  Here's what's happening across your research & portfolio.  │
│  📊 Dashboard │                                                              │
│               │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│  🌎 Markets   │  │ Portfolio  │ │ Today P&L  │ │ Sharpe     │ │ Drawdown   ││
│               │  │ $125,420   │ │ +$1,284    │ │ 1.87       │ │ -4.2%      ││
│  🤖 Research  │  │ +18.4%     │ │ +1.03%     │ │            │ │ ● Healthy  ││
│               │  └────────────┘ └────────────┘ └────────────┘ └────────────┘│
│  📈 Strategies│                                                              │
│               │ ┌─────────────────────────────────┐ ┌─────────────────────┐│
│  🧠 ML Studio │ │                                 │ │   AI RESEARCH COPILOT││
│               │ │          MARKET CHART            │ │                     ││
│  🧬 RL Studio │ │                                 │ │  "What would you      ││
│               │ │       BTC / USD                 │ │   like to research?" ││
│  🧪 Backtests │ │                                 │ │                     ││
│               │ │   Candlesticks                 │ │  > Analyze BTC       ││
│  📝 Paper     │ │   ───────────────              │ │  > Find opportunities││
│               │ │      ╱╲    ╱╲                  │ │  > Build strategy    ││
│  💼 Portfolio │ │  ╱╲╱  ╲╱╲╱  ╲                 │ │  > Run backtest      ││
│               │ │                                 │ │                     ││
│  🗄 Data      │ │  1D  1W  1M  3M  1Y           │ │  Ask anything...     ││
│               │ └─────────────────────────────────┘ └─────────────────────┘│
│  🧠 Models    │                                                              │
│               │ ┌──────────────────────────────────────────────────────────┐│
│  📡 Live      │ │ STRATEGY MONITOR                                         ││
│               │ ├────────────┬───────┬────────┬──────────┬────────┬────────┤│
│               │ │ Strategy   │ Asset │ Mode   │ Signal   │ P&L    │ Status ││
│               │ ├────────────┼───────┼────────┼──────────┼────────┼────────┤│
│               │ │ Momentum   │ BTC   │ PAPER  │ BUY      │ +8.2%  │ ●      ││
│               │ │ Gold-RL    │ GOLD  │ PAPER  │ HOLD     │ +4.7%  │ ●      ││
│               │ │ MeanRev    │ SPY   │ BACKTEST│ SELL    │ +12.1% │ ●      ││
│               │ └────────────┴───────┴────────┴──────────┴────────┴────────┘│
│               │                                                              │
│  ⚙ Settings  │ ┌───────────────────────┐ ┌────────────────────────────────┐│
│               │ │ RISK MONITOR          │ │ MARKET REGIME                 ││
│               │ │                       │ │                                ││
│               │ │ Exposure     42%      │ │ BTC      ▲ Bullish             ││
│               │ │ Daily Loss   1.2%     │ │ SPY      → Neutral             ││
│               │ │ Max Drawdown 4.2%     │ │ GOLD     ▲ Trending            ││
│               │ │                       │ │ EURUSD   ▼ Bearish             ││
│               │ │ ● RISK NORMAL         │ │                                ││
│               │ │                       │ │ Volatility: HIGH               ││
│               │ │ [ EMERGENCY STOP ]    │ │ Confidence: 78%                ││
│               │ └───────────────────────┘ └────────────────────────────────┘│
│               │                                                              │
│               │ ┌─────────────────────────┐ ┌──────────────────────────────┐│
│               │ │ RECENT RESEARCH         │ │ ML / RL EXPERIMENTS          ││
│               │ │                         │ │                              ││
│               │ │ BTC volatility study   │ │ PPO v12     Training  ████░  ││
│               │ │ Gold regime analysis   │ │ XGBoost v8  Completed ✓      ││
│               │ │ SPY factor research    │ │ LSTM v4     Evaluating...     ││
│               │ │                         │ │                              ││
│               │ │ View all →             │ │ View experiments →           ││
│               │ └─────────────────────────┘ └──────────────────────────────┘│
└───────────────┴──────────────────────────────────────────────────────────────┘
```

### User nav → platform layer mapping

| Nav item | Platform layer (FOUNDATIONS) | Roadmap phase |
|----------|------------------------------|---------------|
| 📊 Dashboard | All (composite) | Today |
| 🌎 Markets | Data plane (markets, streams) | Phase 2 |
| 🤖 Research | AI Research layer (agents, copilot) | Phase 4 (agents today via engine) |
| 📈 Strategies | Quant Core (strategy SDK) | Phase 3 |
| 🧠 ML Studio | ML | Phase 5 |
| 🧬 RL Studio | RL (research-only) | Phase 7 |
| 🧪 Backtests | Testing Engine (backtest/emulator/portfolio) | Phase 3 |
| 📝 Paper | Risk + Execution (paper) | Phase 6 |
| 💼 Portfolio | Portfolio (accounts, P&L, ledger) | Phase 6 |
| 🗄 Data | Data plane (registry, datasets, provenance) | Phase 2 |
| 🧠 Models | ML registry | Phase 5 |
| 📡 Live | Risk + Execution (live, mandate-gated) | Phase 8 |
| ⚙ Settings | Platform | Today |

### Dashboard widgets → domain

| Widget | Domain | Notes |
|--------|--------|-------|
| Portfolio / Today P&L / Sharpe / Drawdown | Portfolio | P&L, risk stats |
| Market chart (BTC/USD) | Data plane | Candlesticks, ranges 1D–1Y |
| AI Research Copilot | Research | Natural-language research entry (the service loop) |
| Strategy Monitor | Strategies + Risk | Mode column shows PAPER/BACKTEST/LIVE per strategy |
| Risk Monitor | Risk | Exposure, daily loss, max DD, EMERGENCY STOP |
| Market Regime | Data plane (features) | Regime + volatility + confidence |
| Recent Research | Research | Research reports |
| ML/RL Experiments | ML/RL | Training progress, status |

## 2. QUANTLAB ADMIN — Platform Ops App

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ QUANTLAB ADMIN                         SYSTEM ● HEALTHY     Admin 👤          │
├────────────────┬─────────────────────────────────────────────────────────────┤
│                │                                                             │
│ CONTROL        │ PLATFORM OVERVIEW                                          │
│                │                                                             │
│ 🏠 Overview    │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│                │ │ USERS    │ │ ACTIVE   │ │ RESEARCH │ │ REVENUE  │       │
│ 👥 Users       │ │ 12,482   │ │ 1,842    │ │ 3,921    │ │ $18.4K   │       │
│                │ │ +8.2%    │ │ sessions │ │ jobs     │ │ / month  │       │
│ 🏢 Organizations│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                │                                                             │
│ 💳 Billing     │ ┌───────────────────────┐ ┌─────────────────────────────┐ │
│                │ │ INFRASTRUCTURE        │ │ SYSTEM HEALTH               │ │
│ 🖥 Infrastructure│                       │ │                             │ │
│                │ │ AWS       $142        │ │ API        ● HEALTHY        │ │
│ 🗄 Database    │ │ Cloudflare $8         │ │ Database   ● HEALTHY        │ │
│                │ │ Storage   $11          │ │ Redis      ● HEALTHY        │ │
│ 🤖 AI / Models │ │ GPU       $24          │ │ Workers    ● HEALTHY        │ │
│                │ │ LLM       $38          │ │ WebSocket  ● HEALTHY        │ │
│ 📊 Data        │ │                         │ │                             │ │
│                │ │ TOTAL     $223         │ │ Uptime     99.97%           │ │
│ 📡 Monitoring  │ │ Budget    $250          │ │                           │ │
│                │ │ ████████████████░░ 89% │ │                             │ │
│ 🔐 Security    │ └───────────────────────┘ └─────────────────────────────┘ │
│                │                                                             │
│ 📜 Audit Logs  │ ┌─────────────────────────────────────────────────────────┐│
│                │ │ ACTIVE JOBS                                              ││
│ ⚙ Settings     │ │                                                         ││
│                │ │ RL Training     PPO-v18      GPU     62%     Running    ││
│                │ │ Backtest        BTC Alpha    CPU     31%     Running    ││
│                │ │ Dataset         SP500        CPU     18%     Processing ││
│                │ │ Research        Gold         LLM     --      Running    ││
│                │ └─────────────────────────────────────────────────────────┘│
│                │                                                             │
│                │ ┌───────────────────────┐ ┌─────────────────────────────┐ │
│                │ │ SECURITY              │ │ TRADING CONTROL             │ │
│                │ │                       │ │                             │ │
│                │ │ Failed logins   12    │ │ Paper Accounts  1,421       │ │
│                │ │ API attacks     3     │ │ Live Accounts      27       │ │
│                │ │ Suspicious      1 ⚠   │ │ Open Orders       143       │ │
│                │ │                       │ │                             │ │
│                │ │ [Security Center]     │ │ [Trading Control]           │ │
│                │ └───────────────────────┘ └─────────────────────────────┘ │
└────────────────┴─────────────────────────────────────────────────────────────┘
```

### Admin nav → domain

| Nav item | Domain |
|----------|--------|
| 🏠 Overview | Platform (composite) |
| 👥 Users / 🏢 Organizations | Platform (tenancy) |
| 💳 Billing | Platform (billing/quotas) |
| 🖥 Infrastructure / 🗄 Database | Platform (ops) |
| 🤖 AI / Models | ML/RL |
| 📊 Data | Data plane |
| 📡 Monitoring | Observability (Phase 9) |
| 🔐 Security / 📜 Audit Logs | Platform (audit) |

### Admin widgets → notes

- **Infrastructure panel** shows per-provider cost vs budget — targets the
  Phase 9 scale/metered-billing model (AWS/GPU/LLM rows imply the expanded
  target stack, not today's Railway/Supabase setup).
- **System Health** — API/Database/Redis/Workers/WebSocket, uptime: maps to
  observability (Prometheus/Grafana, Phase 9).
- **Active Jobs** — RL training (GPU), backtests (CPU), dataset processing,
  research (LLM): the WORKFLOW.md pipeline made visible.
- **Trading Control** — paper vs live accounts, open orders: maps to
  Risk + OMS + Execution (Phases 6–8); mandate-gated.

## 3. Brand Note (open question)

The mockups brand the app **QUANTLAB**. Current CLAUDE.md customer-facing
brand is **H~M Trading Institute** (never "Vibe-Trading"). Decision needed:
is QuantLab the product/app name *within* the H~M Trading Institute brand
(e.g. "H~M Trading Institute — QuantLab"), or a rename? UI tokens follow
wiki [[design-system]] either way (dark navy, blue→violet gradient, Inter +
JetBrains Mono). This affects the Design_Flow_Prompt.md brand block before
any design work starts.

## 4. Relationship to Existing Surface

Today's live SPA (Tradi/frontend) covers a subset: Dashboard, Agent launcher,
RunView, Signals, Settings, admin routes. The QuantLab vision is the target
composite surface — Phase 1+ builds the backend it needs; the SPA is the
strangler-fig base it grows from (D16: the live run loop never breaks).
