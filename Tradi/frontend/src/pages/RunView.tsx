import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Layers,
  Loader2,
  Radio,
  X,
  XCircle,
} from "lucide-react";
import {
  getActiveRuns,
  getRun,
  getRunArtifacts,
  signedArtifactUrl,
  subscribeToArtifacts,
  subscribeToRun,
  type AgentRun,
  type RunArtifact,
} from "@/lib/runs";
import { RunResults } from "@/components/runs/RunResults";
import { cn } from "@/lib/utils";
import { LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/company";

const ACTIVE = new Set(["queued", "running"]);

/** Rotating arc SVG — orbital ring shown during active states */
function SpinRing() {
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 spin-ring" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#D946EF" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="14" stroke="var(--border)" strokeWidth="2" />
      <circle cx="18" cy="18" r="14" stroke="url(#ring-g)" strokeWidth="2"
        strokeLinecap="round" strokeDasharray="20 68" />
    </svg>
  );
}

/** Three-dot typing indicator */
function TypingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-1" aria-hidden>
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </span>
  );
}

/** Animated checkmark stroke — drawn on completion */
function CheckDraw() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" aria-hidden>
      <path d="M4 12.5l5.5 5.5L20 7"
        stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="28" strokeDashoffset="28"
        className="stroke-draw"
      />
    </svg>
  );
}

