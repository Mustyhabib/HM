import { useState } from "react";
import {
  Radio,
  TrendingUp,
  TrendingDown,
  Clock,
  Filter,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Zap,
  Bell,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
type SignalDirection = "long" | "short";
type SignalStatus = "active" | "triggered" | "expired" | "cancelled";

interface Signal {
  id: string;
  symbol: string;
  direction: SignalDirection;
  entry: number;
  target: number;
  stop: number;
  confidence: number;
  status: SignalStatus;
  strategy: string;
  timeframe: string;
  timestamp: string;
  pnl?: number;
}

/* ─── Mock data ─── */
const SIGNALS: Signal[] = [
  {
    id: "sig-001",
    symbol: "AAPL",
    direction: "long",
    entry: 198.45,
    target: 215.00,
    stop: 192.30,
    confidence: 87,
    status: "active",
    strategy: "EMA Crossover + RSI",
    timeframe: "4H",
    timestamp: "2026-08-05T09:30:00Z",
  },
  {
    id: "sig-002",
    symbol: "TSLA",
    direction: "short",
    entry: 265.20,
    target: 245.00,
    stop: 275.50,
    confidence: 72,
    status: "active",
    strategy: "MACD Divergence",
    timeframe: "1D",
    timestamp: "2026-08-05T08:15:00Z",
  },
  {
    id: "sig-003",
    symbol: "NVDA",
    direction: "long",
    entry: 485.30,
    target: 520.00,
    stop: 470.00,
    confidence: 91,
    status: "triggered",
    strategy: "Breakout + Volume",
    timeframe: "1H",
    timestamp: "2026-08-04T14:00:00Z",
    pnl: 6.2,
  },
  {
    id: "sig-004",
    symbol: "AMZN",
    direction: "long",
    entry: 192.80,
    target: 205.00,
    stop: 187.00,
    confidence: 68,
    status: "triggered",
    strategy: "Support Bounce",
    timeframe: "4H",
    timestamp: "2026-08-04T10:30:00Z",
    pnl: 3.8,
  },
  {
    id: "sig-005",
    symbol: "META",
    direction: "short",
    entry: 510.40,
    target: 485.00,
    stop: 525.00,
    confidence: 65,
    status: "expired",
    strategy: "RSI Overbought",
    timeframe: "1D",
    timestamp: "2026-08-03T09:00:00Z",
    pnl: -2.1,
  },
  {
    id: "sig-006",
    symbol: "GOOGL",
    direction: "long",
    entry: 178.20,
    target: 195.00,
    stop: 172.00,
    confidence: 82,
    status: "cancelled",
    strategy: "Golden Cross",
    timeframe: "1D",
    timestamp: "2026-08-02T11:00:00Z",
  },
  {
    id: "sig-007",
    symbol: "SPY",
    direction: "long",
    entry: 552.10,
    target: 565.00,
    stop: 545.00,
    confidence: 78,
    status: "triggered",
    strategy: "EMA Crossover + RSI",
    timeframe: "4H",
    timestamp: "2026-08-02T09:30:00Z",
    pnl: 1.9,
  },
  {
    id: "sig-008",
    symbol: "MSFT",
    direction: "short",
    entry: 445.60,
    target: 425.00,
    stop: 458.00,
    confidence: 74,
    status: "active",
    strategy: "Double Top",
    timeframe: "1D",
    timestamp: "2026-08-05T10:00:00Z",
  },
];

const STATUS_CONFIG: Record<
  SignalStatus,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  active: { label: "Active", color: "text-primary", bg: "bg-primary/10", icon: Zap },
  triggered: { label: "Triggered", color: "text-success", bg: "bg-success/10", icon: CheckCircle2 },
  expired: { label: "Expired", color: "text-muted-foreground", bg: "bg-muted/10", icon: Clock },
  cancelled: { label: "Cancelled", color: "text-danger", bg: "bg-danger/10", icon: XCircle },
};

