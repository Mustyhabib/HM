import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, AlertTriangle, Pencil, Loader2 } from "lucide-react";
import { admin, type AdminStats } from "@/lib/admin";

// Fixed plan set — mirrors CLAUDE.md's canonical plans table. There is no
// admin_list_plans RPC (out of the design doc's RPC surface), so current
// name/price aren't fetched here — only mutated via admin_update_plan.
// Check the Supabase dashboard for current values before overwriting.
const PLAN_OPTIONS = [
  { id: "starter", label: "Starter" },
  { id: "pro", label: "Pro" },
  { id: "premium", label: "Premium" },
];

// Aggregated client-side from a bounded admin_list_users page — there is
// no dedicated "subscribers by plan" RPC. Capped at 500 most-recently-
// joined users; a follow-up admin_list_users(p_plan_id) filter or a
// dedicated aggregate RPC would remove this cap.
const AGGREGATE_SAMPLE_SIZE = 500;

function fmtNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

function EditPlanForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(price);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) return;
    setSaving(true);
    try {
      await admin.updatePlan(planId, name, priceNum);
      toast.success(`${planId} plan updated`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-elevated p-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="text-[10px] font-medium uppercase text-muted-foreground">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Plan display name"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/60"
        />
      </div>
      <div className="w-32">
        <label className="text-[10px] font-medium uppercase text-muted-foreground">Price (₦)</label>
        <input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/60"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg gradient-bg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-background"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AdminBilling() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [planCounts, setPlanCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      admin.getStats(),
      admin.listUsers({ limit: AGGREGATE_SAMPLE_SIZE, offset: 0 }),
    ])
      .then(([s, users]) => {
        if (cancelled) return;
        setStats(s);
        const counts: Record<string, number> = {};
        for (const u of users) {
          if (u.subscription_status !== "active") continue;
          const key = u.plan_id ?? "unknown";
          counts[key] = (counts[key] ?? 0) + 1;
        }
        setPlanCounts(counts);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load billing data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-bold text-foreground">Billing</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Subscribers by plan and payment health. Refund execution is a follow-up — this view is read-only.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex justify-center py-10 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">MRR</span>
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold">{stats ? fmtNaira(stats.mrr_ngn) : "—"}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Active subscribers</span>
                <CreditCard className="h-4 w-4 text-success" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold">{stats?.active_subscribers ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Failed webhooks</span>
                <AlertTriangle className="h-4 w-4 text-danger" />
              </div>
              <div className="mt-2 font-mono text-2xl font-bold">{stats?.failed_webhooks ?? "—"}</div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border/60 bg-elevated/40 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Plans</h2>
              <p className="text-[11px] text-muted-foreground">
                Subscriber counts from the {AGGREGATE_SAMPLE_SIZE} most-recently-joined users.
              </p>
            </div>
            <div className="divide-y divide-border">
              {PLAN_OPTIONS.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium capitalize text-foreground">{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {planCounts?.[p.id] ?? 0} active subscriber{(planCounts?.[p.id] ?? 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingPlan(editingPlan === p.id ? null : p.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-elevated"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </div>
                  {editingPlan === p.id && (
                    <EditPlanForm planId={p.id} onDone={() => setEditingPlan(null)} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
