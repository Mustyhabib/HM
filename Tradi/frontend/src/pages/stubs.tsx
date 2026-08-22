/**
 * Stub pages for roadmap Phase 2–8 features.
 * One file, zero per-page files — imported directly in router.tsx (no lazy needed; tiny components).
 * Each stub shows what phase the feature arrives in and what it will include.
 */
import type { LucideIcon } from "lucide-react";
import { Lock, Globe, TrendingUp, Brain, Dna, FlaskConical, ScrollText, Briefcase, Database, Layers, Radio } from "lucide-react";

function Stub({
  icon: Icon, title, phase, description, capabilities,
}: {
  icon: LucideIcon; title: string; phase: string; description: string; capabilities: string[];
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-elevated">
          <Icon className="h-9 w-9 text-muted-foreground/40" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Lock className="h-3 w-3" />
            {phase}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <ul className="space-y-1.5 text-left text-sm">
          {capabilities.map((c) => (
            <li key={c} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border/60 text-center text-[9px] leading-4">○</span>
              {c}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground/40">The live run loop never breaks — new surfaces stand up beside it (D16).</p>
      </div>
    </div>
  );
}

export function Markets() {
  return <Stub icon={Globe} title="Markets" phase="Phase 2 · Data Plane"
    description="Real-time and historical market data with canonical OHLCV streams, venue routing, and point-in-time guarantees."
    capabilities={["Live candlestick streaming (BTC, SPY, GOLD, FX)", "1D–1Y range chart with volume overlay", "Market regime indicator (bullish / neutral / bearish)", "Volatility surface and confidence score"]} />;
}

export function Strategies() {
  return <Stub icon={TrendingUp} title="Strategies" phase="Phase 3 · Quant Core"
    description="Deterministic strategy code with a versioned SDK, walk-forward validation, and an execution interface that separates signal from execution."
    capabilities={["Strategy SDK with typed signal interface", "Walk-forward and out-of-sample validation", "A/B comparison across strategy versions", "Promotion ladder: candidate → validated → paper → live"]} />;
}

export function MLStudio() {
  return <Stub icon={Brain} title="ML Studio" phase="Phase 5 · ML"
    description="Baseline-first ML with a versioned model registry, feature store integration, and MLflow experiment tracking."
    capabilities={["XGBoost, LightGBM, LSTM model training", "Feature store (canonical data pipeline)", "MLflow experiment tracking + model registry", "Walk-forward evaluation, OOS metrics"]} />;
}

export function RLStudio() {
  return <Stub icon={Dna} title="RL Studio" phase="Phase 7 · RL (Research-only)"
    description="Reinforcement learning for trading strategy research — environments, reward functions, PPO/SAC checkpoints. Research-only; no live execution."
    capabilities={["Custom trading environments (Gym-compatible)", "PPO, SAC agent training with GPU support", "Reward shaping and risk-adjusted objectives", "Checkpoint management and replay"]} />;
}

export function Backtests() {
  return <Stub icon={FlaskConical} title="Backtests" phase="Phase 3 · Quant Core"
    description="Vectorized and event-driven backtesting with point-in-time data, slippage modeling, and reproducible experiment records."
    capabilities={["Vectorized backtest engine (daily + intraday)", "Point-in-time data guarantee (no look-ahead)", "Slippage, cost model, and corporate action handling", "Reproducible: records data hash, code commit, seed"]} />;
}

export function Paper() {
  return <Stub icon={ScrollText} title="Paper Trading" phase="Phase 6 · Risk + OMS"
    description="Simulated execution on real-time market data with a full risk engine, OMS, and reconciliation — before any live capital is at risk."
    capabilities={["Paper account with simulated fills on live prices", "Risk engine: exposure limits, daily loss, max drawdown", "OMS: order intents, idempotency, state machine", "Emergency stop across all paper positions"]} />;
}

export function Portfolio() {
  return <Stub icon={Briefcase} title="Portfolio" phase="Phase 6 · Risk + OMS"
    description="Paper and live account P&L, position ledger, trade journal, and portfolio-level risk attribution."
    capabilities={["Portfolio P&L (paper + live)", "Position ledger with realized / unrealized breakdown", "Trade journal and attribution", "Drawdown waterfall and Sharpe time-series"]} />;
}

export function DataPage() {
  return <Stub icon={Database} title="Data" phase="Phase 2 · Data Plane"
    description="Canonical dataset registry with versioned OHLCV, fundamentals, and alternative data — all point-in-time and provider-agnostic."
    capabilities={["Dataset registry: provider, venue, coverage, version", "R2 + Parquet data lake with DuckDB query layer", "Ingestion pipeline: Raw → Validated → Normalized → Feature", "Feed health monitor and gap detection"]} />;
}

export function Models() {
  return <Stub icon={Layers} title="Models" phase="Phase 5 · ML"
    description="Versioned model registry with lineage from training data through feature version to deployment status."
    capabilities={["Model registry: version, status, lineage", "Feature importance and SHAP explainability", "TRAINED → VALIDATED → SHADOW → LIVE lifecycle", "MLflow artifact storage"]} />;
}

export function Live() {
  return <Stub icon={Radio} title="Live Trading" phase="Phase 8 · Execution · Mandate-gated"
    description="Controlled live execution through broker adapters — mandate-gated and off by default. A strategy must pass Research → Validate → Paper → Risk before reaching Live."
    capabilities={["Broker adapters (Alpaca first, IBKR planned)", "Mandate enforcement: Live is a promotion state, not a shortcut", "Fail-closed: stale data / recon mismatch / risk breach → block", "Full audit trail and emergency kill-switch"]} />;
}
