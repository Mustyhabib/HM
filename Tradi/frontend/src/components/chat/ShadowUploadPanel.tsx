import { useCallback, useEffect, useRef, useState } from "react";
import { FileSearch, X as CloseIcon, Loader2, ArrowRight, Crown } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { uploadAttachment, type RunAttachment } from "@/lib/runs";
import { SHADOW_DEFAULT_PROMPT, startShadowRun } from "@/lib/shadow";

/**
 * ShadowUploadPanel — the Shadow Account launcher (Premium tier), shown in the
 * Agent page's inline "+" panel next to the swarm preset picker.
 *
 * Upload a broker trade journal (CSV/XLSX/JSON), optionally refine the prompt,
 * and start a shadow run. The Premium gate mirrors the server's
 * `start_shadow_run` check but is UI-only — the RPC re-derives everything from
 * `auth.uid()` server-side.
 *
 * Renders as a sibling of the Agent prompt box's <form> (same rule as the
 * swarm picker): its inputs must never trigger the prompt form's submit.
 */
interface ShadowUploadPanelProps {
  /** Panel visibility — controlled by the parent's "+" toggle. */
  open: boolean;
  onClose: () => void;
  /** Premium gate — mirrors `start_shadow_run`'s plan check. */
  isPremium: boolean;
  /** Whether the subscription check has resolved (avoids a gate-banner flash). */
  subscriptionLoaded: boolean;
  /** Called with the new run id once `startShadowRun` succeeds. */
  onStarted: (runId: string) => void;
}

const ALLOWED_HINT = ".csv, .xlsx, .json — broker exports (同花顺 / 东方财富 / 富途 / generic)";

export function ShadowUploadPanel({
  open,
  onClose,
  isPremium,
  subscriptionLoaded,
  onStarted,
}: ShadowUploadPanelProps) {
  const [journal, setJournal] = useState<RunAttachment | null>(null);
  const [prompt, setPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const gated = subscriptionLoaded && !isPremium;

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Reset whenever the panel closes, so it reopens fresh.
  useEffect(() => {
    if (!open) {
      setJournal(null);
      setPrompt("");
      setUploading(false);
      setStarting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  const pickFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (gated) return;
      setUploading(true);
      try {
        const att = await uploadAttachment(file);
        setJournal(att);
        toast.success(`${att.name} staged for shadow analysis`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    },
    [gated],
  );

  const run = useCallback(async () => {
    if (!journal || starting || gated) return;
    setStarting(true);
    try {
      const runId = await startShadowRun(journal.path, prompt || undefined);
      onStarted(runId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start shadow run";
      toast.error(msg);
      setStarting(false);
    }
  }, [journal, prompt, starting, gated, onStarted]);

  if (!open) return null;

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-4 msg-enter">
      {/* ─── Header ─── */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
            <FileSearch className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Shadow Account</h2>
            <p className="text-[11px] text-muted-foreground">
              Upload your trade journal — get a behavior profile, an extracted strategy, and a shadow backtest
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shadow account"
          className="rounded-full p-1.5 text-muted-foreground transition hover:bg-elevated hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Plan gate banner ─── */}
      {gated && (
        <div className="mb-3 flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5">
            <Crown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-foreground">Shadow Account requires the Premium plan.</p>
          </div>
          <Link
            to="/pricing"
            className="shrink-0 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            See plans
          </Link>
        </div>
      )}

      {/* ─── Journal upload ─── */}
      <div className="space-y-3">
        {journal ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <FileSearch className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate font-mono text-foreground">{journal.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {(journal.size / 1024).toFixed(0)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={() => setJournal(null)}
              className="shrink-0 text-xs font-medium text-muted-foreground transition hover:text-danger"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || gated}
            className="w-full rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center transition hover:border-primary/40 hover:bg-elevated/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="text-sm font-medium text-foreground">
              {uploading ? "Uploading…" : "Choose a trade journal"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{ALLOWED_HINT}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.json"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </button>
        )}

        {/* ─── Prompt (optional) ─── */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder={SHADOW_DEFAULT_PROMPT}
          aria-label="Shadow analysis prompt (optional)"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50"
        />

        {/* ─── Start ─── */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!journal || starting || gated}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            {starting ? "Starting…" : gated ? "Upgrade required" : "Run shadow analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}
