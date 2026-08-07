import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { startRun } from "@/lib/runs";

/**
 * The Agent workspace is the single research entry point. A prompt is queued as
 * a metered run via the `start_agent_run` RPC (quota check + consume happen
 * atomically server-side) and the user is taken to the run status page, where
 * the worker's progress, result, and artifacts are shown.
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

  const submit = useCallback(
    async (raw: string) => {
      const prompt = raw.trim();
      if (!prompt || starting) return;
      setStarting(true);
      setError(null);
      try {
        const runId = await startRun(prompt);
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
    [navigate, starting],
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
          Ask a trading research question. Each run is queued to the agent and
          metered against your plan.
        </p>
      </div>

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
              disabled={starting}
              placeholder="Ask H~Mltd a trading research question…"
              aria-label="Trading research prompt"
              className="max-h-40 min-h-[52px] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-sm outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={starting || !input.trim()}
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
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        Press Enter to run · Shift+Enter for a new line
      </p>

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
              disabled={starting}
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
