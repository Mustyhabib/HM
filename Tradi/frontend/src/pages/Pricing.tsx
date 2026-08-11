import { Link } from "react-router";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  priceNgn: number;
  uses: number;
  description: string;
  popular?: boolean;
}

// Charge currency is Naira (Paystack). The USD figure shown alongside is
// display-only, at a fixed reference rate. See docs/DECISIONS.md.
const NGN_PER_USD = 1300;

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceNgn: 70000,
    uses: 3,
    description: "For getting started with AI trading research.",
  },
  {
    id: "pro",
    name: "Pro",
    priceNgn: 120000,
    uses: 7,
    description: "For active traders who research regularly.",
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    priceNgn: 200000,
    uses: 15,
    description: "For power users who need the most research runs.",
  },
];

const SHARED_FEATURES = [
  "AI-powered trading research agent",
  "Quantitative backtesting",
  "462 alpha factors",
  "Cross-market data analysis",
  "Report generation with charts",
  "Strategy Studio dashboard",
];

export function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      {/* ─── Header ─── */}
      <div className="text-center msg-enter">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" /> Pricing
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
          One tool.<br className="sm:hidden" /> <span className="gradient-text">Three ways to run it.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Pick a plan by how many agent runs you need per month. No hidden fees, no lock-in.
        </p>
      </div>

      {/* ─── Plan cards ─── */}
      <div className="mt-14 grid grid-cols-1 items-stretch gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-2xl border p-7 transition",
              plan.popular
                ? "gradient-border glow-gradient bg-card lg:-my-2 lg:scale-[1.02]"
                : "border-border bg-card hover:border-border/80",
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-bg glow-gradient px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                Most Popular
              </span>
            )}

            <div>
              <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{plan.description}</p>
            </div>

            {/* Price */}
            <div className="mt-6">
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "font-mono text-4xl font-bold tracking-tight",
                  plan.popular ? "gradient-text" : "text-foreground",
                )}>
                  ₦{plan.priceNgn.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                ≈ ${Math.round(plan.priceNgn / NGN_PER_USD).toLocaleString()} USD
              </div>
            </div>

            {/* Runs badge */}
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2.5">
              <span className={cn(
                "font-mono text-2xl font-bold leading-none",
                plan.popular ? "gradient-text" : "text-foreground",
              )}>
                {plan.uses}
              </span>
              <span className="text-xs leading-tight text-muted-foreground">
                agent runs<br />per month
              </span>
            </div>

            <Link
              to="/signup"
              className={cn(
                "group mt-6 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition",
                plan.popular
                  ? "gradient-bg glow-gradient text-white hover:opacity-90"
                  : "border border-border bg-card text-foreground hover:bg-elevated",
              )}
            >
              Get {plan.name}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            {/* Features */}
            <ul className="mt-6 flex-1 space-y-2.5 border-t border-border/60 pt-5">
              {SHARED_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    plan.popular ? "text-primary" : "text-success",
                  )} />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ─── FAQ / details ─── */}
      <div className="mt-20 grid gap-6 rounded-2xl border border-border bg-card p-8 sm:grid-cols-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">What counts as an agent run?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            One "use" equals one completed agent run — when you ask the AI a research question and receive a finished report.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">What if a run fails?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            If a run fails due to a system error, the use is refunded automatically. User-input errors are not refunded.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Do unused runs roll over?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            No. Unused runs do not roll over — they reset at your next billing period.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Can I cancel anytime?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Yes. Cancel from your billing settings at any time. You keep access until the end of the current period.
          </p>
        </div>
      </div>
    </div>
  );
}
