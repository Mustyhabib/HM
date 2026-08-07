import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: ReactNode }> = {
    queued: { label: "Queued", cls: "bg-primary/10 text-primary", icon: <Clock className="h-3.5 w-3.5" /> },
    running: { label: "Running", cls: "bg-secondary/15 text-secondary", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    completed: { label: "Completed", cls: "bg-success/10 text-success", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    failed: { label: "Failed", cls: "bg-danger/10 text-danger", icon: <XCircle className="h-3.5 w-3.5" /> },
    timeout: { label: "Timed out", cls: "bg-danger/10 text-danger", icon: <XCircle className="h-3.5 w-3.5" /> },
    cancelled: { label: "Cancelled", cls: "bg-elevated text-muted-foreground", icon: <XCircle className="h-3.5 w-3.5" /> },
  };
  const s = map[status] ?? map.queued;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
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
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} open
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
    <div className="mx-auto max-w-3xl p-6">
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Studio
      </Link>

      {loading && !run && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading run…
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>
      )}

      {run && (
        <>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold">Agent run</h1>
              <p className="mt-1 text-sm text-muted-foreground">{run.prompt}</p>
            </div>
            <StatusBadge status={run.status} />
          </div>

          {ACTIVE.has(run.status) && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
              {run.status === "queued"
                ? "Waiting for a worker to pick this up…"
                : "The agent is researching…"}
            </div>
          )}

          {(run.status === "failed" || run.status === "timeout") && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
              <p className="font-medium text-danger">
                This run {run.status === "timeout" ? "timed out" : "failed"}.
              </p>
              {run.error_message && <p className="mt-1 text-muted-foreground">{run.error_message}</p>}
              {run.refunded && <p className="mt-2 text-success">Your use was refunded.</p>}
            </div>
          )}

          {run.status === "completed" && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-primary" /> Result
              </h2>
              {answer ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer}</div>
              ) : (
                <p className="text-sm text-muted-foreground">No readable report was produced for this run.</p>
              )}
            </div>
          )}

          {artifacts.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Artifacts ({artifacts.length})
              </h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {artifacts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      <span className="mr-2 rounded bg-elevated px-1.5 py-0.5 text-[10px] uppercase text-foreground">
                        {a.kind}
                      </span>
                      {a.storage_path.split("/").slice(2).join("/")}
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
