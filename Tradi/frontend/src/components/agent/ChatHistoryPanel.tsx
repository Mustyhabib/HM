/**
 * ChatHistoryPanel — the hanging "past chats" rail on the Research Agent page.
 *
 * Design (per HM spec, 2026-08-23):
 *  - Hangs on the RIGHT edge of the page, vertically centred: starts ~30%
 *    below the top, ends ~30% above the bottom (i.e. occupies the middle
 *    ~40% of viewport height).
 *  - Narrow by default (<20% of width): a slim collapsed rail showing only
 *    status dots. Expands over the content on hover (or when pinned) to a
 *    full list — never pushes the main canvas around.
 *  - Scrollable list of the caller's recent runs (RLS-scoped), newest first;
 *    clicking one opens its run page.
 *  - Live: subscribes to Realtime INSERT/UPDATE on agent_runs so new runs
 *    and status changes appear without a refresh.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  History,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRunHistory,
  subscribeToRunList,
  type AgentRun,
} from "@/lib/runs";

function StatusDot({ status }: { status: AgentRun["status"] }) {
  if (status === "completed")
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />;
  if (status === "failed" || status === "timeout")
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />;
  if (status === "queued")
    return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
}

function timeAgo(iso: string): string {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function ChatHistoryPanel() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Initial load + realtime subscription for inserts and status changes.
  useEffect(() => {
    let cancelled = false;

    getRunHistory(40)
      .then((rows) => { if (!cancelled) { setRuns(rows); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });

    const unsubInsert = subscribeToRunList(
      (row) => { if (!cancelled) setRuns((prev) => [row as AgentRun, ...prev].slice(0, 40)); },
      (row) => {
        if (cancelled) return;
        setRuns((prev) =>
          prev.map((r) => (r.id === (row as AgentRun).id ? { ...r, ...(row as AgentRun) } : r)),
        );
      },
    );
    return () => { cancelled = true; unsubInsert(); };
  }, []);

  const expanded = pinned || hovered;

  const grouped = useMemo(() => {
    const active = runs.filter((r) => r.status === "queued" || r.status === "running");
    const past = runs.filter((r) => r.status !== "queued" && r.status !== "running");
    return { active, past };
  }, [runs]);

  const openRun = (id: string) => navigate(`/run/${id}`);

  return (
    <aside
      aria-label="Past research chats"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        // Hang: vertically centred band — 30% below top, 30% above bottom.
        "fixed right-0 top-[30%] bottom-[30%] z-40 hidden lg:flex flex-col",
        "rounded-l-xl border border-r-0 border-border bg-card/95 shadow-lg shadow-black/10 backdrop-blur",
        "transition-all duration-200 ease-out",
        expanded ? "w-72" : "w-12",
        !expanded && "cursor-pointer",
      )}
      onClick={() => { if (!expanded) setPinned(true); }}
    >
      {/* Rail header */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }}
        aria-label={expanded ? "Collapse chat history" : "Expand chat history"}
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left transition",
          expanded ? "w-full" : "w-full justify-center px-0",
          "hover:bg-elevated/60",
        )}
        title="Past chats"
      >
        {expanded ? (
          <>
            <History className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="flex-1 truncate text-xs font-semibold">Past chats</span>
            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !pinned && "rotate-180")} />
          </>
        ) : (
          <History className="h-4 w-4 text-primary" />
        )}
      </button>

      {/* Collapsed rail: status dots only */}
      {!expanded && (
        <div className="flex flex-col items-center gap-2.5 overflow-hidden py-3">
          {loaded && runs.length === 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-border" title="No chats yet" />
          )}
          {runs.slice(0, 12).map((r) => (
            <span key={r.id} title={r.prompt.slice(0, 80)}>
              <StatusDot status={r.status} />
            </span>
          ))}
        </div>
      )}

      {/* Expanded list */}
      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {!loaded && (
            <div className="space-y-2 py-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-elevated" />
              ))}
            </div>
          )}

          {loaded && runs.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Your research runs will appear here.
            </p>
          )}

          {grouped.active.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Active
              </p>
              {grouped.active.map((r) => (
                <ChatRow key={r.id} run={r} onOpen={openRun} live />
              ))}
            </>
          )}

          {grouped.past.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Earlier
              </p>
              {grouped.past.map((r) => (
                <ChatRow key={r.id} run={r} onOpen={openRun} />
              ))}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function ChatRow({
  run,
  onOpen,
  live = false,
}: {
  run: AgentRun;
  onOpen: (id: string) => void;
  live?: boolean;
}) {
  const sub =
    run.status === "running" && run.progress_message
      ? run.progress_message
      : run.error_message
        ? run.error_message
        : run.completed_at
          ? `Completed · ${timeAgo(run.completed_at)} ago`
          : `Queued · ${timeAgo(run.created_at)} ago`;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(run.id); }}
      className={cn(
        "group mb-0.5 flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left transition",
        "hover:border-border hover:bg-elevated/60",
        live && "border-primary/20 bg-primary/[0.04]",
      )}
      title={run.prompt}
    >
      <span className="mt-0.5"><StatusDot status={run.status} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs leading-snug text-foreground">
          {run.prompt}
        </span>
        <span className={cn(
          "mt-0.5 block truncate text-[10px]",
          live ? "text-primary" : "text-muted-foreground",
        )}>
          {sub}
        </span>
      </span>
      <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
        {timeAgo(run.created_at)}
      </span>
    </button>
  );
}
