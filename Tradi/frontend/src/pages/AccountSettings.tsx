/**
 * AccountSettings — unified profile + settings page.
 *
 * Combines the former /profile and /settings routes into one cohesive page.
 * Layout: profile identity strip at top, then sidebar nav (desktop) /
 * scrollable pill tabs (mobile) + section content panel.
 *
 * Sections
 * ─────────
 *   account      → identity (name, email, timezone, user ID) + preferences
 *   credentials  → BYOK keys (any catalog provider; active provider selectable)
 *   billing      → current plan, usage, payment method, invoice history
 *   notifications → email + push alert toggles
 *   security     → password change, 2FA, active sessions, danger zone
 *
 * Deep-links
 * ──────────
 *   /profile#api-key    → jumps to Credentials (first provider card)
 *   /settings#credentials, #billing, #security → jump to those sections
 */

import { useEffect, useState } from "react";
import {
  User,
  Mail,
  Calendar,
  Crown,
  LogOut,
  Copy,
  Check,
  Zap,
  Target,
  KeyRound,
  Globe,
  Trash2,
  Bell,
  CreditCard,
  Lock,
  Shield,
  Moon,
  Smartphone,
  Eye,
  EyeOff,
  TrendingUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { ProviderByok } from "@/components/settings/ProviderByok";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { BETA_MODE } from "@/lib/beta";
import { getActiveSubscription, type SubscriptionStatus } from "@/lib/runs";
import { supabase } from "@/lib/supabase";

/* ─── Types ──────────────────────────────────────────────────────────── */

type SectionId = "account" | "credentials" | "billing" | "notifications" | "security";

/* ─── Static mock data (replace with real Supabase queries once wired) ── */

const USER = {
  name: "Mustapha Habib",
  email: "mustaphahabib270@gmail.com",
  plan: "Pro" as const,
  memberSince: "2026-06-01",
  totalRuns: 24,
  totalSignals: 87,
  winRate: 64,
  timezone: "UTC+01:00 (West Africa)",
};

/* ─── Sidebar / tab navigation config ───────────────────────────────── */

const NAV: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] =
  [
    { id: "account", label: "Account", icon: User },
    { id: "credentials", label: "LLM Credentials", icon: KeyRound },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
  ];

/* ═══════════════════════════════════════════════════════════════════════
   SHARED PRIMITIVES
   ═══════════════════════════════════════════════════════════════════════ */

