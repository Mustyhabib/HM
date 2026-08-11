import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Users, Sparkles, Search, Crown, X as CloseIcon, Loader2, ArrowRight,
  TrendingUp, BarChart3, Bitcoin, Globe2, Brain, ShieldAlert, Layers,
  LineChart, Landmark, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SWARM_PRESETS, CATEGORY_LABEL, startSwarmRun,
  type SwarmPreset, type SwarmCategory,
} from "@/lib/swarm";
import { getActiveUsage, type UsageSnapshot } from "@/lib/runs";

/**
 * Teams — the multi-agent swarm workspace. Pro & Premium plans only.
 * Users pick from 30 preset teams (Equity, Crypto, Macro, Quant…), fill in
 * a small variable form, and start a coordinated multi-agent run.
 */

const CATEGORY_ICON: Record<SwarmCategory, React.ComponentType<{ className?: string }>> = {
  equity:      TrendingUp,
  crypto:      Bitcoin,
  macro:       Globe2,
  quant:       BarChart3,
  sentiment:   Brain,
  risk:        ShieldAlert,
  sector:      Layers,
  derivatives: LineChart,
  credit:      Landmark,
  committee:   Briefcase,
};

const CATEGORY_ORDER: SwarmCategory[] = [
  "equity", "quant", "macro", "crypto", "committee",
  "risk", "derivatives", "sentiment", "credit", "sector",
];

export function Teams() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<SwarmCategory | "all">("all");
  const [selected, setSelected] = useState<SwarmPreset | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getActiveUsage()
      .then((u) => { if (!cancelled) { setUsage(u); setUsageLoaded(true); } })
      .catch(() => { if (!cancelled) setUsageLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const isPro     = usage?.tier === "pro" || usage?.tier === "premium";
  const outOfQuota = usage !== null && usage.remaining <= 0;
  const gated     = usageLoaded && (!usage || !isPro || outOfQuota);

  /** Filtered preset list — by search + category */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SWARM_PRESETS.filter((p) => {
      if (activeCat !== "all" && p.category !== activeCat) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.includes(q)
      );
    });
  }, [query, activeCat]);

  const openPreset = useCallback((p: SwarmPreset) => {
    setSelected(p);
    const seed: Record<string, string> = {};
    p.vars.forEach((v) => { if (v.default) seed[v.key] = v.default; });
    setVars(seed);
  }, []);

  const closePreset = useCallback(() => {
    setSelected(null);
    setVars({});
  }, []);

  const runPreset = useCallback(async () => {
    if (!selected || starting) return;
    // Validate required vars
    const missing = selected.vars.filter((v) => v.required && !vars[v.key]?.trim());
    if (missing.length) {
      toast.error(`Please fill in: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    setStarting(true);
    try {
      const runId = await startSwarmRun(selected.name, vars);
      navigate(`/run/${runId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start team run";
      toast.error(msg);
      setStarting(false);
    }
  }, [selected, vars, starting, navigate]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* ─── Header ─── */}
      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Users className="h-3 w-3" /> Research Teams
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Deploy a <span className="gradient-text">specialist team</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          30 preset teams of coordinated agents — each with defined roles, tools, and
          hand-offs. Pick a team, brief it, and get a multi-perspective research report.
        </p>
      </div>

      {/* ─── Plan gate banner ─── */}
      {gated && usageLoaded && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Crown className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {!usage
                  ? "Subscribe to run research teams"
                  : !isPro
                  ? "Upgrade to Pro or Premium to run teams"
                  : "You've used all your runs this billing period"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Multi-agent teams count as one run each. Premium plan runs may cost 2 (extended DAG).
              </p>
            </div>
          </div>
          <Link
            to="/pricing"
            className="shrink-0 rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            See plans
          </Link>
        </div>
      )}

      {/* ─── Filters ─── */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams — equity, crypto, macro, risk…"
            aria-label="Search teams"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary/50"
          />
        </div>

        <div className="-mx-1 flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCat("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
              activeCat === "all"
                ? "border-primary/50 bg-primary/12 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            All <span className="ml-1 text-[10px] opacity-70">{SWARM_PRESETS.length}</span>
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = SWARM_PRESETS.filter((p) => p.category === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                  activeCat === cat
                    ? "border-primary/50 bg-primary/12 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {CATEGORY_LABEL[cat]} <span className="ml-1 text-[10px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Presets grid ─── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No teams match your search. Try a different term.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((preset) => {
            const Icon = CATEGORY_ICON[preset.category] ?? Sparkles;
            return (
              <button
                key={preset.name}
                onClick={() => openPreset(preset)}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-elevated/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/8 transition group-hover:border-primary/45 group-hover:bg-primary/12">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABEL[preset.category]}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition">
                    {preset.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Preset launch modal ─── */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preset-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closePreset}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {CATEGORY_LABEL[selected.category]}
                </div>
                <h2 id="preset-title" className="text-lg font-semibold text-foreground">
                  {selected.title}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {selected.description}
                </p>
              </div>
              <button
                onClick={closePreset}
                aria-label="Close"
                className="rounded-full p-1 text-muted-foreground transition hover:bg-elevated hover:text-foreground"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {selected.vars.map((v) => (
                <div key={v.key}>
                  <label htmlFor={`var-${v.key}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
                    {v.label}
                    {v.required && <span className="text-danger">*</span>}
                  </label>
                  <input
                    id={`var-${v.key}`}
                    type="text"
                    value={vars[v.key] ?? ""}
                    onChange={(e) => setVars({ ...vars, [v.key]: e.target.value })}
                    placeholder={v.placeholder}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={closePreset}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-elevated hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={runPreset}
                disabled={starting || gated}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {starting ? "Starting…" : gated ? "Upgrade required" : "Deploy team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
