Session prompt templates
Copy and fill in the blanks at the start of every Claude Code session.
Aligned to CLAUDE.md (source of truth) — Supabase backend, Paystack + Stripe billing,
BYOK, polling worker. Constitution: SOUL/PROJECT/DATA/ARCHITECTURE/WORKFLOW.md.
Upgrade path: UPGRADE_ROADMAP.md (10 phases).

Standard session start (use this every time)
Read CLAUDE.md. Continue from the sprint tracker.
Today's task: [describe the work — reference a Phase in UPGRADE_ROADMAP.md if applicable].

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
Fits in: [frontend component / Edge Function / worker module / SQL migration]
Rules from CLAUDE.md that apply: [quote them, e.g. "RLS row isolation, service_role-only key
decrypt, webhook idempotency, no live trading"]
Do not touch any other files.
When done, write a test for it (worker: pytest; frontend: vitest) and update the CLAUDE.md
sprint tracker.

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
After refactor, run: cd vibe-trading-saas/worker && pytest -q (or the frontend vitest file).

Vibe-Trading engine integration session
Read CLAUDE.md.
Wrap the Vibe-Trading engine for [specific use case]. Follow the worker patterns in CLAUDE.md.
Key constraints:
- LLM provider is DeepSeek via BYOK — the worker decrypts the user's key via
  worker_get_user_api_key(user_id, 'deepseek') and passes it to the subprocess; NEVER use a
  platform-wide key; if the user has no key, start_agent_run already returned no_api_key.
- Engine runs as a subprocess-per-run: `vibe-trading run -p "<prompt>" --json --no-rich --max-iter N`
  with isolated HOME / VIBE_TRADING_HOME per run (never in-process — process-global singletons).
- No Celery/Redis — the worker is a polling loop (FOR UPDATE SKIP LOCKED).
- No live trading at MVP — do not wire broker/live-order paths.

Schema / migration session
Read CLAUDE.md.
I changed [table name]: [describe change — added column / new table / new RPC].
Write the SQL migration under vibe-trading-saas/db/migrations/ with a dated filename
(YYYY_MM_DD_<name>.sql) and show it for confirmation before applying to Supabase.
Then update the DB schema section of CLAUDE.md.

Frontend session
Read CLAUDE.md.
Build [page name] in the React 19 + Vite app (Tradi/frontend/src/pages, react-router 8).
Supabase calls it makes: [list supabase.from / supabase.rpc / supabase.storage calls]
Uses these libs: [lib/runs.ts, lib/billing.ts, lib/apikeys.ts, lib/swarm.ts, ...]
Auth: [yes — inside AuthGuard / no — public]
Data fetching: direct Supabase client + Realtime postgres_changes (NO SWR/React Query).
Design system: Aurora Fire tokens (index.css CSS vars), Inter + JetBrains Mono. Do not
introduce new colors/fonts.
Do not build any other pages. Focus only on this one.

Billing / webhook session (Paystack)
Read CLAUDE.md.
Implement/adjust Paystack billing in: [paystack-init | paystack-webhook Edge Function | lib/billing.ts].
Rules from CLAUDE.md that apply: verify x-paystack-signature HMAC-SHA512 (constant-time) before
parsing; re-verify with Paystack API before activating; store nothing until the webhook confirms;
webhook_events.provider_event_id UNIQUE (duplicates → 200); upsert via upsert_subscription RPC
(service_role only).
Do not touch any other files. Add/adjust the relevant test.

Billing / webhook session (Stripe — planned)
Read CLAUDE.md + UPGRADE_ROADMAP.md.
Implement/adjust Stripe billing in: [stripe-init | stripe-webhook Edge Function | lib/billing.ts].
Rules from CLAUDE.md that apply: verify Stripe-Signature before parsing; re-verify with the Stripe
API before activating; namespace webhook_events.provider_event_id per provider; upsert via
upsert_subscription RPC with provider='stripe' (service_role only); never trust raw event payloads.
Do not touch any other files. Add/adjust the relevant test.

Supabase auth session
Read CLAUDE.md.
Implement/adjust Supabase Auth for: [sign up | sign in | session sync | guard].
Rules from CLAUDE.md that apply: verify Supabase JWT; map auth.uid() → profiles row; session
set synchronously in the Zustand store; never store passwords locally.
Do not touch any other files. Add/adjust the relevant test.
