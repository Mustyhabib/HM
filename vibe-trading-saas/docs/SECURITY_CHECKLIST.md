# Security Checklist

Pre-launch checklist. Derived from `CLAUDE.md` → "IMPORTANT SAFETY RULES" /
"SECURITY PRINCIPLES" / "AGENT EXECUTION PRINCIPLES", plus Tradi's own
`AGENT_CONTRIBUTOR_GUIDE.md` and `SECURITY.md`. Check off before taking
payments from real users, not before — this is a launch gate, not a
someday-list.

## Secrets & credentials

- [ ] No API keys, tokens, or service-role keys anywhere in the repo, commit
      history, logs, or docs (`CLAUDE.md` rule 1).
- [ ] Supabase **service-role key** used only in server-side code
      (Next.js API routes, worker) — never shipped to the client bundle
      (`CLAUDE.md` → "SECURITY PRINCIPLES": "Do not expose service-role keys
      to the frontend").
- [ ] Stripe **secret key** and **webhook signing secret** server-side only;
      only the **publishable key** reaches the browser.
- [ ] Development uses Stripe test-mode keys; switching to live keys is an
      explicit, confirmed action, not a side effect of deploying
      (`CLAUDE.md` rule 2).
- [ ] `.env` files are gitignored everywhere (root, `vibe-trading-saas/`,
      and `Tradi/agent/.env` if ever populated locally for testing).

## Multi-tenant isolation

- [ ] Every user-owned table has `user_id` and an RLS policy scoping reads/
      writes to `auth.uid()` (`CLAUDE.md` → "Every user-owned table should
      include user_id" / "Every query should be user-scoped").
- [ ] Manually verify RLS with two real test accounts: user A cannot read,
      list, or guess a URL to user B's `agent_runs`, `agent_artifacts`, or
      `subscriptions` rows (`CLAUDE.md` rule 8: "Never allow one user to
      access another user's data").
- [ ] `agent_artifacts` served via **signed URLs**, not a public Storage
      bucket (`ARCHITECTURE.md`).
- [ ] Worker runs each use with an isolated `HOME`/`VIBE_TRADING_HOME` per
      run (`docs/DECISIONS.md` 2026-08-05) — confirm no shared temp
      directory or leftover state from a prior run is reused before
      deletion is verified working, not just coded.

## Quota & billing correctness

- [ ] Run creation checks and consumes quota **inside the same transaction**
      as the `agent_runs` insert (`CLAUDE.md` rule 7: never trust
      client-side quota checks alone). Verify by firing two concurrent
      "Start run" requests against an account with exactly 1 use left —
      exactly one should succeed.
- [ ] `usage_events` rows are genuinely immutable — `UPDATE`/`DELETE`
      revoked at the DB grant level, not just left undone in the API
      (`CLAUDE.md`: "Usage events must be immutable").
- [ ] Stripe webhook handler is idempotent against replay: same event ID
      processed twice has no double effect (`CLAUDE.md` rule 9,
      `webhook_events` table in `DATABASE_SCHEMA.md`).
- [ ] Stripe webhook signature verified before any processing (reject
      unsigned/invalid-signature requests).
- [ ] `agent_runs.idempotency_key` actually enforced (`UNIQUE` constraint,
      not just documented) so a retried "Run" click can't double-charge a
      use.

## Agent execution safety (Tradi-specific)

- [ ] `VIBE_TRADING_ENABLE_SHELL_TOOLS` never set by the worker (defaults
      `False` — leave it that way; shell-capable tools have no place in a
      hosted multi-tenant context).
- [ ] No broker/live-trading/OAuth env vars ever configured by the worker —
      Tradi's mandate gate stays closed by simply never handing it
      credentials to gate (`CLAUDE.md`: "Never enable live trading without
      explicit approval").
- [ ] Worker enforces its own wall-clock timeout per run — Tradi has no
      built-in overall-run timeout (`ARCHITECTURE.md`); confirm a hung run
      actually gets killed, not just that a timeout value is configured.
- [ ] `VIBE_TRADING_ALLOWED_RUN_ROOTS` scoped to the run's own isolated
      directory, not a shared or overly broad path.
- [ ] Generated backtest code executes in the narrowed subprocess Tradi
      itself provides (per `Tradi/SECURITY.md` — doesn't forward LLM
      provider keys, bearer tokens, or broker secrets to it); don't
      accidentally widen that by exporting extra env vars into the
      subprocess environment.

## Input validation & abuse prevention

- [ ] All user input (run prompts, settings, uploaded files) validated
      server-side, not just in the frontend (`CLAUDE.md` → "SECURITY
      PRINCIPLES": "Validate all user input").
- [ ] Rate limiting on agent-run creation beyond the monthly quota — a
      short per-user cooldown between run starts (`ARCHITECTURE.md` →
      "Future hardening"; decide if this ships at MVP or is genuinely
      deferred).
- [ ] File upload size/type limits enforced if the "analyze a broker
      export" style feature ships at MVP.

## Infra & deployment

- [ ] `API_AUTH_KEY`-equivalent protection on anything the worker or an
      internal API route exposes beyond loopback, mirroring Tradi's own
      rule ("API or Web deployments beyond loopback must use
      `API_AUTH_KEY`" — `AGENT_CONTRIBUTOR_GUIDE.md`).
- [ ] No irreversible infra change (prod DB migration, deleting a bucket,
      rotating a live key) made without a deliberate, confirmed step
      (`CLAUDE.md` rule 10).
- [ ] Sentry (or equivalent) configured and actually receiving events
      before launch, not just installed (`CLAUDE.md` → "MVP FEATURES":
      "Basic monitoring/error tracking").
- [ ] Basic uptime monitoring on the frontend and worker.

## Legal / disclosure

- [ ] Legal pages present (ToS, Privacy) — MVP feature, and specifically
      needs to disclose "analysis/research only, not investment advice,
      not live trading" given `Tradi`'s own disclaimer posture.
- [ ] `Tradi/LICENSE` and `Tradi/NOTICE` still present and unmodified after
      the merge into this repo (MIT obligation — verify this stays true
      after any future refactor of the `Tradi/` tree).

## Sign-off

This checklist should be re-walked before **any** of: first real payment
processed, first production deploy reachable outside localhost, or a change
to RLS policies / webhook handling / quota logic. Record the date and who
walked it in `docs/DECISIONS.md`.
