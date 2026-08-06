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

export function Landing() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative grid-bg">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <div className="msg-enter">
            <span className="mb-4 inline-block rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              AI Trading Research — No Code Required
            </span>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your AI Trading
              <br />
              <span className="gradient-text">Research Agent</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Ask any trading question. Get quantitative research, backtesting, and
              analysis — powered by AI, delivered as a report. No Python, no API
              keys, no setup.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-lg gradient-bg glow-gradient px-6 py-3 font-medium text-white transition hover:opacity-90"
              >
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 font-medium text-foreground transition hover:bg-[#101730]"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/60 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            How it works
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ step, title, desc }) => (
              <div key={step} className="rounded-xl border border-border bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full gradient-bg text-sm font-bold text-white">
                  {step}
                </span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/60 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Why H~M
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-6">
                <Icon className="h-8 w-8 text-primary" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 py-16">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to start researching?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Plans start at ₦70,000/month (~$54). No credit card required to sign up.
          </p>
          <Link
            to="/signup"
            className="mt-6 inline-flex items-center gap-2 rounded-lg gradient-bg glow-gradient px-6 py-3 font-medium text-white transition hover:opacity-90"
          >
            Create Your Account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
