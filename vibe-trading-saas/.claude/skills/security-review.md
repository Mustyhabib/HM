# Skill: security review for this project

Used by `/review` and `/ship`. This is the concrete "what to grep for /
what to open" companion to `docs/SECURITY_CHECKLIST.md` — that doc is the
launch-gate checklist; this is how to actually walk it against a diff.

## Fast triage — does this diff touch a sensitive surface at all?

```bash
git diff --name-only | grep -E \
  'route\.ts$|webhook|stripe|rls|migration|\.sql$|worker|agent_runs|subprocess'
```

If nothing matches, this is very likely a low-risk UI/copy change — say so
and move on rather than padding out a review with irrelevant checks.

## If it touches Supabase migrations / RLS

- Every `create table` needs `enable row level security` and at least a
  `select` policy in the *same* migration — a table created without RLS is
  open to every authenticated user (Postgres default) until someone
  remembers to fix it. Don't let that gap exist even briefly.
- A new `insert`/`update` policy on `subscriptions`, `webhook_events`,
  `usage_periods`, `usage_events`, or `audit_logs` for the `authenticated`
  role is very likely wrong — those are service-role-only by design
  (`docs/DATABASE_SCHEMA.md`). Treat one appearing in a diff as a finding,
  not an assumption that it's intentional.
- Cross-check against `.claude/skills/supabase-rls.md`'s baseline pattern.

## If it touches quota / run-creation code

- Is the check-and-consume still one atomic call (`start_agent_run` RPC,
  `.claude/skills/quota-enforcement.md`), or did this diff introduce a
  separate "check" step in application code before the "consume" step? The
  latter is a race condition even if it works in manual testing.
- Does a new failure path correctly call (or correctly *not* call)
  `refund_agent_run` per the system-caused vs. user-caused distinction?

## If it touches Stripe/webhooks

- Signature verification still present and still before any DB write?
- Still inserting into `webhook_events` and treating a unique-violation as
  a no-op, rather than a new dedupe mechanism invented locally?

## If it touches the worker or the `Tradi` subprocess call

- Does the `env` dict passed to `subprocess.run` stay an explicit allowlist
  (`.claude/skills/agent-worker.md`), or did this diff start inheriting
  `os.environ` wholesale? That's the specific pattern that would
  accidentally re-enable shell tools or leak a broker credential.
- Is `VIBE_TRADING_ENABLE_SHELL_TOOLS` still absent from that env?
- Is the wall-clock `timeout=` argument still present on the
  `subprocess.run` call?

## If it touches auth/session code

- Any path where a user ID is taken from a request body/query param
  instead of the authenticated session (`auth.uid()` / verified JWT)? That's
  an impersonation vector — user-supplied IDs are never trustworthy for
  "which user is this."

## Secrets sweep (any diff)

```bash
git diff | grep -inE 'sk_live|sk_test|service_role|SUPABASE_SERVICE|api[_-]?key\s*=\s*["'"'"']'
```

A match here is a stop-and-flag, not a "probably fine."

## Reporting

State findings as: file:line, what's wrong, and the concrete input/sequence
that triggers it (e.g. "two concurrent POSTs to /api/runs with 1 use left
both succeed because..."). Skip findings that are stylistic rather than
exploitable — that's a different pass.
