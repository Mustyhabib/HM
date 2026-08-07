import { Link, Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/pricing", label: "Pricing" },
];

const AUTH_LINKS = [
  { to: "/login", label: "Log in", primary: false },
  { to: "/signup", label: "Sign up", primary: true },
];

export function PublicLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Left: brand + nav */}
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

          {/* Right: auth */}
          <div className="flex items-center gap-2">
            {AUTH_LINKS.map(({ to, label, primary }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                  primary
                    ? "gradient-bg glow-gradient text-white hover:opacity-90"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-bold gradient-text">H~Mltd</span>
            <span>
              &copy; {new Date().getFullYear()} H~Mltd. All rights reserved.
            </span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link
              to="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
