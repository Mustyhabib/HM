import { Link } from "react-router";
import { ArrowRight, Bot, BarChart3, Shield, FlaskConical, TrendingUp } from "lucide-react";

/* ─── Market ticker data ─── */
const TICKER_ITEMS = [
  { sym: "AAPL",  val: "+2.14%", pos: true  },
  { sym: "BTC",   val: "-0.82%", pos: false },
  { sym: "TSLA",  val: "+4.31%", pos: true  },
  { sym: "ETH",   val: "+1.24%", pos: true  },
  { sym: "SPY",   val: "+0.56%", pos: true  },
  { sym: "SOL",   val: "-1.13%", pos: false },
  { sym: "NVDA",  val: "+3.47%", pos: true  },
  { sym: "GLD",   val: "+0.24%", pos: true  },
  { sym: "QQQ",   val: "+1.85%", pos: true  },
  { sym: "MSFT",  val: "-0.31%", pos: false },
];

function TickerStrip() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="ticker-wrap border-y border-border/50 bg-[var(--bg-panel)] py-2.5">
      <div className="ticker-inner">
        {items.map(({ sym, val, pos }, i) => (
          <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-mono text-xs font-semibold text-foreground/70">{sym}</span>
            <span className={`font-mono text-[11px] font-medium ${pos ? "text-success" : "text-danger"}`}>{val}</span>
            <span className="mx-1 h-3 w-px bg-border/60" />
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Bot,
    title: "AI Research Agent",
    desc: "Ask any trading question in plain English. The agent hypothesizes, sources data, backtests, and generates a full research report — no code required.",
    tags: ["NLP hypothesis", "Strategy synthesis", "Auto-backtest", "Report generation"],
  },
  {
    icon: BarChart3,
    title: "Quantitative Backtesting",
    desc: "462 alpha factors, 8 backtest engines, cross-market coverage. Real quant-grade analysis without a single line of Python.",
    tags: [],
  },
  {
    icon: FlaskConical,
    title: "Experiment Registry",
    desc: "Every run is logged, versioned, and replayable. Compare strategies side-by-side and promote winners through validation gates.",
    tags: [],
  },
  {
    icon: TrendingUp,
    title: "Research-to-Paper Workflow",
    desc: "From idea to validated paper trade — the full promotion ladder with walk-forward validation, drawdown gates, and risk checks.",
    tags: [],
  },
  {
    icon: Shield,
    title: "Research Only — By Design",
    desc: "No live trading at MVP. Your capital stays in your broker account. We never touch it, hold it, or proxy it.",
    tags: [],
  },
];

const STEPS = [
  { step: "1", title: "Ask your question", desc: "Describe a strategy, market hypothesis, or asset to research in plain English." },
  { step: "2", title: "Data is sourced", desc: "The platform pulls canonical, point-in-time market data from the institutional feed." },
  { step: "3", title: "Agent experiments", desc: "The AI agent runs backtests, applies alpha factors, and stress-tests the idea." },
  { step: "4", title: "Get your report", desc: "View a full research report — equity curve, metrics, risk breakdown, and next steps." },
];

/** Hero preview: terminal chrome + trading chart video */
function ChartPreview() {
  return (
    <div className="relative rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden glass">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border bg-[var(--bg-panel)] px-4 py-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground/70 truncate">
          H~Mltd Agent · EMA Crossover BTC/USDT 2024
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 border border-success/25 px-2 py-0.5 text-[10px] font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          completed
        </span>
      </div>

      {/* Chart video with metrics overlay */}
      <div className="relative overflow-hidden" style={{ height: "270px" }}>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover object-center"
        >
          <source src="/trading-chart.mp4" type="video/mp4" />
        </video>

        {/* Bottom gradient + floating metrics */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/70 to-transparent px-4 pb-4 pt-10">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Sharpe",   value: "1.82",   accent: true  },
              { label: "Win Rate", value: "64%",    accent: false },
              { label: "Return",   value: "+23.4%", accent: false },
            ].map(({ label, value, accent }) => (
              <div
                key={label}
                className={
                  accent
                    ? "rounded-lg border border-primary/30 bg-primary/20 px-3 py-2 text-center backdrop-blur-md"
                    : "rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-center backdrop-blur-md"
                }
              >
                <div className={`font-mono text-sm font-bold ${accent ? "gradient-text" : "text-foreground"}`}>{value}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI output snippet */}
      <div className="border-t border-border/50 px-4 py-3">
        <div className="rounded-lg border border-border/50 bg-[var(--bg-panel)] px-3 py-3">
          <div className="font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-primary">▶</span>
            {" "}The 10/21 EMA crossover shows consistent alpha in trending regimes.
            <br />
            <span className="text-muted-foreground/50">Max drawdown capped at </span>
            <span className="text-danger">-11.2%</span>
            <span className="text-muted-foreground/50">; Profit Factor </span>
            <span className="text-foreground">2.34</span>
            <span className="text-primary cursor-blink">▌</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex flex-col">

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden grid-bg">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-cyan-500/8 blur-3xl float-y" />
        <div className="pointer-events-none absolute top-32 right-1/5 h-64 w-64 rounded-full bg-blue-600/8 blur-3xl float-y-slow" />
        <div className="pointer-events-none absolute inset-0 signal-lines opacity-40" />

        <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl flex-col items-center justify-center gap-14 px-4 py-20 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:py-0">

          {/* Left — copy */}
          <div className="flex max-w-lg flex-col items-start msg-enter">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Quant Research OS
            </span>

            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.06]">
              Research-grade<br />quant analysis,<br />on demand
            </h1>

            <p className="mt-5 max-w-[44ch] text-base text-muted-foreground sm:text-lg leading-relaxed">
              Institutional market data, 462 alpha factors, and an AI research agent —
              all in one platform. From idea to validated strategy, without writing code.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                Start Researching <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition hover:bg-elevated active:scale-[0.98]"
              >
                View Pricing
              </Link>
            </div>

            {/* Trust stats */}
            <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-border/50 pt-6">
              {[
                { value: "403B+", label: "Market ticks" },
                { value: "462",   label: "Alpha factors" },
                { value: "8",     label: "Backtest engines" },
              ].map(({ value, label }, i) => (
                <div key={label} className="flex items-center gap-6">
                  {i > 0 && <div className="h-8 w-px bg-border" />}
                  <div>
                    <div className="font-mono text-xl font-bold gradient-text">{value}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — chart preview */}
          <div className="w-full max-w-md flex-shrink-0 lg:max-w-none lg:w-[420px] fade-up-in" style={{ animationDelay: "120ms" }}>
            <ChartPreview />
          </div>
        </div>
      </section>

      {/* ─── Live market ticker ─── */}
      <TickerStrip />

      {/* ─── How it works ─── */}
      <section className="border-t border-border/50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">From question to validated insight</h2>
            <p className="mt-2 text-sm text-muted-foreground">Institutional workflow. Zero setup. No Python.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ step, title, desc }, i) => (
              <div key={step} className="relative flex flex-col">
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-6 hidden h-px w-6 -translate-y-1/2 bg-gradient-to-r from-border to-transparent lg:block" style={{ right: "-1.5rem" }} />
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-bg text-sm font-bold text-white shadow-lg glow-gradient">
                  {step}
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features bento ─── */}
      <section className="border-t border-border/50 py-20 reveal-on-scroll">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">The full research stack</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Wide card — AI agent */}
            <div className="flex items-start gap-5 rounded-xl border border-border bg-card p-6 sm:col-span-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-bg/15 border border-primary/20">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{FEATURES[0].title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{FEATURES[0].desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {FEATURES[0].tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Regular feature cards */}
            {FEATURES.slice(1).map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-6 transition hover:border-border/80 hover:bg-elevated/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-elevated border border-border">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Data plane callout ─── */}
      <section className="border-t border-border/50 py-20 reveal-on-scroll">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 sm:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
              <div className="flex-1">
                <span className="text-xs font-medium text-primary uppercase tracking-wide">Phase 2 · Now Live</span>
                <h3 className="mt-2 text-xl font-bold text-foreground">Institutional data plane, open to all</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Our five-layer canonical pipeline (RAW → VALIDATED → NORMALIZED → DERIVED → FEATURES)
                  delivers point-in-time, bias-free data to every research run.
                  Powered by 403B+ ticks across 27 asset classes — the same quality foundation
                  institutional desks build on.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:shrink-0 sm:grid-cols-1">
                {[
                  { value: "403B+", label: "Market ticks" },
                  { value: "27",    label: "Asset classes" },
                  { value: "5",     label: "Canonical layers" },
                  { value: "PIT",   label: "Point-in-time safe" },
                ].map(({ value, label }) => (
                  <div key={label} className="text-center sm:text-left">
                    <div className="font-mono text-lg font-bold gradient-text">{value}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="border-t border-border/50 py-20 reveal-on-scroll">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to start researching?</h2>
          <p className="mt-4 text-muted-foreground">
            Plans from <span className="font-mono font-semibold text-foreground">₦20,000/month</span>. No credit card required to sign up.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg gradient-bg glow-gradient px-8 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            Create Your Account <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Cancel any time. BYOK model — bring your own DeepSeek API key.
          </p>
        </div>
      </section>
    </div>
  );
}
