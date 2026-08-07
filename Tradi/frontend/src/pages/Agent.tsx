import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Send, Loader2, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { startRun, getActiveUsage, type UsageSnapshot } from "@/lib/runs";

/**
 * The Agent workspace is the single research entry point. A prompt is queued as
 * a metered run via the `start_agent_run` RPC (the quota check + 1-use consume
 * happen atomically server-side) and the user is taken to the run status page.
 *
 * The quota shown here is READ-ONLY (RLS-scoped): it surfaces the tier-based
 * allowance and proactively gates the prompt when none remain. The server RPC
 * stays the sole authority — the frontend never writes the counter, so there's
 * no double-charge.
 */

const EXAMPLES = [
  "Backtest a 10/21 EMA crossover on AAPL over the last 2 years and report Sharpe, win rate, and max drawdown.",
  "Compare momentum vs mean-reversion on BTC/USDT for 2024 and tell me which regime each favored.",
  "Screen for oversold names: RSI(14) below 30 with rising 50-day volume, and rank the top 10.",
  "Build and evaluate a simple pairs-trading strategy on KO and PEP, then summarize the edge.",
];

export function Agent() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [usageError, setUsageError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getActiveUsage()
      .then((u) => {
        if (cancelled) return;
        setUsage(u);
        setUsageLoaded(true);
      })
      .catch(() => {
        // Fail open — the server RPC still enforces quota. Don't hard-block the
        // UI on a transient read error; the run-start will surface any problem.
        if (cancelled) return;
        setUsageError(true);
        setUsageLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const noPlan = usageLoaded && !usageError && usage === null;
  const outOfQuota =
    usageLoaded && !usageError && usage !== null && usage.remaining <= 0;
  const blocked = noPlan || outOfQuota;

  const submit = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || starting || blocked) return;
      setStarting(true);
      setError(null);
      try {
        const runId = await startRun(prompt);
        // Refetch usage to show the consumed use immediately (and keep it fresh
        // for when the user returns from RunView). Fail open — if the read fails,
        // the stale display is better than hard-blocking the navigation.
        try {
          const u = await getActiveUsage();
          setUsage(u);
        } catch {
          // Silent fail — navigate with stale quota display
        }
        navigate(`/run/${runId}`);
      } catch (e) {
        // friendlyStartError() already maps quota_exceeded / no-plan /
        // not-authenticated into user-facing copy inside startRun.
        const message = e instanceof Error ? e.message : "Failed to start run";
        setError(message);
        toast.error(message);
        setStarting(false);
      }
    },
    [navigate, starting, blocked],
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
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-10">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">
          <span className="gradient-text">H~Mltd</span> Agent
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a trading research question. Each run consumes one use from your
          plan.
        </p>
      </div>

      {/* Quota-exhausted / no-plan banner */}
      {blocked && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <p className="text-xs text-foreground">
            {noPlan
              ? "You don't have an active plan. Subscribe to start running the agent."
              : `You've used all ${usage?.uses_allowed} runs in your plan this period — it resets at your next billing date.`}
          </p>
          <Link
            to="/pricing"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            <Crown className="h-3.5 w-3.5" />
            {noPlan ? "See plans" : "Upgrade"}
          </Link>
        </div>
      )}

      {/* Prompt box — glowing gradient border (brand) */}
      <div className="gradient-border glow-pulse rounded-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="rounded-2xl bg-card p-2"
        >
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
                blocked
                  ? "No runs left — upgrade to continue"
                  : "Ask H~Mltd a trading research question…"
              }
              aria-label="Trading research prompt"
              className="max-h-40 min-h-[52px] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-sm outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={starting || blocked || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-bg glow-gradient text-white transition hover:opacity-90 disabled:opacity-50"
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
        </form>
      </div>

      {error && <p className="mt-2 px-1 text-xs text-danger">{error}</p>}

      {/* Hint + remaining-quota pill */}
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-muted-foreground">
          Press Enter to run · Shift+Enter for a new line
        </p>
        {usageLoaded && !usageError && usage !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              usage.remaining <= 0
                ? "border-danger/40 text-danger"
                : usage.remaining <= 1
                  ? "border-amber-500/40 text-amber-500"
                  : "border-border text-muted-foreground",
            )}
            title="Runs remaining in your current billing period"
          >
            {usage.remaining} of {usage.uses_allowed} runs left
          </span>
        )}
      </div>

      {/* Examples */}
      <div className="mt-8">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Try one of these
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => fillExample(ex)}
              disabled={starting || blocked}
              className="rounded-xl border border-border bg-card p-3 text-left text-xs leading-relaxed text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
