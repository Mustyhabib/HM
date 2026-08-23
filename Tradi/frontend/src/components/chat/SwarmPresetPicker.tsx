import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Users, Sparkles, Search, Crown, X as CloseIcon, Loader2, ArrowRight, ArrowLeft, Plus,
  TrendingUp, BarChart3, Bitcoin, Globe2, Brain, ShieldAlert, Layers,
  LineChart, Landmark, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SWARM_PRESETS, CATEGORY_LABEL, startSwarmRun,
  type SwarmPreset, type SwarmCategory,
} from "@/lib/swarm";

/**
 * SwarmPresetPicker — the multi-agent swarm launcher, extracted from the
 * former `/teams` page (2026-08-21) into an inline panel on the Agent page.
 * Pro & Premium plans only; the plan gate mirrors the server's
 * `start_swarm_run` check (`plan_id IN ('pro','premium')`) but is UI-only —
 * the RPC re-derives and re-checks everything from `auth.uid()` server-side.
 *
 * Renders as a sibling of the Agent prompt box's <form>, never nested
 * inside it — the vars form below has its own text inputs, and nesting them
 * in the outer prompt form would let Enter submit the wrong thing.
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

interface SwarmPresetPickerProps {
  /** Panel visibility — controlled by the parent's "+" toggle button. */
  open: boolean;
  onClose: () => void;
  /** Pro/Premium gate — mirrors `start_swarm_run`'s plan check. */
  isPro: boolean;
  /** Whether the subscription check has resolved (avoids a gate-banner flash). */
  subscriptionLoaded: boolean;
  /** Called with the new run id once `startSwarmRun` succeeds. */
  onStarted: (runId: string) => void;
  /** Called with the preset TITLE when the user picks "Add to prompt" —
   *  exports the chosen team into the composer text instead of running it. */
  onChosen?: (title: string) => void;
}

export function SwarmPresetPicker({
  open,
  onClose,
  isPro,
  subscriptionLoaded,
  onStarted,
  onChosen,
}: SwarmPresetPickerProps) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<SwarmCategory | "all">("all");
  const [selected, setSelected] = useState<SwarmPreset | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);

  const gated = subscriptionLoaded && !isPro;

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Reset to the browse view whenever the panel closes, so it reopens fresh.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setVars({});
      setQuery("");
      setActiveCat("all");
      setStarting(false);
    }
  }, [open]);

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

  const backToBrowse = useCallback(() => {
    setSelected(null);
    setVars({});
  }, []);

  const runPreset = useCallback(async () => {
    if (!selected || starting || gated) return;
    const missing = selected.vars.filter((v) => v.required && !vars[v.key]?.trim());
    if (missing.length) {
      toast.error(`Please fill in: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    setStarting(true);
    try {
      const runId = await startSwarmRun(selected.name, vars);
      onStarted(runId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start team run";
      toast.error(msg);
      setStarting(false);
    }
  }, [selected, vars, starting, gated, onStarted]);

  if (!open) return null;

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-4 msg-enter">
      {/* ─── Header ─── */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/8">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Deploy a specialist team</h2>
            <p className="text-[11px] text-muted-foreground">
              30 preset teams — pick one, brief it, get a multi-perspective report
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close swarm presets"
          className="rounded-full p-1.5 text-muted-foreground transition hover:bg-elevated hover:text-foreground"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Plan gate banner ─── */}
      {gated && (
        <div className="mb-3 flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5">
            <Crown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-foreground">
              Swarm teams require the Pro or Premium plan.
            </p>
          </div>
          <Link
            to="/pricing"
            className="shrink-0 rounded-lg gradient-bg glow-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            See plans
          </Link>
        </div>
      )}

      {selected ? (
        /* ─── Vars form for the selected preset ─── */
        <div>
          <button
            type="button"
            onClick={backToBrowse}
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to teams
          </button>

          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            {CATEGORY_LABEL[selected.category]}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{selected.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {selected.description}
          </p>

          <div className="mt-4 space-y-3">
            {selected.vars.map((v) => (
              <div key={v.key}>
                <label
                  htmlFor={`swarm-var-${v.key}`}
                  className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground"
                >
                  {v.label}
                  {v.required && <span className="text-danger">*</span>}
                </label>
                <input
                  id={`swarm-var-${v.key}`}
                  type="text"
                  value={vars[v.key] ?? ""}
                  onChange={(e) => setVars((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  placeholder={v.placeholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary/50"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={backToBrowse}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-elevated hover:text-foreground"
            >
              Cancel
            </button>
            {onChosen && (
              <button
                type="button"
                onClick={() => onChosen(selected.title)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/15"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to prompt
              </button>
            )}
            <button
              type="button"
              onClick={runPreset}
              disabled={starting || gated}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-bg glow-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              {starting ? "Starting…" : gated ? "Upgrade required" : "Start swarm"}
            </button>
          </div>
        </div>
      ) : (
        /* ─── Browse: search + category chips + preset grid ─── */
        <div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams — equity, crypto, macro, risk…"
              aria-label="Search teams"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary/50"
            />
          </div>

          <div className="-mx-1 mb-3 flex flex-wrap gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveCat("all")}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                activeCat === "all"
                  ? "border-primary/50 bg-primary/12 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
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
                  type="button"
                  onClick={() => setActiveCat(cat)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                    activeCat === cat
                      ? "border-primary/50 bg-primary/12 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {CATEGORY_LABEL[cat]} <span className="ml-1 text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-background p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No teams match your search. Try a different term.
              </p>
            </div>
          ) : (
            <div className="grid max-h-72 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {filtered.map((preset) => {
                const Icon = CATEGORY_ICON[preset.category] ?? Sparkles;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => openPreset(preset)}
                    className="group flex flex-col gap-2 rounded-xl border border-border bg-background p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-elevated/40 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/8 transition group-hover:border-primary/45 group-hover:bg-primary/12">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABEL[preset.category]}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition">
                        {preset.title}
                      </h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
