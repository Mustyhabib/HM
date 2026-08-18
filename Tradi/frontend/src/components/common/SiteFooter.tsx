import { Link } from "react-router";
import {
  BRAND_NAME,
  LEGAL_NAME,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/lib/company";

/**
 * Shared footer — rendered on every page (public + authenticated app) so the
 * platform's ownership/contact footprint is always visible, per
 * Design_Flow_Prompt.md "Ownership / contact footprint".
 *
 * SUPPORT_PHONE is a bracketed placeholder until legal review fills a real
 * number (see lib/company.ts). We render it as plain text in that case —
 * only render a `tel:` link once it actually contains digits.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  const isPlaceholderPhone = SUPPORT_PHONE.includes("[");
  const phoneHref = SUPPORT_PHONE.replace(/[^\d+]/g, "");

  return (
    <footer className="border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
          <span className="font-bold gradient-text">{BRAND_NAME}</span>
          <span>
            &copy; {year} {LEGAL_NAME}. All rights reserved.
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="transition-colors hover:text-foreground"
          >
            {SUPPORT_EMAIL}
          </a>
          {isPlaceholderPhone ? (
            <span>{SUPPORT_PHONE}</span>
          ) : (
            <a
              href={`tel:${phoneHref}`}
              className="transition-colors hover:text-foreground"
            >
              {SUPPORT_PHONE}
            </a>
          )}
          <Link to="/docs" className="transition-colors hover:text-foreground">Docs</Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
