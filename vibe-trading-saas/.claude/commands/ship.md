Pre-ship pass for: $ARGUMENTS (or the current branch's pending changes if
unspecified).

This is the gate before merging/deploying anything real. Do not skip steps
because the change looks small — `CLAUDE.md` rule 10 covers irreversible
infra changes specifically because "small" changes are where those hide.

1. Run `/review` on the change first if it hasn't already happened this
   session.
2. If the change touches billing, quota, or RLS: walk the relevant section
   of `docs/SECURITY_CHECKLIST.md` explicitly, not from memory.
3. If the change touches Paystack: confirm test keys are still what's
   configured, unless this is the deliberate, explicitly-confirmed switch
   to live keys (`CLAUDE.md` rule 2, `docs/30_DAY_PLAN.md` Day 29).
4. Confirm no secret, token, or service-role key appears in the diff.
5. Update `docs/STATE.md` with what shipped, and append to the "Session
   log" table.
6. If this closes out a `docs/30_DAY_PLAN.md` day/week, mark it and note
   any drift from the planned schedule.

Only after all of the above: state clearly whether this is ready to
merge/deploy, or what's still blocking. Don't soften a "not ready" into a
"ready with caveats" — if `SECURITY_CHECKLIST.md` isn't fully walked for a
billing/RLS/webhook change, it's not ready.