/** 3-step status timeline: Queued → Running → Completed */
function StatusTimeline({ status }: { status: string }) {
  const steps = [
    { key: "queued",    label: "Queued",    icon: Clock },
    { key: "running",   label: "Running",   icon: Loader2 },
    { key: "completed", label: "Complete",  icon: CheckCircle2 },
  ];

  const failed = status === "failed" || status === "timeout" || status === "cancelled";
  const currentIdx =
    status === "queued"     ? 0 :
    status === "running"    ? 1 :
    status === "completed"  ? 2 :
    failed                  ? 1 :
    0;

  return (
    <div className="flex items-center justify-between px-2 py-1">
      {steps.map(({ key, label, icon: Icon }, i) => {
        const active   = i === currentIdx && !failed;
        const done     = i < currentIdx || status === "completed";
        const errored  = failed && i === currentIdx;

        const dotCls =
          errored ? "border-danger bg-danger/15 text-danger" :
          done    ? "border-success bg-success/15 text-success" :
          active  ? "border-primary bg-primary/15 text-primary" :
                    "border-border bg-elevated text-muted-foreground";
        const lineCls =
          done    ? "bg-gradient-to-r from-success to-success/30" :
          active  ? "bg-gradient-to-r from-primary to-border" :
          errored ? "bg-gradient-to-r from-danger to-border" :
                    "bg-border";

        return (
          <div key={key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${dotCls}`}>
                <Icon className={`h-4 w-4 ${active && key === "running" ? "animate-spin" : ""}`} />
              </div>
              <span className={`text-[10px] font-medium uppercase tracking-wide ${
                errored ? "text-danger" : done ? "text-success" : active ? "text-primary" : "text-muted-foreground"
              }`}>
                {errored && i === 1 ? (status === "timeout" ? "Timeout" : status === "cancelled" ? "Cancelled" : "Failed") : label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-2 h-px flex-1 transition ${lineCls}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Format elapsed seconds — "3s", "42s", "1m 18s", "12m 04s" */
function fmtElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/** Waiting/running card — shows live elapsed time + honest status copy. */
function ActiveState({ run }: { run: AgentRun }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const createdMs = new Date(run.created_at).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - createdMs) / 1000));
  const isQueued = run.status === "queued";
  const isStalled = isQueued && elapsedSec > 30;

  return (
    <div className="rounded-xl border border-primary/20 bg-card p-6 glass">
      <div className="mb-5 flex items-center gap-3">
        <SpinRing />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 font-medium text-foreground text-sm">
            {isQueued ? "Waiting for a worker to pick up your run" : "Agent is thinking"}
            {run.status === "running" && <TypingDots />}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {isQueued
              ? isStalled
                ? "Longer than usual — the queue may be busy. Your credit is safe; it will refund on failure."
                : "Usually takes a few seconds. You can safely leave this page — we'll keep processing."
              : "Researching, analyzing, and drafting your report…"}
          </div>
        </div>
        {/* Live elapsed pill */}
        <div
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium",
            isStalled
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border bg-elevated text-muted-foreground",
          )}
          title="Time since the run was queued"
        >
          {fmtElapsed(elapsedSec)}
        </div>
      </div>

      {/* Progress line — worker streams this from trace.jsonl */}
      {run.status === "running" && run.progress_message && (
        <ProgressLine
          message={run.progress_message}
          iter={run.progress_iter}
          maxIter={run.max_iter}
          updatedAt={run.progress_at}
        />
      )}

      {/* Shimmer placeholder lines */}
      <div className="space-y-2.5">
        <div className="shimmer h-3 w-full rounded" />
        <div className="shimmer h-3 w-11/12 rounded" />
        <div className="shimmer h-3 w-4/5 rounded" />
        <div className="shimmer h-3 w-3/4 rounded" />
      </div>
    </div>
  );
}

/**
 * Live progress line — the newest message the worker has streamed, plus a
 * subtle "N seconds ago" freshness cue and an optional iteration counter.
 * Message swaps use a short fade so consecutive updates don't jitter.
 */
function ProgressLine({
  message,
  iter,
  maxIter,
  updatedAt,
}: {
  message: string;
  iter: number | null;
  maxIter: number;
  updatedAt: string | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ageSec = updatedAt
    ? Math.max(0, Math.floor((now - new Date(updatedAt).getTime()) / 1000))
    : null;
  // Key on message so each new one triggers the fade-in
  return (
    <div
      key={message}
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 animate-in fade-in duration-300"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="typing-dot" />
        <span className="truncate text-xs text-foreground">{message}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {iter !== null && iter > 0 && (
          <span className="rounded-full border border-border bg-elevated px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {iter}/{maxIter}
          </span>
        )}
        {ageSec !== null && (
          <span className="font-mono text-[10px] text-muted-foreground" title="Last progress update">
            {ageSec < 3 ? "just now" : `${ageSec}s ago`}
          </span>
        )}
      </div>
    </div>
  );
}

/** Header trio: one shared component so hover-reveal behaviour is consistent. */
function IconChip({
  label,
  icon: Icon,
  active,
  tone = "default",
  onClick,
  as = "button",
  to,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  tone?: "default" | "primary" | "success" | "danger" | "warning";
  onClick?: () => void;
  as?: "button" | "link";
  to?: string;
}) {
  const toneClass =
    tone === "primary" ? "border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/15"
    : tone === "success" ? "border-success/30 bg-success/10 text-success glow-success"
    : tone === "danger"  ? "border-danger/30 bg-danger/10 text-danger"
    : tone === "warning" ? "border-secondary/30 bg-secondary/15 text-secondary"
    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground";

  const base = cn(
    "group relative inline-flex h-8 items-center gap-1.5 rounded-full border px-2 text-xs font-medium transition-all duration-200",
    active ? "px-2.5" : "hover:pl-2.5",
    toneClass,
  );

  const content = (
    <>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", active && tone === "warning" && "animate-spin")} />
      {/* Label reveals on hover — width transitions from 0 to full */}
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-200",
          active ? "max-w-[100px] opacity-100" : "max-w-0 opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 group-focus:max-w-[100px] group-focus:opacity-100",
        )}
      >
        {label}
      </span>
    </>
  );

  if (as === "link" && to) {
    return (
      <Link to={to} className={base} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={base} aria-label={label} title={label}>
      {content}
    </button>
  );
}

/** Format elapsed seconds relative to a created_at ISO string */
function elapsedFrom(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return fmtElapsed(s);
}

/** Status → icon-chip config for the trio. */
function statusChip(status: string): {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "primary" | "success" | "danger" | "warning";
} {
  switch (status) {
    case "queued":    return { label: "Queued",     icon: Clock,        tone: "primary" };
    case "running":   return { label: "Running",    icon: Loader2,      tone: "warning" };
    case "completed": return { label: "Completed",  icon: CheckCircle2, tone: "success" };
    case "failed":    return { label: "Failed",     icon: XCircle,      tone: "danger" };
    case "timeout":   return { label: "Timed out",  icon: XCircle,      tone: "danger" };
    case "cancelled": return { label: "Cancelled",  icon: XCircle,      tone: "default" };
    default:          return { label: status,       icon: Clock,        tone: "default" };
  }
}

/** Icon-only trio in the RunView header — Status · Queue · Exit. */
function HeaderTrio({ runId, status }: { runId: string; status: string }) {
  const [queueOpen, setQueueOpen] = useState(false);
  const s = statusChip(status);
  return (
    <div className="relative flex shrink-0 items-center gap-1.5">
      {/* Status pill — always shows its label; tone matches state */}
      <IconChip label={s.label} icon={s.icon} tone={s.tone} active />

      {/* Queue viewer — toggle popover */}
      <IconChip
        label="Queue"
        icon={Layers}
        onClick={() => setQueueOpen((o) => !o)}
        active={queueOpen}
        tone={queueOpen ? "primary" : "default"}
      />

      {/* Exit */}
      <IconChip label="Exit" icon={X} as="link" to="/agent" />

      {queueOpen && <QueuePopover currentRunId={runId} onClose={() => setQueueOpen(false)} />}
    </div>
  );
}

/** Queue popover — anchored dropdown showing the user's active runs. */
function QueuePopover({
  currentRunId,
  onClose,
}: {
  currentRunId: string;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    getActiveRuns()
      .then((r) => { if (!cancelled) setRuns(r); })
      .catch(() => { if (!cancelled) setRuns([]); });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Silence unused-var warning while still forcing a rerender each second
  void now;

  return (
    <>
      {/* Backdrop — click closes */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Active queue"
        className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border/60 bg-elevated/40 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Your queue
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {runs === null ? "…" : `${runs.length} active`}
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {runs === null ? (
            <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading queue…
            </div>
          ) : runs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No other queued or running jobs.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const isCurrent = r.id === currentRunId;
                return (
                  <li key={r.id}>
                    <Link
                      to={`/run/${r.id}`}
                      onClick={onClose}
                      className={cn(
                        "block px-3 py-2.5 transition hover:bg-elevated/50",
                        isCurrent && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {r.status === "queued" ? (
                            <Clock className="h-3 w-3 shrink-0 text-primary" />
                          ) : (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-secondary" />
                          )}
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {r.status}
                          </span>
                          {isCurrent && (
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              current
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {elapsedFrom(r.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-foreground">{r.prompt}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function ArtifactLink({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const url = await signedArtifactUrl(path);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener");
  }
  return (
    <button
      onClick={open}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-primary transition hover:border-primary/30 hover:bg-primary/10 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      Open
    </button>
  );
}

/**
 * Inline preview for HTML run artifacts (e.g. the Shadow Account report).
 * The engine's report HTML is self-authored and static — sandbox without
 * scripts, same-origin so relative assets inside the report still load.
 */
function HtmlArtifactPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedArtifactUrl(path)
      .then((u) => {
        if (alive && u) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Report preview
        </span>
        <ArtifactLink path={path} />
      </div>
      <iframe src={url} title="Run report" sandbox="allow-same-origin" className="h-96 w-full bg-white" />
    </div>
  );
}

export function RunView() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveConnected, setLiveConnected] = useState(false);
  const loadedArtifacts = useRef(false);

  const loadArtifacts = useCallback(async (id: string) => {
    if (loadedArtifacts.current) return;
    loadedArtifacts.current = true;
    try {
      const arts = await getRunArtifacts(id);
      setArtifacts(arts);
      const report = arts.find((a) => a.kind === "report");
      if (report) {
        const url = await signedArtifactUrl(report.storage_path);
        if (url) {
          const res = await fetch(url);
          if (res.ok) setAnswer(await res.text());
        }
      }
    } catch {
      /* artifacts are best-effort in the UI too */
    }
  }, []);

  /**
   * Real-time subscription strategy:
   * - Fetch the run once on mount to render the initial state
   * - Subscribe to UPDATE on agent_runs (status → running/completed/failed)
   * - Subscribe to INSERT on agent_artifacts (worker uploads land instantly)
   * - Keep a slow (10s) fallback poll in case realtime disconnects
   */
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout>;

    // 1. Initial fetch
    getRun(runId)
      .then((r) => {
        if (cancelled) return;
        setRun(r);
        setLoading(false);
        if (r?.status === "completed") loadArtifacts(runId);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load run");
        setLoading(false);
      });

    // 2. Live subscription — status transitions
    const unsubRun = subscribeToRun(runId, (updated) => {
      if (cancelled) return;
      setRun(updated);
      setLiveConnected(true);
      if (updated.status === "completed") loadArtifacts(runId);
    });

    // 3. Live subscription — artifacts as they land
    const unsubArts = subscribeToArtifacts(runId, (art) => {
      if (cancelled) return;
      setArtifacts((prev) => (prev.some((a) => a.id === art.id) ? prev : [...prev, art]));
    });

    // 4. Fallback poll — slow, only fires if we haven't reached a terminal state
    function fallback() {
      if (cancelled) return;
      getRun(runId!)
        .then((r) => {
          if (cancelled) return;
          setRun((prev) => {
            // Don't overwrite fresher realtime data
            if (prev && new Date(prev.completed_at ?? prev.created_at) >= new Date(r?.created_at ?? 0)) {
              return prev;
            }
            return r;
          });
          if (r && ACTIVE.has(r.status)) fallbackTimer = setTimeout(fallback, 10_000);
        })
        .catch(() => {
          fallbackTimer = setTimeout(fallback, 10_000);
        });
    }
    fallbackTimer = setTimeout(fallback, 10_000);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      unsubRun();
      unsubArts();
    };
  }, [runId, loadArtifacts]);

  // Shadow Account / HTML reports get an inline preview below the artifact list.
  const htmlArtifact = artifacts.find(
    (a) => a.kind === "html" || a.storage_path.toLowerCase().endsWith(".html"),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Studio
      </Link>

      {loading && !run && (
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">Loading run…</span>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {run && (
        <>
          {/* ─── Header ─── */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Agent Run</span>
                {liveConnected && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/8 px-1.5 py-0.5 text-[9px] font-medium text-success"
                    title="Real-time updates connected"
                  >
                    <Radio className="h-2.5 w-2.5" /> Live
                  </span>
                )}
              </div>
              <p className="text-base leading-relaxed text-foreground">{run.prompt}</p>
            </div>

            {/* Icon trio — Status · Queue · Exit. Labels reveal on hover/focus/touch. */}
            <HeaderTrio runId={runId!} status={run.status} />
          </div>

          {/* ─── Operator line — who runs this platform (financial research product) ─── */}
          <p className="mb-6 text-xs text-muted-foreground">
            Operated by {LEGAL_NAME} · {SUPPORT_EMAIL}
          </p>

          {/* ─── Status timeline ─── */}
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <StatusTimeline status={run.status} />
          </div>

          {/* ─── Active state: spin ring + typing dots + shimmer ─── */}
          {ACTIVE.has(run.status) && (
            <ActiveState run={run} />
          )}

          {/* ─── Failed / timeout state ─── */}
          {(run.status === "failed" || run.status === "timeout") && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-5">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-danger">
                    This run {run.status === "timeout" ? "timed out" : "failed"}.
                  </p>
                  {run.error_message && (
                    <p className="mt-1.5 text-sm text-muted-foreground">{run.error_message}</p>
                  )}
                  {run.refunded && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Your use was refunded
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Completed report ─── */}
          {run.status === "completed" && (
            <div className="rounded-xl border border-success/20 bg-card">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <CheckDraw />
                  <FileText className="h-4 w-4 text-primary" /> Research Report
                </h2>
                {artifacts.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"}
                  </span>
                )}
              </div>
              <div className="p-6">
                <RunResults artifacts={artifacts} report={answer} />
              </div>
            </div>
          )}

          {/* ─── Artifacts ─── */}
          {artifacts.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Artifacts
              </h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {artifacts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-elevated/50">
                    <span className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
                      <span className="rounded bg-elevated border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground">
                        {a.kind}
                      </span>
                      <span className="truncate">
                        {a.storage_path.split("/").slice(2).join("/")}
                      </span>
                    </span>
                    <ArtifactLink path={a.storage_path} />
                  </li>
                ))}
              </ul>
              {htmlArtifact && <HtmlArtifactPreview path={htmlArtifact.storage_path} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
