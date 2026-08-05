import { Link } from "react-router";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  price: number;
  uses: number;
  description: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 20,
    uses: 3,
    description: "For getting started with AI trading research.",
  },
  {
    id: "pro",
    name: "Pro",
    price: 35,
    uses: 7,
    description: "For active traders who research regularly.",
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    price: 50,
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
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Simple, transparent pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Pick a plan based on how many agent runs you need per month.
          No hidden fees, no lock-in.
        </p>
      </div>

      {/* Plan cards */}
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-xl border p-6",
              plan.popular
                ? "gradient-border glow-gradient"
                : "border-border",
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-bg px-3 py-0.5 text-xs font-medium text-white">
                Most Popular
              </span>
            )}
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>

            <div className="mt-6">
              <span className="text-4xl font-bold font-mono">${plan.price}</span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <div className="mt-2 rounded-lg bg-[#101730] px-3 py-2 text-sm">
              <span className="font-semibold text-foreground font-mono">{plan.uses}</span>{" "}
              <span className="text-muted-foreground">agent runs per month</span>
            </div>

            <Link
              to="/signup"
              className={cn(
                "mt-6 block rounded-lg py-2.5 text-center text-sm font-medium transition",
                plan.popular
                  ? "gradient-bg glow-gradient text-white hover:opacity-90"
                  : "border border-border bg-card text-foreground hover:bg-[#101730]",
              )}
            >
              Get Started
            </Link>

            <ul className="mt-6 flex-1 space-y-2">
              {SHARED_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span className="text-muted-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* FAQ teaser */}
      <div className="mt-16 text-center">
        <h3 className="text-lg font-semibold">What counts as an agent run?</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          One "use" equals one completed agent run — when you ask the AI a
          research question and receive a finished report. If a run fails due to
          a system error, the use is refunded automatically. Unused runs do not
          roll over.
        </p>
      </div>
    </div>
  );
}