/* ─── Summary cards ─── */
function SummaryCards() {
  const active = SIGNALS.filter((s) => s.status === "active").length;
  const triggered = SIGNALS.filter((s) => s.status === "triggered").length;
  const winRate = (() => {
    const closed = SIGNALS.filter((s) => s.pnl !== undefined);
    if (closed.length === 0) return 0;
    return Math.round((closed.filter((s) => s.pnl! > 0).length / closed.length) * 100);
  })();
  const totalPnl = SIGNALS.reduce((sum, s) => sum + (s.pnl ?? 0), 0);

  const cards = [
    { label: "Active Signals", value: active, icon: Radio, color: "text-primary" },
    { label: "Triggered", value: triggered, icon: CheckCircle2, color: "text-success" },
    { label: "Win Rate", value: `${winRate}%`, icon: Target, color: "text-secondary" },
    {
      label: "Total P&L",
      value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(1)}%`,
      icon: BarChart3,
      color: totalPnl >= 0 ? "text-success" : "text-danger",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{label}</span>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
          <div className="mt-2 text-xl font-bold font-mono">{value}</div>
        </div>
      ))}
    </div>
  );
}

// Need Target for SummaryCards
import { Target } from "lucide-react";

/* ─── Signal card ─── */
function SignalCard({ signal }: { signal: Signal }) {
  const { label, color, bg, icon: StatusIcon } = STATUS_CONFIG[signal.status];
  const isLong = signal.direction === "long";
  const rr = Math.abs(signal.target - signal.entry) / Math.abs(signal.entry - signal.stop);

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/30">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              isLong ? "bg-success/10" : "bg-danger/10",
            )}
          >
            {isLong ? (
              <TrendingUp className="h-5 w-5 text-success" />
            ) : (
              <TrendingDown className="h-5 w-5 text-danger" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">{signal.symbol}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  isLong ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                )}
              >
                {signal.direction}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">{signal.strategy}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", bg, color)}>
            <StatusIcon className="h-3 w-3" />
            {label}
          </span>
        </div>
      </div>

      {/* Price levels */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-[#05060F] p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Entry</div>
          <div className="mt-0.5 text-sm font-mono font-medium">${signal.entry.toFixed(2)}</div>
        </div>
        <div className="rounded-lg bg-[#05060F] p-3">
          <div className="text-[10px] text-success uppercase tracking-wider">Target</div>
          <div className="mt-0.5 text-sm font-mono font-medium text-success">
            ${signal.target.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg bg-[#05060F] p-3">
          <div className="text-[10px] text-danger uppercase tracking-wider">Stop</div>
          <div className="mt-0.5 text-sm font-mono font-medium text-danger">
            ${signal.stop.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {signal.timeframe}
          </span>
          <span>R:R {rr.toFixed(1)}</span>
          <span
            className={cn(
              "font-medium",
              signal.confidence >= 80
                ? "text-success"
                : signal.confidence >= 60
                  ? "text-amber-400"
                  : "text-danger",
            )}
          >
            {signal.confidence}% confidence
          </span>
        </div>
        <div className="flex items-center gap-2">
          {signal.pnl !== undefined && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-mono font-medium",
                signal.pnl >= 0 ? "text-success" : "text-danger",
              )}
            >
              {signal.pnl >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {signal.pnl >= 0 ? "+" : ""}
              {signal.pnl.toFixed(1)}%
            </span>
          )}
          <span>{new Date(signal.timestamp).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export function Signals() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SignalStatus | "all">("all");
  const [directionFilter, setDirectionFilter] = useState<SignalDirection | "all">("all");

  const filtered = SIGNALS.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (directionFilter !== "all" && s.direction !== directionFilter) return false;
    if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Signals</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated trading signals from your strategies
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-[#101730]">
          <Bell className="h-4 w-4" />
          Alerts
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-6">
        <SummaryCards />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SignalStatus | "all")}
              className="appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-8 text-sm outline-none transition focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="triggered">Triggered</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as SignalDirection | "all")}
              className="appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-8 text-sm outline-none transition focus:border-primary"
            >
              <option value="all">All Directions</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Signal list */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No signals match your filters</p>
          </div>
        ) : (
          filtered.map((signal) => <SignalCard key={signal.id} signal={signal} />)
        )}
      </div>

      {/* Footer note */}
      <div className="mt-8 text-center text-xs text-muted-foreground">
        Signals are generated by AI strategies and are not financial advice.
        <br />
        Always do your own research before trading.
      </div>
    </div>
  );
}
