import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Search, ChevronLeft, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { admin, type AdminUserRow } from "@/lib/admin";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type StatusFilter = "all" | "active" | "suspended";

function planBadge(planId: string | null, status: string | null) {
  if (!planId) {
    return <span className="text-xs text-muted-foreground">No plan</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
        {planId}
      </span>
      {status && (
        <span
          className={cn(
            "text-[10px] capitalize",
            status === "active" ? "text-success" : "text-muted-foreground",
          )}
        >
          {status}
        </span>
      )}
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    admin
      .listUsers({ search: debouncedSearch, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((rows) => {
        if (cancelled) return;
        setUsers(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page]);

  // Status filter is applied client-side on the current page — the RPC
  // filters by search/pagination only, not suspension state.
  const visible = (users ?? []).filter((u) => {
    if (statusFilter === "active") return u.suspended_at === null;
    if (statusFilter === "suspended") return u.suspended_at !== null;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-foreground">Users</h1>
      <p className="mt-1 text-sm text-muted-foreground">Search, filter, and drill into any account.</p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name…"
            className="w-full rounded-lg border border-border bg-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <div className="flex gap-1.5">
          {(["all", "active", "suspended"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium capitalize transition",
                statusFilter === f
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-elevated",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-elevated/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Runs</th>
                <th className="px-4 py-2.5 font-medium">Last run</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No users match.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((u) => (
                  <tr key={u.id} className="transition hover:bg-elevated/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${u.id}`} className="block">
                        <div className="font-medium text-foreground">{u.email}</div>
                        {u.display_name && (
                          <div className="text-xs text-muted-foreground">{u.display_name}</div>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{planBadge(u.plan_id, u.subscription_status)}</td>
                    <td className="px-4 py-3">
                      {u.suspended_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                          <ShieldAlert className="h-3 w-3" /> Suspended
                        </span>
                      ) : (
                        <span className="text-xs text-success">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{u.runs_total}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(u.last_run_at)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Page {page + 1} · {visible.length} shown
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-elevated disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || (users?.length ?? 0) < PAGE_SIZE}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-elevated disabled:opacity-40"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
