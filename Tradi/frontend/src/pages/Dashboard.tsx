import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Bot,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ShieldCheck,
  FlaskConical,
  Minus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { supabase } from "@/lib/supabase";
import type { AgentRun } from "@/lib/runs";
import { CandlestickChart } from "@/components/charts/CandlestickChart";
import type { PriceBar } from "@/lib/api";

// ─── Greeting helper ────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function displayName(user: { email?: string; user_metadata?: Record<string, string> } | null) {
  if (!user) return "";
  return (
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "there"
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      <span className="font-mono text-xl font-bold tracking-tight text-foreground">
        {value}
      </span>
      {sub && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            trend === "up"   && "text-success",
            trend === "down" && "text-danger",
            (!trend || trend === "neutral") && "text-muted-foreground",
          )}
        >
          {trend === "up"   && <TrendingUp   className="h-3 w-3" />}
          {trend === "down" && <TrendingDown className="h-3 w-3" />}
          {(!trend || trend === "neutral") && <Minus className="h-3 w-3" />}
          {sub}
        </span>
      )}
    </div>
  );
}

// ─── Empty panel placeholder ─────────────────────────────────────────────────
function PhasePlaceholder({
  icon: Icon,
  title,
  phase,
  description,
}: {
  icon: typeof BarChart3;
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-5 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/30" />
      <p className="text-xs font-medium text-foreground/60">{title}</p>
      <p className="text-[11px] text-muted-foreground">{description}</p>
      <span className="mt-1 rounded-full border border-border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50">
        {phase}
      </span>
    </div>
  );
}

// ─── Live Market Chart (LSE via Edge Function → CoinGecko fallback) ──────────
// ADR D18: LSE is the Phase 2 primary data provider (platform-managed API key).
// ADR D17: WebSocket live feed is Phase 6; HTTP OHLCV (historical) is Phase 2.
// The LSE_API_KEY stays server-side — the browser calls the market-data Edge
// Function which proxies to LSE and returns normalised PriceBar[].
// Fallback: if the Edge Function isn't deployed yet (404) or LSE_API_KEY isn't
// configured (503), we fall back to CoinGecko's free public OHLC API so the
// chart is never empty. Once the Edge Function + LSE key are live, the fallback
// is never reached.
const COINS = [
  { lseSymbol: "BTC/USD", cgId: "bitcoin",  symbol: "BTC", label: "Bitcoin"  },
  { lseSymbol: "ETH/USD", cgId: "ethereum", symbol: "ETH", label: "Ethereum" },
  { lseSymbol: "SOL/USD", cgId: "solana",   symbol: "SOL", label: "Solana"   },
] as const;

