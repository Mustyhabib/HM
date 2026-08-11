import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Sun, Moon, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const NAV_LINKS = [
  { to: "/",       label: "Home"    },
  { to: "/pricing", label: "Pricing" },
  { to: "/docs",    label: "Docs"    },
];

const AUTH_LINKS = [
  { to: "/login",  label: "Log in",  primary: false },
  { to: "/signup", label: "Sign up", primary: true  },
];

export function PublicLayout() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex min-h-dvh flex-col bg-background">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">

          {/* Left: brand + desktop nav */}
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-1.5"
              aria-label="H~Mltd home"
            >
              <span className="text-xl font-bold gradient-text glow-gradient">
                H~Mltd
              </span>
            </Link>
            <nav
              className="hidden items-center gap-1 sm:flex"
              aria-label="Public navigation"
            >
              {NAV_LINKS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    pathname === to
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right: theme toggle + auth (desktop) + hamburger (mobile) */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {theme === "dark"
                ? <Sun className="h-3.5 w-3.5" />
                : <Moon className="h-3.5 w-3.5" />}
            </button>

            {/* Desktop auth links */}
            {AUTH_LINKS.map(({ to, label, primary }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "hidden sm:inline-flex rounded-lg px-4 py-1.5 text-sm font-medium transition",
                  primary
                    ? "gradient-bg glow-gradient text-white hover:opacity-90"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:hidden"
            >
              {mobileOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileOpen && (
          <nav
            className="border-t border-border/60 bg-background/95 px-4 py-3 sm:hidden"
            aria-label="Mobile navigation"
          >
            <div className="space-y-1">
              {NAV_LINKS.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={closeMobile}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm transition-colors",
                    pathname === to
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
              {AUTH_LINKS.map(({ to, label, primary }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={closeMobile}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-center text-sm font-medium transition",
                    primary
                      ? "gradient-bg glow-gradient text-white hover:opacity-90"
                      : "border border-border text-muted-foreground hover:bg-elevated hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* ─── Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-bold gradient-text">H~Mltd</span>
            <span>
              &copy; {new Date().getFullYear()} H~Mltd. All rights reserved.
            </span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/docs"    className="transition-colors hover:text-foreground">Docs</Link>
            <Link to="/terms"   className="transition-colors hover:text-foreground">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
