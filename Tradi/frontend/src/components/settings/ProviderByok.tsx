import { useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  Globe,
  Loader2,
  Trash2,
  Check,
  CircleCheck,
  ShieldCheck,
  ChevronRight,
  Zap,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listSupportedProviders,
  listApiKeyStatuses,
  getSelectedProvider,
  setSelectedProvider,
  saveApiKey,
  deleteApiKey,
  testProviderCredential,
  type ProviderCatalogEntry,
  type ApiKeyStatus,
  type SelectedProvider,
  type TestResult,
} from "@/lib/apikeys";

/**
 * Catalog-driven BYOK section — redesigned for clear provider selection.
 *
 * Providers are visible upfront as selectable rows (not buried behind accordion
 * toggles). Clicking a provider opens its key form inline, immediately below
 * the row. The active provider radio is explicit. Each user's credential is
 * encrypted in Supabase Vault and tied solely to their account — the platform
 * never proxies or sees the plaintext.
 *
 * Provider list is fetched from `list_supported_llm_providers()` (same catalog
 * the worker uses at boot) — the UI and run loop can never drift apart.
 */

interface ProviderRow {
  catalog: ProviderCatalogEntry;
  status: ApiKeyStatus | null;
}

export function ProviderByok() {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ApiKeyStatus>>({});
  const [selected, setSelected] = useState<SelectedProvider>({
    selected_provider: null,
    configured: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  // Which provider's form is open — null means no form shown
  const [openProvider, setOpenProvider] = useState<string | null>(null);

  const load = async () => {
    setLoaded(false);
    setLoadError(null);
    try {
      const [cat, stats, sel] = await Promise.all([
        listSupportedProviders(),
        listApiKeyStatuses().catch(() => [] as ApiKeyStatus[]),
        getSelectedProvider().catch(
          () => ({ selected_provider: null, configured: false }) as SelectedProvider,
        ),
      ]);
      setCatalog(cat);
      const statusMap = Object.fromEntries(
        (stats as ApiKeyStatus[]).map((s) => [s.provider, s]),
      );
      setStatuses(statusMap);
      setSelected(sel);
      // Auto-open the first unconfigured provider to guide first-time setup,
      // or the active provider if everything is already set.
      const firstUnconfigured = cat.find((c) => !statusMap[c.name]);
      const autoOpen =
        firstUnconfigured?.name ??
        sel.selected_provider ??
        cat[0]?.name ??
        null;
      setOpenProvider(autoOpen);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
  }, [reloadCount]);

  // If the user has a configured key but no explicit selection, reflect the
  // first configured provider as the effective active.
  const effectiveSelected = useMemo(() => {
    if (selected.selected_provider) return selected.selected_provider;
    const firstConfigured = catalog.find((c) => statuses[c.name]);
    return firstConfigured?.name ?? null;
  }, [selected, catalog, statuses]);

  const rows: ProviderRow[] = useMemo(
    () => catalog.map((c) => ({ catalog: c, status: statuses[c.name] ?? null })),
    [catalog, statuses],
  );

  const configuredCount = rows.filter((r) => r.status).length;

  return (
    <section
      id="api-key"
      className="mt-6 scroll-mt-20 rounded-xl border border-border bg-card p-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              LLM Providers
            </h2>
            <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
              BYOK
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a provider, paste your API key. H~M never proxies or marks up
            model calls — your key, your spend.
          </p>
        </div>
        {configuredCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <CircleCheck className="h-3.5 w-3.5" />
            {configuredCount} provider{configuredCount !== 1 ? "s" : ""} configured
          </span>
        )}
      </div>

      {/* Security trust note */}
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-elevated px-3 py-2.5">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          Every key is encrypted at rest in{" "}
          <span className="font-medium text-foreground">Supabase Vault</span> and
          tied exclusively to your account. Only the worker decrypts it
          server-side, immediately before a run — the platform never stores or
          sees your plaintext credential.
        </p>
      </div>

      {/* Loading skeleton */}
      {!loaded && (
        <div className="mt-4 space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse rounded-lg bg-elevated"
            />
          ))}
        </div>
      )}

      {/* Error state */}
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

      {/* Empty catalog */}
      {loaded && !loadError && catalog.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No providers are currently available. Please try again later.
        </p>
      )}

      {/* Provider list */}
      {loaded && !loadError && rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          {rows.map((row, idx) => (
            <ProviderRow
              key={row.catalog.name}
              row={row}
              isActive={effectiveSelected === row.catalog.name}
              isOpen={openProvider === row.catalog.name}
              isLast={idx === rows.length - 1}
              activeModel={
                effectiveSelected === row.catalog.name
                  ? selected.selected_model ?? null
                  : null
              }
              onToggle={() =>
                setOpenProvider((prev) =>
                  prev === row.catalog.name ? null : row.catalog.name,
                )
              }
              onSaved={(status) => {
                setStatuses((prev) => ({ ...prev, [row.catalog.name]: status }));
                // First key configured becomes the implicit active provider.
                if (!selected.selected_provider) {
                  setSelected({
                    selected_provider: row.catalog.name,
                    configured: true,
                  });
                } else {
                  setSelected((prev) => ({ ...prev, configured: true }));
                }
              }}
              onDeleted={() => {
                setStatuses((prev) => {
                  const next = { ...prev };
                  delete next[row.catalog.name];
                  return next;
                });
              }}
              onActivate={async () => {
                try {
                  const next = await setSelectedProvider(row.catalog.name);
                  setSelected(next);
                  toast.success(`${row.catalog.label} set as active provider`);
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Failed to set active provider",
                  );
                }
              }}
              onModelSaved={(model) =>
                setSelected((prev) => ({ ...prev, selected_model: model }))
              }
            />
          ))}
        </div>
      )}

      {/* Active provider callout */}
      {loaded && !loadError && effectiveSelected && (
        <p className="mt-3 text-xs text-muted-foreground">
          Runs will use{" "}
          <span className="font-medium text-foreground">
            {catalog.find((c) => c.name === effectiveSelected)?.label ??
              effectiveSelected}
          </span>{" "}
          as the active provider.{" "}
          {catalog.length > 1 && "Configure another provider to enable fallback."}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Individual provider row — selection + inline form
// ---------------------------------------------------------------------------

function ProviderRow({
  row,
  isActive,
  isOpen,
  isLast,
  activeModel,
  onToggle,
  onSaved,
  onDeleted,
  onActivate,
  onModelSaved,
}: {
  row: { catalog: ProviderCatalogEntry; status: ApiKeyStatus | null };
  isActive: boolean;
  isOpen: boolean;
  isLast: boolean;
  activeModel: string | null;
  onToggle: () => void;
  onSaved: (s: ApiKeyStatus) => void;
  onDeleted: () => void;
  onActivate: () => void;
  onModelSaved: (model: string | null) => void;
}) {
  const { catalog, status } = row;
  const isUrl = catalog.provider_type === "url";

  return (
    <div className={cn(!isLast && "border-b border-border")}>
      {/* Selector row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
          isOpen
            ? "bg-elevated"
            : "hover:bg-elevated/60",
        )}
        aria-expanded={isOpen}
      >
        {/* Provider icon */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            isActive
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {isUrl ? (
            <Globe className="h-4 w-4" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
        </div>

        {/* Provider name + badges */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{catalog.label}</span>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {isUrl ? "base URL" : "API key"}
            </span>
            {status && (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                <CircleCheck className="h-3 w-3" /> configured
              </span>
            )}
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Check className="h-3 w-3" /> active
              </span>
            )}
          </div>
          {!status && (
            <span className="mt-0.5 text-xs text-muted-foreground">
              {isUrl
                ? "Enter your Ollama server URL to enable"
                : `Enter your ${catalog.label} API key to enable`}
            </span>
          )}
          {status && (
            <span className="mt-0.5 font-mono text-xs text-muted-foreground">
              {isUrl ? `…${status.last4}` : `sk-…${status.last4}`}
              {" · added "}
              {new Date(status.configured_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-90",
          )}
        />
      </button>

      {/* Inline form — shown when this provider is selected */}
      {isOpen && (
        <div className="border-t border-border bg-card px-4 pb-4 pt-3">
          <ProviderForm
            catalog={catalog}
            status={status}
            isActive={isActive}
            currentModel={isActive ? activeModel : null}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onActivate={onActivate}
            onModelSaved={onModelSaved}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key / URL form for one provider
// ---------------------------------------------------------------------------

function ProviderForm({
  catalog,
  status,
  isActive,
  currentModel,
  onSaved,
  onDeleted,
  onActivate,
  onModelSaved,
}: {
  catalog: ProviderCatalogEntry;
  status: ApiKeyStatus | null;
  isActive: boolean;
  currentModel: string | null;
  onSaved: (s: ApiKeyStatus) => void;
  onDeleted: () => void;
  onActivate: () => void;
  onModelSaved: (model: string | null) => void;
}) {
  const isUrl = catalog.provider_type === "url";
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const fieldLabel = isUrl
    ? `${catalog.label} Base URL`
    : `${catalog.label} API Key`;
  const placeholder = isUrl
    ? catalog.default_base_url || "http://localhost:11434"
    : "Paste your API key";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await saveApiKey(catalog, draft);
      onSaved(next);
      setDraft("");
      setTestResult(null);
      toast.success(`${catalog.label} saved`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!draft.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testProviderCredential(catalog, draft.trim());
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        model: catalog.default_model,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteApiKey(catalog.name);
      onDeleted();
      setConfirmDelete(false);
      toast.success(`${catalog.label} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Key/URL entry */}
      <form onSubmit={submit} className="space-y-2">
        <label
          htmlFor={`provider-input-${catalog.name}`}
          className="block text-xs font-medium text-muted-foreground"
        >
          {fieldLabel}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`provider-input-${catalog.name}`}
            type={isUrl ? "url" : "password"}
            required
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setTestResult(null);
            }}
            placeholder={
              status
                ? isUrl
                  ? `Current: …${status.last4}  (paste new URL to rotate)`
                  : `Current: sk-…${status.last4}  (paste new key to rotate)`
                : placeholder
            }
            className="w-full flex-1 rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2.5 font-mono text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
          <div className="flex shrink-0 gap-2">
            {/* Test button — calls the model with the draft credential */}
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !draft.trim()}
              title={`Test with ${catalog.default_model}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-elevated/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-warning" />
              )}
              <span className="hidden sm:inline">Test</span>
            </button>
            <button
              type="submit"
              disabled={saving || !draft.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status ? "Rotate" : "Save"}
            </button>
          </div>
        </div>

        {/* Test result — model name + pass/fail inline */}
        {(testing || testResult) && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2",
              testing
                ? "border-border bg-elevated text-muted-foreground"
                : testResult?.ok
                  ? "border-success/30 bg-success/8 text-success"
                  : "border-danger/30 bg-danger/8 text-danger",
            )}
          >
            {testing && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
            {!testing && testResult?.ok && <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            {!testing && !testResult?.ok && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span className="text-xs">
              {testing
                ? `Testing ${catalog.default_model}…`
                : testResult?.message}
            </span>
          </div>
        )}

        {saveError && <p className="text-xs text-danger">{saveError}</p>}

        {/* Per-field trust hint */}
        <p className="text-xs text-muted-foreground">
          {isUrl
            ? "Make sure this URL is reachable from the worker. Stored encrypted in Supabase Vault."
            : "Encrypted in Supabase Vault — only the worker reads it server-side during a run."}
        </p>
      </form>

      {/* Actions for a configured key */}
      {status && (
        <div className="space-y-3 border-t border-border pt-3">
          {/* Model override — only meaningful on the active provider */}
          {isActive && (
            <ModelOverride
              catalog={catalog}
              current={currentModel}
              onSaved={(model) => onModelSaved(model)}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
          {!isActive && (
            <button
              type="button"
              onClick={onActivate}
              className="rounded-lg border border-primary/30 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/15"
            >
              Set as active provider
            </button>
          )}
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Check className="h-3 w-3" /> Active — runs use this key
            </span>
          )}

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-danger transition hover:border-danger/40 hover:bg-danger/5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Remove {catalog.label}?
              </span>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg border border-border px-2.5 py-1 text-xs transition hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger/15 disabled:opacity-50"
              >
                {deleting ? "Removing…" : "Confirm"}
              </button>
            </div>
          )}
          </div>
        </div>
      )}

      {/* TODO: fallback model selector goes here once spec is confirmed */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model override — pin the model the engine calls on the active provider
// ---------------------------------------------------------------------------

function ModelOverride({
  catalog,
  current,
  onSaved,
}: {
  catalog: ProviderCatalogEntry;
  current: string | null;
  onSaved: (model: string | null) => void;
}) {
  const [modelDraft, setModelDraft] = useState(current ?? "");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  // Track whether the user has edited away from the saved value.
  const dirty = modelDraft.trim() !== (current ?? "");

  const saveModel = async (value: string | null) => {
    setModelSaving(true);
    setModelError(null);
    try {
      const next = await setSelectedProvider(catalog.name, value);
      onSaved(next.selected_model ?? null);
      toast.success(
        value
          ? `Model pinned: ${value}`
          : `Model reset to ${catalog.label} default`,
      );
    } catch (err) {
      setModelError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setModelSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (modelSaving) return;
        void saveModel(modelDraft.trim() || null);
      }}
      className="space-y-2"
    >
      <label
        htmlFor={`provider-model-${catalog.name}`}
        className="block text-xs font-medium text-muted-foreground"
      >
        Model{" "}
        <span className="font-normal text-muted-foreground/70">
          (default: <span className="font-mono">{catalog.default_model}</span>)
        </span>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`provider-model-${catalog.name}`}
          type="text"
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          value={modelDraft}
          onChange={(e) => setModelDraft(e.target.value)}
          placeholder={catalog.default_model}
          className="w-full flex-1 rounded-lg border border-border bg-[var(--bg-input)] px-3 py-2 font-mono text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="submit"
          disabled={modelSaving || !dirty}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/8 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {modelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {modelDraft.trim() ? "Pin model" : "Use default"}
        </button>
        {current && (
          <button
            type="button"
            disabled={modelSaving}
            onClick={() => {
              setModelDraft("");
              void saveModel(null);
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-elevated disabled:opacity-50"
          >
            Reset
          </button>
        )}
      </div>
      {modelError && <p className="text-xs text-danger">{modelError}</p>}
      <p className="text-xs text-muted-foreground">
        Leave empty to use the provider default. The pinned model is recorded
        on every run for reproducibility.
      </p>
    </form>
  );
}
