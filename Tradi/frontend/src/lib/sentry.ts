/**
 * Sentry error tracking — optional, DSN-driven, fail-open (design D-M1).
 *
 * No VITE_SENTRY_DSN -> initSentry() is a no-op: @sentry/react's init is
 * never called, so there is zero network activity and zero behaviour
 * change. Set the DSN and the app starts reporting uncaught errors, with
 * user content stripped out of any `extra` payload first (design D-M2).
 */
import * as Sentry from "@sentry/react";

// Keys that must never reach Sentry, regardless of what a call site passes —
// prompts and credentials are the two things CLAUDE.md forbids leaking off
// the platform. Matches the worker's equivalent denylist (sentry.py).
const DENYLIST_RE = /(prompt|api[_-]?key|token|secret|email)/i;

let initialized = false;

/**
 * Initialize Sentry if `VITE_SENTRY_DSN` is set. Safe to call unconditionally
 * — with no DSN this never touches the network.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || "production",
    // MVP: errors only, no performance tracing — nothing here carries user
    // content, but traces are a scope decision for a later increment.
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

function scrubExtra(
  extra?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra)) {
    if (DENYLIST_RE.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * Safe wrapper around Sentry.captureException: no-op without a DSN, never
 * throws, and strips any `extra` key that looks like a prompt/credential
 * before the error is sent.
 */
export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    Sentry.captureException(error, { extra: scrubExtra(extra) });
  } catch {
    // Reporting must never be the thing that breaks the app.
  }
}
