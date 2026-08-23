/**
 * RunResults — professional results view for completed agent runs.
 *
 * Parses the engine's standard artifact set (metrics.csv, equity.csv,
 * risk_xray.json) out of the run's signed artifacts and renders:
 *   1. Headline verdict strip — total return / Sharpe / max DD / win rate
 *      with sentiment coloring (same thresholds as MetricsCard)
 *   2. Equity curve — strategy vs benchmark (ECharts, theme-aware)
 *   3. Full metrics grid + risk x-ray (concentration / volatility)
 *   4. The research report rendered as real markdown (GFM tables)
 *
 * Every number shown is traced to a stored artifact — nothing is invented.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  BarChart3,
  Loader2,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import { echarts } from "@/lib/echarts";
import { useThemeDark } from "@/lib/theme-store";
import { getChartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";
import { signedArtifactUrl, type RunArtifact } from "@/lib/runs";

// ---------------------------------------------------------------------------
// Parsing helpers — tiny CSV/JSON readers for the engine's known shapes
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])),
  );
}

async function fetchArtifactText(path: string): Promise<string | null> {
  const url = await signedArtifactUrl(path, 600);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.text();
}

type EquityPoint = { timestamp: string; equity: number; benchmark: number };

interface RiskXray {
  concentration?: { hhi?: number; effective_n?: number; top1_weight?: number };
  volatility?: {
    daily_vol?: number;
    annualized_vol?: number;
    downside_deviation_annualized?: number;
  };
  inputs?: { symbols?: string[]; aligned_days?: number };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunResults({
  artifacts,
  report,
}: {
  artifacts: RunArtifact[];
  /** The run's answer.md text (already loaded by RunView), if any. */
  report?: string | null;
}) {
  const dark = useThemeDark();
  const [loading, setLoading] = useState(true);
  const [metricsRow, setMetricsRow] = useState<Record<string, string> | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [riskXray, setRiskXray] = useState<RiskXray | null>(null);

  const metricsPath = useMemo(
    () => artifacts.find((a) => a.storage_path.endsWith("/metrics.csv"))?.storage_path,
    [artifacts],
  );
  const equityPath = useMemo(
    () => artifacts.find((a) => a.storage_path.endsWith("/equity.csv"))?.storage_path,
    [artifacts],
  );
  const riskPath = useMemo(
    () => artifacts.find((a) => a.storage_path.endsWith("/risk_xray.json"))?.storage_path,
    [artifacts],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Fetch in parallel; each is independently optional.
      const [mRaw, eRaw, rRaw] = await Promise.all([
        metricsPath ? fetchArtifactText(metricsPath) : Promise.resolve(null),
        equityPath ? fetchArtifactText(equityPath) : Promise.resolve(null),
        riskPath ? fetchArtifactText(riskPath) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      try {
        if (mRaw) {
          const rows = csvToObjects(mRaw);
          setMetricsRow(rows[rows.length - 1] ?? null); // last row = final
        }
        if (eRaw) {
          setEquity(
            csvToObjects(eRaw).map((r) => ({
              timestamp: r.timestamp ?? "",
              equity: Number(r.equity),
              benchmark: Number(r.benchmark_equity),
            })).filter((p) => Number.isFinite(p.equity)),
          );
        }
        if (rRaw) setRiskXray(JSON.parse(rRaw) as RiskXray);
      } catch {
        /* malformed artifacts degrade to plain-report view */
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [metricsPath, equityPath, riskPath]);

  const num = (k: string): number | null => {
    if (!metricsRow) return null;
    const v = Number(metricsRow[k]);
    return Number.isFinite(v) ? v : null;
  };
  const pct = (v: number | null, digits = 2): string =>
    v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
  const ratio = (v: number | null): string =>
    v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

  // Headline quartet
  const headline = [
    { key: "total_return", label: "Total Return", value: pct(num("total_return")), good: (num("total_return") ?? 0) > 0 },
    { key: "sharpe", label: "Sharpe", value: ratio(num("sharpe")), good: (num("sharpe") ?? 0) >= 1.0 },
    { key: "max_drawdown", label: "Max Drawdown", value: pct(num("max_drawdown")), good: false },
    { key: "win_rate", label: "Win Rate", value: pct(num("win_rate"), 1), good: (num("win_rate") ?? 0) >= 0.5 },
  ];

  const gridMetrics: Array<[string, string]> = [];
  const push = (label: string, v: string | null) => { if (v != null) gridMetrics.push([label, v]); };
  push("Annualized Return", num("annual_return") == null ? null : pct(num("annual_return")));
  push("Calmar", num("calmar") == null ? null : ratio(num("calmar")));
  push("Sortino", num("sortino") == null ? null : ratio(num("sortino")));
  push("Profit Factor", num("profit_factor") == null ? null : ratio(num("profit_factor")));
  push("Profit/Loss Ratio", num("profit_loss_ratio") == null ? null : ratio(num("profit_loss_ratio")));
  push("Trades", num("trade_count") == null ? null : String(Math.round(num("trade_count")!)));
  push("Avg Holding Days", num("avg_holding_days") == null ? null : num("avg_holding_days")!.toFixed(1));
  push("Benchmark Return", num("benchmark_return") == null ? null : pct(num("benchmark_return")));
  push("Excess Return", num("excess_return") == null ? null : pct(num("excess_return")));
  push("Information Ratio", num("information_ratio") == null ? null : ratio(num("information_ratio")));
  push("Total Turnover", num("total_turnover") == null ? null : num("total_turnover")!.toFixed(2));
  push("Final Value", num("final_value") == null ? null : Math.round(num("final_value")!).toLocaleString());

  const hasAnything = !loading && (metricsRow || equity.length > 0);

  return (
    <div className="space-y-5">
      {/* Loading shimmer */}
      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading result data…
        </div>
      )}

      {/* ── 1. Headline verdict strip ── */}
      {metricsRow && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {headline.map((h) => (
            <div
              key={h.key}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {h.label}
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-lg font-semibold tabular-nums",
                  h.good ? "text-success" : h.key === "total_return" || h.key === "win_rate" ? "text-danger" : "text-foreground",
                )}
              >
                {h.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── 2. Equity curve vs benchmark ── */}
      {equity.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" /> Equity Curve
            </h3>
            <span className="text-[11px] text-muted-foreground">strategy vs benchmark</span>
          </div>
          <EquityMiniChart data={equity} dark={dark} />
        </div>
      )}

      {/* ── 3. Full metrics + risk ── */}
      {(gridMetrics.length > 0 || riskXray) && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {gridMetrics.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> Performance Detail
              </h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                {gridMetrics.map(([label, v]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-mono text-xs font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {riskXray && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-primary" /> Risk X-Ray
              </h3>
              <dl className="space-y-2">
                <RiskRow label="Effective # holdings" value={riskXray.concentration?.effective_n?.toFixed(2)} />
                <RiskRow label="HHI concentration" value={riskXray.concentration?.hhi?.toFixed(3)} />
                <RiskRow label="Ann. volatility" value={riskXray.volatility?.annualized_vol == null ? null : pct(riskXray.volatility.annualized_vol, 1)} />
                <RiskRow label="Downside dev. (ann.)" value={riskXray.volatility?.downside_deviation_annualized == null ? null : pct(riskXray.volatility.downside_deviation_annualized, 1)} />
                {riskXray.inputs?.symbols?.length ? (
                  <RiskRow label="Universe" value={riskXray.inputs.symbols.join(", ")} />
                ) : null}
              </dl>
              {riskXray.concentration && riskXray.concentration.effective_n != null && riskXray.concentration.effective_n <= 1.5 && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-[11px] text-warning">
                  <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
                  Single-asset portfolio — concentration risk is maximal.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 4. Research report as markdown ── */}
      {report && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border/60 px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" /> Research Report
            </h3>
          </div>
          <div className="hm-report prose-sm px-5 py-4 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border-b [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1 [&_code]:rounded [&_code]:bg-elevated [&_code]:px-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Nothing parseable — RunView's plain fallback still shows the answer */}
      {!hasAnything && !report && !loading && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          This run produced no structured result artifacts.
        </p>
      )}
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value?: string | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Compact strategy-vs-benchmark area chart (theme-aware ECharts). */
function EquityMiniChart({
  data,
  dark,
}: {
  data: EquityPoint[];
  dark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length < 2) return;
    const t = getChartTheme();
    const chart = echarts.init(ref.current);
    const dates = data.map((d) => d.timestamp.slice(0, 10));
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: t.tooltipBg,
        borderColor: t.tooltipBorder,
        textStyle: { color: t.tooltipText, fontSize: 11 },
      },
      legend: {
        data: ["Strategy", "Benchmark"],
        textStyle: { color: t.textColor, fontSize: 11 },
        top: 0, right: 8,
      },
      grid: { left: 8, right: 8, top: 28, bottom: 0, containLabel: true },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: t.axisColor } },
        axisLabel: { color: t.textColor, fontSize: 10 },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: t.gridColor } },
        axisLabel: {
          color: t.textColor, fontSize: 10,
          formatter: (v: number) =>
            new Intl.NumberFormat(undefined, { notation: "compact" }).format(v),
        },
      },
      series: [
        {
          name: "Strategy",
          type: "line",
          data: data.map((d) => d.equity),
          showSymbol: false,
          lineStyle: { width: 2, color: "#7C3AED" },
          itemStyle: { color: "#7C3AED" },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: dark ? "rgba(124,58,237,0.25)" : "rgba(124,58,237,0.18)" },
              { offset: 1, color: "rgba(124,58,237,0)" },
            ]),
          },
        },
        {
          name: "Benchmark",
          type: "line",
          data: data.map((d) => d.benchmark),
          showSymbol: false,
          lineStyle: { width: 1.5, type: "dashed", color: t.textColor },
          itemStyle: { color: t.textColor },
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [data, dark]);

  return <div ref={ref} className="h-64 w-full" />;
}
