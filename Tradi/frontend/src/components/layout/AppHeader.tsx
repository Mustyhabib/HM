/**
 * AppHeader — persistent top header across all authenticated pages.
 *
 * Layout contract (HM spec, 2026-08-23):
 *  - LEFT: brand mark + name, then the CURRENT PAGE's greeting/title
 *    (each page declares its own identity — see PAGE_TITLES below).
 *  - RIGHT: quick links — Profile, Billing, Docs, Review & FAQ.
 *    These retire the old sidebar-bottom section.
 */
import { Link, useLocation } from "react-router";
import {
  BookOpen,
  CreditCard,
  MessageSquareHeart,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/common/BrandMark";
import { getActiveSubscription } from "@/lib/runs";
import { BETA_MODE } from "@/lib/beta";

/** Subscription pill next to the brand — plan level, consistent everywhere. */
function PlanPill() {
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    if (BETA_MODE) return; // beta pill is static — no fetch needed
    let cancelled = false;
    getActiveSubscription()
      .then((s) => { if (!cancelled) setPlan(s?.planId ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (BETA_MODE) {
    return (
      <span
        title="Open beta — full access, no charge"
        className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
      >
        BETA
      </span>
    );
  }

  const label = (plan ?? "free").toUpperCase();
  return (
    <span
      title={`Subscription: ${plan ?? "free"}`}
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        plan === "premium"
          ? "gradient-bg text-white"
          : plan === "pro"
            ? "border border-primary/40 bg-primary/10 text-primary"
            : "border border-border bg-elevated text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/** Per-page identity shown left of the quick links. */
const PAGE_TITLES: Array<{ match: RegExp; title: string; sub?: string }> = [
  { match: /^\/dashboard/, title: "Dashboard", sub: "Your research command center" },
  { match: /^\/agent/,     title: "Research Studio", sub: "One prompt, one reproducible run" },
  { match: /^\/run\//,     title: "Run Output" },
  { match: /^\/profile|^\/settings/, title: "Profile & Settings" },
  { match: /^\/docs/,      title: "Documentation" },
  { match: /^\/review/,    title: "Reviews & Support" },
  { match: /^\/reports/,   title: "Reports" },
  { match: /^\/runtime/,   title: "Runtime" },
  { match: /^\/scheduled/, title: "Scheduled Runs" },
  { match: /^\/compare/,   title: "Compare Runs" },
  { match: /^\/correlation/, title: "Correlation" },
  { match: /^\/alpha-zoo/, title: "Alpha Zoo" },
];

function pageTitle(pathname: string) {
  return PAGE_TITLES.find((p) => p.match.test(pathname)) ?? null;
}

const QUICK_LINKS = [
  { to: "/profile", icon: UserCircle, label: "Profile" },
  { to: "/billing/callback", icon: CreditCard, label: "Billing", hidden: true }, // billing lives under profile; kept out of the row
  { to: "/docs", icon: BookOpen, label: "Docs" },
  { to: "/review", icon: MessageSquareHeart, label: "Review" },
];

export function AppHeader() {
  const { pathname } = useLocation();
  const identity = pageTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/60 bg-card px-5">
      {/* LEFT — brand + plan pill + per-page identity */}
      <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
        <BrandLogo />
      </Link>
      <PlanPill />

      <div className="h-6 w-px bg-border/60" aria-hidden />

      <div className="min-w-0 flex-1">
        {identity ? (
          <>
            <p className="truncate text-sm font-semibold leading-tight">{identity.title}</p>
            {identity.sub && (
              <p className="truncate text-[11px] leading-tight text-muted-foreground">{identity.sub}</p>
            )}
          </>
        ) : (
          <p className="truncate text-sm font-semibold">H~M Trading Institute</p>
        )}
      </div>

      {/* RIGHT — quick links */}
      <nav aria-label="Quick links" className="flex shrink-0 items-center gap-1">
        {QUICK_LINKS.filter((l) => !l.hidden).map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            title={label}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition",
              pathname.startsWith(to)
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-elevated hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
