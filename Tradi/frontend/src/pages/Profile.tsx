import { useState } from "react";
import {
  User,
  Mail,
  Calendar,
  Crown,
  Activity,
  Clock,
  Settings,
  LogOut,
  Copy,
  Check,
  Zap,
  TrendingUp,
  Target,
  Award,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";

/* ─── Mock user (will be replaced with real data once subscriptions are wired) ─── */
const USER = {
  name: "Mustapha Habib",
  email: "mustaphahabib270@gmail.com",
  plan: "Pro",
  memberSince: "2026-06-01",
  totalRuns: 24,
  totalSignals: 87,
  winRate: 64,
  userId: "usr_hm_7x9k2m4q",
};

/* ─── Stats card ─── */
function StatCard({
  icon: Icon,
  label,
  value,
  color = "text-primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className="mt-2 text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}

/* ─── Activity item ─── */
function ActivityItem({
  action,
  detail,
  time,
  type,
}: {
  action: string;
  detail: string;
  time: string;
  type: "run" | "signal" | "billing" | "account";
}) {
  const iconMap = {
    run: Zap,
    signal: TrendingUp,
    billing: Crown,
    account: User,
  };
  const colorMap = {
    run: "bg-primary/10 text-primary",
    signal: "bg-success/10 text-success",
    billing: "bg-secondary/10 text-secondary",
    account: "bg-muted/10 text-muted-foreground",
  };
  const Icon = iconMap[type];

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", colorMap[type])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{action}</div>
        <div className="text-xs text-muted-foreground truncate">{detail}</div>
      </div>
      <div className="text-xs text-muted-foreground whitespace-nowrap">{time}</div>
    </div>
  );
}

/* ─── Page ─── */
export function Profile() {
  const [copied, setCopied] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Use real email from auth if available, fall back to mock
  const email = user?.email ?? USER.email;
  const userId = user?.id?.slice(0, 16) ?? USER.userId;

  const handleCopyId = () => {
    navigator.clipboard.writeText(userId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const memberDate = new Date(USER.memberSince);
  const daysAsMember = Math.floor(
    (Date.now() - memberDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Profile header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full gradient-bg text-2xl font-bold text-white shrink-0">
            {USER.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <h1 className="text-xl font-bold">{USER.name}</h1>
              <span className="flex items-center gap-1 rounded-full gradient-bg px-2.5 py-0.5 text-xs font-medium text-white">
                <Crown className="h-3 w-3" />
                {USER.plan}
              </span>
            </div>

            <div className="mt-2 flex flex-col items-center gap-3 text-sm text-muted-foreground sm:flex-row">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {email}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Member since {memberDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
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

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Zap} label="Total Runs" value={USER.totalRuns} color="text-primary" />
        <StatCard icon={Activity} label="Signals Generated" value={USER.totalSignals} color="text-secondary" />
        <StatCard icon={Target} label="Win Rate" value={`${USER.winRate}%`} color="text-success" />
        <StatCard icon={Calendar} label="Days Active" value={daysAsMember} color="text-muted-foreground" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Current plan */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Crown className="h-4 w-4 text-secondary" />
            Current Plan
          </h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="text-sm font-medium">Pro — ₦120,000/mo</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Runs this period</span>
              <span className="text-sm font-mono font-medium">3 / 7</span>
            </div>
            <div className="h-2 rounded-full bg-elevated">
              <div className="h-full rounded-full gradient-bg" style={{ width: "42.8%" }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Renews</span>
              <span className="text-sm font-mono">Aug 15, 2026</span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link
              to="/settings"
              className="flex-1 rounded-lg gradient-bg px-3 py-2 text-center text-sm font-medium text-white transition hover:opacity-90"
            >
              Upgrade Plan
            </Link>
            <Link
              to="/usage"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm transition hover:bg-elevated"
            >
              View Usage
            </Link>
          </div>
        </div>

        {/* Achievements */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Award className="h-4 w-4 text-amber-400" />
            Achievements
          </h2>
          <div className="mt-4 space-y-3">
            {[
              { name: "First Run", desc: "Completed your first agent run", earned: true },
              { name: "Signal Hunter", desc: "Generated 50+ signals", earned: true },
              { name: "Strategist", desc: "Created 10 strategies", earned: true },
              { name: "Power User", desc: "Complete 100 agent runs", earned: false, progress: "24/100" },
              { name: "Streak Master", desc: "Run agent 7 days in a row", earned: false, progress: "3/7" },
            ].map((badge) => (
              <div
                key={badge.name}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  badge.earned ? "border-border" : "border-border/50 opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-sm",
                    badge.earned ? "gradient-bg text-white" : "bg-elevated text-muted-foreground",
                  )}
                >
                  {badge.earned ? "★" : "☆"}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{badge.name}</div>
                  <div className="text-xs text-muted-foreground">{badge.desc}</div>
                </div>
                {badge.earned ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <span className="text-xs font-mono text-muted-foreground">{badge.progress}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </h2>
          <button className="text-xs text-primary hover:underline">View all</button>
        </div>
        <div className="mt-4 divide-y divide-border">
          <ActivityItem
            type="run"
            action="Agent run completed"
            detail="EMA Crossover strategy backtest on AAPL — Sharpe 1.82"
            time="2h ago"
          />
          <ActivityItem
            type="signal"
            action="New signal generated"
            detail="TSLA short signal — MACD Divergence, 72% confidence"
            time="4h ago"
          />
          <ActivityItem
            type="run"
            action="Agent run completed"
            detail="RSI Mean Reversion analysis on SPY ETF"
            time="Yesterday"
          />
          <ActivityItem
            type="billing"
            action="Subscription renewed"
            detail="Pro Plan — ₦120,000 charged to Visa ending 4242"
            time="Aug 1"
          />
          <ActivityItem
            type="signal"
            action="Signal triggered"
            detail="NVDA long signal hit target — +6.2% gain"
            time="Aug 1"
          />
          <ActivityItem
            type="account"
            action="Plan upgraded"
            detail="Upgraded from Starter to Pro plan"
            time="Jul 15"
          />
        </div>
      </div>
    </div>
  );
}
