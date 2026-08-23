import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Send,
  Loader2,
  Sparkles,
  Crown,
  KeyRound,
  TrendingUp,
  BarChart3,
  Search,
  Layers,
  Paperclip,
  Plus,
  X as CloseIcon,
  FileSpreadsheet,
  FileJson,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  startRun,
  getActiveSubscription,
  uploadAttachment,
  type SubscriptionStatus,
  type RunAttachment,
} from "@/lib/runs";
import { getSelectedProvider } from "@/lib/apikeys";
import { SwarmPresetPicker } from "@/components/chat/SwarmPresetPicker";
import { ShadowUploadPanel } from "@/components/chat/ShadowUploadPanel";

/**
 * The Agent workspace is the single research entry point. A prompt is queued
 * as a run via the `start_agent_run` RPC and the user is taken to the run
 * status page.
 *
 * BYOK pivot (2026-08-12): runs are unlimited per subscription — there is no
 * quota to display. The prompt box is gated on two proactive, READ-ONLY
 * (RLS-scoped) client-side checks that mirror the server RPC's actual
 * gates: an active/trialing subscription and a configured DeepSeek key.
 * Both checks are display/UX only — `start_agent_run` re-derives and
 * re-checks everything from `auth.uid()` server-side, so there's no
 * client-trust gap (CLAUDE.md: never trust client-side checks alone).
 */

const EXAMPLES = [
  {
    icon: TrendingUp,
    label: "Backtest a strategy",
    prompt:
      "Backtest a 10/21 EMA crossover on AAPL over the last 2 years and report Sharpe, win rate, and max drawdown.",
    preview: "Sharpe 1.82 · Win rate 64% · Max DD –11.2%",
  },
  {
    icon: BarChart3,
    label: "Compare regimes",
    prompt:
      "Compare momentum vs mean-reversion on BTC/USDT for 2024 and tell me which regime each favored.",
    preview: "Momentum dominated Q1–Q3, mean-rev outperformed Q4",
  },
  {
    icon: Search,
    label: "Screen for setups",
    prompt:
      "Screen for oversold names: RSI(14) below 30 with rising 50-day volume, and rank the top 10.",
    preview: "10 signals found — MSFT, META, AMZN top-ranked",
  },
  {
    icon: Layers,
    label: "Pairs trading edge",
    prompt:
      "Build and evaluate a simple pairs-trading strategy on KO and PEP, then summarize the edge.",
    preview: "Cointegrated 95% CI · Sharpe 1.41 · 38 trades/yr",
  },
];

/** Neural-network motif SVG — represents the agent's reasoning graph */
function AgentBrainSVG() {
  const nodes: [number, number][] = [[24,5],[8,18],[40,18],[16,33],[32,33],[24,26]];
  const edges: [number, number, number, number][] = [
    [24,5,8,18],[24,5,40,18],[8,18,16,33],[8,18,24,26],
    [40,18,32,33],[40,18,24,26],[24,26,16,33],[24,26,32,33],
  ];
  return (
    <svg viewBox="0 0 48 38" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="ag-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="33%" stopColor="#D946EF" />
          <stop offset="66%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#FB923C" />
        </linearGradient>
      </defs>
      {edges.map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="url(#ag-g)" strokeWidth="1.2" strokeOpacity="0.3" />
      ))}
      {nodes.map(([cx,cy],i) => (
        <circle key={i} cx={cx} cy={cy} r={i === 0 ? 4.5 : 3}
          fill="url(#ag-g)" fillOpacity={i === 0 ? 1 : 0.65} />
      ))}
    </svg>
  );
}

/** File-kind → icon */
function AttachIcon({ kind }: { kind: RunAttachment["kind"] }) {
  if (kind === "json") return <FileJson className="h-3.5 w-3.5 text-primary" />;
  return <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />;
}

