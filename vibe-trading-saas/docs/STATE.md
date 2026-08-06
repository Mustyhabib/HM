# STATE

## Current sprint day

Day 4 of 30 — 2026-08-06 (billing provider set to Paystack + NGN; Stripe parked for later). Day 5 worker `TradiRunner` remains the next feature step.

## Completed

- GitHub access set up: SSH key generated and added to account, `gh` CLI
  authenticated as `Mustyhabib`, global git identity configured.
- `Mustyhabib/HM` repo created (private) — the umbrella repo for this project.
- `vibe-trading-saas/` scaffold created: `CLAUDE.md` (full operating charter —
  pricing, stack, safety rules, workflow rules), `docs/*` placeholders,
  `.claude/commands/*` and `.claude/skills/*` placeholders.
- Vibe-Trading engine forked to `Mustyhabib/vibe-trading-engine` (private),
  then fully merged into `HM` as `Tradi/` — single unified repo, engine's own
  git history dropped in favor of one tree. MIT `LICENSE`/`NOTICE` preserved.
- `Tradi/CLAUDE.md` written (engine-specific dev guide: setup, build/lint/test
  commands, architecture map, safety-critical surfaces). Kept untracked in git
  per the engine's own `.gitignore` convention (matches upstream policy).
- `docs/PROJECT_BRIEF.md` populated.
- Worker-invocation decision made and recorded in `docs/DECISIONS.md`:
  subprocess-per-run (`vibe-trading run -p ... --json --max-iter N`) with an
  isolated `HOME`/`VIBE_TRADING_HOME` per run, not in-process import, not
  container-per-run at MVP. Grounded in reading Tradi's actual config code
  (`agent/src/config/accessor.py`, `agent/src/config/paths.py`,
  `agent/src/memory/persistent.py`) — its `EnvConfig` is a process-global
  singleton and persistent memory resolves off `Path.home()`, so in-process
  multi-tenant execution isn't safe without engine changes we don't want to
  make.
- `docs/ARCHITECTURE.md` populated: system diagram, component responsibilities,
  run states, quota-enforcement rule, deferred persistent-memory feature,
  post-MVP hardening list, two open questions (worker host, per-tier limits).
- All remaining planning docs populated: `docs/DATABASE_SCHEMA.md` (9 tables,
  full columns/constraints/RLS notes), `docs/SECURITY_CHECKLIST.md`
  (pre-launch gate checklist), `docs/30_DAY_PLAN.md` (week-by-week MVP plan).
- All `.claude/commands/*.md` written (architect, build, review, debug, ship)
  and all `.claude/skills/*.md` written (supabase-rls, stripe-billing,
  quota-enforcement, agent-worker, security-review) — concrete, code-level
  guidance grounded in this project's actual schema/architecture decisions,
  not generic boilerplate.
- Audit pass: vendoring decision (Tradi fully tracked in-repo vs. sibling
  checkout at build time) recorded in `docs/DECISIONS.md` — the original
  `.gitignore` (commit `e943c08`) had excluded `/Vibe-Trading/` for a
  sibling-repo approach, but `f78487a` vendored it directly; the decision
  was made but never logged. Now recorded.
- Root `.gitignore` restored (was 0 bytes after the vendoring change
  dropped the old exclusion rule) — now covers `.env`, `node_modules`,
  `.next`, `__pycache__`, `.venv`, Supabase local dev, OS junk, editor
  temps.
