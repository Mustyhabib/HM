import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Send,
  Loader2,
  Crown,
  KeyRound,
  Paperclip,
  Plus,
  Users,
  X as CloseIcon,
  FileSpreadsheet,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BETA_MODE } from "@/lib/beta";
import { useAuth } from "@/lib/auth-store";
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

/** Teams-tab styling — active state when the picker is open above. */
function cnSwarmTab(open: boolean): string {
  return cn(
    "flex h-7 items-center justify-center gap-1 rounded-lg transition disabled:opacity-40",
    open
      ? "border border-primary/50 bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-elevated hover:text-primary",
  );
}

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

  // Multi-run thread: every submitted prompt stacks inline, oldest → newest.
  const [runIds, setRunIds] = useState<string[]>([]);
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const [attachments, setAttachments] = useState<RunAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Swarm launcher — MANUAL only. The picker displays ABOVE the composer,
  // closes on outside click, and a chosen team can be exported into the
  // prompt via the rightmost "+" (adds a swarm directive to the text).
  const [swarmOpen, setSwarmOpen] = useState(false);
  const [chosenSwarm, setChosenSwarm] = useState<string | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Click-outside closes the swarm panel.
  useEffect(() => {
    if (!swarmOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!composerRef.current?.contains(e.target as Node)) setSwarmOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [swarmOpen]);

  /** Export the chosen swarm into the prompt as an explicit directive. */
  const addSwarmToPrompt = useCallback(() => {
    if (!chosenSwarm) return;
    setInput((prev) => {
      const directive = `[Use the ${chosenSwarm} specialist team] `;
      if (prev.includes(`[${chosenSwarm}`)) return prev; // already added
      return directive + prev;
    });
    setSwarmOpen(false);
    toast.success(`${chosenSwarm} attached to your prompt`);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [chosenSwarm]);

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

  const noSubscription = BETA_MODE
    ? false // open beta: subscription gate lifted (tiered, not deleted)
    : subscriptionLoaded && !subscriptionError && subscription === null;
  const noApiKey = BETA_MODE
    ? false // open beta: BYOK gate lifted — runs use the platform default provider
    : apiKeyLoaded && !apiKeyError && apiKeyConfigured === false;
  const blocked = noSubscription || noApiKey;

  /** Upload one or more research data files (Premium at launch; open to all
   * during the open beta). */
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!isPremium && !BETA_MODE) {
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

  // Open beta: bootstrap an anonymous (guest) session so the first submit has
  // a real auth.uid() — server RPCs, quota, and rate limits all work normally.
  const { ensureGuestSession } = useAuth();
  useEffect(() => {
    if (!BETA_MODE) return;
    void ensureGuestSession();
  }, [BETA_MODE, ensureGuestSession]);

  const submit = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || starting || blocked) return;
      setSwarmOpen(false);
      setStarting(true);
      setError(null);
      try {
        const runId = await startRun(prompt, { attachments });
        // Stack inline — the composer stays ready for the next prompt.
        setRunIds((prev) => [...prev, runId]);
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

  // Live progress for each run in the thread. Subscriptions are ADDED
  // incrementally as new runs stack — existing channels are never torn down
  // and re-created (the old keyed-on-runIds effect dropped updates during
  // every resubscribe window). Channels live until the page unmounts.
  const subscribedRef = useRef<Set<string>>(new Set());
  const unsubsRef = useRef<Array<() => void>>([]);
  useEffect(() => {
    runIds.forEach((id) => {
      if (subscribedRef.current.has(id)) return;
      subscribedRef.current.add(id);

      unsubsRef.current.push(
        subscribeToRun(id, (r) => {
          setRuns((prev) => ({ ...prev, [id]: r }));
          if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }),
      );

      // Hydrate the row we just created (prompt echo before first update).
      import("@/lib/runs").then(({ getRun }) =>
        getRun(id).then((r) => {
          if (r) setRuns((prev) => (prev[id] ? prev : { ...prev, [id]: r }));
        }),
      );
    });
  }, [runIds]);

  // Final teardown — once, on unmount.
  useEffect(
    () => () => {
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
    },
    [],
  );

  // Rotating placeholder — quiet hint without an example-card grid.
  const [exampleIdx, setExampleIdx] = useState(0);
  useEffect(() => {
    if (input || blocked || starting) return;
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 6000);
    return () => clearInterval(t);
  }, [input, blocked, starting]);

  /** Thin one-line status strip per run. */
  function StatusStrip({ id }: { id: string }) {
    const run = runs[id];
    const status = run?.status ?? "queued";
    const running = status === "queued" || status === "running";

    return (
      <div className="rounded-lg border border-border/70 bg-card/60 px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs">
          {running ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
          ) : (
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                status === "completed" ? "bg-success" : "bg-danger",
              )}
            />
          )}
          <span className="font-medium">{run?.prompt ?? "…"}</span>
          <span
            className={cn(
              "shrink-0",
              running ? "text-primary" : status === "completed" ? "text-success" : "text-danger",
            )}
          >
            {running
              ? status === "queued" ? "queued" : "running"
              : status === "completed" ? "done" : "failed"}
          </span>
          <Link
            to={`/run/${id}`}
            className="ml-auto shrink-0 font-medium text-primary hover:underline"
          >
            Full view →
          </Link>
        </div>

        {/* Live progress line — Realtime-pushed by the worker */}
        {run?.progress_message && (
          <p className="mt-1 truncate border-t border-border/50 pt-1 font-mono text-[11px] text-muted-foreground">
            <span className="mr-1.5 text-primary">›</span>
            {run.progress_message}
            {run.progress_iter != null && (
              <span className="ml-2 rounded bg-elevated px-1 py-0.5 text-[9px]">
                iter {run.progress_iter}/{run.max_iter}
              </span>
            )}
          </p>
        )}

        {status === "failed" && run?.error_message && (
          <p className="mt-1 truncate border-t border-border/50 pt-1 text-[11px] text-danger">
            {run.error_message}
          </p>
        )}

        {/* Artifact bundle pill once complete */}
        {status === "completed" && (
          <div className="border-t border-border/50 pt-1">
            <ArtifactBundleStrip runId={id} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col">
      {/* Right hanging past-chats rail */}
      <ChatHistoryPanel />

      {/* ─── Canvas: empty until a run opens inline ─── */}
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-44 pt-6 lg:pr-80">
        {/* Greeting — fades out once a thread exists */}
        {runIds.length === 0 && (
          <div className="msg-enter mt-[18vh] text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              What would you like to <span className="gradient-text">research?</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One prompt, one reproducible research run.
            </p>
          </div>
        )}

        {/* ─── Multi-run thread: prompts stack inline, oldest → newest ─── */}
        {runIds.length > 0 && (
          <div ref={threadRef} className="mx-auto w-full max-w-3xl space-y-3 overflow-y-auto">
            {runIds.map((id) => (
              <div key={id} className="space-y-2">
                {/* Prompt echo */}
                <div className="bubble-user ml-auto w-fit max-w-[85%] px-3.5 py-2 text-sm text-foreground">
                  {runs[id]?.prompt ?? "…"}
                </div>
                {/* Thin streaming status strip */}
                <StatusStrip id={id} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Bottom-docked composer — offset RIGHT of the chats rail ─── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:pl-60">
        <div ref={composerRef} className="pointer-events-auto ml-auto max-w-3xl px-6 pb-5 lg:mr-[max(1.5rem,calc((100vw-60rem)/2))] lg:pr-24">
          {/* ─── Swarm picker — displays ABOVE the prompt box, closes on
               outside click (handled by composerRef listener) ─── */}
          {swarmOpen && (
            <div className="mb-2">
              <SwarmPresetPicker
                open
                onClose={() => setSwarmOpen(false)}
                isPro={isPro}
                subscriptionLoaded={subscriptionLoaded}
                onChosen={(title) => { setChosenSwarm(title); setSwarmOpen(false); }}
                onStarted={(runId) => {
                  setSwarmOpen(false);
                  setRunIds((prev) => [...prev, runId]);
                }}
              />
            </div>
          )}

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
                {/* LEFTMOST controls: 📎 (attach) and teams tab (opens the
                    picker ABOVE this box; click-outside closes) */}
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
                    if (!isPremium && !BETA_MODE) {
                      toast.error("File attachments are a Premium feature");
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  disabled={starting || blocked || uploading}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-primary disabled:opacity-40"
                  aria-label={isPremium || BETA_MODE ? "Attach data files (CSV, XLSX, JSON)" : "Premium feature — attach data files"}
                  title={isPremium || BETA_MODE ? "Attach research data (CSV, XLSX, JSON) — free during beta" : "File attachments require Premium at launch"}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSwarmOpen((p) => !p)}
                  disabled={starting || blocked}
                  className={cnSwarmTab(swarmOpen)}
                  aria-expanded={swarmOpen}
                  aria-label={`Specialist teams (${SWARM_TEAM_COUNT} available)`}
                  title={`Specialist teams (${SWARM_TEAM_COUNT}) — pick one, then add it to your prompt`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span className="hidden text-[11px] font-medium sm:inline">{SWARM_TEAM_COUNT}</span>
                </button>

                {/* Chosen swarm chip */}
                {chosenSwarm && (
                  <span className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2 py-0.5 text-[10px] text-primary">
                    <Users className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{chosenSwarm}</span>
                    <button
                      type="button"
                      onClick={() => setChosenSwarm(null)}
                      aria-label={`Remove ${chosenSwarm}`}
                      className="rounded-full transition hover:text-danger"
                    >
                      <CloseIcon className="h-2.5 w-2.5" />
                    </button>
                  </span>
                )}

                <span className="flex-1" />

                <kbd className="hidden rounded border border-border bg-elevated px-1 font-mono text-[9px] text-muted-foreground sm:block">
                  Enter
                </kbd>

                {/* RIGHTMOST "+": export the chosen swarm into the prompt */}
                {chosenSwarm && (
                  <button
                    type="button"
                    onClick={addSwarmToPrompt}
                    disabled={starting || blocked}
                    className="flex h-7 items-center justify-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary transition hover:bg-primary/15 disabled:opacity-40"
                    aria-label={`Add ${chosenSwarm} to prompt`}
                    title={`Add "${chosenSwarm}" to your prompt`}
                  >
                    <Plus className="h-3 w-3" /> Add to prompt
                  </button>
                )}

                {/* Send */}
                <button
                  type="submit"
                  disabled={starting || blocked || !input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-bg glow-gradient text-white transition hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
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

    </div>
  );
}
