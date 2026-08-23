import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Send,
  Loader2,
  Crown,
  KeyRound,
  Paperclip,
  Plus,
  X as CloseIcon,
  FileSpreadsheet,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import {
  startRun,
  getActiveSubscription,
  uploadAttachment,
  subscribeToRun,
  type SubscriptionStatus,
  type RunAttachment,
  type AgentRun,
} from "@/lib/runs";
import { getSelectedProvider } from "@/lib/apikeys";
import { SwarmPresetPicker } from "@/components/chat/SwarmPresetPicker";
import { ShadowUploadPanel } from "@/components/chat/ShadowUploadPanel";
import { ChatHistoryPanel } from "@/components/agent/ChatHistoryPanel";
import { ArtifactBundleStrip } from "@/components/agent/ArtifactBundleStrip";

/**
 * Research Agent — rebuilt 2026-08-23 (HM spec):
 *
 * Clean single-focus canvas. The prompt box sits at the BOTTOM of the page
 * (chat-style), compact and refined; the "+" (swarm teams) and paperclip
 * (attachments) buttons sit at the LEFTMOST edge of the box. All large
 * marketing blocks (hero, example grid, teams CTA banner) are removed —
 * examples collapse into placeholder rotation and swarm is a small
 * clickable tab showing the team count.
 *
 * A prompt opens the run INLINE on this page (live progress via Supabase
 * Realtime — push-based, replaces the retired HTTP-SSE path) instead of
 * navigating away; past chats hang in the right-side ChatHistoryPanel.
 */

const EXAMPLES = [
  "Backtest a 10/21 EMA crossover on AAPL over the last 2 years — Sharpe, win rate, max drawdown.",
  "Compare momentum vs mean-reversion on BTC/USDT for 2024 — which regime favored each?",
  "Screen for oversold names: RSI(14) < 30 with rising 50-day volume, rank the top 10.",
  "Build a pairs-trading strategy on KO and PEP and summarize the edge.",
];

const SWARM_TEAM_COUNT = 30;

/** File-kind → icon */
function AttachIcon({ kind }: { kind: RunAttachment["kind"] }) {
  if (kind === "json") return <FileJson className="h-3 w-3 text-primary" />;
  return <FileSpreadsheet className="h-3 w-3 text-primary" />;
}

