import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  Home,
  Bot,
  Users,
  Radio,
  BookOpen,
  Settings,
  Wallet,
  UserCircle,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Sun,
  Moon,
  Menu,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/common/BrandMark";
import { safeGet, safeSet } from "@/lib/storage";
import { useTheme } from "@/lib/theme";

const NAV_ITEMS = [
  { to: "/dashboard", icon: Home,     label: "Home"     },
  { to: "/agent",     icon: Bot,      label: "Agent"    },
  { to: "/teams",     icon: Users,    label: "Teams"    },
  { to: "/signals",   icon: Radio,    label: "Signals"  },
  { to: "/usage",     icon: BookOpen, label: "Usage"    },
  { to: "/settings",  icon: Settings, label: "Settings" },
  { to: "/wallet",    icon: Wallet,   label: "Wallet"   },
  { to: "/docs",      icon: FileText, label: "Docs"     },
];

// ─── NavItem — shared by both mobile and desktop sidebars ───────────────────
function NavItem({
  to,
  icon: Icon,
  label,
  active,
  compact,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  active: boolean;
  compact: boolean;
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
          : "text-muted-foreground hover:bg-elevated hover:text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!compact && <span>{label}</span>}
    </Link>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(
    () => safeGet("hm-sidebar") === "collapsed",
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    safeSet("hm-sidebar", next ? "collapsed" : "expanded");
  };

  const navItems = NAV_ITEMS.map(({ to, icon, label }) => ({
    to,
    icon,
    label,
    active:
      to === "/dashboard"
        ? pathname === "/dashboard"
        : pathname.startsWith(to),
  }));

  return (
    <div className="flex h-dvh overflow-hidden bg-background">

      {/* ─── Mobile: backdrop overlay ───────────────────────────────────── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      {/* ─── Mobile: slide-in sidebar drawer ────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/60 bg-card",
          "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Sidebar navigation"
      >
        {/* Brand + close */}
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

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} compact={false} />
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-border/60 px-3 py-3 space-y-1">
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
          <button className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-3 py-2 text-sm font-medium text-white transition hover:opacity-90">
            <Crown className="h-4 w-4" />
            Upgrade Plan
          </button>
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
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
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r border-border/60 bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-56",
        )}
        aria-label="Sidebar navigation"
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

        {/* Nav */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-3",
            collapsed ? "px-2" : "px-3",
          )}
        >
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavItem key={item.to} {...item} compact={collapsed} />
            ))}
          </div>
        </nav>

        {/* Bottom section */}
        <div
          className={cn(
            "mt-auto border-t border-border/60 py-3",
            collapsed ? "px-2" : "px-3",
          )}
        >
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

          {/* Upgrade button */}
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
              <span className="text-xs">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
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

        {/* Mobile top bar (hidden on md+) */}
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
            {theme === "dark"
              ? <Sun className="h-4 w-4" />
              : <Moon className="h-4 w-4" />}
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
