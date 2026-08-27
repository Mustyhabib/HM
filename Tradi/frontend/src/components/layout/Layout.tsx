import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  LayoutDashboard,
  Globe,
  Bot,
  TrendingUp,
  Brain,
  Dna,
  FlaskConical,
  ScrollText,
  Briefcase,
  Database,
  Layers,
  Radio,
  Sun,
  Moon,
  X,
  FileText,
  Microscope,
} from "lucide-react";
import { UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { AppHeader } from "@/components/layout/AppHeader";
import { BetaBanner } from "@/components/common/BetaBanner";
import { FeaturePreviewDrawer } from "@/components/layout/FeaturePreviewDrawer";

/* ─── Nav definition ────────────────────────────────────────────────────────
   Each section has a label (shown expanded) and items.
   IMPORTANT: /agent stays as-is — only the label changes to "Research".
   New stubs (Phase 2-8) are locked=true until their phase ships.
─────────────────────────────────────────────────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: "OVERVIEW",
    items: [
      { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard", locked: false },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { to: "/markets",    icon: Globe,           label: "Markets",    locked: true  },
      { to: "/agent",      icon: Bot,             label: "Research",   locked: false },
      { to: "/reports",    icon: FileText,        label: "Reports",    locked: false },
      { to: "/alpha-zoo",  icon: Microscope,      label: "Alpha Zoo",  locked: false },
    ],
  },
  {
    label: "STRATEGY",
    items: [
      { to: "/strategies", icon: TrendingUp,      label: "Strategies", locked: true  },
      { to: "/backtests",  icon: FlaskConical,    label: "Backtests",  locked: true  },
      { to: "/paper",      icon: ScrollText,      label: "Paper",      locked: true  },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { to: "/ml-studio",  icon: Brain,           label: "ML Studio",  locked: true  },
      { to: "/rl-studio",  icon: Dna,             label: "RL Studio",  locked: true  },
    ],
  },
  {
    label: "PORTFOLIO",
    items: [
      { to: "/portfolio",  icon: Briefcase,       label: "Portfolio",  locked: true  },
      { to: "/data",       icon: Database,        label: "Data",       locked: true  },
      { to: "/models",     icon: Layers,          label: "Models",     locked: true  },
      { to: "/live",       icon: Radio,           label: "Live",       locked: true  },
    ],
  },
];

// ─── NavItem ─────────────────────────────────────────────────────────────────
function NavItem({
  to,
  icon: Icon,
  label,
  active,
  compact,
  locked,
  onPreview,
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
  compact: boolean;
  locked: boolean;
  onPreview?: () => void;
}) {
  // Locked items open the feature-preview drawer instead of navigating.
  if (locked && onPreview) {
    return (
      <button
        type="button"
        title={compact ? label : undefined}
        onClick={onPreview}
        className={cn(
          "w-full flex items-center rounded-lg text-sm transition-colors",
          compact ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
          "text-muted-foreground/40 hover:bg-elevated hover:text-muted-foreground",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!compact && <span className="flex-1 text-left">{label}</span>}
        {!compact && (
          <span className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/40 border border-border/40">
            Soon
          </span>
        )}
      </button>
    );
  }

  return (
    <Link
      to={to}
      title={compact ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-sm transition-colors",
        compact ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
        active
          ? "bg-primary/10 text-primary font-medium"
          : locked
          ? "text-muted-foreground/40 hover:bg-elevated hover:text-muted-foreground cursor-default"
          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
      )}
      onClick={locked ? (e) => e.preventDefault() : undefined}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!compact && (
        <span className="flex-1">{label}</span>
      )}
      {!compact && locked && (
        <span className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/40 border border-border/40">
          Soon
        </span>
      )}
    </Link>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ label, compact }: { label: string; compact: boolean }) {
  if (compact) return <div className="my-2 h-px bg-border/40 mx-2" />;
  return (
    <div className="mb-1 mt-4 first:mt-0 px-3 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 select-none">
      {label}
    </div>
  );
}

// ─── Sidebar nav content (shared between mobile + desktop) ────────────────────
function SidebarNav({
  pathname,
  compact,
  onPreview,
}: {
  pathname: string;
  compact: boolean;
  onPreview: (to: string) => void;
}) {
  return (
    <nav
      className={cn("flex-1 overflow-y-auto py-3", compact ? "px-2" : "px-3")}
      aria-label="Sidebar navigation"
    >
      {NAV_SECTIONS.map((section) => {
        // In BETA_MODE locked items are now shown — clicking them opens the
        // feature-preview drawer instead of navigating. BETA_MODE=false
        // restores the old "Soon" nav-link behaviour unchanged.
        const items = section.items;
        return (
          <div key={section.label}>
            <SectionLabel label={section.label} compact={compact} />
            <div className="space-y-0.5">
              {items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  locked={item.locked}
                  compact={compact}
                  onPreview={item.locked ? () => onPreview(item.to) : undefined}
                  active={
                    item.to === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.to)
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export function Layout() {
  const { pathname } = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  // Feature-preview drawer: null = closed; a route path = open at that slide
  const [previewTo, setPreviewTo] = useState<string | null>(null);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <BetaBanner />

      {/* ─── Mobile: backdrop overlay ───────────────────────────────────── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      {/* ─── Mobile: slide-in sidebar drawer ────────────────────────────── */}
      <aside
        aria-label="Mobile navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/60 bg-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="text-lg font-bold gradient-text">H~</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <SidebarNav pathname={pathname} compact={false} onPreview={setPreviewTo} />

        <div className="border-t border-border/60 px-3 py-3 space-y-1">
          <Link
            to="/profile"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              pathname.startsWith("/profile") || pathname.startsWith("/settings")
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-elevated hover:text-foreground",
            )}
          >
            <UserCircle className="h-[18px] w-[18px] shrink-0" />
            <span>Profile &amp; Settings</span>
          </Link>
          <div className="flex gap-3 px-3 pt-1 text-[10px] text-muted-foreground/60">
            <Link to="/terms"   className="hover:text-muted-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
          </div>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            {theme === "dark"
              ? <Sun className="h-[18px] w-[18px] shrink-0" />
              : <Moon className="h-[18px] w-[18px] shrink-0" />}
            <span className="text-xs">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>

      {/* ─── Desktop: persistent sidebar ────────────────────────────────── */}
      <aside
        aria-label="Primary navigation"
        className="hidden w-56 shrink-0 border-r border-border/60 bg-card md:flex md:flex-col"
      >
        <SidebarNav pathname={pathname} compact={false} onPreview={setPreviewTo} />
      </aside>

      {/* ─── Main content area ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Persistent header — brand+plan left, page identity, quick links right */}
        <AppHeader />

        <main className="relative flex-1 overflow-auto">
          <Outlet />

          {/* Mini utility strip — dashboard-only, bottom-left, unobtrusive.
              Retires the old sidebar footer (legal/theme/support). */}
          {pathname === "/dashboard" && (
            <div className="pointer-events-none sticky bottom-0 left-0 z-20">
              <div className="pointer-events-auto inline-flex items-center gap-3 rounded-tr-lg border border-r-0 border-b-0 border-border/60 bg-card/90 px-3 py-1.5 text-[10px] text-muted-foreground/70 backdrop-blur">
                <Link to="/terms" className="transition-colors hover:text-muted-foreground">Terms</Link>
                <span aria-hidden>·</span>
                <Link to="/privacy" className="transition-colors hover:text-muted-foreground">Privacy</Link>
                <span aria-hidden>·</span>
                <button
                  onClick={toggleTheme}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  className="inline-flex items-center gap-1 transition-colors hover:text-muted-foreground"
                >
                  {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <span aria-hidden>·</span>
                <a href="/review" className="transition-colors hover:text-muted-foreground">Support</a>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ─── Feature-preview drawer (roadmap stubs) ─────────────────────── */}
      <FeaturePreviewDrawer
        open={previewTo !== null}
        initialTo={previewTo}
        onClose={() => setPreviewTo(null)}
      />
    </div>
  );
}
