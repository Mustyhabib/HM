import { useEffect, useState, useCallback } from "react";
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
  Loader2,
  Trash2,
  ChevronDown,
  ExternalLink,
  Plus,
  Shield,
  ArrowRight,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import {
  saveApiKey,
  listApiKeyStatuses,
  deleteApiKey,
  type ApiKeyStatus,
} from "@/lib/apikeys";
import {
  FEATURED_PROVIDERS,
  MORE_PROVIDERS,
  type LlmProvider,
} from "@/lib/providers";
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

/* ─── Provider tile — clickable selector in the grid ──────────────────
 * Compact tile for each provider. Clicking selects it and shows the
 * API key input directly below the grid.
 */
function ProviderTile({
  provider,
  isConfigured,
  isSelected,
  last4,
  onClick,
}: {
  provider: LlmProvider;
  isConfigured: boolean;
  isSelected: boolean;
  last4?: string;
  onClick: () => void;
}) {
  const hue = provider.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const badgeBg = `hsl(${hue} 55% 92%)`;
  const badgeText = `hsl(${hue} 60% 35%)`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all",
        isSelected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : isConfigured
            ? "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]"
            : "border-border/60 bg-card hover:border-border hover:bg-elevated/50",
      )}
    >
      {/* Configured indicator dot */}
      {isConfigured && (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-success" />
        </div>
      )}

      {/* Provider badge */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold transition-transform group-hover:scale-105"
        style={{ backgroundColor: badgeBg, color: badgeText }}
      >
        {provider.label[0]}
      </div>

      {/* Name + status */}
      <div className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{provider.label}</span>
        {isConfigured && last4 ? (
          <span className="block text-[10px] font-mono text-success">
            ✓ …{last4}
          </span>
        ) : (
          <span className="block text-[10px] text-muted-foreground">
            {provider.apiKeyRequired ? "API key" : "Base URL"}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─── Key input panel — appears below the grid when a provider is selected ─ */
function KeyInputPanel({
  provider,
  status,
  onSaved,
  onDeleted,
  onClose,
}: {
  provider: LlmProvider;
  status: ApiKeyStatus | null;
  onSaved: (next: ApiKeyStatus) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isConfigured = status !== null;
  const credentialLabel = provider.apiKeyRequired ? "API Key" : "Base URL";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveApiKey(provider.name, draft);
      onSaved(next);
      setDraft("");
      setSaveError(null);
      toast.success(`${provider.label} ${credentialLabel.toLowerCase()} saved securely`);
    } catch (saveErr) {
      const message = saveErr instanceof Error ? saveErr.message : "Failed to save";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteApiKey(provider.name);
      onDeleted();
      setConfirmDeleteOpen(false);
      toast.success(`${provider.label} ${credentialLabel.toLowerCase()} removed`);
    } catch (deleteErr) {
      const message = deleteErr instanceof Error ? deleteErr.message : "Failed to remove";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const hue = provider.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const badgeBg = `hsl(${hue} 55% 92%)`;
  const badgeText = `hsl(${hue} 60% 35%)`;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Panel header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
            style={{ backgroundColor: badgeBg, color: badgeText }}
          >
            {provider.label[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{provider.label}</h3>
              {isConfigured && (
                <span className="inline-flex items-center rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                  Active
                </span>
              )}
              {!provider.apiKeyRequired && (
                <span className="inline-flex items-center rounded-full border border-border/60 bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  URL
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          aria-label="Close"
        >
          <Plus className="h-3.5 w-3.5 rotate-45" />
        </button>
      </div>

      {/* Current status */}
      {isConfigured && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span className="text-xs text-muted-foreground">
              Current key ending in <span className="font-mono font-medium text-foreground">…{status.last4}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {new Date(status.configured_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="rounded-md border border-border p-1 text-danger/70 transition hover:bg-danger/5 hover:text-danger"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Key input form */}
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label
          htmlFor={`provider-key-${provider.name}`}
          className="text-xs font-medium text-muted-foreground"
        >
          {isConfigured ? `Replace ${credentialLabel}` : `Paste your ${provider.label} ${credentialLabel}`}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`provider-key-${provider.name}`}
            type={provider.inputType}
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={provider.placeholder}
            className="w-full flex-1 rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2.5 font-mono text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
          <button
            type="submit"
            disabled={saving || !draft.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save Securely"}
          </button>
        </div>
        {saveError && <p className="text-xs text-danger">{saveError}</p>}

        {/* Security note + help link */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-muted-foreground">
            <Shield className="mr-0.5 inline h-2.5 w-2.5" />
            Encrypted in Supabase Vault — never stored in plaintext, tied to your account only.
          </p>
          {provider.helpUrl && (
            <a
              href={provider.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-primary hover:underline"
            >
              Get {provider.apiKeyRequired ? "a key" : "started"}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Remove ${provider.label}?`}
        description="Runs will fall back to another configured provider, or be blocked if this is your only one."
        confirmLabel={deleting ? "Removing…" : "Remove"}
        cancelLabel="Cancel"
        tone="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

/* ─── Configured providers summary — fallback cascade display ────────── */
function ConfiguredProvidersSummary({
  statuses,
  allProviders,
}: {
  statuses: Map<string, ApiKeyStatus>;
  allProviders: LlmProvider[];
}) {
  if (statuses.size === 0) return null;

  // Show configured providers in catalog order (= resolution priority)
  const configured = allProviders.filter((p) => statuses.has(p.name));

  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        <ArrowRight className="h-3 w-3" />
        Run priority (first available is used)
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {configured.map((provider, idx) => {
          const hue = provider.name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
          const status = statuses.get(provider.name)!;
          return (
            <div key={provider.name} className="flex items-center gap-1">
              {idx > 0 && (
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/40" />
              )}
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
              >
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold"
                  style={{ backgroundColor: `hsl(${hue} 55% 92%)`, color: `hsl(${hue} 60% 35%)` }}
                >
                  {provider.label[0]}
                </span>
                {provider.label}
                <span className="font-mono text-[10px] text-muted-foreground">…{status.last4}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Multi-provider BYOK section ──────────────────────────────────────
 * Unified API key manager with provider selector grid. Users choose a
 * provider, paste their key, and it's encrypted in Supabase Vault —
 * tied to their account only. Multiple providers can be configured;
 * the worker resolves the first available at run time.
 *
 * `id="api-key"` preserves the /profile#api-key deep-link from the
 * Agent page's "no key configured" banner.
 */
function ProviderKeysSection() {
  const [statuses, setStatuses] = useState<Map<string, ApiKeyStatus>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const ALL_PROVIDERS = [...FEATURED_PROVIDERS, ...MORE_PROVIDERS];

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    listApiKeyStatuses()
      .then((list) => {
        if (cancelled) return;
        const map = new Map<string, ApiKeyStatus>();
        for (const s of list) map.set(s.provider, s);
        setStatuses(map);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load provider statuses");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const handleSaved = useCallback((providerName: string, next: ApiKeyStatus) => {
    setStatuses((prev) => {
      const updated = new Map(prev);
      updated.set(providerName, next);
      return updated;
    });
    setSelectedProvider(null);
  }, []);

  const handleDeleted = useCallback((providerName: string) => {
    setStatuses((prev) => {
      const updated = new Map(prev);
      updated.delete(providerName);
      return updated;
    });
  }, []);

  const configuredCount = statuses.size;
  const moreHasConfigured = MORE_PROVIDERS.some((p) => statuses.has(p.name));
  const selectedProviderObj = ALL_PROVIDERS.find((p) => p.name === selectedProvider) ?? null;

  return (
    <section id="api-key" className="mt-6 scroll-mt-20 rounded-xl border border-border bg-card p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="h-5 w-5 text-primary" />
            Bring Your Own API Key
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-lg">
            Choose your preferred LLM provider below and paste your API key.
            Your key is encrypted and tied exclusively to your account — we never
            store plaintext or proxy your calls.
          </p>
        </div>
        {loaded && configuredCount > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
            <Shield className="h-3 w-3" />
            {configuredCount} provider{configuredCount !== 1 ? "s" : ""} active
          </span>
        )}
      </div>

      {/* ── Security trust bar ── */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3 text-primary/60" />
          End-to-end encrypted
        </span>
        <span className="flex items-center gap-1">
          <KeyRound className="h-3 w-3 text-primary/60" />
          Per-user isolation
        </span>
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3 text-primary/60" />
          Zero plaintext storage
        </span>
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-primary/60" />
          You pay the provider directly
        </span>
      </div>

      {/* ── Loading ── */}
      {!loaded && (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {loaded && loadError && (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
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

      {loaded && !loadError && (
        <>
          {/* ── Configured providers — fallback cascade ── */}
          {configuredCount > 0 && (
            <div className="mt-5">
              <ConfiguredProvidersSummary statuses={statuses} allProviders={ALL_PROVIDERS} />
            </div>
          )}

          {/* ── Supported providers label ── */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Supported Providers — select to configure
            </h3>
          </div>

          {/* ── Featured provider grid ── */}
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
            {FEATURED_PROVIDERS.map((provider) => (
              <ProviderTile
                key={provider.name}
                provider={provider}
                isConfigured={statuses.has(provider.name)}
                isSelected={selectedProvider === provider.name}
                last4={statuses.get(provider.name)?.last4}
                onClick={() =>
                  setSelectedProvider(selectedProvider === provider.name ? null : provider.name)
                }
              />
            ))}
          </div>

          {/* ── More providers — collapsible ── */}
          {MORE_PROVIDERS.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowMore(!showMore)}
                className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:bg-elevated"
              >
                <span>
                  More providers ({MORE_PROVIDERS.length})
                  {moreHasConfigured && " · some configured"}
                </span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")}
                />
              </button>
              {(showMore || moreHasConfigured) && (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {MORE_PROVIDERS.map((provider) => (
                    <ProviderTile
                      key={provider.name}
                      provider={provider}
                      isConfigured={statuses.has(provider.name)}
                      isSelected={selectedProvider === provider.name}
                      last4={statuses.get(provider.name)?.last4}
                      onClick={() =>
                        setSelectedProvider(
                          selectedProvider === provider.name ? null : provider.name,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Key input panel — appears below grid when a provider is selected ── */}
          {selectedProviderObj && (
            <div className="mt-4">
              <KeyInputPanel
                key={selectedProviderObj.name}
                provider={selectedProviderObj}
                status={statuses.get(selectedProviderObj.name) ?? null}
                onSaved={(next) => handleSaved(selectedProviderObj.name, next)}
                onDeleted={() => handleDeleted(selectedProviderObj.name)}
                onClose={() => setSelectedProvider(null)}
              />
            </div>
          )}

          {/* ── Empty state — nudge user to add their first key ── */}
          {configuredCount === 0 && !selectedProvider && (
            <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] px-4 py-5 text-center">
              <KeyRound className="mx-auto h-6 w-6 text-primary/40" />
              <p className="mt-2 text-sm font-medium">No providers configured yet</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Select a provider above and paste your API key to start running research agents.
                Your key stays encrypted and is never shared.
              </p>
            </div>
          )}
        </>
      )}
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

      <ProviderKeysSection />

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
