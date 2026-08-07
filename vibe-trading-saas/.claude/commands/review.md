Review the pending changes (or, if given, the specific area: $ARGUMENTS).

This is a correctness/safety review for this specific project, not a style
pass — run `/simplify` separately for cleanups. Walk the diff against:

**Multi-tenancy** (`CLAUDE.md` → "SECURITY PRINCIPLES")
- Does every new/changed query on a user-owned table scope by `user_id` /
  `auth.uid()`? Could one user's request read or affect another user's row?
- Does any new table lack an RLS policy?

**Quota & billing** (`CLAUDE.md` rules 7 & 9, `docs/DATABASE_SCHEMA.md`)
- Is quota checked and consumed in the same transaction as the thing it
  gates, or is there a race window between check and use?
- Is `usage_events` actually append-only in this change (no update/delete
  path introduced)?
- Is Paystack webhook handling idempotent against a replayed event ID?

**Agent execution safety** (`docs/ARCHITECTURE.md`, `docs/
SECURITY_CHECKLIST.md`)
- Does the worker's `Tradi` subprocess invocation still avoid
  `VIBE_TRADING_ENABLE_SHELL_TOOLS`, broker/OAuth env vars, and use an
  isolated `HOME` per run?
- Is there still an enforced wall-clock timeout on the subprocess?

**Secrets** (`CLAUDE.md` rule 1)
- Any key, token, or service-role credential in code, logs, error messages,
  or a doc file?

**Scope** (`CLAUDE.md` → "NON-GOALS FOR MVP")
- Does this change quietly introduce something on the non-goals list (live
  trading, team accounts, a public API, etc.)? Flag it even if it's small.

Report findings the way `/code-review` normally would — concrete file:line,
what's wrong, what input/sequence triggers it. Don't restate things that are
fine; only report actual findings.
