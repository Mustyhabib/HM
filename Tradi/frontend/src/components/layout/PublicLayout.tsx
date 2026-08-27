import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { Sun, Moon, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { BETA_MODE } from "@/lib/beta";
import { SiteFooter } from "@/components/common/SiteFooter";
import { BetaBanner } from "@/components/common/BetaBanner";

const NAV_LINKS = [
  { to: "/",       label: "Home"    },
  { to: "/pricing", label: "Pricing" },
  { to: "/docs",    label: "Docs"    },
];

// Open beta: auth links hidden from the header. BETA_MODE=false brings them
// straight back — the routes and Login/Signup pages are untouched.
const AUTH_LINKS = BETA_MODE
  ? []
  : [
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
      <BetaBanner />

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">

          {/* Left: desktop nav only (brand moves to right) */}
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

          {/* Right: theme toggle + auth + brand mark (top-right) */}
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

            {/* Brand — top-right anchor */}
            <Link
              to="/"
              className="hidden sm:flex items-center gap-1.5 ml-1 pl-3 border-l border-border/60"
              aria-label="H~Mltd home"
            >
              <span className="text-base font-bold gradient-text glow-gradient">
                H~Mltd
              </span>
            </Link>

            {/* Mobile: brand + hamburger */}
            <Link
              to="/"
              className="flex sm:hidden items-center"
              aria-label="H~Mltd home"
            >
              <span className="text-base font-bold gradient-text glow-gradient">
                H~Mltd
              </span>
            </Link>
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
      <SiteFooter />
    </div>
  );
}
