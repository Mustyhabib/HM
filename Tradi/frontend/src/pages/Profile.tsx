import { useEffect, useState } from "react";
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
  KeyRound,
  Globe,
  Loader2,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { saveApiKey, getApiKeyStatus, deleteApiKey, type ApiKeyStatus } from "@/lib/apikeys";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Skeleton } from "@/components/common/Skeleton";

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

/* ─── API key section (BYOK) ───────────────────────────────────────────
 * Users bring their own DeepSeek key — stored server-side in Supabase
 * Vault, never re-rendered as plaintext once saved. This card is the only
 * place in the app that reads/writes it (via `lib/apikeys.ts`, which talks
 * to SECURITY DEFINER RPCs — there is no client-facing table to query).
 * `id="api-key"` lets `/profile#api-key` deep-link here from the Agent
 * page's "no key configured" banner.
 */
function ApiKeySection() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Bumped by the "Retry" button to re-run the effect below without
  // duplicating its fetch/cancellation logic.
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    getApiKeyStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load key status");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveApiKey("deepseek", draft);
      setStatus(next);
      setEditing(false);
      // Never keep the plaintext around once it's safely stored server-side.
      setDraft("");
      toast.success("DeepSeek key saved");
    } catch (saveErr) {
      const message = saveErr instanceof Error ? saveErr.message : "Failed to save key";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
    setSaveError(null);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteApiKey("deepseek");
      setStatus(null);
      setConfirmDeleteOpen(false);
      toast.success("DeepSeek key removed");
    } catch (deleteErr) {
      const message = deleteErr instanceof Error ? deleteErr.message : "Failed to delete key";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const showForm = loaded && !loadError && (status === null || editing);

  return (
    <section id="api-key" className="mt-6 scroll-mt-20 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          API Key
        </h2>
        <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
          DeepSeek
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        H~Mltd runs on your own DeepSeek key — we never proxy or mark up model calls.
      </p>

      {!loaded && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      )}

      {loaded && loadError && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
          <p className="text-xs text-danger">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadCount((n) => n + 1)}
            className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-elevated"
          >
            Retry
          </button>
        </div>
      )}

      {loaded && !loadError && status !== null && !editing && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-3 py-2.5">
            <span className="font-mono text-sm text-foreground">sk-…{status.last4}</span>
            <span className="text-xs text-muted-foreground">
              Added {new Date(status.configured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-elevated"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-danger transition hover:bg-danger/5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <label htmlFor="profile-api-key" className="text-xs font-medium text-muted-foreground">
            DEEPSEEK API KEY
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="profile-api-key"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-..."
              className="w-full flex-1 rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2.5 font-mono text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="submit"
                disabled={saving || !draft.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
              {status !== null && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm transition hover:bg-elevated disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          {saveError && <p className="text-xs text-danger">{saveError}</p>}
          <p className="text-xs text-muted-foreground">
            Get a key from{" "}
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              platform.deepseek.com/api_keys
            </a>
            . Only DeepSeek is supported today.
          </p>
        </form>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Remove your DeepSeek key?"
        description="Runs will be blocked until you add a key again. This does not cancel your subscription."
        confirmLabel={deleting ? "Removing…" : "Remove key"}
        cancelLabel="Cancel"
        tone="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </section>
  );
}

/* ─── Ollama BYOK section ──────────────────────────────────────────────
 * Users who self-host Ollama can point H~M at their server by supplying
 * the base URL (e.g. http://192.168.1.10:11434). The URL is encrypted in
 * Supabase Vault exactly like a DeepSeek key. The worker resolves
 * provider priority at run time: DeepSeek first, Ollama as fallback.
 * `id="ollama-key"` lets deep-links work (/profile#ollama-key).
 */
function OllamaSection() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    // Use the legacy single-provider RPC, scoped to ollama.
    // getApiKeyStatus() only returns deepseek — call save_user_api_key via
    // the supabase client directly with provider=ollama via saveApiKey / RPC.
    // Cheaper: just call getApiKeyStatus narrowed to "ollama" by fetching all.
    import("@/lib/apikeys")
      .then(({ listApiKeyStatuses }) => listApiKeyStatuses())
      .then((statuses) => {
        if (cancelled) return;
        setStatus(statuses.find((s) => s.provider === "ollama") ?? null);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load Ollama status");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveApiKey("ollama", draft);
      setStatus(next);
      setEditing(false);
      setDraft("");
      toast.success("Ollama URL saved");
    } catch (saveErr) {
      const message = saveErr instanceof Error ? saveErr.message : "Failed to save URL";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
    setSaveError(null);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteApiKey("ollama");
      setStatus(null);
      setConfirmDeleteOpen(false);
      toast.success("Ollama URL removed");
    } catch (deleteErr) {
      const message = deleteErr instanceof Error ? deleteErr.message : "Failed to remove URL";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const showForm = loaded && !loadError && (status === null || editing);

  return (
    <section id="ollama-key" className="mt-4 scroll-mt-20 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          Ollama
        </h2>
        <span className="inline-flex items-center rounded-full border border-border/60 bg-elevated px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Self-hosted
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Running Ollama locally or on a private server? Point H~M at it — no API key needed.
        DeepSeek takes priority if both are configured.
      </p>

      {!loaded && (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      )}

      {loaded && loadError && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
          <p className="text-xs text-danger">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadCount((n) => n + 1)}
            className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-elevated"
          >
            Retry
          </button>
        </div>
      )}

      {loaded && !loadError && status !== null && !editing && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-3 py-2.5">
            <span className="font-mono text-sm text-foreground">…{status.last4}</span>
            <span className="text-xs text-muted-foreground">
              Added {new Date(status.configured_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-elevated"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-danger transition hover:bg-danger/5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <label htmlFor="profile-ollama-url" className="text-xs font-medium text-muted-foreground">
            OLLAMA BASE URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="profile-ollama-url"
              type="url"
              required
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full flex-1 rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2.5 font-mono text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="submit"
                disabled={saving || !draft.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
              {status !== null && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm transition hover:bg-elevated disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          {saveError && <p className="text-xs text-danger">{saveError}</p>}
          <p className="text-xs text-muted-foreground">
            Make sure your Ollama server is reachable from the worker.{" "}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              ollama.com
            </a>
          </p>
        </form>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Remove Ollama URL?"
        description="Runs will fall back to DeepSeek (if configured) or be blocked until a key is added."
        confirmLabel={deleting ? "Removing…" : "Remove"}
        cancelLabel="Cancel"
        tone="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </section>
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

  // Client-side routing doesn't scroll to a URL fragment the way a full page
  // load does — the Agent page links here as `/profile#api-key`, so scroll
  // to the section manually on mount.
  useEffect(() => {
    if (window.location.hash === "#api-key") {
      document.getElementById("api-key")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

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

      <ApiKeySection />
      <OllamaSection />

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
