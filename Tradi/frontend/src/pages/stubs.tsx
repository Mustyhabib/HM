/**
 * Stub pages for roadmap Phase 2–8 features.
 *
 * Data lives in FeaturePreviewDrawer (single source of truth shared with the
 * in-app feature-preview carousel). Each export is a full-page route component
 * that looks up its own entry by `to` path.
 */
import { Lock } from "lucide-react";
import { STUB_FEATURES } from "@/components/layout/FeaturePreviewDrawer";

function Stub({ to }: { to: string }) {
  const f = STUB_FEATURES.find((x) => x.to === to);
  if (!f) return null;
  const Icon = f.icon;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-elevated">
          <Icon className="h-9 w-9 text-muted-foreground/40" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight">{f.label}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Lock className="h-3 w-3" />
            {f.phase}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
        <ul className="space-y-1.5 text-left text-sm">
          {f.capabilities.map((c) => (
            <li key={c} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border/60 text-center text-[9px] leading-4">○</span>
              {c}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground/40">The live run loop never breaks — new surfaces stand up beside it (D16).</p>
      </div>
    </div>
  );
}

export function Markets()    { return <Stub to="/markets" />; }
export function Strategies() { return <Stub to="/strategies" />; }
export function MLStudio()   { return <Stub to="/ml-studio" />; }
export function RLStudio()   { return <Stub to="/rl-studio" />; }
export function Backtests()  { return <Stub to="/backtests" />; }
export function Paper()      { return <Stub to="/paper" />; }
export function Portfolio()  { return <Stub to="/portfolio" />; }
export function Models()     { return <Stub to="/models" />; }
export function Live()       { return <Stub to="/live" />; }
