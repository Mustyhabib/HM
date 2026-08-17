import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { admin, type AuditLogRow } from "@/lib/admin";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

// Known action values written by _log_admin (see the admin_dashboard
// migration). Kept as a fixed list — there's no admin_list_actions RPC.
const ACTIONS = [
  "user.suspend",
  "user.unsuspend",
  "billing.plan_override",
  "billing.plan_update",
];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}

export function AdminAuditLog() {
  const [actionFilter, setActionFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState<AuditLogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    admin
      .listAuditLogs({ action: actionFilter || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((rows) => {
        if (cancelled) return;
        setLogs(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load audit log");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actionFilter, page]);

  // Search over actor_email/target_id is applied client-side on the
  // current page — the RPC filters by action + pagination only.
  const q = search.trim().toLowerCase();
  const visible = (logs ?? []).filter((l) => {
    if (!q) return true;
    return (l.actor_email ?? "").toLowerCase().includes(q) || (l.target_id ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-foreground">Audit Log</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every admin mutation, tamper-evident.</p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor email or target id…"
            className="w-full rounded-lg border border-border bg-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-elevated/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No matching audit events.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((l) => (
                  <tr key={l.id} className="align-top transition hover:bg-elevated/50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{fmtDateTime(l.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{l.actor_email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {l.target_type}
                      {l.target_id && <span className="ml-1 font-mono">{l.target_id.slice(0, 12)}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {Object.keys(l.metadata ?? {}).length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <details className={cn("text-xs")}>
                          <summary className="cursor-pointer text-primary">view</summary>
                          <pre className="mt-1 max-w-xs overflow-x-auto rounded-lg border border-border bg-elevated p-2 font-mono text-[11px] text-muted-foreground">
                            {JSON.stringify(l.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
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
            disabled={loading || (logs?.length ?? 0) < PAGE_SIZE}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-elevated disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
