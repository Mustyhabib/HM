import { useState } from "react";
import { useNavigate } from "react-router";
import { Check, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { initiateSubscription, type PlanId } from "@/lib/billing";
import { useAuth } from "@/lib/auth-store";

/** Feature bundle a tier unlocks — server-enforced (start_swarm_run's plan
 * gate; attachments checked client-side today, Premium-only). BYOK pivot:
 * tiers differentiate by capability, not by a monthly run count. */
type FeatureBundle = "single" | "swarm" | "attachments" | "shadow";

interface Plan {
  id: string;
  name: string;
  priceNgn: number;
  bundle: FeatureBundle[];
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
    priceNgn: 20000,
    bundle: ["single"],
    description: "For getting started with AI trading research.",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    priceNgn: 35000,
    bundle: ["single", "swarm"],
    description: "For active traders who research regularly.",
    popular: true,
  },
  {
    id: "premium",
    name: "Premium",
    priceNgn: 75000,
    bundle: ["single", "swarm", "attachments", "shadow"],
    description: "For power users who need the full research toolkit.",
    popular: false,
  },
];

// Canonical display order — independent of how each plan's `bundle` array
// happens to be authored.
const BUNDLE_ORDER: FeatureBundle[] = ["single", "swarm", "attachments", "shadow"];

const BUNDLE_FEATURE_LABEL: Record<FeatureBundle, string> = {
  single: "Single-agent research runs",
  swarm: "30 specialist research teams (swarm)",
  attachments: "Attach CSV / XLSX / JSON research data",
  shadow: "Shadow Account — trade-journal analysis & shadow backtest",
};

// Shared across every tier — not a differentiator.
const SHARED_FEATURES = ["462 alpha factors", "Report + charts", "Bring your DeepSeek key"];

/** A plan's full feature list: its bundle's capabilities first, then the
 * baseline features every tier gets. */
function planFeatures(plan: Plan): string[] {
  const bundleFeatures = BUNDLE_ORDER.filter((b) => plan.bundle.includes(b)).map(
    (b) => BUNDLE_FEATURE_LABEL[b],
  );
  return [...bundleFeatures, ...SHARED_FEATURES];
}

export function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<PlanId | null>(null);

  async function handleSubscribe(planId: PlanId) {
    if (!user) {
      navigate("/signup");
      return;
    }
    setLoading(planId);
    const err = await initiateSubscription(planId);
    // If err is non-null, redirect didn't happen — show the error.
    if (err) {
      toast.error(err);
      setLoading(null);
    }
    // On success, browser redirects to Paystack; we never reach here.
  }

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
          Pick a plan by the research capabilities you need. Unlimited runs on every
          tier — bring your own DeepSeek key.
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

            <button
              onClick={() => handleSubscribe(plan.id as PlanId)}
              disabled={loading !== null}
              className={cn(
                "group mt-6 inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed w-full",
                plan.popular
                  ? "gradient-bg glow-gradient text-white hover:opacity-90"
                  : "border border-border bg-card text-foreground hover:bg-elevated",
              )}
            >
              {loading === plan.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting…
                </>
              ) : (
                <>
                  {user ? `Subscribe — ${plan.name}` : `Get ${plan.name}`}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            {/* Features */}
            <ul className="mt-6 flex-1 space-y-2.5 border-t border-border/60 pt-5">
              {planFeatures(plan).map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
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
          <h3 className="text-base font-semibold text-foreground">Why do I need my own API key?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            H~M runs on DeepSeek. Your key means your usage stays your usage — we don't proxy or mark up model calls. You pay DeepSeek directly for tokens.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">How much will DeepSeek cost me?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Typical research runs cost a few cents on DeepSeek v4-flash. See deepseek.com/pricing.
          </p>
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">What if a run fails?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            If a run fails due to a system error, the use is refunded automatically. User-input errors are not refunded.
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
