import { useState } from "react";
import { Link } from "react-router";
import {
  Bot,
  ArrowRight,
  TrendingUp,
  Target,
  DollarSign,
  ArrowUpRight,
  BarChart3,
  Activity,
  Copy,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Pine Script sample ─── */
const PINE_SCRIPT = `// @version=5
strategy("H~Mltd AI Strategy", overlay=true,
  initial_capital=100000, default_qty_type=strategy.percent,
  default_qty_value=10)

// === Inputs ===
fastLen = input.int(10, "Fast EMA Length")
slowLen = input.int(21, "Slow EMA Length")
rsiLen  = input.int(14, "RSI Length")
rsiThresh = input.int(50, "RSI Threshold")

// === Indicators ===
fastEMA = ta.ema(close, fastLen)
slowEMA = ta.ema(close, slowLen)
rsi = ta.rsi(close, rsiLen)

// === Conditions ===
longCond  = ta.crossover(fastEMA, slowEMA) and rsi > rsiTh\\
resh
shortCond = ta.crossunder(fastEMA, slowEMA) and rsi < (10\\
0 - rsiThresh)

// === Strategy Execution ===
if (longCond)
    strategy.entry("Long", strategy.long)
    strategy.exit("Long Exit", "Long", stop=low, limit=high

if (shortCond)
    strategy.entry("Short", strategy.short)
    strategy.exit("Short Exit", "Short", stop=high, limit=l\\
ow)

// === Plotting ===
plot(fastEMA, color=color.blue, title="Fast EMA")
plot(slowEMA, color=color.orange, title="Slow EMA")
hline(rsiThresh, "RSI Threshold", color=color.gray,
  linestyle=hline.style_dotted)

bgcolor(longCond ? color.new(color.green, 90) :
  shortCond ? color.new(color.red, 90) : na)`;

/* ─── Metrics data ─── */
const METRICS = [
  { label: "Sharpe Ratio", value: "1.82", icon: TrendingUp, color: "text-primary" },
  { label: "Win Rate",     value: "64%",  icon: Target,      color: "text-secondary" },
  { label: "Net Profit",   value: "+18.4%", icon: DollarSign, color: "text-success", positive: true },
];

const BOTTOM_STATS = [
  { label: "Total Trades",      value: "152" },
  { label: "Profitable Trades", value: "97" },
  { label: "Max Drawdown",      value: "-11.2%", negative: true },
  { label: "Profit Factor",     value: "2.34" },
];

/* ─── Equity curve SVG ─── */
function EquityCurve() {
  const points = [
    10, 12, 11, 15, 14, 18, 17, 22, 20, 25, 23, 28, 30, 27,
    32, 35, 33, 38, 40, 37, 42, 45, 43, 48, 50, 47, 52, 55,
    53, 58, 60, 57, 63, 65, 62, 68, 70, 67, 73, 75,
  ];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 600;
  const h = 160;
  const pad = 4;

  const pathD = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p - min) / (max - min)) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const areaD = `${pathD} L${w - pad},${h} L${pad},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={pad}
          y1={h * f}
          x2={w - pad}
          y2={h * f}
          stroke="var(--border)"
          strokeWidth="0.5"
          strokeDasharray="4 4"
        />
      ))}
      <path d={areaD} fill="url(#eq-fill)" />
      <path d={pathD} fill="none" stroke="url(#eq-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="sparkline-draw" style={{ '--sl-len': '820' } as React.CSSProperties} />
    </svg>
  );
}

/* ─── Pine Script Viewer ─── */
function PineScriptPanel() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(PINE_SCRIPT).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-border bg-[var(--bg-panel)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-danger/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
          </div>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            strategy.pine
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="rounded-md px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-elevated hover:text-foreground">
            Save
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            <Copy className="h-3 w-3" />
            {copied ? "✓ strategy.pine" : "Copy"}
          </button>
          <button className="rounded-md gradient-bg glow-gradient px-2.5 py-1 text-[11px] font-medium text-white transition hover:opacity-90">
            Run Backtest
          </button>
        </div>
      </div>

      {/* Code */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-xs leading-relaxed">
          <code>
            {PINE_SCRIPT.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-4 inline-block w-6 shrink-0 text-right text-muted-foreground/40 select-none font-mono">
                  {i + 1}
                </span>
                <span className="flex-1 font-mono">
                  <PineScriptLine line={line} />
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border bg-[var(--bg-panel)] px-4 py-1.5 text-[10px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          No errors
        </span>
        <span>Ln 1, Col 1 · Pine Script v5</span>
      </div>
    </div>
  );
}

/** Basic Pine Script syntax coloring */
function PineScriptLine({ line }: { line: string }) {
  if (line.trimStart().startsWith("//")) {
    return <span className="text-emerald-500/70">{line}</span>;
  }

  const keywords = /\b(strategy|input|ta|plot|bgcolor|hline|if|and|or|not|true|false|na)\b/g;
  const strings  = /(".*?")/g;
  const numbers  = /\b(\d+\.?\d*)\b/g;
  const funcs    = /\b(int|float|string|bool|color|ema|crossover|crossunder|rsi|entry|exit|new)\b/g;

  const tokens: { start: number; end: number; cls: string }[] = [];

  for (const match of line.matchAll(strings)) {
    tokens.push({ start: match.index!, end: match.index! + match[0].length, cls: "text-amber-400" });
  }
  for (const match of line.matchAll(keywords)) {
    if (!tokens.some((t) => match.index! >= t.start && match.index! < t.end)) {
      tokens.push({ start: match.index!, end: match.index! + match[0].length, cls: "text-violet-400" });
    }
  }
  for (const match of line.matchAll(funcs)) {
    if (!tokens.some((t) => match.index! >= t.start && match.index! < t.end)) {
      tokens.push({ start: match.index!, end: match.index! + match[0].length, cls: "text-blue-400" });
    }
  }
  for (const match of line.matchAll(numbers)) {
    if (!tokens.some((t) => match.index! >= t.start && match.index! < t.end)) {
      tokens.push({ start: match.index!, end: match.index! + match[0].length, cls: "text-cyan-400" });
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  if (tokens.length === 0) {
    return <span className="text-foreground/90">{line}</span>;
  }

  const elements: React.ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((tok, i) => {
    if (tok.start > cursor) {
      elements.push(<span key={`t-${i}`} className="text-foreground/90">{line.slice(cursor, tok.start)}</span>);
    }
    elements.push(<span key={`h-${i}`} className={tok.cls}>{line.slice(tok.start, tok.end)}</span>);
    cursor = tok.end;
  });
  if (cursor < line.length) {
    elements.push(<span key="rest" className="text-foreground/90">{line.slice(cursor)}</span>);
  }

  return <>{elements}</>;
}

/* ─── Dashboard page ─── */
export function Dashboard() {
  return (
    <div className="flex h-full">
      {/* ─── Left: Strategy Studio ─── */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl p-6 space-y-6 msg-enter">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Strategy Studio</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Market Open
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Create, test, and optimize quantitative strategies with H~Mltd.
            </p>
          </div>

          {/* Agent launcher */}
          <div className="gradient-border glow-pulse rounded-2xl">
            <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl gradient-bg glow-gradient">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">
                    Research with the H~Mltd Agent
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    Ask trading questions, run backtests, and launch agent swarms from one prompt.
                  </p>
                </div>
              </div>
              <Link
                to="/agent"
                className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                <Bot className="h-4 w-4" />
                Open Agent
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          {/* Performance metrics */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-primary" />
                Strategy Performance
              </h2>
              <span className="text-[11px] text-muted-foreground">Last 30 days</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {METRICS.map(({ label, value, icon: Icon, color, positive }, i) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </span>
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-elevated", color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span
                      className="font-mono text-2xl font-bold tracking-tight count-in"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >{value}</span>
                    {positive !== undefined && (
                      <span className="mb-1 flex items-center text-xs text-success">
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Equity Curve */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" />
                Equity Curve
              </h2>
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
                {["1M", "3M", "6M", "1Y", "ALL"].map((period) => (
                  <button
                    key={period}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-mono font-medium transition",
                      period === "1Y"
                        ? "gradient-bg text-white"
                        : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                    )}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="h-40">
                <EquityCurve />
              </div>
              <div className="mt-3 flex justify-between text-[10px] font-mono text-muted-foreground/60 px-1">
                {["May '25", "Jul '25", "Sep '25", "Nov '25", "Jan '26", "Mar '26", "May '26"].map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BOTTOM_STATS.map(({ label, value, negative }) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </div>
                <div
                  className={cn(
                    "mt-1.5 font-mono text-lg font-bold tracking-tight",
                    negative ? "text-danger" : "text-foreground",
                  )}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Right: Pine Script Panel ─── */}
      <div className="hidden w-[420px] shrink-0 border-l border-border p-4 lg:block">
        <PineScriptPanel />
      </div>
    </div>
  );
}
