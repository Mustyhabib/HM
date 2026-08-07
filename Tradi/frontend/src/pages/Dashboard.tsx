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
  {
    label: "Sharpe Ratio",
    value: "1.82",
    icon: TrendingUp,
    color: "text-primary",
  },
  {
    label: "Win Rate",
    value: "64%",
    icon: Target,
    color: "text-secondary",
  },
  {
    label: "Net Profit",
    value: "+18.4%",
    icon: DollarSign,
    color: "text-success",
    positive: true,
  },
];

const BOTTOM_STATS = [
  { label: "Total Trades", value: "152" },
  { label: "Profitable Trades", value: "97" },
  { label: "Max Drawdown", value: "-11.2%", negative: true },
  { label: "Profit Factor", value: "2.34" },
];

/* ─── Equity curve SVG (placeholder) ─── */
function EquityCurve() {
  // Simulated equity curve data points
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

  // Area fill
  const areaD = `${pathD} L${w - pad},${h} L${pad},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
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
      <path d={pathD} fill="none" stroke="url(#eq-gradient)" strokeWidth="2" />
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
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Pine Script v5
          </span>
          <span className="rounded bg-[#101730] px-1.5 py-0.5 text-[10px] text-muted-foreground">
            .pine
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-[#101730] hover:text-foreground">
            Save
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-[#101730] hover:text-foreground"
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="rounded-md gradient-bg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
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
                <span className="mr-4 inline-block w-6 shrink-0 text-right text-muted-foreground/50 select-none">
                  {i + 1}
                </span>
                <span className="flex-1">
                  <PineScriptLine line={line} />
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span>✓ No errors</span>
        <span>
          Ln 1, Col 1 &nbsp;·&nbsp; Pine Script
        </span>
      </div>
    </div>
  );
}

/** Basic Pine Script syntax coloring */
function PineScriptLine({ line }: { line: string }) {
  // Comments
  if (line.trimStart().startsWith("//")) {
    return <span className="text-emerald-500/70">{line}</span>;
  }

  // Simple keyword highlight
  const keywords =
    /\b(strategy|input|ta|plot|bgcolor|hline|if|and|or|not|true|false|na)\b/g;
  const strings = /(".*?")/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const funcs =
    /\b(int|float|string|bool|color|ema|crossover|crossunder|rsi|entry|exit|new)\b/g;

  // Tokenize simplistically
  const tokens: { start: number; end: number; cls: string }[] = [];

  for (const match of line.matchAll(strings)) {
    tokens.push({
      start: match.index!,
      end: match.index! + match[0].length,
      cls: "text-amber-400",
    });
  }
  for (const match of line.matchAll(keywords)) {
    if (!tokens.some((t) => match.index! >= t.start && match.index! < t.end)) {
      tokens.push({
        start: match.index!,
        end: match.index! + match[0].length,
        cls: "text-violet-400",
      });
    }
  }
  for (const match of line.matchAll(funcs)) {
    if (!tokens.some((t) => match.index! >= t.start && match.index! < t.end)) {
      tokens.push({
        start: match.index!,
        end: match.index! + match[0].length,
        cls: "text-blue-400",
      });
    }
  }
  for (const match of line.matchAll(numbers)) {
    if (!tokens.some((t) => match.index! >= t.start && match.index! < t.end)) {
      tokens.push({
        start: match.index!,
        end: match.index! + match[0].length,
        cls: "text-cyan-400",
      });
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
      elements.push(
        <span key={`t-${i}`} className="text-foreground/90">
          {line.slice(cursor, tok.start)}
        </span>,
      );
    }
    elements.push(
      <span key={`h-${i}`} className={tok.cls}>
        {line.slice(tok.start, tok.end)}
      </span>,
    );
    cursor = tok.end;
  });
  if (cursor < line.length) {
    elements.push(
      <span key="rest" className="text-foreground/90">
        {line.slice(cursor)}
      </span>,
    );
  }

  return <>{elements}</>;
}

/* ─── Dashboard page ─── */
export function Dashboard() {
  return (
    <div className="flex h-full">
      {/* ─── Left: Strategy Studio ─── */}
      <div className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Strategy Studio</h1>
            <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Market: Open
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, test, and optimize quantitative strategies with H~Mltd
          </p>
        </div>

        {/* Launch the agent workspace (single prompt box lives on /agent) */}
        <div className="gradient-border glow-pulse rounded-xl mb-6">
          <div className="flex flex-col gap-3 rounded-xl bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Research with the H~Mltd Agent
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ask trading research questions, run backtests, and launch agent swarms — all from the Agent workspace.
              </p>
            </div>
            <Link
              to="/agent"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Bot className="h-4 w-4" />
              Open Agent
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Strategy Performance */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Strategy Performance
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {METRICS.map(({ label, value, icon: Icon, color, positive }) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-2xl font-bold font-mono">{value}</span>
                  {positive !== undefined && (
                    <span className="mb-0.5 flex items-center text-xs text-success">
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equity Curve */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Equity Curve
            </h2>
            <div className="flex items-center gap-1">
              {["1M", "3M", "6M", "1Y", "ALL"].map((period) => (
                <button
                  key={period}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] transition",
                    period === "1Y"
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="h-40">
              <EquityCurve />
            </div>
            {/* X-axis labels */}
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/60 px-1">
              {["May '25", "Jul '25", "Sep '25", "Nov '25", "Jan '26", "Mar '26", "May '26"].map(
                (m) => (
                  <span key={m}>{m}</span>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="grid grid-cols-4 gap-4">
          {BOTTOM_STATS.map(({ label, value, negative }) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-card p-4 text-center"
            >
              <div className="text-xs text-muted-foreground">{label}</div>
              <div
                className={cn(
                  "mt-1 text-lg font-bold font-mono",
                  negative ? "text-danger" : "text-foreground",
                )}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Right: Pine Script Panel ─── */}
      <div className="hidden w-[420px] shrink-0 border-l border-border p-4 lg:block">
        <PineScriptPanel />
      </div>
    </div>
  );
}
