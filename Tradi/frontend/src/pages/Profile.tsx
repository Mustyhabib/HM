import { useEffect, useState } from "react";
import {
  User,
  Mail,
  Calendar,
  Crown,
  Settings,
  LogOut,
  Copy,
  Check,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth-store";
import {
  getActiveSubscription,
  type SubscriptionStatus,
} from "@/lib/runs";
import { ProviderByok } from "@/components/settings/ProviderByok";

/**
 * Profile — the account page. All identity data comes from Supabase Auth;
 * the plan badge comes from the live subscriptions table (same source the
 * run gates read). Sections backed by features that don't exist yet
 * (usage stats, achievements, activity feed) render honest placeholders —
 * no fabricated numbers.
 */

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
};

export function Profile() {
  const [copied, setCopied] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(
    null,
  );
  const [subLoaded, setSubLoaded] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Real identity — never fall back to placeholder personal data.
  const email = user?.email ?? "";
  const name =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    email.split("@")[0] ||
    "there";
  const initials = (name || "?")
    .split(/\s+/)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const userId = user?.id?.slice(0, 16) ?? "";
  const memberSince = user?.created_at ? new Date(user.created_at) : null;

  useEffect(() => {
    let cancelled = false;
    getActiveSubscription()
      .then((s) => {
        if (!cancelled) {
          setSubscription(s);
          setSubLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSubLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyId = () => {
    navigator.clipboard.writeText(userId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Profile header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full gradient-bg text-2xl font-bold text-white shrink-0">
            {initials}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <h1 className="text-xl font-bold">{name}</h1>
              <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                <Crown className="h-3 w-3 text-secondary" />
                {!subLoaded
                  ? "…"
                  : subscription
                    ? `${PLAN_LABEL[subscription.planId] ?? subscription.planId} plan`
                    : "No active plan"}
              </span>
            </div>

            <div className="mt-2 flex flex-col items-center gap-3 text-sm text-muted-foreground sm:flex-row">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {email}
              </span>
              {memberSince && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Member since{" "}
                    {memberSince.toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 sm:justify-start">
              <span className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs text-muted-foreground">
                {userId}
                <button onClick={handleCopyId} className="text-muted-foreground hover:text-foreground transition">
                  {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                </button>
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            <Link
              to="/settings"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-elevated"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-danger transition hover:bg-danger/5"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </div>
        </div>
      </div>

      <ProviderByok />

      {/* Current plan */}
      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Crown className="h-4 w-4 text-secondary" />
          Current Plan
        </h2>
        <div className="mt-4 space-y-3">
          {!subLoaded ? (
            <p className="text-sm text-muted-foreground">Checking your plan…</p>
          ) : subscription ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-medium">
                  {PLAN_LABEL[subscription.planId] ?? subscription.planId}
                  {subscription.status === "trialing" ? " (trial)" : ""}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Manage billing, invoices, and cancellation from the billing
                settings page.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You don't have an active plan yet.
              </p>
              <Link
                to="/pricing"
                className="inline-block rounded-lg gradient-bg px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                See plans
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Usage / achievements / activity — arrive with Phase 2+ (data plane &
          research governance). Honest placeholders until then. */}
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-center">
        <User className="mx-auto h-6 w-6 text-muted-foreground/30" />
        <p className="mt-2 text-sm font-medium text-foreground/60">
          Usage stats, achievements, and activity history
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Coming with the research-governance rollout — your run history is
          already live on the Agent page.
        </p>
        <Link
          to="/agent"
          className="mt-3 inline-block text-xs text-primary hover:underline"
        >
          Open Research →
        </Link>
      </div>
    </div>
  );
}