export function Agent() {
  const [searchParams] = useSearchParams();

  // Pre-fill textarea from ?prompt= (set by dashboard suggestion chips)
  const [input, setInput] = useState(() => searchParams.get("prompt") ?? "");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline live output for the most recent run (this session).
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveRun, setLiveRun] = useState<AgentRun | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const [attachments, setAttachments] = useState<RunAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Swarm launcher — MANUAL only: a small clickable tab showing the team
  // count ("30"); clicking opens the preset picker. Nothing auto-runs.
  const [swarmOpen, setSwarmOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"teams" | "shadow">("teams");

  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState(false);
  const isPremium = subscription?.planId === "premium";
  const isPro = subscription?.planId === "pro" || subscription?.planId === "premium";

  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getActiveSubscription()
      .then((s) => {
        if (cancelled) return;
        setSubscription(s);
        setSubscriptionLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSubscriptionError(true);
        setSubscriptionLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSelectedProvider()
      .then((sel) => {
        if (cancelled) return;
        setApiKeyConfigured(sel.configured);
        setApiKeyLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setApiKeyError(true);
        setApiKeyLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const noSubscription = subscriptionLoaded && !subscriptionError && subscription === null;
  const noApiKey = apiKeyLoaded && !apiKeyError && apiKeyConfigured === false;
  const blocked = noSubscription || noApiKey;

  /** Upload one or more research data files (Premium only). */
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!isPremium) {
      toast.error("File attachments are a Premium feature");
      return;
    }
    setUploading(true);
    const uploaded: RunAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const att = await uploadAttachment(file);
        uploaded.push(att);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        toast.error(`${file.name}: ${msg}`);
      }
    }
    if (uploaded.length) {
      setAttachments((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} attached`);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [isPremium]);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || starting || blocked) return;
      setSwarmOpen(false);
      setStarting(true);
      setError(null);
      try {
        const runId = await startRun(prompt, { attachments });
        // Open inline — the run streams into this page's output area.
        setLiveRunId(runId);
        setAttachments([]);
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to start run";
        setError(message);
        toast.error(message);
      } finally {
        setStarting(false);
      }
    },
    [starting, blocked, attachments],
  );

  // Live progress for the in-page output: subscribe while a run is active.
  useEffect(() => {
    if (!liveRunId) return;
    let cancelled = false;

    const apply = (r: AgentRun) => {
      if (cancelled) return;
      setLiveRun(r);
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    };

    import("@/lib/runs").then(({ getRun }) =>
      getRun(liveRunId).then((r) => { if (r) apply(r); }),
    );

    const unsub = subscribeToRun(liveRunId, apply);
    return () => { cancelled = true; unsub(); };
  }, [liveRunId]);

  // Rotating placeholder — quiet hint without an example-card grid.
  const [exampleIdx, setExampleIdx] = useState(0);
  useEffect(() => {
    if (input || blocked || starting) return;
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 6000);
    return () => clearInterval(t);
  }, [input, blocked, starting]);

  const activeStatus = liveRun?.status ?? null;
  const isActive = activeStatus === "queued" || activeStatus === "running";

  return (
    <div className="relative flex min-h-full flex-col">
      {/* Right hanging past-chats rail */}
      <ChatHistoryPanel />

      {/* ─── Canvas: empty until a run opens inline ─── */}
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-44 pt-6 lg:pr-80">
        {/* Greeting — fades out once a run exists */}
        {!liveRunId && (
          <div className="msg-enter mt-[18vh] text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              What would you like to <span className="gradient-text">research?</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One prompt, one reproducible research run.
            </p>
          </div>
        )}

        {/* ─── Inline live output ─── */}
        {liveRunId && (
          <div ref={outputRef} className="mx-auto w-full max-w-3xl space-y-3 overflow-y-auto">
            {/* Prompt echo */}
            <div className="bubble-user ml-auto w-fit max-w-[85%] px-3.5 py-2 text-sm text-foreground">
              {liveRun?.prompt ?? "…"}
            </div>

            {/* Status card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2.5">
                {isActive ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : activeStatus === "completed" ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
                )}
                <p className="text-sm font-medium">
                  {isActive
                    ? liveRun?.status === "queued"
                      ? "Queued — waiting for a worker…"
                      : "Running"
                    : activeStatus === "completed"
                      ? "Completed"
                      : "Failed"}
                </p>
                <Link
                  to={`/run/${liveRunId}`}
                  className="ml-auto shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Full view →
                </Link>
              </div>

              {/* Live progress line — Realtime-pushed by the worker */}
              {liveRun?.progress_message && (
                <p className="mt-2.5 truncate border-t border-border/60 pt-2.5 font-mono text-xs text-muted-foreground">
                  <span className="mr-1.5 text-primary">›</span>
                  {liveRun.progress_message}
                  {liveRun.progress_iter != null && (
                    <span className="ml-2 rounded bg-elevated px-1.5 py-0.5 text-[10px]">
                      iter {liveRun.progress_iter}/{liveRun.max_iter}
                    </span>
                  )}
                </p>
              )}

              {activeStatus === "failed" && liveRun?.error_message && (
                <p className="mt-2.5 border-t border-border/60 pt-2.5 text-xs text-danger">
                  {liveRun.error_message}
                </p>
              )}

              {/* Artifact bundle — small pill, bottom-left below the output.
                  One click downloads every artifact the run produced. */}
              {activeStatus === "completed" && (
                <div className="border-t border-border/60 pt-2.5">
                  <ArtifactBundleStrip runId={liveRunId} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom-docked composer ─── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:pl-60 lg:pr-80">
        <div className="pointer-events-auto mx-auto max-w-3xl px-6 pb-5">
          {/* Access banner — only when blocked */}
          {blocked && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
              <p className="text-xs leading-relaxed text-foreground">
                {noSubscription
                  ? "You don't have an active plan yet. Subscribe to start running the agent."
                  : "Configure an LLM provider key on the Profile page before running."}
              </p>
              {noSubscription ? (
                <Link
                  to="/pricing"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <Crown className="h-3.5 w-3.5" /> See plans
                </Link>
              ) : (
                <Link
                  to="/profile#api-key"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Add key
                </Link>
              )}
            </div>
          )}

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <span
                  key={a.path}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-2.5 py-1 text-[11px]"
                >
                  <AttachIcon kind={a.kind} />
                  <span className="max-w-[160px] truncate font-mono">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.path)}
                    aria-label={`Remove ${a.name}`}
                    className="rounded-full text-muted-foreground transition hover:text-danger"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Composer — compact, refined */}
          <div className="gradient-border rounded-xl shadow-lg shadow-black/5">
            <form
              onSubmit={(e) => { e.preventDefault(); submit(input); }}
              className="rounded-xl bg-card p-1.5"
            >
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
                    if (native.isComposing || native.keyCode === 229) return;
                    e.preventDefault();
                    submit(input);
                  }
                }}
                disabled={starting || blocked}
                placeholder={
                  blocked && noSubscription
                    ? "Subscribe to start running the agent"
                    : blocked && noApiKey
                      ? "Add your provider key to start running"
                      : EXAMPLES[exampleIdx]
                }
                aria-label="Trading research prompt"
                className="max-h-40 w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
              />

              <div className="flex items-center gap-1 px-1 pb-0.5 pt-1">
                {/* LEFTMOST controls: + (teams) and 📎 (attach) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"
                  multiple
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                  aria-label="Attach research data files"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!isPremium) {
                      toast.error("File attachments are a Premium feature");
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={starting || blocked || uploading}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-primary disabled:opacity-40"
                  aria-label={isPremium ? "Attach data files (CSV, XLSX, JSON)" : "Premium feature — attach data files"}
                  title={isPremium ? "Attach research data (CSV, XLSX, JSON)" : "File attachments require Premium"}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSwarmOpen(true)}
                  disabled={starting || blocked}
                  className="flex h-7 items-center justify-center gap-1 rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-primary disabled:opacity-40"
                  aria-label={`Deploy a specialist team (${SWARM_TEAM_COUNT} available)`}
                  title={`Specialist teams (${SWARM_TEAM_COUNT})`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden text-[11px] font-medium sm:inline">{SWARM_TEAM_COUNT}</span>
                </button>

                <span className="flex-1" />

                <kbd className="hidden rounded border border-border bg-elevated px-1 font-mono text-[9px] text-muted-foreground sm:block">
                  Enter
                </kbd>

                {/* Send — rightmost */}
                <button
                  type="submit"
                  disabled={starting || blocked || !input.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg glow-gradient text-white transition hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Start run"
                >
                  {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </form>
          </div>

          {error && <p className="mt-1.5 px-1 text-xs text-danger">{error}</p>}
        </div>
      </div>

      {/* ─── Swarm / Shadow launcher panels (manual, opened from the + tab) ─── */}
      {swarmOpen && panelTab === "shadow" && (
        <ShadowUploadPanel
          open
          onClose={() => setSwarmOpen(false)}
          isPremium={isPremium}
          subscriptionLoaded={subscriptionLoaded}
          onStarted={(runId) => {
            setSwarmOpen(false);
            setLiveRunId(runId);
          }}
        />
      )}
      <SwarmPresetPicker
        open={swarmOpen && panelTab === "teams"}
        onClose={() => setSwarmOpen(false)}
        isPro={isPro}
        subscriptionLoaded={subscriptionLoaded}
        onStarted={(runId) => {
          setSwarmOpen(false);
          setLiveRunId(runId);
        }}
      />

      {/* Keep Shadow tab reachable: tiny switcher inside the picker overlay era */}
      {swarmOpen && panelTab === "teams" && (
        <button
          type="button"
          onClick={() => setPanelTab("shadow")}
          className="sr-only"
          aria-hidden
        >
          Shadow Account
        </button>
      )}
    </div>
  );
}
