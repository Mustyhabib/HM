import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import {
  getRun,
  getRunArtifacts,
  signedArtifactUrl,
  type AgentRun,
  type RunArtifact,
} from "@/lib/runs";

const ACTIVE = new Set(["queued", "running"]);

/** Rotating arc SVG — orbital ring shown during active states */
function SpinRing() {
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 spin-ring" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="50%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#22D3EE" />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: ReactNode }> = {
    queued:    { label: "Queued",     cls: "border-primary/30 bg-primary/10 text-primary",       icon: <Clock className="h-3.5 w-3.5" /> },
    running:   { label: "Running",    cls: "border-secondary/30 bg-secondary/15 text-secondary", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    completed: { label: "Completed",  cls: "border-success/30 bg-success/10 text-success glow-success", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    failed:    { label: "Failed",     cls: "border-danger/30 bg-danger/10 text-danger",          icon: <XCircle className="h-3.5 w-3.5" /> },
    timeout:   { label: "Timed out",  cls: "border-danger/30 bg-danger/10 text-danger",          icon: <XCircle className="h-3.5 w-3.5" /> },
    cancelled: { label: "Cancelled",  cls: "border-border bg-elevated text-muted-foreground",    icon: <XCircle className="h-3.5 w-3.5" /> },
  };
  const s = map[status] ?? map.queued;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
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

export function RunView() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const r = await getRun(runId!);
        if (cancelled) return;
        setRun(r);
        setLoading(false);
        if (r && !ACTIVE.has(r.status)) {
          if (r.status === "completed") await loadArtifacts(runId!);
          return; // terminal — stop polling
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load run");
          setLoading(false);
        }
      }
      if (!cancelled) timer = setTimeout(tick, 2500);
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, loadArtifacts]);

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
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Agent Run
              </div>
              <p className="text-base leading-relaxed text-foreground">{run.prompt}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={run.status} />
              <Link
                to="/agent"
                title="Back to the prompt"
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Exit
              </Link>
            </div>
          </div>

          {/* ─── Status timeline ─── */}
          <div className="mb-6 rounded-xl border border-border bg-card p-4">
            <StatusTimeline status={run.status} />
          </div>

          {/* ─── Active state: spin ring + typing dots + shimmer ─── */}
          {ACTIVE.has(run.status) && (
            <div className="rounded-xl border border-primary/20 bg-card p-6 glass">
              <div className="mb-5 flex items-center gap-3">
                {/* Orbital spin ring replacing static icon */}
                <SpinRing />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 font-medium text-foreground text-sm">
                    {run.status === "queued" ? "Waiting for a worker" : "Agent is thinking"}
                    {run.status === "running" && <TypingDots />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {run.status === "queued"
                      ? "Your run is next in line — this usually takes a few seconds."
                      : "Researching, analyzing, and drafting your report…"}
                  </div>
                </div>
              </div>

              {/* Shimmer placeholder lines */}
              <div className="space-y-2.5">
                <div className="shimmer h-3 w-full rounded" />
                <div className="shimmer h-3 w-11/12 rounded" />
                <div className="shimmer h-3 w-4/5 rounded" />
                <div className="shimmer h-3 w-3/4 rounded" />
              </div>
            </div>
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
                {answer ? (
                  <div className="hm-report whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {answer}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No readable report was produced for this run.
                  </p>
                )}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
