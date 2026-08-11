import { Link } from "react-router";
import { ArrowRight, Bot, BarChart3, Shield, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "AI-Powered Research",
    desc: "Ask questions in plain English. The agent researches, analyzes, and backtests — so you don't have to.",
  },
  {
    icon: BarChart3,
    title: "Quantitative Backtesting",
    desc: "462 alphas, 8 backtest engines, cross-market data. Real quant analysis without writing code.",
  },
  {
    icon: Shield,
    title: "No Live Trading Risk",
    desc: "Research and analysis only. Your money stays in your account — we never touch your broker.",
  },
  {
    icon: Zap,
    title: "Ready in Seconds",
    desc: "No Python setup, no API keys to manage, no local install. Sign up and start researching.",
  },
];

const STEPS = [
  { step: "1", title: "Sign up", desc: "Create an account and pick a plan." },
  { step: "2", title: "Ask a question", desc: "Describe what you want to research in plain English." },
  { step: "3", title: "Agent runs", desc: "The AI agent researches, analyzes, and generates a report." },
  { step: "4", title: "Get results", desc: "View your report with charts, data, and actionable insights." },
];

/** Abstract equity curve SVG — represents the product's output domain */
function EquityPreview() {
  const pts = [8,10,9,13,12,16,15,19,18,23,21,26,28,25,30,33,31,36,38,35,40,43,41,46,48,45,50,53,51,56];
  const max = Math.max(...pts), min = Math.min(...pts);
  const W = 320, H = 90, P = 4;
  const path = pts.map((v, i) => {
    const x = P + (i / (pts.length - 1)) * (W - P * 2);
    const y = H - P - ((v - min) / (max - min)) * (H - P * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `${path} L${W - P},${H} L${P},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lp-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lp-fill)" />
      <path d={path} fill="none" stroke="url(#lp-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Terminal-style product preview panel */
function TerminalPreview() {
  return (
    <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
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

      {/* Chart area */}
      <div className="p-4">
        <div className="h-[90px] w-full">
          <EquityPreview />
        </div>

        {/* Metrics row — single accent (Sharpe, the hero metric); neutral for the rest */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Sharpe",   value: "1.82",   accent: true  },
            { label: "Win Rate", value: "64%",    accent: false },
            { label: "Return",   value: "+23.4%", accent: false },
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className={
                accent
                  ? "rounded-lg border border-primary/25 bg-primary/8 px-3 py-2 text-center"
                  : "rounded-lg border border-border bg-elevated px-3 py-2 text-center"
              }
            >
              <div className={`font-mono text-sm font-bold ${accent ? "gradient-text" : "text-foreground"}`}>{value}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        {/* AI output snippet */}
        <div className="mt-3 rounded-lg border border-border/50 bg-[var(--bg-panel)] px-3 py-3">
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

        {/* Bottom ticker strip */}
        <div className="mt-3 flex items-center gap-3 border-t border-border/40 pt-3">
          {["AAPL +2.1%", "BTC -0.8%", "TSLA +4.3%", "ETH +1.2%"].map((t) => {
            const pos = t.includes("+");
            return (
              <span key={t} className={`font-mono text-[10px] ${pos ? "text-success" : "text-danger"}`}>
                {t}
              </span>
            );
          })}
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
        {/* Ambient orbs — cyan/blue signal palette */}
        <div className="pointer-events-none absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-cyan-500/8 blur-3xl float-y" />
        <div className="pointer-events-none absolute top-32 right-1/5 h-64 w-64 rounded-full bg-blue-600/8 blur-3xl float-y-slow" />
        {/* Ghosted equity curves drifting across the bottom — domain motif */}
        <div className="pointer-events-none absolute inset-0 signal-lines opacity-40" />

        <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-6xl flex-col items-center justify-center gap-14 px-4 py-20 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:py-0">

          {/* Left — copy */}
          <div className="flex max-w-lg flex-col items-start msg-enter">
            <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              AI Trading Research
            </span>

            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.06]">
              Your AI trading<br />research agent
            </h1>

            <p className="mt-5 max-w-[44ch] text-base text-muted-foreground sm:text-lg leading-relaxed">
              Ask any trading question. Get quantitative research, backtesting, and analysis — delivered as a report.
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
            <div className="mt-10 flex items-center gap-6 border-t border-border/50 pt-6">
              {[
                { value: "462", label: "Alpha factors" },
                { value: "8",   label: "Backtest engines" },
                { value: "24",  label: "Data sources" },
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

          {/* Right — terminal preview */}
          <div className="w-full max-w-md flex-shrink-0 lg:max-w-none lg:w-[420px] fade-up-in" style={{ animationDelay: "120ms" }}>
            <TerminalPreview />
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="border-t border-border/50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">From question to insight in minutes</h2>
            <p className="mt-2 text-sm text-muted-foreground">No setup, no code, no waiting</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ step, title, desc }, i) => (
              <div key={step} className="relative flex flex-col">
                {/* Connector line (desktop only) */}
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
      <section className="border-t border-border/50 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl">Built for serious research</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Wide card */}
            <div className="flex items-start gap-5 rounded-xl border border-border bg-card p-6 sm:col-span-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-bg/15 border border-primary/20">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{FEATURES[0].title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{FEATURES[0].desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["NLP research", "Strategy synthesis", "Auto-backtest", "Report generation"].map((tag) => (
                    <span key={tag} className="rounded-full border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Regular cards */}
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

      {/* ─── CTA ─── */}
      <section className="border-t border-border/50 py-20">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to start researching?</h2>
          <p className="mt-4 text-muted-foreground">
            Plans from <span className="font-mono font-semibold text-foreground">₦70,000/month</span>. No credit card required to sign up.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg gradient-bg glow-gradient px-8 py-3 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
          >
            Create Your Account <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Cancel any time. Unused runs do not roll over.
          </p>
        </div>
      </section>
    </div>
  );
}
