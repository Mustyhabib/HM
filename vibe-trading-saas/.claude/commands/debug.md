Debug: $ARGUMENTS

Before guessing, establish which layer the problem is actually in — this
project has several moving pieces and the fix location depends entirely on
which one is at fault:

1. **Frontend** (Next.js) — check the browser console/network tab first if
   the report is UI-shaped.
2. **Supabase** — check RLS policies (a silently empty result set is often a
   policy mismatch, not a query bug) and `get_logs`/`get_advisors` via the
   Supabase MCP tools before changing application code.
3. **Worker ↔ Tradi boundary** — if a run is stuck or failed, check:
   - Did the worker actually claim the row (`agent_runs.claimed_by`), or is
     it still sitting `queued`?
   - What did the `Tradi` subprocess print to stderr? (Captured logs, per
     `docs/ARCHITECTURE.md`.)
   - Is the isolated `HOME=/var/vibe-runs/<run_id>` directory what's
     expected — permissions, existence, leftover state from a prior run?
   - Did it hit the worker's wall-clock timeout, or one of `Tradi`'s own
     (`TIMEOUT_SECONDS` default 120s per LLM call,
     `VIBE_TRADING_TOOL_TIMEOUT_SECONDS` default 1800s per tool)?
4. **Paystack/webhooks** — check `webhook_events` for whether the event
   arrived and was marked `processed_at`, and Paystack's own dashboard
   event log, before assuming the handler is broken.

Reproduce with the narrowest possible case before proposing a fix. State the
root cause in one sentence before writing the fix — if you can't state it in
one sentence, you don't have it yet, keep investigating.

After fixing: check whether the bug reveals a gap in
`docs/SECURITY_CHECKLIST.md` or a missed case in `docs/DATABASE_SCHEMA.md`'s
constraints — if so, note it there, not just in the fix.
