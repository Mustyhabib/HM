Plan the implementation for: $ARGUMENTS

Before proposing anything:

1. Read `vibe-trading-saas/CLAUDE.md` (the operating charter), `docs/
   ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, and `docs/DECISIONS.md`.
   Don't propose a design that conflicts with an existing decision without
   flagging the conflict explicitly and asking before proceeding.
2. Check `docs/STATE.md` for what's already built vs. still planned, so the
   plan starts from actual current state, not the 30-day plan's assumption.

Then produce a plan that:

- States the simplest implementation that satisfies the requirement — per
  `CLAUDE.md`, this project is anti-overengineering by default. If the ask
  sounds like it needs more than the simplest thing, say so and recommend
  the simpler MVP alternative instead of silently building the bigger
  version.
- Names every file that will be touched or created, with real paths.
- Flags anything that touches a safety-critical surface (quota/billing
  transactions, RLS policies, webhook handling, the worker's subprocess
  invocation of `Tradi`) so it gets extra scrutiny before implementation.
- Is broken into small steps a `/build` pass can execute one at a time.
- Ends with the specific doc updates the change will need (`docs/STATE.md`
  at minimum; `docs/DECISIONS.md` if it's a real architectural choice;
  `docs/DATABASE_SCHEMA.md` if it touches tables).

Ask for approval before implementation starts, per `CLAUDE.md` → "WORKFLOW
RULES". Do not start writing code from this command — that's `/build`.
