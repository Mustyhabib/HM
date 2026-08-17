import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Wallet,
  Layers,
  Activity,
  UserPlus,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { admin, type AdminStats } from "@/lib/admin";
import { cn } from "@/lib/utils";

function fmtNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "primary" | "success" | "warning" | "danger" | "default";
}) {
  const toneClass =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-secondary"
    : tone === "danger"  ? "text-danger"
    : tone === "default" ? "text-muted-foreground"
    : "text-primary";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", toneClass)} />
      </div>
      <div className="mt-2 font-mono text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="shimmer h-3 w-20 rounded" />
      <div className="shimmer mt-3 h-7 w-16 rounded" />
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const s = await admin.getStats();
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusEntries = stats ? Object.entries(stats.runs_by_status) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Business health and queue status, live from Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-elevated disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-elevated"
          >
            Retry
          </button>
        </div>
      )}

      {/* Primary stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard icon={Wallet} label="MRR" value={stats ? fmtNaira(stats.mrr_ngn) : "—"} tone="primary" />
            <StatCard icon={Users} label="Active subscribers" value={stats?.active_subscribers ?? "—"} tone="success" />
            <StatCard icon={Layers} label="Queue depth" value={stats?.queue_depth ?? "—"} tone="warning" />
            <StatCard icon={Activity} label="Active runs" value={stats?.active_runs ?? "—"} tone="primary" />
          </>
        )}
      </div>

      {/* Secondary stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard icon={Users} label="Total users" value={stats?.total_users ?? "—"} tone="default" />
            <StatCard icon={UserPlus} label="New (30d)" value={stats?.new_users_30d ?? "—"} tone="default" />
            <StatCard icon={Clock} label="Runs (24h)" value={stats?.runs_24h ?? "—"} tone="default" />
            <StatCard icon={AlertTriangle} label="Failed webhooks" value={stats?.failed_webhooks ?? "—"} tone="danger" />
          </>
        )}
      </div>

      {/* Runs by status */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Runs by status</h2>
        {loading ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="shimmer h-7 w-24 rounded-full" />
            <div className="shimmer h-7 w-24 rounded-full" />
            <div className="shimmer h-7 w-24 rounded-full" />
          </div>
        ) : statusEntries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {statusEntries.map(([status, count]) => (
              <span
                key={status}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">{status}</span>
                <span className="font-mono font-semibold text-foreground">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
