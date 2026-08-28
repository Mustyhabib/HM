import { Link } from "react-router";
import {
  Bot,
  Zap,
  BarChart3,
  Database,
  CreditCard,
  HelpCircle,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const SECTIONS = [
  { id: "overview",     label: "Overview"        },
  { id: "quickstart",   label: "Quick Start"     },
  { id: "agent-runs",   label: "Agent Runs"      },
  { id: "prompts",      label: "Writing Prompts" },
  { id: "strategies",   label: "Strategies"      },
  { id: "data-sources", label: "Data Sources"    },
  { id: "billing",      label: "Billing & Quota" },
  { id: "faq",          label: "FAQ"             },
];

const FACTOR_FAMILIES = [
  { name: "Qlib158",     count: "158", desc: "Microsoft Qlib-style fundamental + technical factors" },
  { name: "Alpha101",    count: "101", desc: "WorldQuant-style short-horizon price/volume alphas" },
  { name: "GTJA191",     count: "191", desc: "Chinese market momentum and mean-reversion alphas" },
  { name: "Academic",    count: "~8",  desc: "Literature factors: momentum, size, value, quality" },
  { name: "Fundamental", count: "~4",  desc: "EPS growth, P/B ratio, revenue momentum" },
];

const BACKTEST_ENGINES = [
  { name: "Vectorized backtest",    type: "Fast daily OHLCV — full equity curve + metrics" },
  { name: "Options portfolio",      type: "Options pricing, Greeks, P&L simulation" },
  { name: "Cross-market composite", type: "Multi-asset, multi-market combined testing" },
  { name: "Walk-forward",           type: "Out-of-sample validation with rolling windows" },
  { name: "Monte Carlo",            type: "Path simulation and distribution analysis" },
  { name: "Mean-reversion",         type: "Pairs trading and statistical arbitrage" },
  { name: "Momentum",               type: "Time-series and cross-sectional momentum" },
  { name: "Market regime",          type: "Bull/bear/sideways detection and adaptation" },
];

const DATA_SOURCES = [
  { provider: "yfinance",  markets: "Global equities, ETFs, indices — no key needed" },
  { provider: "Binance",   markets: "Crypto spot and futures" },
  { provider: "OKX",       markets: "Crypto spot, futures, options" },
  { provider: "Tushare",   markets: "Chinese A-shares (API token required)" },
  { provider: "AkShare",   markets: "Chinese markets, macro data" },
  { provider: "BaoStock",  markets: "Chinese A-shares historical data" },
  { provider: "ccxt",      markets: "40+ crypto exchanges unified" },
  { provider: "mootdx",    markets: "Chinese real-time market data" },
];

const FAQ_ITEMS = [
  {
    q: "Can I use H~Mltd to place live trades?",
    a: "No. H~Mltd is a research-only platform. It never connects to your broker and cannot execute trades. Your capital is always safe.",
  },
  {
    q: "What if the agent can't answer my question?",
    a: "If the agent encounters a question it cannot process (missing data, unsupported market, invalid ticker), the run fails with an error message. System errors are automatically refunded; input errors are not.",
  },
  {
    q: "Can I download my results?",
    a: "Yes. Completed runs produce downloadable artifacts — JSON results, CSV data tables, and chart images — available from the run detail page.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your prompts and results are scoped strictly to your account and are never shared with other users or used to train third-party models.",
  },
  {
    q: "Which markets are supported?",
    a: "US equities, global ETFs, crypto (100+ tokens), Chinese A-shares, and other markets via 24 integrated data providers with automatic fallback chains.",
  },
  {
    q: "Can I cancel and get a refund?",
    a: "You may cancel at any time. Subscription fees for the current billing period are not refunded. Run credits consumed in that period are not returned as cash.",
  },
];

export function Docs() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">

      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" /> Documentation
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          H~Mltd Platform Docs
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Everything you need to know about using the H~Mltd AI trading research platform.
        </p>
      </div>

      {/* ─── Table of contents ────────────────────────────────────────── */}
      <div className="mb-12 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </h2>
        <ul className="grid gap-1 sm:grid-cols-2">
          {SECTIONS.map(({ id, label }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-elevated hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* ─── Content sections ─────────────────────────────────────────── */}
      <div className="space-y-16">

        {/* Overview */}
        <section id="overview" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            H~Mltd is an AI-powered trading research platform. Describe a research
            question in plain English — the platform's AI agent does the research, runs
            backtests against real market data, and delivers a structured report. No
            coding required.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Bot,
                title: "AI Agent",
                desc: "Natural language interface to 462 alpha factors and 8 backtest engines.",
              },
              {
                icon: BarChart3,
                title: "Backtesting",
                desc: "Cross-market historical testing across equities, crypto, and derivatives.",
              },
              {
                icon: Database,
                title: "Data Sources",
                desc: "24 integrated providers with automatic fallback chains — most markets work with zero API keys.",
              },
              {
                icon: Zap,
                title: "Fast Results",
                desc: "Reports in minutes, not hours. No local install, no Python environment.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-3 rounded-xl border border-border bg-elevated/40 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/8">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start */}
        <section id="quickstart" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Quick Start</h2>
          <ol className="space-y-4">
            {[
              {
                step: "01",
                title: "Create an account",
                desc: "Go to /signup, enter your email and a password. Confirm your email address.",
              },
              {
                step: "02",
                title: "Choose a plan",
                desc: "All plans include unlimited runs. Pick Starter, Pro, or Premium based on features you need. During the open beta, everything is free.",
              },
              {
                step: "03",
                title: "Open the Agent",
                desc: "Navigate to the Agent page from your dashboard sidebar. You'll see the research prompt input.",
              },
              {
                step: "04",
                title: "Ask a question",
                desc: "Type your research question in plain English and press Enter. The agent queues your run immediately.",
              },
              {
                step: "05",
                title: "Read your report",
                desc: "Once the run completes (typically 1–5 minutes), view your research report, charts, and downloadable data on the run page.",
              },
            ].map(({ step, title, desc }) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/8 font-mono text-xs font-bold text-primary">
                  {step}
                </span>
                <div className="pt-0.5">
                  <div className="font-semibold text-foreground">{title}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Agent Runs */}
        <section id="agent-runs" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Agent Runs</h2>
          <p className="text-muted-foreground leading-relaxed">
            Each prompt submission creates one <strong className="text-foreground">agent run</strong>.
            A run progresses through four lifecycle states:
          </p>
          <div className="mt-4 space-y-2">
            {[
              {
                status: "Queued",
                color: "border-primary/30 bg-primary/10 text-primary",
                desc: "Your run is waiting for a worker. Resolves within seconds under normal load.",
              },
              {
                status: "Running",
                color: "border-secondary/30 bg-secondary/10 text-secondary",
                desc: "The AI agent is actively researching, fetching data, and running backtests.",
              },
              {
                status: "Completed",
                color: "border-success/30 bg-success/10 text-success",
                desc: "Report is ready. Artifacts (CSV, charts, JSON) are available for download.",
              },
              {
                status: "Failed",
                color: "border-danger/30 bg-danger/10 text-danger",
                desc: "The run hit an error. System-caused failures refund the run credit automatically.",
              },
            ].map(({ status, color, desc }) => (
              <div
                key={status}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
              >
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
                >
                  {status}
                </span>
                <span className="text-sm text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-sm">
              <strong className="text-foreground">BYOK model:</strong>{" "}
              <span className="text-muted-foreground">
                You supply your own LLM API key and pay the provider directly for token usage.
                The platform charges a flat subscription fee — all plans include unlimited runs.
                A safety rate limit of 30 runs per hour applies.
              </span>
            </p>
          </div>
        </section>

        {/* Writing Prompts */}
        <section id="prompts" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Writing Effective Prompts</h2>
          <p className="text-muted-foreground leading-relaxed">
            The agent interprets natural language — no internal tool names or API syntax required.
            Describe what you want to research as clearly as you would to an analyst.
          </p>

          <h3 className="mt-6 text-base font-semibold">Example prompts</h3>
          <div className="mt-3 space-y-2">
            {[
              "Backtest a 10/21 EMA crossover on AAPL over the last 2 years and report Sharpe, win rate, and max drawdown.",
              "Compare momentum vs mean-reversion on BTC/USDT for 2024. Which regime each strategy favoured?",
              "Screen for oversold names: RSI(14) below 30 with rising 50-day volume. Rank the top 10.",
              "Build and evaluate a pairs-trading strategy on KO and PEP. Summarise the cointegration and edge.",
              "Which GTJA191 alpha performed best on Chinese A-shares in 2023? Include Sharpe and turnover.",
            ].map((prompt) => (
              <div
                key={prompt}
                className="rounded-lg border border-border bg-elevated/30 px-4 py-2.5"
              >
                <span className="mr-2 text-xs font-bold text-primary">▶</span>
                <span className="text-sm text-muted-foreground">{prompt}</span>
              </div>
            ))}
          </div>

          <h3 className="mt-6 text-base font-semibold">Tips</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              "Be specific about the ticker, timeframe, and metrics you want.",
              "Mention the market (US equities, crypto, Chinese A-shares) when relevant.",
              "If comparing strategies, name both explicitly.",
              "One focused research question per run gives the best results.",
              "Shift+Enter inserts a new line; Enter submits.",
            ].map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="shrink-0 text-primary">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </section>

        {/* Strategies */}
        <section id="strategies" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Strategies & Alpha Factors</h2>
          <p className="text-muted-foreground leading-relaxed">
            The platform includes 462 prebuilt alpha factors across five families,
            plus 8 backtest engines. The agent selects the best fit for your question.
          </p>

          <h3 className="mt-6 text-base font-semibold">Alpha factor families</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Family</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Count</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FACTOR_FAMILIES.map(({ name, count, desc }) => (
                  <tr key={name} className="hover:bg-elevated/30">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-foreground">{name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-primary">{count}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-6 text-base font-semibold">Backtest engines</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50">
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Engine</th>
                  <th className="px-4 py-2.5 text-left font-medium text-foreground">Capability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {BACKTEST_ENGINES.map(({ name, type }) => (
                  <tr key={name} className="hover:bg-elevated/30">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-foreground">{name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Data Sources */}
        <section id="data-sources" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Data Sources</h2>
          <p className="text-muted-foreground leading-relaxed">
            The platform integrates 24 data providers with automatic fallback chains —
            most markets work with zero configuration.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {DATA_SOURCES.map(({ provider, markets }) => (
              <div
                key={provider}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
              >
                <span className="shrink-0 font-mono text-xs font-bold text-primary">{provider}</span>
                <span className="text-xs text-muted-foreground">{markets}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Plus 16 additional sources. The agent automatically selects the best provider for your query.
          </p>
        </section>

        {/* Billing */}
        <section id="billing" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Billing &amp; BYOK</h2>
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-secondary/25 bg-secondary/5 p-4 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
            <span>
              <strong className="text-foreground">Open Beta:</strong> the platform is completely
              free right now — no subscription, no quota, no card. Everything below describes how
              billing will work when we launch, so you can plan ahead. Nothing is charged today.
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-border bg-card p-5">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground">Paystack — Naira billing (at launch)</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  All charges are in Nigerian Naira (NGN) via Paystack. The USD equivalent on the
                  pricing page is display-only at a fixed reference rate of ₦1,300/USD. H~Mltd
                  never stores your card details — Paystack handles all payment processing.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-elevated/50">
                    <th className="px-4 py-2.5 text-left font-medium text-foreground">Plan</th>
                    <th className="px-4 py-2.5 text-left font-medium text-foreground">Price / month</th>
                    <th className="px-4 py-2.5 text-left font-medium text-foreground">Runs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { plan: "Starter", price: "₦20,000",  runs: "Unlimited*" },
                    { plan: "Pro",     price: "₦35,000", runs: "Unlimited*" },
                    { plan: "Premium", price: "₦75,000", runs: "Unlimited*" },
                  ].map(({ plan, price, runs }) => (
                    <tr key={plan} className="hover:bg-elevated/30">
                      <td className="px-4 py-2.5 font-medium text-foreground">{plan}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{price}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-primary">{runs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground/70">
              * Unlimited runs on every tier — bring your own LLM key. Launch pricing shown here
              matches the current pricing page.
            </p>

            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "At launch, runs reset on each monthly billing renewal date.",
                "Unused runs do not roll over to the next period.",
                "System-caused failures automatically return the run credit to your account.",
                "Cancel at any time — access continues until period end.",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="shrink-0 text-primary">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">FAQ</h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map(({ q, a }) => (
              <div key={q} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">{q}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <h3 className="text-lg font-bold">Ready to start?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a plan and start researching in minutes.
          </p>
          <Link
            to="/pricing"
            className="mt-4 inline-flex items-center gap-2 rounded-lg gradient-bg glow-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            View plans <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}