/** Card wrapper with a title and optional description. */
function Card({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6", className)}>
      {title && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** Horizontal label + input row used in form sections. */
function FieldRow({
  label,
  value,
  type = "text",
  disabled = false,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  type?: string;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <label className="flex shrink-0 items-center gap-2 pt-0.5 text-sm font-medium text-muted-foreground sm:w-36">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </label>
      <div className="flex-1">
        <input
          type={type}
          defaultValue={value}
          disabled={disabled}
          className={cn(
            "w-full rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2 text-sm text-foreground outline-none transition",
            "focus:border-primary/60 focus:ring-2 focus:ring-primary/15",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** On/off toggle row. */
function Toggle({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
        <div>
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

/** Compact stat pill shown in the profile header. */
function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-mono text-sm font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   BYOK CREDENTIAL CARDS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Catalog-driven BYOK credentials. Renders the shared ProviderByok component
 * (id="api-key" for /profile#api-key deep-links) inside the credentials tab.
 * The provider list comes from the DB, matching the worker's catalog.
 */
function CredentialsSection() {
  return <ProviderByok />;
}


/* ═══════════════════════════════════════════════════════════════════════
   SECTION CONTENT PANELS
   ═══════════════════════════════════════════════════════════════════════ */

function AccountPanel() {
  const daysActive = Math.floor(
    (Date.now() - new Date(USER.memberSince).getTime()) / (1000 * 60 * 60 * 24),
  );
  const [runCount, setRunCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from("agent_runs")
          .select("id", { count: "exact", head: true });
        if (!cancelled && count !== null) setRunCount(count);
      } catch {
        // transient — leave count as null (shows "…" → stays "…" on error)
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-5">
      {/* Profile info */}
      <Card title="Profile" description="Your public-facing identity on the platform">
        <div className="space-y-4">
          <FieldRow icon={User} label="Display name" value={USER.name} />
          <FieldRow
            icon={Mail}
            label="Email"
            value={USER.email}
            disabled
            hint="Email is managed by H~M authentication and cannot be changed here."
          />
          <FieldRow icon={Globe} label="Timezone" value={USER.timezone} />
        </div>
        <div className="mt-5 flex justify-end">
          <button className="rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Save Changes
          </button>
        </div>
      </Card>

      {/* Activity summary */}
      <Card title="Activity Summary" description="Your platform usage at a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-elevated p-4">
            <Zap className="h-4 w-4 text-primary" />
            <div className="mt-2 font-mono text-xl font-bold">
              {runCount === null ? "…" : runCount}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">Total Runs</div>
          </div>
          <div className="rounded-lg border border-border bg-elevated p-4">
            <TrendingUp className="h-4 w-4 text-secondary" />
            <div className="mt-2 font-mono text-xl font-bold text-muted-foreground/50">—</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              Signals
              <span className="rounded border border-border px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50">Phase 3</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-elevated p-4">
            <Target className="h-4 w-4 text-success" />
            <div className="mt-2 font-mono text-xl font-bold text-muted-foreground/50">—</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              Win Rate
              <span className="rounded border border-border px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/50">Phase 3</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-elevated p-4">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div className="mt-2 font-mono text-xl font-bold">{daysActive}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Days Active</div>
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <Card title="Preferences">
        <div className="space-y-5">
          <Toggle
            icon={Moon}
            label="Dark mode"
            description="H~M Trading Institute uses a dark theme by default"
            checked={true}
            onChange={() => {}}
            disabled
          />
          <Toggle
            icon={Globe}
            label="Show prices in local currency"
            description="Display subscription prices in NGN where applicable"
            checked={false}
            onChange={() => {}}
          />
        </div>
      </Card>
    </div>
  );
}

function CredentialsPanel() {
  return (
    <div className="space-y-5">
      {/* Explainer */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium text-foreground">Bring Your Own Key (BYOK)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          H~M Trading Institute never proxies or marks up LLM calls. You connect your own
          provider credentials — we encrypt them at rest in Supabase Vault and inject them
          into runs server-side. <strong className="text-foreground">DeepSeek takes priority.</strong>{" "}
          Ollama is used as a fallback if DeepSeek is not configured.
        </p>
      </div>

      {/* Provider cards */}
      <CredentialsSection />
    </div>
  );
}

const PLAN_PRICES: Record<SubscriptionStatus["planId"], string> = {
  starter: "₦20,000/month",
  pro: "₦35,000/month",
  premium: "₦75,000/month",
};

const PLAN_FEATURES = [
  { feature: "Single-agent research runs", included: true },
  { feature: "Swarm orchestration (30 presets)", included: true },
  { feature: "File attachments (CSV / XLSX / JSON)", included: false, plan: "Premium" },
  { feature: "Shadow account backtesting", included: false, plan: "Premium" },
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plan Features card — unchanged across every billing state. */
function PlanFeaturesCard() {
  return (
    <Card title="Plan Features">
      <div className="space-y-2">
        {PLAN_FEATURES.map(({ feature, included, plan }) => (
          <div key={feature} className="flex items-center justify-between py-1.5">
            <span className={cn("text-sm", !included && "text-muted-foreground")}>{feature}</span>
            {included ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {plan}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function BillingPanel() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let c = false;
    getActiveSubscription()
      .then((s) => {
        if (!c) {
          setSub(s);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!c) setLoaded(true);
      });
    return () => {
      c = true;
    };
  }, []);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Checking your plan…</p>;
  }

  // Open beta: full free access regardless of plan — billing UI is a preview
  // of what launch will look like, nothing is charged today.
  if (BETA_MODE) {
    const heading = sub ? `${capitalize(sub.planId)} (active at launch)` : "Open Beta";
    return (
      <div className="space-y-5">
        <Card>
          <div className="flex items-start gap-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl gradient-bg">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="text-base font-bold">{heading}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                You're on full free access during the beta. Plans below show how billing will
                work at launch — nothing to pay right now.
              </p>
            </div>
          </div>
        </Card>
        <PlanFeaturesCard />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between rounded-lg border border-border p-5">
            <p className="text-sm text-muted-foreground">No active plan.</p>
            <Link
              to="/pricing"
              className="rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Upgrade
            </Link>
          </div>
        </Card>
        <PlanFeaturesCard />
      </div>
    );
  }

  const statusLabel = sub.status === "active" ? "Active" : "Trialing";

  return (
    <div className="space-y-5">
      {/* Current plan */}
      <Card>
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-bg">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">{capitalize(sub.planId)} Plan</span>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  {statusLabel}
                </span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {PLAN_PRICES[sub.planId]} · Unlimited runs
              </div>
            </div>
          </div>
          <Link
            to="/pricing"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-elevated"
          >
            Upgrade
          </Link>
        </div>

        {/* BYOK unlimited note */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-elevated px-3 py-2.5">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Unlimited runs</strong> — because you bring your
            own LLM key, there's no per-run cost to us. Run as many backtests as you like.
          </p>
        </div>
      </Card>

      <PlanFeaturesCard />
    </div>
  );
}

function NotificationsPanel() {
  const [emailRun, setEmailRun] = useState(true);
  const [emailBilling, setEmailBilling] = useState(true);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [pushRun, setPushRun] = useState(false);
  const [pushSignals, setPushSignals] = useState(true);

  return (
    <div className="space-y-5">
      <Card title="Email Notifications" description="Choose which emails you receive from H~M">
        <div className="space-y-5">
          <Toggle
            icon={Zap}
            label="Run completed"
            description="Get notified when an agent run finishes or fails"
            checked={emailRun}
            onChange={setEmailRun}
          />
          <Toggle
            icon={CreditCard}
            label="Billing & invoices"
            description="Payment confirmations, invoice receipts, and plan changes"
            checked={emailBilling}
            onChange={setEmailBilling}
          />
          <Toggle
            icon={Mail}
            label="Product updates"
            description="New features, platform improvements, and research tips"
            checked={emailMarketing}
            onChange={setEmailMarketing}
          />
        </div>
        <div className="mt-5 flex justify-end">
          <button className="rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Save Preferences
          </button>
        </div>
      </Card>

      <Card title="Push Notifications" description="Browser and mobile push alerts">
        <div className="space-y-5">
          <Toggle
            icon={Smartphone}
            label="Run status updates"
            description="Push notification when a run completes or fails"
            checked={pushRun}
            onChange={setPushRun}
          />
          <Toggle
            icon={Bell}
            label="Signal alerts"
            description="Get notified when new trading signals are triggered"
            checked={pushSignals}
            onChange={setPushSignals}
          />
        </div>
      </Card>

      {/* Beta note */}
      <p className="rounded-lg border border-border bg-elevated px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Beta notice:</span> Notification delivery
        (email and push) is not yet active. Preferences are saved and will apply at launch.
      </p>
    </div>
  );
}

function SecurityPanel({ onSignOut }: { onSignOut: () => void }) {
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionAlerts, setSessionAlerts] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Password */}
      <Card title="Change Password" description="Update the password linked to your account">
        <div className="space-y-4">
          <FieldRow icon={Lock} label="Current" value="" type={showPw ? "text" : "password"} />
          <FieldRow icon={Lock} label="New password" value="" type={showPw ? "text" : "password"} />
          <FieldRow
            icon={Lock}
            label="Confirm"
            value=""
            type={showPw ? "text" : "password"}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
          >
            {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPw ? "Hide" : "Show"} password
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            Update Password
          </button>
        </div>
      </Card>

      {/* 2FA */}
      <Card title="Two-Factor Authentication">
        <div className="space-y-5">
          <Toggle
            icon={Shield}
            label="Enable 2FA"
            description="Add an extra layer of security with an authenticator app (TOTP)"
            checked={twoFactor}
            onChange={setTwoFactor}
          />
          {twoFactor && (
            <div className="ml-7 rounded-lg border border-border bg-elevated p-4">
              <p className="text-sm font-medium text-foreground">Coming after launch</p>
              <p className="mt-1 text-xs text-muted-foreground">
                TOTP-based 2FA (authenticator app) is not yet active during the beta.
                Toggle will persist your preference — setup flow activates at launch.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Sessions */}
      <Card title="Active Sessions" description="Devices currently logged into your account">
        <div className="mb-4">
          <Toggle
            icon={Bell}
            label="New login alerts"
            description="Email me when a new device logs into my account"
            checked={sessionAlerts}
            onChange={setSessionAlerts}
          />
        </div>
        <div className="space-y-2">
          {[
            { device: "Chrome · macOS", location: "Lagos, NG", current: true, last: "Active now" },
            {
              device: "Safari · iPhone",
              location: "Lagos, NG",
              current: false,
              last: "2h ago",
            },
          ].map((s) => (
            <div
              key={s.device}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.device}
                  {s.current && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">
                      Current
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.location} · {s.last}
                </div>
              </div>
              {!s.current && (
                <button className="text-xs text-danger transition hover:underline">Revoke</button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Danger zone */}
      <Card>
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-5">
          <h3 className="text-sm font-semibold text-danger">Danger Zone</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            These actions are permanent and cannot be undone.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition hover:bg-elevated"
            >
              <LogOut className="h-4 w-4" />
              Sign out everywhere
            </button>
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-danger/50 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete your account?"
        description="All your data, runs, and API keys will be permanently erased. Your subscription will not be refunded for the current period. This cannot be undone."
        confirmLabel="Delete my account"
        cancelLabel="Cancel"
        tone="destructive"
        onConfirm={() => setConfirmDeleteOpen(false)} // TODO: wire real deletion RPC
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ROOT PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function AccountSettings() {
  const [section, setSection] = useState<SectionId>("account");
  const [copied, setCopied] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const email = user?.email ?? USER.email;
  const userId = user?.id ?? USER.name.toLowerCase().replace(/\s/g, "_");
  const displayId = userId.slice(0, 16);

  const memberDate = new Date(USER.memberSince);
  const daysActive = Math.floor(
    (Date.now() - memberDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  const copyUserId = () => {
    navigator.clipboard.writeText(userId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  // Handle deep-links from other pages (e.g. Agent → /profile#api-key)
  useEffect(() => {
    const hash = window.location.hash;
    const sectionMap: Record<string, SectionId> = {
      "#api-key": "credentials",
      "#ollama-key": "credentials",
      "#credentials": "credentials",
      "#billing": "billing",
      "#notifications": "notifications",
      "#security": "security",
    };
    const target = sectionMap[hash];
    if (target) {
      setSection(target);
      // Scroll to anchor after the section renders
      setTimeout(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    }
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* ── Profile identity header ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl gradient-bg text-xl font-bold text-white">
            {USER.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold">{USER.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full gradient-bg px-2.5 py-0.5 text-xs font-medium text-white">
                <Crown className="h-3 w-3" />
                {USER.plan}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {email}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Member since{" "}
                {memberDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
            </div>

            {/* Quick stats + user ID */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatPill icon={Zap} value={USER.totalRuns} label="runs" />
              <StatPill icon={Calendar} value={daysActive} label="days" />

              {/* User ID copy chip */}
              <button
                onClick={copyUserId}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-1.5 font-mono text-xs text-muted-foreground transition hover:text-foreground"
                title="Copy user ID"
              >
                {displayId}
                {copied ? (
                  <Check className="h-3 w-3 text-success" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:text-danger hover:border-danger/50 hover:bg-danger/5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      {/* ── Layout: sidebar + content ─────────────────────────────────── */}
      <div className="mt-6 flex gap-6 items-start">
        {/* Sidebar — desktop only */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-6 space-y-0.5 rounded-xl border border-border bg-card p-2">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  section === id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile pill tabs */}
        <div className="flex-1 min-w-0">
          <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 lg:hidden">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap",
                  section === id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Section content */}
          {section === "account" && <AccountPanel />}
          {section === "credentials" && <CredentialsPanel />}
          {section === "billing" && <BillingPanel />}
          {section === "notifications" && <NotificationsPanel />}
          {section === "security" && <SecurityPanel onSignOut={handleSignOut} />}
        </div>
      </div>
    </div>
  );
}
