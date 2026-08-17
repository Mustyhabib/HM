Session prompt templates
Copy and fill in the blanks at the start of every Claude Code session.

Standard session start (use this every time)
Read CLAUDE.md. Continue from the current phase tracker.
Today's task: [paste the Phase N prompt from BUILD_PLAN.md here].

Debugging session
Read CLAUDE.md.
Bug: [describe what's wrong]
Error: [paste error / stack trace]
File(s) involved: [list them]
Do NOT change any other files. Fix only what's broken.
After fix, run the relevant test and show me the output.

Adding a feature mid-build
Read CLAUDE.md.
Add: [feature name]
Fits in: [which service / route]
Rules from CLAUDE.md that apply: [quote the relevant ones, e.g. "row isolation, quota check"]
Do not touch any other files.
When done, write a test for it and add a one-line note to CLAUDE.md session notes.

Code review session
Read CLAUDE.md.
Review [filename] against the security rules and API conventions in CLAUDE.md.
List any violations, ranked by severity.
Do not change the file yet — just report.

Refactor session
Read CLAUDE.md.
Refactor [filename or function name] to [goal — e.g. "reduce duplication",
"add proper error handling", "make async"].
Do not change behavior — all existing tests must still pass.
After refactor, run: pytest tests/[relevant_test_file].py -v

Vibe-Trading integration session
Read CLAUDE.md.
Wrap the Vibe-Trading [StrategyAgent / BacktestRunner / LiveAgent] for
[specific use case]. Follow the integration patterns in CLAUDE.md.
Key constraints:
- LLM provider is DeepSeek via BYOK — decrypt the user's llm_keys row in the
  worker and pass it as api_key; NEVER use a platform-wide LLM key; if the user
  has no llm_key, return 400 "add your DeepSeek API key first"
- BacktestRunner is synchronous — run in Celery worker, not in request thread
- LiveAgent blocks until revoked — Celery task with SIGTERM handling
- Always check quota BEFORE calling Vibe-Trading
- Never pass raw exchange API keys — always decrypt from encrypted_keys first

Migration session (after model change)
Read CLAUDE.md.
I changed [model name]: [describe change — added column / changed type / etc].
Generate an Alembic migration: alembic revision --autogenerate -m "[description]"
Show me the migration SQL and confirm it's correct before applying.
Then run: alembic upgrade head

Frontend session
Read CLAUDE.md.
Build [page name] in the Vite + React app (src/pages, react-router).
API endpoints it calls: [list them with method + path]
Uses these components: [list shadcn-style/Radix components]
Auth: [yes — inject Supabase access token via src/lib/api.ts / no — public]
Data fetching: SWR with key "[endpoint path]" (or Zustand for client state)
Do not build any other pages. Focus only on this one.

Billing / webhook session
Read CLAUDE.md.
Implement/adjust billing for provider: [stripe | paystack].
Rules from CLAUDE.md that apply: verify webhook signature before parsing; store
nothing until webhook confirms; upsert subscriptions with the correct provider;
write audit_log on subscription lifecycle events.
Do not touch any other files. Add/adjust the relevant webhook test.

Supabase auth session
Read CLAUDE.md.
Implement/adjust Supabase Auth for: [sign up | sign in | session sync | guard].
Rules from CLAUDE.md that apply: verify Supabase JWT; map supabase_id → users
row; 403 when is_suspended; never store passwords locally.
Do not touch any other files. Add/adjust the relevant auth test.    
