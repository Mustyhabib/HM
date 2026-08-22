/**
 * DataCatalog — Phase 2 · Data Plane
 *
 * Shows the platform's dataset_registry and live feed health.
 * Data is served by two SECURITY DEFINER RPCs:
 *   - list_platform_datasets()  → dataset_registry rows
 *   - list_feed_status()        → data_feeds health (sanitised, no secrets)
 *
 * Route: /data
 */

import { useEffect, useState } from "react";
import {
  Database, Activity, CheckCircle, AlertCircle, Clock,
  RefreshCw, Download,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformDataset {
  id: string;
  provider: string;
  name: string | null;
  universe: Array<{ symbol: string }>;
  asset_class: "market" | "macro" | "alternative";
  frequency: string;
  coverage_start: string | null;
  coverage_end: string | null;
  quality_score: number | null;
  row_count: number | null;
  size_bytes: number | null;
  storage_path: string | null;
  last_ingested_at: string | null;
  updated_at: string;
}

interface FeedStatus {
  name: string;
  provider: string;
  asset_class: string;
  frequency: string;
  symbols: string[];
  status: "active" | "paused" | "error" | "pending";
  is_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  runs_total: number;
  runs_ok: number;
}

type AssetFilter = "all" | "market" | "macro" | "alternative";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtRows(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function qualityColor(score: number | null): string {
  if (!score) return "text-muted-foreground";
  if (score >= 0.9) return "text-green-500";
  if (score >= 0.7) return "text-yellow-500";
  return "text-red-500";
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  market: "Market",
  macro: "Macro",
  alternative: "Alternative",
};

const FEED_STATUS_CONFIG: Record<
  FeedStatus["status"],
  { icon: typeof CheckCircle; color: string; label: string }
> = {
  active:  { icon: CheckCircle, color: "text-green-500",  label: "Active"  },
  paused:  { icon: Clock,       color: "text-yellow-500", label: "Paused"  },
  error:   { icon: AlertCircle, color: "text-red-500",    label: "Error"   },
  pending: { icon: Clock,       color: "text-muted-foreground", label: "Pending" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DataCatalog() {
  const [datasets, setDatasets] = useState<PlatformDataset[]>([]);
  const [feeds, setFeeds] = useState<FeedStatus[]>([]);
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);

    const [dsResult, feedResult] = await Promise.all([
      supabase.rpc("list_platform_datasets"),
      supabase.rpc("list_feed_status"),
    ]);

    if (dsResult.error) {
      setError(dsResult.error.message);
    } else {
      setDatasets((dsResult.data as PlatformDataset[]) ?? []);
    }
    if (!feedResult.error) {
      setFeeds((feedResult.data as FeedStatus[]) ?? []);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered =
    filter === "all" ? datasets : datasets.filter((d) => d.asset_class === filter);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Data Catalog</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Platform dataset registry — canonical OHLCV, macro &amp; alternative data.
            Parquet-first, point-in-time, provider-agnostic.
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Feed health ── */}
      {feeds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Feed health
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {feeds.map((f) => {
              const cfg = FEED_STATUS_CONFIG[f.status];
              const StatusIcon = cfg.icon;
              const uptime =
                f.runs_total > 0
                  ? `${Math.round((f.runs_ok / f.runs_total) * 100)}% uptime`
                  : "no runs yet";
              return (
                <div
                  key={f.name}
                  className="rounded-xl border border-border bg-elevated p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary/60" />
                      <span className="text-sm font-medium">{f.name}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Provider</span>
                      <span className="font-mono uppercase">{f.provider}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Symbols</span>
                      <span className="font-mono">{(f.symbols ?? []).join(", ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last run</span>
                      <span>{fmtRelative(f.last_run_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Reliability</span>
                      <span>{uptime}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Error state ── */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <strong>Error loading catalog:</strong> {error}
        </div>
      )}

      {/* ── Dataset registry ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Dataset registry
            {datasets.length > 0 && (
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs normal-case">
                {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
          {/* Asset class filter */}
          {datasets.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              {(["all", "market", "macro", "alternative"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all" ? "All" : ASSET_CLASS_LABELS[f]}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading catalog…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFeeds={feeds.length > 0} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/60 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Dataset</th>
                  <th className="px-4 py-3 font-medium">Symbols</th>
                  <th className="px-4 py-3 font-medium">Coverage</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Quality</th>
                  <th className="px-4 py-3 font-medium">Last ingested</th>
                  <th className="px-4 py-3 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((ds) => (
                  <DatasetRow key={ds.id} dataset={ds} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Phase note ── */}
      <p className="text-xs text-muted-foreground/50 text-center">
        Phase 2 · Data Plane — RAW → VALIDATED → NORMALIZED → DERIVED → FEATURES (D16: live loop never breaks)
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DatasetRow({ dataset: ds }: { dataset: PlatformDataset }) {
  const symbols = (ds.universe ?? []).map((u) => u.symbol).join(", ") || "—";
  const coverage =
    ds.coverage_start && ds.coverage_end
      ? `${fmtDate(ds.coverage_start)} → ${fmtDate(ds.coverage_end)}`
      : "—";

  return (
    <tr className="hover:bg-elevated/40 transition-colors">
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          <div className="font-medium">{ds.name ?? `${ds.provider} · ${ds.frequency}`}</div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
              {ds.provider}
            </span>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {ASSET_CLASS_LABELS[ds.asset_class] ?? ds.asset_class}
            </span>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {ds.frequency}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{symbols}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{coverage}</td>
      <td className="px-4 py-3 text-xs font-mono">{fmtRows(ds.row_count)}</td>
      <td className="px-4 py-3 text-xs font-mono">{fmtBytes(ds.size_bytes)}</td>
      <td className={`px-4 py-3 text-xs font-mono font-semibold ${qualityColor(ds.quality_score)}`}>
        {ds.quality_score ? ds.quality_score.toFixed(2) : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {fmtRelative(ds.last_ingested_at)}
      </td>
      <td className="px-4 py-3">
        {ds.storage_path && (
          <DownloadButton storagePath={ds.storage_path} />
        )}
      </td>
    </tr>
  );
}

function DownloadButton({ storagePath }: { storagePath: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage
      .from("hm-datalake")
      .createSignedUrl(storagePath, 300); // 5-minute signed URL
    setLoading(false);
    if (error) {
      console.error("Signed URL error:", error.message);
      return;
    }
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      onClick={() => void handleDownload()}
      disabled={loading}
      title="Download Parquet"
      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
    >
      <Download className={`h-3 w-3 ${loading ? "animate-pulse" : ""}`} />
      .parquet
    </button>
  );
}

function EmptyState({ hasFeeds }: { hasFeeds: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-border bg-elevated/30 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-elevated">
        <Database className="h-9 w-9 text-muted-foreground/40" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">No datasets ingested yet</h3>
        {hasFeeds ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            Feed adapters are configured. Run{" "}
            <code className="rounded bg-elevated px-1.5 py-0.5 text-xs font-mono">hm-ingest</code>{" "}
            on the Railway worker to pull BTC/ETH/SOL daily OHLCV into the catalog.
          </p>
        ) : (
          <p className="max-w-sm text-sm text-muted-foreground">
            Phase 2 data infrastructure is deployed. The{" "}
            <code className="rounded bg-elevated px-1.5 py-0.5 text-xs font-mono">LSE_API_KEY</code>{" "}
            environment variable must be set on the Railway worker, then run{" "}
            <code className="rounded bg-elevated px-1.5 py-0.5 text-xs font-mono">hm-ingest</code>{" "}
            to begin ingestion.
          </p>
        )}
      </div>
      <div className="space-y-1 text-left text-xs text-muted-foreground/60">
        <div>○ Canonical OHLCV: BTC/USD, ETH/USD, SOL/USD (daily, 1yr history)</div>
        <div>○ Storage: hm-datalake (Supabase Storage → R2 in Phase 9)</div>
        <div>○ Format: Parquet (snappy) · Schema: timestamp, open, high, low, close, volume</div>
        <div>○ Pipeline: RAW → VALIDATED → NORMALIZED → DERIVED → FEATURES</div>
      </div>
    </div>
  );
}