- **Frontend foundation built** — adapted the existing `Tradi/frontend/`
  (React 19 + Vite + TypeScript + Tailwind 3 + react-router 8) instead of
  creating a separate Next.js app. Decision: reuse the existing SPA stack
  rather than introducing a second framework — it already has dark mode,
  i18n, design tokens, and a full component library.
  - New `PublicLayout` component (header + footer, no sidebar) for public
    pages — sits alongside the existing sidebar `Layout` for authenticated
    app pages.
  - 5 new pages added:
    - `Landing.tsx` — hero, how-it-works, features, CTA (root `/`)
    - `Pricing.tsx` — 3-tier plan cards ($20/3, $35/7, $50/15) with
      feature lists and FAQ
    - `Login.tsx` — email/password form, TODO wired to Supabase Auth
    - `Signup.tsx` — email/password/confirm form with client-side
      validation, TODO wired to Supabase Auth
    - `Dashboard.tsx` — stats cards, quick actions, recent runs placeholder
  - `router.tsx` updated: public routes (`/`, `/pricing`, `/login`,
    `/signup`) use `PublicLayout`; authenticated routes (`/dashboard`,
    `/agent`, `/reports`, etc.) use sidebar `Layout`. Existing engine
    pages all preserved and working.
  - `.env.example` added with placeholders for `VITE_API_URL`,
    `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
    `VITE_STRIPE_PUBLISHABLE_KEY` (all commented out).
  - `.claude/launch.json` added for dev server preview.
  - Verified: `tsc --noEmit` passes (zero errors), `vite build` succeeds,
    all 5 new pages render correctly in browser, existing engine pages
    (`/agent`, `/reports`, `/settings`, etc.) unbroken, zero console
    errors.
- **H~M brand redesign applied** — complete visual overhaul per
  `CLAUDE.md` → "BRAND & DESIGN SYSTEM":
  - `index.css`: new CSS variable system using H~M dark navy palette
    (#05060F base, #0B1020 card, #1E2A45 border, #3B82F6 primary blue,
    #8B5CF6 primary violet). Single dark theme everywhere — no light
    mode toggle. Added utility classes: `.gradient-text`, `.gradient-bg`,
    `.gradient-border`, `.glow-blue/violet/gradient`, `.grid-bg`,
    `.glow-pulse`.
  - `tailwind.config.ts`: updated to reference new hex-based CSS vars
    instead of HSL; added `secondary`, `elevated`, `ring` colors.
  - `BrandMark.tsx`: replaced candlestick SVG icon with "H~M" gradient
    text logo with glow. Added `BrandLogo` component.
  - `Layout.tsx`: completely redesigned sidebar — new nav items (Home,
    Agent, Signals, Usage, Settings, Wallet, Profile), H~M gradient
    logo with PRO badge, "Upgrade Plan" gradient button, collapse toggle.
    Stripped out i18n/session list/language switcher/SSE status (engine-
    specific, not needed in the SaaS shell).
  - `Dashboard.tsx`: rebuilt as "Strategy Studio" matching the reference
    screenshot — AI prompt box with glowing gradient border + pulse
    animation, AI Suggestions/Optimize/Validate/Explain action buttons,
    Strategy Performance metrics (Sharpe 1.82, Win Rate 64%, Net Profit
    +18.4%), SVG equity curve chart with gradient fill, bottom stats row
    (Total Trades/Profitable/Max Drawdown/Profit Factor), Pine Script v5
    code viewer panel on the right with syntax highlighting (keywords,
    strings, numbers, functions, comments) + line numbers + header with
    Save/Copy/Run Backtest buttons + footer status bar.
  - `PublicLayout.tsx`: updated branding to H~M gradient logo, gradient
    Sign Up button with glow.
  - `Landing.tsx`: H~M branding, `.grid-bg` hero background, gradient
    buttons with glow, violet→blue gradient text on "Research Agent".
  - `Login.tsx` / `Signup.tsx`: H~M gradient logo, dark card-colored
    inputs, gradient submit button with glow.
  - `Pricing.tsx`: Pro card uses `.gradient-border` with glow, "Most
    Popular" gradient badge, JetBrains Mono for prices.
  - All pages verified in browser — zero console errors, `tsc --noEmit`
    clean, `vite build` passes.
- **Settings, Signals, and Profile pages built** — three new SaaS pages
  replacing/extending the sidebar navigation:
  - `SaasSettings.tsx` — 5-tab settings page (Account, Billing,
    Notifications, Security, API Keys). Account: profile fields, dark
    mode preference, danger zone (delete account). Billing: current
    plan card with usage progress bar, payment method, billing history
    table. Notifications: email + push toggles per category. Security:
    password change, 2FA setup, session management. API Keys: live/test
    key display with show/hide, copy, regenerate; webhooks section; API
    docs link. Replaces the engine's LLM-config Settings page at
    `/settings` (engine settings still available at `/settings/engine`).
  - `Signals.tsx` — trading signals dashboard with 4 summary stat cards
    (Active, Triggered, Win Rate, Total P&L), search by symbol,
    status/direction filters, 8 mock signal cards each showing symbol,
    direction badge (long/short), strategy name, status badge
    (active/triggered/expired/cancelled), entry/target/stop price
    levels, R:R ratio, confidence percentage, P&L for closed signals,
    date. Disclaimer footer.
  - `Profile.tsx` — user profile with gradient avatar (initials),
    name, email, Pro plan badge, member-since date, copyable user ID.
    Stats grid (Total Runs, Signals Generated, Win Rate, Days Active).
    Current plan card with usage bar + upgrade/view-usage links.
    Achievements section (5 badges, 3 earned, 2 in progress with
    progress counters). Recent activity feed (6 items: runs, signals,
    billing, account events) with typed icons and timestamps.
  - `router.tsx` updated: `/settings` → SaasSettings, `/signals` →
    Signals, `/profile` → Profile. Engine Settings preserved at
    `/settings/engine`. All sidebar nav links now resolve to real pages.
  - Verified: `tsc --noEmit` zero errors, zero console errors, all
    three pages render correctly in browser.

- **Supabase database created and migrated** — project
  `wqjdumforbalfmtawwpg` (eu-central-1, Postgres 17), org "HM
  Infrastructure". Two migrations applied:
  - `create_initial_schema` — 9 tables per `DATABASE_SCHEMA.md`:
    `profiles` (1:1 auth.users, auto-created via trigger),
    `plans` (static tiers), `subscriptions` (mirrors Stripe),
    `usage_periods` (transactional quota counter),
    `usage_events` (immutable audit trail, trigger-enforced),
    `agent_runs` (worker queue), `agent_artifacts` (storage refs),
    `webhook_events` (Stripe idempotency), `audit_logs` (append-only,
    trigger-enforced). Indexes on all query-hot columns. `updated_at`
    trigger on subscriptions.
  - `add_rls_policies_and_seed_plans` — RLS enabled on all 9 tables.
    User-facing tables: SELECT where `user_id = auth.uid()`.
    `agent_runs` also allows INSERT for owning user.
    `webhook_events` and `audit_logs`: no client policies (service role
    only). Plans seeded: starter $20/3, pro $35/7, premium $50/15.
    Two SECURITY DEFINER functions: `start_agent_run()` (atomic quota
    check + consume + create run, FOR UPDATE row lock) and
    `refund_agent_run()` (atomic decrement + event log).
- **Supabase Auth wired into frontend**:
  - `@supabase/supabase-js` installed.
  - `src/lib/supabase.ts` — Supabase client from env vars.
  - `src/lib/auth-store.ts` — Zustand auth store with `signUp`,
    `signIn`, `signOut`, session listener, loading/initialized state.
  - `src/components/auth/AuthGuard.tsx` — `AuthGuard` (redirects to
    `/login` if not authenticated) and `GuestGuard` (redirects to
    `/dashboard` if already logged in). Both show loading spinner
    while auth initializes.
  - `router.tsx` updated: public routes (landing, pricing) open;
    auth routes (login, signup) wrapped in `GuestGuard`; app routes
    (dashboard, agent, settings, etc.) wrapped in `AuthGuard`.
  - `Login.tsx` — now calls `signIn()` from auth store, redirects
    to dashboard (or previous page) on success.
  - `Signup.tsx` — now calls `signUp()` from auth store, shows
    "check your email" success message.
  - `Profile.tsx` — uses real auth email, working Log Out button
    via `signOut()`.
  - `.env` created with real Supabase URL + anon key.
  - `.env.example` updated (Supabase vars now uncommented).
  - `tsconfig.json` — added `vite/client` to types for
    `import.meta.env` support.
  - Verified: `tsc --noEmit` zero errors, `/dashboard` redirects
    to `/login`, signup form renders, landing page clean.
- **Worker skeleton built** (`vibe-trading-saas/worker/`) — Python
  package `hm_worker`, installed with `pip install -e ".[dev]"`,
  entry point `hm-worker`. Day 3 was absorbed (its Next.js/Auth scope
  was already delivered on Day 2), so this is Day 4 of the plan.
  - `src/hm_worker/config.py` — frozen `Config` dataclass loaded once
    from env, failing loudly on anything missing. Custom `__repr__`
    redacts `service_role_key` so the key can't leak into a log line.
    `WORKER_STALE_AFTER_SECONDS` defaults to
    `WORKER_RUN_TIMEOUT_SECONDS + 300`.
  - `src/hm_worker/db.py` — `RunQueue` wrapping the four lifecycle
    RPCs: `claim` / `heartbeat` / `complete` / `fail`.
  - `src/hm_worker/runner.py` — `Runner` protocol plus `StubRunner`
    (sleeps, heartbeats, succeeds). Error taxonomy that drives the
    refund decision: `UserInputError` (no refund), `SystemError_`
    (refund), `RunTimeout` (refund, status `timeout`), `ClaimLost`
    (row left untouched).
  - `src/hm_worker/main.py` — polling loop, SIGINT/SIGTERM handlers
    that drain the current run before exiting, and per-iteration error
    backoff so a transient API fault can't kill the loop. `build_runner`
    deliberately raises if `WORKER_EXECUTE_TRADI` is set — that's the
    Day 5 slot for the real subprocess runner.
  - Second migration applied: `add_worker_run_lifecycle_functions` —
    `claim_agent_run`, `heartbeat_agent_run`, `complete_agent_run`,
    `fail_agent_run`. All `SECURITY DEFINER`, granted to `service_role`
    only. Claiming uses `SELECT ... FOR UPDATE SKIP LOCKED` inside the
    function because PostgREST can't express it; that's what makes
    multiple worker instances safe to run in parallel.
  - Crash recovery: a claim whose heartbeat goes stale is reclaimed by
    the next worker to poll. Every close is guarded by
    `claimed_by = <this worker>`, so a worker that lost its claim can't
    overwrite the result of the one that took over.
  - `worker/README.md` — setup, run, test, queue state diagram, refund
    table, deployment notes.
  - Verified: 16 tests passing (`pytest`) — 6 on config (missing vars,
    non-integer values, key redaction, stale-window default, worker-id
    generation) and 10 on the loop (complete path, all four refund
    outcomes, lost claim, signal drain, claim-failure backoff, stub
    abort paths). Stale reclaim itself lives in SQL and is not yet
    covered by a test.

## Blocked

- Nothing currently blocking.

## Next action

Day 4 complete (Day 3 absorbed into Day 2). Per `docs/30_DAY_PLAN.md`:

- **Next up: Day 5** — replace `StubRunner` with a real `TradiRunner`:
  subprocess-per-run (`vibe-trading run -p ... --json --max-iter N`)
  with an isolated `HOME`/`VIBE_TRADING_HOME` per run, per the
  worker-invocation decision in `docs/DECISIONS.md`. Then wire it in at
  `build_runner()` in `src/hm_worker/main.py`, which currently raises
  when `WORKER_EXECUTE_TRADI` is set.
- Then: one real end-to-end run — insert a queued `agent_runs` row by
  hand, start the worker, watch it claim → run → complete.

Not yet done on the worker:
- **`worker/.env` does not exist yet**, so the worker has never actually
  connected to Supabase — everything so far is unit tests against mocks.
  Copy `.env.example` to `.env` and fill in `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API →
  service_role) before the Day 5 end-to-end run.
