import { Link, Outlet, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ListChecks,
  ScrollText,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { BrandLogo } from "@/components/common/BrandMark";

const NAV_ITEMS = [
  { to: "/admin",       icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/users",  icon: Users,           label: "Users"     },
  { to: "/admin/billing", icon: CreditCard,     label: "Billing"   },
  { to: "/admin/runs",   icon: ListChecks,      label: "Runs"      },
  { to: "/admin/audit",  icon: ScrollText,      label: "Audit Log" },
];

/**
 * Admin shell — a separate, denser sidebar+topbar from the user-facing
 * `Layout`. Same design tokens (bg/card/border/primary/etc.), no new
 * colors. Desktop-first per the design spec; admin doesn't need a mobile
 * drawer.
 */
export function AdminLayout() {
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = NAV_ITEMS.map(({ to, icon, label }) => ({
    to,
    icon,
    label,
    active: to === "/admin" ? pathname === "/admin" : pathname.startsWith(to),
  }));

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* ─── Sidebar ─── */}
      <aside
        className="hidden w-52 shrink-0 flex-col border-r border-border/60 bg-card md:flex"
        aria-label="Admin navigation"
      >
        <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
          <Link to="/admin" className="flex items-center gap-1.5">
            <BrandLogo />
          </Link>
          <span className="ml-auto flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="h-2.5 w-2.5" />
            Admin
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                item.active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-elevated hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border/60 px-2 py-3">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
          >
            Exit to app
          </Link>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 bg-card px-4">
          <div className="flex items-center gap-2 md:hidden">
            <BrandLogo />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Admin</span>
          </div>
          <div className="hidden text-sm font-medium text-foreground md:block">
            H~M Admin
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-danger/40 hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
