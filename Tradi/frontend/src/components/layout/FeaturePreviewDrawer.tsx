/**
 * FeaturePreviewDrawer — slide-in panel that showcases roadmap features.
 *
 * Opens when the user clicks a locked nav item (Markets, Strategies, etc.).
 * Content is a horizontal carousel — one card per upcoming feature — with
 * prev / next buttons, dot indicators, and keyboard arrow / Escape support.
 *
 * The stub page routes (/markets, /strategies, …) remain intact for direct
 * URL access; this drawer is the in-app discovery surface.
 */

import { useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  Globe,
  TrendingUp,
  Brain,
  Dna,
  FlaskConical,
  ScrollText,
  Briefcase,
  Layers,
  Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Feature data ─────────────────────────────────────────────────────────────

export interface StubFeature {
  to: string;
  icon: LucideIcon;
  label: string;
  phase: string;
  description: string;
  capabilities: string[];
}

export const STUB_FEATURES: StubFeature[] = [
  {
    to: "/markets",
    icon: Globe,
    label: "Markets",
    phase: "Phase 2 · Data Plane",
    description:
      "Real-time and historical market data with canonical OHLCV streams, venue routing, and point-in-time guarantees.",
    capabilities: [
      "Live candlestick streaming (BTC, SPY, GOLD, FX)",
      "1D–1Y range chart with volume overlay",
      "Market regime indicator (bullish / neutral / bearish)",
      "Volatility surface and confidence score",
    ],
  },
  {
    to: "/strategies",
    icon: TrendingUp,
    label: "Strategies",
    phase: "Phase 3 · Quant Core",
    description:
      "Deterministic strategy code with a versioned SDK, walk-forward validation, and an execution interface that separates signal from execution.",
    capabilities: [
      "Strategy SDK with typed signal interface",
      "Walk-forward and out-of-sample validation",
      "A/B comparison across strategy versions",
      "Promotion ladder: candidate → validated → paper → live",
    ],
  },
  {
    to: "/backtests",
    icon: FlaskConical,
    label: "Backtests",
    phase: "Phase 3 · Quant Core",
    description:
      "Vectorized and event-driven backtesting with point-in-time data, slippage modeling, and reproducible experiment records.",
    capabilities: [
      "Vectorized backtest engine (daily + intraday)",
      "Point-in-time data guarantee (no look-ahead)",
      "Slippage, cost model, and corporate action handling",
      "Reproducible: records data hash, code commit, seed",
    ],
  },
  {
    to: "/paper",
    icon: ScrollText,
    label: "Paper Trading",
    phase: "Phase 6 · Risk + OMS",
    description:
      "Simulated execution on real-time market data with a full risk engine, OMS, and reconciliation — before any live capital is at risk.",
    capabilities: [
      "Paper account with simulated fills on live prices",
      "Risk engine: exposure limits, daily loss, max drawdown",
      "OMS: order intents, idempotency, state machine",
      "Emergency stop across all paper positions",
    ],
  },
  {
    to: "/ml-studio",
    icon: Brain,
    label: "ML Studio",
    phase: "Phase 5 · ML",
    description:
      "Baseline-first ML with a versioned model registry, feature store integration, and MLflow experiment tracking.",
    capabilities: [
      "XGBoost, LightGBM, LSTM model training",
      "Feature store (canonical data pipeline)",
      "MLflow experiment tracking + model registry",
      "Walk-forward evaluation, OOS metrics",
    ],
  },
  {
    to: "/rl-studio",
    icon: Dna,
    label: "RL Studio",
    phase: "Phase 7 · RL (Research-only)",
    description:
      "Reinforcement learning for trading strategy research — environments, reward functions, PPO/SAC checkpoints. Research-only; no live execution.",
    capabilities: [
      "Custom trading environments (Gym-compatible)",
      "PPO, SAC agent training with GPU support",
      "Reward shaping and risk-adjusted objectives",
      "Checkpoint management and replay",
    ],
  },
  {
    to: "/portfolio",
    icon: Briefcase,
    label: "Portfolio",
    phase: "Phase 6 · Risk + OMS",
    description:
      "Paper and live account P&L, position ledger, trade journal, and portfolio-level risk attribution.",
    capabilities: [
      "Portfolio P&L (paper + live)",
      "Position ledger with realized / unrealized breakdown",
      "Trade journal and attribution",
      "Drawdown waterfall and Sharpe time-series",
    ],
  },
  {
    to: "/models",
    icon: Layers,
    label: "Models",
    phase: "Phase 5 · ML",
    description:
      "Versioned model registry with lineage from training data through feature version to deployment status.",
    capabilities: [
      "Model registry: version, status, lineage",
      "Feature importance and SHAP explainability",
      "TRAINED → VALIDATED → SHADOW → LIVE lifecycle",
      "MLflow artifact storage",
    ],
  },
  {
    to: "/live",
    icon: Radio,
    label: "Live Trading",
    phase: "Phase 8 · Execution · Mandate-gated",
    description:
      "Controlled live execution through broker adapters — mandate-gated and off by default. A strategy must pass Research → Validate → Paper → Risk before reaching Live.",
    capabilities: [
      "Broker adapters (Alpaca first, IBKR planned)",
      "Mandate enforcement: Live is a promotion state, not a shortcut",
      "Fail-closed: stale data / recon mismatch / risk breach → block",
      "Full audit trail and emergency kill-switch",
    ],
  },
];

const N = STUB_FEATURES.length;

// ─── Single slide card ────────────────────────────────────────────────────────

function FeatureSlide({ feature }: { feature: StubFeature }) {
  const Icon = feature.icon;
  return (
    <div
      className="flex h-full flex-col justify-center px-6 py-8 text-center"
      style={{ width: `${100 / N}%` }}
    >
      {/* Icon */}
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-elevated">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>

      {/* Title + phase */}
      <h2 className="mb-1 text-base font-bold tracking-tight">{feature.label}</h2>
      <span className="mb-4 inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Lock className="h-2.5 w-2.5" />
        {feature.phase}
      </span>

      {/* Description */}
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        {feature.description}
      </p>

      {/* Capabilities */}
      <ul className="space-y-2 text-left">
        {feature.capabilities.map((c) => (
          <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border/60 text-center text-[9px] leading-4 text-muted-foreground/50">
              ○
            </span>
            {c}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[10px] text-muted-foreground/40">
        The live run loop never breaks — new surfaces stand up beside it (D16).
      </p>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export function FeaturePreviewDrawer({
  open,
  initialTo,
  onClose,
}: {
  open: boolean;
  initialTo: string | null;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  // Track touch start X for swipe
  const touchStartX = useRef<number | null>(null);

  // Jump to the feature that was clicked
  useEffect(() => {
    if (open && initialTo) {
      const idx = STUB_FEATURES.findIndex((f) => f.to === initialTo);
      if (idx !== -1) setIndex(idx);
    }
  }, [open, initialTo]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft")  setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(N - 1, i + 1));
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Swipe support
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -40) setIndex((i) => Math.min(N - 1, i + 1));
    else if (dx > 40) setIndex((i) => Math.max(0, i - 1));
    touchStartX.current = null;
  }

  const feature = STUB_FEATURES[index];

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* ── Panel ── */}
      <aside
        aria-label="Feature preview"
        aria-modal={open}
        role="dialog"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[92vw] flex-col",
          "border-l border-border/60 bg-card shadow-2xl",
          "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <feature.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold">{feature.label}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close feature preview"
            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Carousel track */}
        <div
          className="flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex h-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: `${N * 100}%`,
              transform: `translateX(${-(index / N) * 100}%)`,
            }}
          >
            {STUB_FEATURES.map((f) => (
              <FeatureSlide key={f.to} feature={f} />
            ))}
          </div>
        </div>

        {/* Footer — prev / dots / next */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-3">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Previous feature"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {STUB_FEATURES.map((f, i) => (
              <button
                key={f.to}
                onClick={() => setIndex(i)}
                aria-label={`Jump to ${f.label}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === index
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-border hover:bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <button
            onClick={() => setIndex((i) => Math.min(N - 1, i + 1))}
            disabled={index === N - 1}
            aria-label="Next feature"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
