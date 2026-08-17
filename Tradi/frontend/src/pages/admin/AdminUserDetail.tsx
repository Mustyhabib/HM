import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Crown,
  Clock,
  ScrollText,
} from "lucide-react";
import { admin, type AdminUserDetail as AdminUserDetailData } from "@/lib/admin";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { cn } from "@/lib/utils";

// Fixed plan set — mirrors CLAUDE.md's canonical plans table (no RPC lists
// plans; the tier set is small and stable).
const PLAN_OPTIONS = [
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "premium", label: "Premium" },
];

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const [detail, setDetail] = useState<AdminUserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspending, setSuspending] = useState(false);

  const [unsuspendOpen, setUnsuspendOpen] = useState(false);
  const [unsuspending, setUnsuspending] = useState(false);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overridePlanId, setOverridePlanId] = useState(PLAN_OPTIONS[0].id);
  const [overrideReason, setOverrideReason] = useState("");
  const [overriding, setOverriding] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    admin
      .getUserDetail(userId)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load user"))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmSuspend = async () => {
    if (!userId || !suspendReason.trim()) return;
    setSuspending(true);
    try {
      await admin.suspendUser(userId, suspendReason);
      toast.success("User suspended");
      setSuspendOpen(false);
      setSuspendReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to suspend user");
    } finally {
      setSuspending(false);
    }
  };

  const confirmUnsuspend = async () => {
    if (!userId) return;
    setUnsuspending(true);
    try {
      await admin.unsuspendUser(userId);
      toast.success("User unsuspended");
      setUnsuspendOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unsuspend user");
    } finally {
      setUnsuspending(false);
    }
  };

  const confirmOverride = async () => {
    if (!userId || !overrideReason.trim()) return;
    setOverriding(true);
    try {
      await admin.overridePlan(userId, overridePlanId, overrideReason);
      toast.success(`Plan overridden to ${overridePlanId}`);
      setOverrideOpen(false);
      setOverrideReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to override plan");
    } finally {
      setOverriding(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to users
        </Link>
        <div className="mt-6 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error ?? "User not found"}
        </div>
      </div>
    );
  }

  const { profile, subscription, api_key_status, recent_runs, audit_trail } = detail;
  const isSuspended = profile.suspended_at !== null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">{profile.email}</h1>
          {profile.display_name && (
            <p className="mt-0.5 text-sm text-muted-foreground">{profile.display_name}</p>
          )}
        </div>
        <div className="flex gap-2">
          {isSuspended ? (
            <button
              type="button"
              onClick={() => setUnsuspendOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-success/30 px-3 py-2 text-sm text-success transition hover:bg-success/10"
            >
              <ShieldCheck className="h-4 w-4" /> Unsuspend
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSuspendOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger transition hover:bg-danger/10"
            >
              <ShieldAlert className="h-4 w-4" /> Suspend
            </button>
          )}
          <button
            type="button"
            onClick={() => setOverrideOpen(true)}
            className="flex items-center gap-1.5 rounded-lg gradient-bg glow-gradient px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Crown className="h-4 w-4" /> Override plan
          </button>
        </div>
      </div>

      {isSuspended && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-danger">This account is suspended</p>
            <p className="mt-1 text-sm text-muted-foreground">{profile.suspended_reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">Since {fmtDateTime(profile.suspended_at)}</p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Profile" icon={ShieldCheck}>
          <Row label="User ID" value={<span className="font-mono text-xs">{profile.id.slice(0, 8)}…</span>} />
          <Row label="Email" value={profile.email} />
          <Row label="Joined" value={fmtDateTime(profile.created_at)} />
        </Card>

        <Card title="Subscription" icon={Crown}>
          {subscription ? (
            <>
              <Row label="Plan" value={<span className="capitalize">{subscription.plan_id}</span>} />
              <Row
                label="Status"
                value={
                  <span
                    className={cn(
                      "capitalize",
                      subscription.status === "active" ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {subscription.status}
                  </span>
                }
              />
              <Row label="Period ends" value={fmtDateTime(subscription.current_period_end)} />
              <Row label="Cancels at period end" value={subscription.cancel_at_period_end ? "Yes" : "No"} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No subscription on record.</p>
          )}
        </Card>

        <Card title="DeepSeek API key" icon={KeyRound}>
          {api_key_status ? (
            <>
              <Row label="Key" value={<span className="font-mono text-xs">sk-…{api_key_status.last4}</span>} />
              <Row label="Configured" value={fmtDateTime(api_key_status.configured_at)} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No key configured.</p>
          )}
        </Card>

        <Card title="Recent runs" icon={Clock}>
          {recent_runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent_runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{r.prompt}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Audit trail" icon={ScrollText}>
          {audit_trail.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin actions recorded for this user.</p>
          ) : (
            <ul className="divide-y divide-border">
              {audit_trail.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs text-primary">{a.action}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={suspendOpen}
        title="Suspend this user?"
        description="They'll be blocked from starting new agent runs until unsuspended. Sign-in stays open."
        confirmLabel={suspending ? "Suspending…" : "Suspend"}
        cancelLabel="Cancel"
        tone="destructive"
        confirmDisabled={!suspendReason.trim()}
        onConfirm={confirmSuspend}
        onCancel={() => {
          setSuspendOpen(false);
          setSuspendReason("");
        }}
      >
        <label htmlFor="suspend-reason" className="text-xs font-medium text-muted-foreground">
          REASON (REQUIRED)
        </label>
        <textarea
          id="suspend-reason"
          required
          rows={3}
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
          placeholder="e.g. Chargeback dispute, ToS violation…"
          className="mt-1.5 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={unsuspendOpen}
        title="Unsuspend this user?"
        description="They'll immediately be able to start agent runs again."
        confirmLabel={unsuspending ? "Unsuspending…" : "Unsuspend"}
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={confirmUnsuspend}
        onCancel={() => setUnsuspendOpen(false)}
      />

      <ConfirmDialog
        open={overrideOpen}
        title="Override subscription plan?"
        description="Grants an active 30-day subscription immediately, bypassing Paystack. Always logged."
        confirmLabel={overriding ? "Applying…" : "Override plan"}
        cancelLabel="Cancel"
        tone="primary"
        confirmDisabled={!overrideReason.trim()}
        onConfirm={confirmOverride}
        onCancel={() => {
          setOverrideOpen(false);
          setOverrideReason("");
        }}
      >
        <label htmlFor="override-plan" className="text-xs font-medium text-muted-foreground">
          PLAN
        </label>
        <select
          id="override-plan"
          value={overridePlanId}
          onChange={(e) => setOverridePlanId(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <label htmlFor="override-reason" className="mt-3 block text-xs font-medium text-muted-foreground">
          REASON (REQUIRED)
        </label>
        <textarea
          id="override-reason"
          required
          rows={3}
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          placeholder="e.g. Manual comp for support issue…"
          className="mt-1.5 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
      </ConfirmDialog>
    </div>
  );
}
