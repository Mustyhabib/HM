import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { admin, type AdminRunRow } from "@/lib/admin";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const STATUS_FILTERS = ["all", "queued", "running", "completed", "failed", "timeout", "cancelled"] as const;

// Mirrors RunView's statusChip tone mapping (queued=primary, running=warning,
// completed=success, failed/timeout=danger, cancelled=default) for a
// consistent status vocabulary across the user and admin apps.
function statusToneClass(status: string): string {
  switch (status) {
    case "queued":    return "border-primary/30 bg-primary/10 text-primary";
    case "running":   return "border-secondary/30 bg-secondary/15 text-secondary";
    case "completed": return "border-success/30 bg-success/10 text-success";
    case "failed":
    case "timeout":   return "border-danger/30 bg-danger/10 text-danger";
    default:          return "border-border bg-elevated text-muted-foreground";
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AdminRuns() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [page, setPage] = useState(0);
  const [runs, setRuns] = useState<AdminRunRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    admin
      .listRuns({ status: status === "all" ? undefined : status, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((rows) => {
        if (cancelled) return;
        setRuns(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load runs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, page]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-foreground">Runs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Cross-user agent run monitor.</p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setStatus(f);
              setPage(0);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition",
              status === f
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-elevated",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-elevated/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Prompt</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Progress</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && (runs?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No runs match.
                  </td>
                </tr>
              )}
              {!loading &&
                runs?.map((r) => (
                  <tr key={r.id} className="transition hover:bg-elevated/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.user_email}</div>
                      {r.display_name && <div className="text-xs text-muted-foreground">{r.display_name}</div>}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-foreground" title={r.prompt}>
                      {r.prompt}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", statusToneClass(r.status))}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{r.kind}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-xs text-muted-foreground" title={r.progress_message ?? undefined}>
                      {r.progress_message ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(r.completed_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Page {page + 1}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-elevated disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || (runs?.length ?? 0) < PAGE_SIZE}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-elevated disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