const RANGES = [
  { label: "7D",  days: 7  },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

/** CoinGecko fallback — free, no key, CORS-enabled */
async function fetchCoinGeckoOHLC(cgId: string, days: number): Promise<PriceBar[]> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`,
  );
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const raw = (await r.json()) as [number, number, number, number, number][];
  const byDate = new Map<string, PriceBar>();
  for (const [ts, open, high, low, close] of raw) {
    const date = new Date(ts).toISOString().split("T")[0];
    byDate.set(date, { time: date, open, high, low, close, volume: 0 });
  }
  return [...byDate.values()];
}

function LiveMarketChart() {
  const [coin, setCoin]   = useState<(typeof COINS)[number]>(COINS[0]);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const [data, setData]   = useState<PriceBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const to   = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - range.days);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // Try LSE Edge Function first; fall back to CoinGecko if unavailable
    supabase.functions
      .invoke<{ bars: PriceBar[] }>("market-data", {
        body: {
          symbol:     coin.lseSymbol,
          resolution: "1d",
          from:       fmt(from),
          to:         fmt(to),
        },
      })
      .then(({ data: resp, error: fnErr }) => {
        if (cancelled) return;
        if (fnErr || !resp?.bars?.length) {
          // Edge Function not deployed or LSE key not set — fall back
          return fetchCoinGeckoOHLC(coin.cgId, range.days).then((bars) => {
            if (!cancelled) { setData(bars); setLoading(false); }
          });
        }
        setData(resp.bars);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Network error calling Edge Function — fall back to CoinGecko
        return fetchCoinGeckoOHLC(coin.cgId, range.days)
          .then((bars) => { if (!cancelled) { setData(bars); setLoading(false); } })
          .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
      });

    return () => { cancelled = true; };
  }, [coin.lseSymbol, coin.cgId, range.days]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Live Market Chart
          </h3>
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50">
            {coin.symbol}/USD
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Coin selector */}
          <div className="flex gap-0.5">
            {COINS.map((c) => (
              <button
                key={c.lseSymbol}
                onClick={() => setCoin(c)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors",
                  coin.lseSymbol === c.lseSymbol
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                {c.symbol}
              </button>
            ))}
          </div>
          <div className="w-px h-3 bg-border/40" />
          {/* Range selector */}
          <div className="flex gap-0.5">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors",
                  range.label === r.label
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground/50 hover:text-muted-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart body */}
      <div className="p-3">
        {loading && (
          <div className="flex h-[280px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading {coin.label}…</span>
          </div>
        )}
        {!loading && error && (
          <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
            <BarChart3 className="h-7 w-7 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Chart unavailable</p>
            <p className="text-[10px] text-muted-foreground/50">{error}</p>
          </div>
        )}
        {!loading && !error && data.length > 0 && (
          <CandlestickChart data={data} height={280} />
        )}
      </div>
    </div>
  );
}

// ─── Recent Research (live from agent_runs) ──────────────────────────────────
function RecentResearch() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("agent_runs")
      .select("id,prompt,status,created_at,completed_at")
      .in("status", ["completed", "running", "queued"])
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => {
        setRuns((data as AgentRun[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Recent Research
        </h3>
      </div>
      <div className="divide-y divide-border">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}
        {!loading && runs.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No research runs yet.{" "}
            <Link to="/agent" className="text-primary hover:underline">
              Start a run →
            </Link>
          </div>
        )}
        {runs.map((run) => (
          <Link
            key={run.id}
            to={`/run/${run.id}`}
            className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-elevated"
          >
            <span
              className={cn(
                "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                run.status === "completed" && "bg-success",
                run.status === "running"   && "bg-primary animate-pulse",
                run.status === "queued"    && "bg-warning animate-pulse",
              )}
            />
            <span className="flex-1 truncate text-foreground/80">{run.prompt}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
              {new Date(run.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </Link>
        ))}
      </div>
      {runs.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <Link
            to="/agent"
            className="text-xs text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── AI Research Copilot panel ───────────────────────────────────────────────
function ResearchCopilot() {
  const SUGGESTIONS = [
    "Analyze BTC momentum signals",
    "Find mean-reversion opportunities",
    "Build a multi-factor strategy",
    "Run SPY factor research",
  ];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            AI Research Copilot
          </h3>
        </div>
      </div>
      <div className="flex-1 p-4 space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          What would you like to research?
        </p>
        {SUGGESTIONS.map((s) => (
          <Link
            key={s}
            to={`/agent?prompt=${encodeURIComponent(s)}`}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-elevated hover:text-foreground"
          >
            <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
            {s}
          </Link>
        ))}
      </div>
      <div className="border-t border-border p-3">
        <Link
          to="/agent"
          className="flex w-full items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Bot className="h-4 w-4" />
          Open Research
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// ─── Strategy Monitor ────────────────────────────────────────────────────────
function StrategyMonitor() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Strategy Monitor
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-elevated/40">
              {["Strategy", "Asset", "Mode", "Signal", "P&L", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground/50"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                No strategies running.{" "}
                <Link to="/agent" className="text-primary hover:underline">
                  Run a research agent →
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────
export function Dashboard() {
  const { user } = useAuth();
  const name = displayName(user);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6 msg-enter">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}{name ? `, ${name.charAt(0).toUpperCase() + name.slice(1)}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening across your research &amp; portfolio.
          </p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Portfolio"
            value="—"
            sub="Paper account required"
            trend="neutral"
          />
          <StatCard
            label="Today P&L"
            value="—"
            sub="No active positions"
            trend="neutral"
          />
          <StatCard
            label="Sharpe Ratio"
            value="—"
            sub="Run a backtest first"
            trend="neutral"
          />
          <StatCard
            label="Drawdown"
            value="—"
            sub="No open trades"
            trend="neutral"
          />
        </div>

        {/* ── Live Market Chart + AI Research Copilot ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Live BTC/ETH/SOL candlestick chart via CoinGecko public API */}
          <div className="lg:col-span-3">
            <LiveMarketChart />
          </div>

          {/* AI Research Copilot — live today via /agent */}
          <div className="lg:col-span-2">
            <ResearchCopilot />
          </div>
        </div>

        {/* ── Strategy Monitor ── */}
        <StrategyMonitor />

        {/* ── Risk Monitor + Market Regime ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PhasePlaceholder
            icon={ShieldCheck}
            title="Risk Monitor"
            phase="Phase 6 · Risk Engine"
            description="Exposure, daily loss limits, max drawdown tracking, and emergency stop arrive with the Risk Engine."
          />
          <PhasePlaceholder
            icon={TrendingUp}
            title="Market Regime"
            phase="Phase 2 · Data Plane"
            description="Regime classification, volatility signals, and confidence scores arrive with the Data Plane."
          />
        </div>

        {/* ── Recent Research + ML/RL Experiments ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RecentResearch />
          <PhasePlaceholder
            icon={FlaskConical}
            title="ML / RL Experiments"
            phase="Phase 5 · ML · Phase 7 · RL"
            description="Model training progress, XGBoost/PPO experiment tracking, and evaluation status arrive in Phase 5 and 7."
          />
        </div>

      </div>
    </div>
  );
}