- No test covers stale-claim reclaim (the logic is in SQL).
- Nothing yet writes to `agent_artifacts` — `StubRunner` returns output
  but the worker only logs it.
- Timeout enforcement is configured (`WORKER_RUN_TIMEOUT_SECONDS`) but
  only the stub honours it; real enforcement arrives with `TradiRunner`.

Still-open decisions (`docs/ARCHITECTURE.md` → "Open questions"):
- Worker host choice (Railway/Fly.io/Hetzner)
- Per-tier timeout/`--max-iter` defaults

Architecture note: "reuse Tradi frontend" decision has held through Day 4.
Should be formally recorded in `docs/DECISIONS.md`.

## Session log

| Date | Sprint day | Summary |
|---|---|---|
| 2026-08-05 | 1 | GitHub/SSH setup, HM repo created, Tradi engine merged in, saas scaffold + docs kickoff |
| 2026-08-05 | 1 | ARCHITECTURE.md + worker-invocation decision (subprocess-per-run, isolated HOME) |
| 2026-08-05 | 1 | Finished all planning docs: DATABASE_SCHEMA, SECURITY_CHECKLIST, 30_DAY_PLAN, all commands + skills |
| 2026-08-05 | 1 | Audit: recorded vendoring decision in DECISIONS.md, restored root .gitignore (was 0 bytes) |
| 2026-08-05 | 1 | Frontend foundation: Landing, Pricing, Login, Signup, Dashboard pages + PublicLayout + .env.example. Build + type-check pass, all pages verified in browser |
| 2026-08-05 | 1 | H~M brand redesign: dark navy palette, gradient logo, Strategy Studio dashboard with Pine Script panel, equity curve, metrics cards. All pages verified in browser |
| 2026-08-05 | 1 | Settings, Signals, Profile pages: 5-tab SaaS settings (account/billing/notifications/security/API), signal cards with filters, profile with stats + achievements + activity feed. All verified in browser |
| 2026-08-05 | 2 | Supabase: 9 tables + RLS + seed plans + quota functions. Auth: Zustand store, AuthGuard/GuestGuard, Login/Signup wired to real Supabase Auth, route protection. tsc clean |
| 2026-08-05 | 4 | Worker skeleton: `hm_worker` package (config/db/runner/main), run-lifecycle migration (claim/heartbeat/complete/fail, SKIP LOCKED), heartbeat + stale reclaim, refund taxonomy, graceful shutdown. 16 tests passing |
| 2026-08-05 | 4 | Signup/login fixed & verified live. Root cause was Supabase email rate limit; disabled email confirmation (3 auth toggles: allow-signups ON, email-provider ON, confirm-email OFF). Code: signup confirmation-off branch + synchronous session set so post-auth redirect doesn't race AuthGuard. Both flows land on /dashboard. Billing pivot Stripe→Flutterwave recorded (D8) |
| 2026-08-06 | 4 | Billing set to **Paystack + NGN** (Stripe parked). Established the operator is a Nigerian entity with no US/UK company, so Stripe can't onboard; customers are Nigerian crypto/forex/indices traders. Recovered the stashed NGN work and swapped Flutterwave→Paystack across frontend (₦70k/₦120k/₦200k), CLAUDE.md, docs, commands, skills, wiki; authored `paystack-billing.md`, kept `stripe-billing.md` parked. No DB migration needed — live schema already has neutral columns + `plans.price_ngn`. Neutral billing columns kept (Stripe-compatible). D8 updated; DECISIONS.md records the Paystack decision + compliance framing (present as education SaaS). |
