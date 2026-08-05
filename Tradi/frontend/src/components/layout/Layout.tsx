import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  Home,
  Bot,
  Radio,
  BookOpen,
  Settings,
  Wallet,
  UserCircle,
  ChevronsLeft,
  ChevronsRight,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/common/BrandMark";
import { safeGet, safeSet } from "@/lib/storage";

const NAV_ITEMS = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/agent", icon: Bot, label: "Agent" },
  { to: "/signals", icon: Radio, label: "Signals" },
  { to: "/usage", icon: BookOpen, label: "Usage" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/wallet", icon: Wallet, label: "Wallet" },
];

export function Layout() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => safeGet("hm-sidebar") === "collapsed",
  );

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    safeSet("hm-sidebar", next ? "collapsed" : "expanded");
  };

  return (
    <div className="flex h-screen bg-background">
      {/* ─── Sidebar ─── */}
      <aside
        className={cn(
          "flex flex-col shrink-0 border-r border-border/60 bg-card transition-all duration-200",
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
              <span className="text-lg font-bold gradient-text">H~M</span>
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
        <nav className={cn("flex-1 py-3", collapsed ? "px-2" : "px-3")}>
          <div className="space-y-1">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
              const active =
                to === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center rounded-lg text-sm transition-colors",
                    collapsed
                      ? "justify-center p-2.5"
                      : "gap-3 px-3 py-2.5",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-[#101730] hover:text-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              );
            })}
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
              "flex items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-[#101730] hover:text-foreground",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
            )}
          >
            <UserCircle className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span>Profile</span>}
          </Link>

          {/* Upgrade button */}
          {!collapsed && (
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg gradient-bg glow-gradient px-3 py-2 text-sm font-medium text-white transition hover:opacity-90">
              <Crown className="h-4 w-4" />
              Upgrade Plan
            </button>
          )}

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapse}
            className={cn(
              "mt-2 flex items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground",
              collapsed
                ? "justify-center w-full p-2.5"
                : "gap-3 px-3 py-2.5 w-full",
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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

      {/* ─── Main content ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