export function Agent() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<RunAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  // Swarm preset panel — inline "+" toggle next to the send button (formerly
  // the standalone /teams page, folded in 2026-08-21).
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
        // Fail open — the server RPC still enforces the gate. Don't hard-block
        // the UI on a transient read error; the run-start will surface any problem.
        if (cancelled) return;
        setSubscriptionError(true);
        setSubscriptionLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSelectedProvider()
      .then((sel) => {
        if (cancelled) return;
        // configured === true means the user has a usable credential for their
        // selected (or any) provider. Multi-provider aware.
        setApiKeyConfigured(sel.configured);
        setApiKeyLoaded(true);
      })
      .catch(() => {
        // Fail open — same rationale as the subscription check above.
        if (cancelled) return;
        setApiKeyError(true);
        setApiKeyLoaded(true);
      });
    return () => {
      cancelled = true;
    };
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
        // BYOK pivot: no quota to refetch after starting — runs are unlimited
        // per subscription, so subscription/key status don't change here.
        const runId = await startRun(prompt, { attachments });
        navigate(`/run/${runId}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to start run";
        setError(message);
        toast.error(message);
        setStarting(false);
      }
    },
    [navigate, starting, blocked, attachments],
  );

  const fillExample = useCallback((example: string) => {
    setInput(example);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, []);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-12">
      {/* ─── Header ─── */}
      <div className="mb-8 text-center msg-enter">
        <div className="mb-4 flex justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/8">
            <AgentBrainSVG />
            {/* Pulse ring */}
            <span className="pointer-events-none absolute inset-0 rounded-2xl border border-primary/30 animate-ping opacity-20" style={{ animationDuration: "2.5s" }} />
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Research Studio
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          What would you like to <span className="gradient-text">research?</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Ask any trading question. One run per prompt.
        </p>
      </div>

      {/* ─── Access banner — subscription or key missing ─── */}
      {blocked && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3.5">
          <p className="text-xs leading-relaxed text-foreground">
            {noSubscription
              ? "You don't have an active plan yet. Subscribe to start running the agent."
              : "Add your DeepSeek API key on the Profile page before running."}
          </p>
          {noSubscription ? (
            <Link
              to="/pricing"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Crown className="h-3.5 w-3.5" />
              See plans
            </Link>
          ) : (
            <Link
              to="/profile#api-key"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Add key
            </Link>
          )}
        </div>
      )}

      {/* ─── Swarm / Shadow launcher — sibling of the prompt form, never nested
           inside it (its search/var/upload inputs must not trigger the prompt
           form's Enter-to-submit) ─── */}
      {swarmOpen && (
        <div className="mb-3">
          {/* Panel tabs — Specialist teams | Shadow Account */}
          <div className="-mx-1 mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPanelTab("teams")}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                panelTab === "teams"
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              Specialist teams
            </button>
            <button
              type="button"
              onClick={() => setPanelTab("shadow")}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                panelTab === "shadow"
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              Shadow Account
            </button>
          </div>

          {panelTab === "shadow" && (
            <ShadowUploadPanel
              open
              onClose={() => setSwarmOpen(false)}
              isPremium={isPremium}
              subscriptionLoaded={subscriptionLoaded}
              onStarted={(runId) => {
                setSwarmOpen(false);
                navigate(`/run/${runId}`);
              }}
            />
          )}
        </div>
      )}
      <SwarmPresetPicker
        open={swarmOpen && panelTab === "teams"}
        onClose={() => setSwarmOpen(false)}
        isPro={isPro}
        subscriptionLoaded={subscriptionLoaded}
        onStarted={(runId) => {
          setSwarmOpen(false);
          navigate(`/run/${runId}`);
        }}
      />

      {/* ─── Prompt box ─── */}
      <div className="gradient-border glow-pulse rounded-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="rounded-2xl bg-card p-2"
        >
          {/* Attachment chips (Premium only, above the textarea) */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-1.5 pb-1">
              {attachments.map((a) => (
                <span
                  key={a.path}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-[11px]"
                >
                  <AttachIcon kind={a.kind} />
                  <span className="max-w-[160px] truncate font-mono text-foreground">{a.name}</span>
                  <span className="text-muted-foreground">
                    {(a.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.path)}
                    aria-label={`Remove ${a.name}`}
                    className="ml-0.5 rounded-full text-muted-foreground transition hover:text-danger"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  const native = e.nativeEvent as KeyboardEvent & {
                    isComposing?: boolean;
                  };
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
                    ? "Add your DeepSeek key to start running"
                    : "e.g. Backtest a 10/21 EMA crossover on AAPL over the last 2 years…"
              }
              aria-label="Trading research prompt"
              className="max-h-52 min-h-[56px] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-sm outline-none disabled:opacity-60"
            />
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Attach — Premium only, tooltip explains for others */}
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
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border transition",
                  isPremium
                    ? "border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/8"
                    : "border-border/60 text-muted-foreground/50 hover:border-primary/30 hover:text-primary/70 cursor-help",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                aria-label={isPremium ? "Attach data files (CSV, XLSX, JSON)" : "Premium feature — attach data files"}
                title={
                  isPremium
                    ? "Attach research data (CSV, XLSX, JSON — 50 MB max)"
                    : "File attachments require the Premium plan"
                }
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>

              {/* Swarm presets — inline team launcher */}
              <button
                type="button"
                onClick={() => setSwarmOpen((prev) => !prev)}
                disabled={starting || blocked}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border transition",
                  swarmOpen
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/8",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                aria-label="Swarm presets"
                aria-expanded={swarmOpen}
                title="Deploy a specialist team"
              >
                <Plus className={cn("h-4 w-4 transition-transform", swarmOpen && "rotate-45")} />
              </button>

              {/* Send */}
              <button
                type="submit"
                disabled={starting || blocked || !input.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-xl gradient-bg glow-gradient text-white transition hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Start run"
                title="Start run"
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && <p className="mt-2 px-1 text-xs text-danger">{error}</p>}

      {/* ─── Hint + status pill ─── */}
      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-muted-foreground">
          <kbd className="rounded border border-border bg-elevated px-1 font-mono text-[10px]">Enter</kbd> to run · <kbd className="rounded border border-border bg-elevated px-1 font-mono text-[10px]">Shift+Enter</kbd> for new line
        </p>
        {!blocked && apiKeyConfigured && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] font-mono font-medium text-muted-foreground"
            title="BYOK — unlimited runs on your subscription"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Unlimited runs
          </span>
        )}
      </div>

      {/* ─── Teams CTA — Pro & Premium — opens the inline swarm panel above
           (formerly a Link to the standalone /teams page) ─── */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setSwarmOpen(true)}
          className={cn(
            "group flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left transition",
            isPro
              ? "border-primary/25 bg-gradient-to-r from-primary/8 via-secondary/5 to-transparent hover:border-primary/45 hover:from-primary/12"
              : "border-border bg-card/60 hover:border-primary/30",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Run with a research team
                {!isPro && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/8 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                    <Crown className="h-2.5 w-2.5" /> Pro+
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                30 specialist teams — equity research, macro, crypto, quant, sentiment
              </p>
            </div>
          </div>
          <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary transition group-hover:translate-x-0.5 sm:inline-flex">
            Browse teams →
          </span>
        </button>
      </div>

      {/* ─── Example prompts — shown as mini conversations ─── */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Or try a starting point
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {EXAMPLES.map(({ icon: Icon, label, prompt, preview }, i) => (
            <button
              key={label}
              type="button"
              onClick={() => fillExample(prompt)}
              disabled={starting || blocked}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-elevated/40 hover:shadow-lg hover:shadow-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {/* Label row */}
              <div className="flex items-center gap-1.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-elevated transition group-hover:border-primary/30 group-hover:bg-primary/8">
                  <Icon className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[11px] font-semibold text-foreground">{label}</span>
              </div>
              {/* User bubble */}
              <div
                className="bubble-user ml-3 px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                {prompt.length > 62 ? prompt.slice(0, 62) + "…" : prompt}
              </div>
              {/* AI response bubble */}
              <div
                className="bubble-ai px-3 py-1.5 text-[11px] font-mono leading-relaxed text-muted-foreground"
                style={{ animationDelay: `${i * 55 + 80}ms` }}
              >
                <span className="mr-1 text-[9px] text-primary">▶</span>{preview}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
