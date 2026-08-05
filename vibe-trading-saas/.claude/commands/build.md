Implement: $ARGUMENTS

Follow `CLAUDE.md` → "WORKFLOW RULES": restate the task briefly, implement
in small steps, prefer working code over explanation, don't omit code for
brevity, include file paths and the commands to run.

Ground rules specific to this repo:

- `Tradi/` is a vendored dependency, not this project's code — call into it
  (per `docs/ARCHITECTURE.md`'s subprocess pattern), don't modify it. If a
  change seems to require patching `Tradi/`, stop and flag that explicitly
  rather than editing it inline.
- Any table touched must already exist in `docs/DATABASE_SCHEMA.md` — if it
  doesn't, that's an `/architect` step first, not something to improvise
  here.
- New user-owned tables/columns need an RLS policy in the same change, not
  as a follow-up (`CLAUDE.md` → "SECURITY PRINCIPLES").
- Quota-affecting code paths (run creation, refunds) must stay inside the
  transactional check-and-consume pattern in `docs/DATABASE_SCHEMA.md` —
  never a separate read-then-write.
- Billing/webhook code must stay idempotent — check `webhook_events`
  before processing, not after.
- Don't add live-trading, broker, or shell-tool env vars to the worker's
  `Tradi` subprocess invocation under any circumstance without explicit
  confirmation first (`CLAUDE.md` safety rules 4 and the worker section of
  `ARCHITECTURE.md`).

When the implementation is done:

- Update `docs/STATE.md` — what was completed, what's next (`CLAUDE.md`:
  "Update docs/STATE.md when a milestone is completed").
- If a real architectural or trade-off decision was made along the way that
  isn't already in `docs/DECISIONS.md`, append it there in the file's
  existing format.
