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
  Settings,
  UserCircle,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/common/BrandMark";
import { safeGet, safeSet } from "@/lib/storage";
import { useTheme } from "@/lib/theme";

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
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
  compact: boolean;
  locked: boolean;
}) {
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
function SidebarNav({ pathname, compact }: { pathname: string; compact: boolean }) {
  return (
    <nav
      className={cn("flex-1 overflow-y-auto py-3", compact ? "px-2" : "px-3")}
      aria-label="Sidebar navigation"
    >
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <SectionLabel label={section.label} compact={compact} />
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                locked={item.locked}
                compact={compact}
                active={
                  item.to === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.to)
                }
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export function Layout() {
  const { pathname } = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(
    () => safeGet("hm-sidebar") === "collapsed",
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    safeSet("hm-sidebar", next ? "collapsed" : "expanded");
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">

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
        <div className="flex h-14 items-center border-b border-border/60 px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <BrandLogo />
            <span className="ml-1 rounded-full gradient-bg px-2 py-0.5 text-[10px] font-semibold text-white">
              PRO
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <SidebarNav pathname={pathname} compact={false} />

        <div className="border-t border-border/60 px-3 py-3 space-y-1">
          <Link
            to="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              pathname.startsWith("/settings")
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-elevated hover:text-foreground",
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span>Settings</span>
          </Link>
          <Link
            to="/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-elevated hover:text-foreground"
          >
            <UserCircle className="h-[18px] w-[18px] shrink-0" />
            <span>Profile</span>
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
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r border-border/60 bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-56",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex items-center border-b border-border/60 h-14",
            collapsed ? "justify-center px-2" : "px-4",
          )}
        >
          <Link to="/dashboard" className="flex items-center gap-2">
            {collapsed ? (
              <span className="text-lg font-bold gradient-text">H~</span>
            ) : (
              <>
                <BrandLogo />
                <span className="ml-1 rounded-full gradient-bg px-2 py-0.5 text-[10px] font-semibold text-white">
                  PRO
                </span>
              </>
            )}
          </Link>
        </div>

        <SidebarNav pathname={pathname} compact={collapsed} />

        {/* Bottom section */}
        <div
          className={cn(
            "mt-auto border-t border-border/60 py-3",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {/* Settings */}
          <Link
            to="/settings"
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm transition-colors",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
              pathname.startsWith("/settings")
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-elevated hover:text-foreground",
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>

          {/* Profile */}
          <Link
            to="/profile"
            title={collapsed ? "Profile" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
            )}
          >
            <UserCircle className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Profile</span>}
          </Link>

          {/* Legal — expanded only */}
          {!collapsed && (
            <div className="mt-1 flex gap-3 px-3 text-[10px] text-muted-foreground/60">
              <Link to="/terms"   className="hover:text-muted-foreground transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            </div>
          )}

          {/* Upgrade button — expanded only */}
          {!collapsed && (
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-3 py-2 text-sm font-medium text-white transition hover:opacity-90">
              <Crown className="h-4 w-4" />
              Upgrade Plan
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className={cn(
              "mt-1 flex items-center rounded-lg text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground",
              collapsed ? "justify-center w-full p-2.5" : "gap-3 px-3 py-2.5 w-full",
            )}
          >
            {theme === "dark"
              ? <Sun className="h-[18px] w-[18px] shrink-0" />
              : <Moon className="h-[18px] w-[18px] shrink-0" />}
            {!collapsed && (
              <span className="text-xs">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            )}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "mt-1 flex items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
              collapsed ? "justify-center w-full p-2.5" : "gap-3 px-3 py-2.5 w-full",
            )}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ─── Main content area ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
          <Link to="/dashboard">
            <span className="text-lg font-bold gradient-text glow-gradient">H~Mltd</span>
          </Link>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
