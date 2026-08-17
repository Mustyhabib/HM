Build Plan — Vibe-Trading SaaS
Copy-paste prompts for each Claude Code session. One phase per session.
After every session: update "Current phase tracker" in CLAUDE.md.

PHASE 0 — Project scaffold
Prompt:
Read CLAUDE.md. Create the full project scaffold for the Vibe-Trading SaaS:
 1. docker-compose.yml with services: postgres (16-alpine), redis (7-alpine),
    backend (FastAPI), worker (Celery), frontend (Vite+React). Use health checks.
    Mount volumes for postgres data and code hot-reload.
 2. backend/ — FastAPI app skeleton:
    - pyproject.toml with deps: fastapi, uvicorn, sqlalchemy[asyncio], asyncpg,
      alembic, celery[redis], redis, stripe, requests (paystack), boto3,
      cryptography, pydantic-settings, supabase, vibe-trading-ai, pytest,
      pytest-asyncio, fastapi-limiter
    - app/main.py: FastAPI() with CORS, /health route, routers placeholder
    - app/core/config.py: Settings from env vars (all vars in CLAUDE.md)
    - .env.example with every var from CLAUDE.md (Stripe + Paystack + Supabase)
 3. frontend/ — Vite + React:
    - npm create vite@latest frontend -- --template react-ts
    - Install: tailwindcss, react-router-dom, zustand, @supabase/supabase-js,
      @stripe/stripe-js, swr, axios
    - src/main.tsx + src/router/index.tsx (createBrowserRouter) with route
      placeholders and a Providers/auth-guard wrapper
    - src/lib/api.ts: typed fetch wrapper that injects the Supabase access token
    - src/lib/auth.ts: supabase client singleton (createClient)
 4. Makefile with: dev, migrate, test, lint targets
 When done, update CLAUDE.md phase tracker: Phase 0 complete, next = Phase 1.
Verify: `docker-compose up` starts all services. `/health` returns 200.

PHASE 1 — Database models + migrations
Prompt:
Read CLAUDE.md. Implement all database models and initial migration.
 1. app/core/database.py: AsyncEngine + AsyncSessionLocal + get_db dependency.
    Base = declarative_base() with UUID default and created_at auto-timestamp.
 2. app/models/ — one file per model, import all in __init__.py. Create every
    model from the "DB models" section of CLAUDE.md exactly (note: users has
    supabase_id, NO hashed_password; subscriptions has provider +
    stripe_subscription_id + paystack_subscription_code; include llm_keys).
    Use mapped_column(UUID, default=uuid4) for all PKs.
    Add __table_args__ = (Index("ix_user_id", "user_id"),) on every table with
    a user_id FK.
 3. alembic init migrations/ — configure to use the async engine from config.
    Generate initial migration: alembic revision --autogenerate -m "initial".
    Verify migration SQL looks correct before applying.
 4. app/core/dependencies.py:
    get_db, get_current_user (verify Supabase JWT → look up users by supabase_id,
      auto-provision row on first login → return or 401; 403 if is_suspended),
    require_admin (get_current_user + role == "admin" check).
 5. Seed script: scripts/seed_plans.py — insert the 3 plans from CLAUDE.md
    (free: run_limit=1, backtest_daily_limit=1, bot_limit=0).
 When done, update CLAUDE.md phase tracker: Phase 1 complete, next = Phase 2.
Verify: `alembic upgrade head` creates all tables. seed_plans inserts 3 plans.

PHASE 2 — Auth (Supabase Auth)
Prompt:
Read CLAUDE.md. Wire Supabase Auth end-to-end. Do NOT build custom bcrypt/SMTP
auth — Supabase owns credentials and email confirmation.
 app/services/auth_svc.py:
 - get_or_create_user(supabase_user) → find users row by supabase_id, else create
   (email, name, supabase_id). Return local user.
 - verify_supabase_token(access_token) → validate against SUPABASE_JWT_SECRET /
   Supabase, return supabase user payload or raise 401.
 - sync_session(user) → ensure stripe_customer_id / paystack_customer_code exist
   lazily (create on first checkout, not at signup).
 app/api/v1/auth.py — routes (frontend holds Supabase session; these assist sync):
 POST /auth/callback      → exchange/confirm Supabase session, upsert users row,
                            return local user profile {role, plan}
 GET  /auth/me            → return current local user (uses get_current_user)
 POST /auth/logout        → (frontend clears Supabase session) optional server hook
 app/core/security.py:
 - decode/verify Supabase JWT helpers; AES-256-GCM encrypt/decrypt helpers reused
   by exchange + llm keys.
 Frontend: src/lib/auth.ts supabase.auth.signUp / signInWithPassword /
   signOut / onAuthStateChange; store session in Zustand; guard routes.
 Tests in tests/test_auth.py:
 - Supabase sign_up → callback upserts users row (happy path)
 - valid Supabase JWT → get_current_user returns user
 - tampered/expired JWT → 401
 - suspended user → 403 on protected route
 When done, update CLAUDE.md phase tracker: Phase 2 complete, next = Phase 3.
Verify: All 4 tests pass. Frontend can sign up/in and hit a protected route.

PHASE 3 — User service + quota enforcement + BYOK keys
Prompt:
Read CLAUDE.md. Build user profile, quota middleware, and key vaults.
 app/services/user_svc.py:
 - get_me / update_me (name, timezone; no email change)
 - get_usage(user_id) → usage_records for current month (create if missing)
 - check_quota(user_id, action: Literal["run","backtest","bot"]) → raise HTTP 429
   with {"error":"plan limit reached","limit":N,"used":N} if exceeded. -1 =
   unlimited. Increment atomically (SELECT FOR UPDATE).
 - get_active_plan(user_id) → join subscriptions + plans, fallback to free plan
 app/api/v1/users.py:
 GET  /users/me | PATCH /users/me | GET /users/me/usage | GET /users/me/plan
 app/api/v1/keys.py (EXCHANGE API keys):
 POST   /users/me/exchange-keys → AES-256-GCM encrypt (key=ENCRYPTION_KEY),
                                   store ciphertext+iv in encrypted_keys
 GET    /users/me/exchange-keys → [{id, exchange, created_at}] — NEVER ciphertext
 DELETE /users/me/exchange-keys/:id
 app/api/v1/llmkeys.py (BYOK DeepSeek keys):
 POST   /users/me/llm-keys  → encrypt, store in llm_keys (provider='deepseek')
 GET    /users/me/llm-keys  → [{id, provider, created_at}] — NEVER plaintext
 DELETE /users/me/llm-keys/:id
 Tests: quota at limit → 429 (free run_limit=1 → second run in month blocks);
        unlimited (-1) never blocks; exchange + llm keys stored encrypted
        (assert ciphertext != plaintext); GET never returns keys.
 When done, update CLAUDE.md phase tracker: Phase 3 complete, next = Phase 4.
Verify: check_quota blocks at plan limit. Key endpoints never return key material.

PHASE 4 — Billing (Stripe + Paystack, dual provider)
Prompt:
Read CLAUDE.md. Build billing for BOTH providers behind one service interface.
 app/services/billing_svc.py:
 - get_plans() → all plans from DB
 - create_subscription(user_id, plan_id, provider: Literal["stripe","paystack"])
     stripe  → Stripe Checkout Session, return {checkout_url}
     paystack→ Paystack initialize transaction (callback_url=PAYSTACK_CALLBACK_URL),
               return {authorization_url, reference}
   Store nothing until the provider webhook confirms.
 - cancel_subscription(user_id) → route to the provider on the active subscription
 - get_billing_portal(user_id) → Stripe portal URL (Paystack: manage on dashboard)
 - handle_stripe_webhook(payload, sig) → verify Stripe-Signature; switch:
     checkout.session.completed / customer.subscription.updated / .deleted /
     invoice.payment_failed → upsert subscriptions (provider='stripe') + audit_log
 - handle_paystack_webhook(payload, sig) → verify x-paystack-signature HMAC with
   PAYSTACK_SECRET_KEY; switch:
     charge.success / subscription.disable / invoice.* → upsert subscriptions
     (provider='paystack') + audit_log
 app/api/v1/plans.py:
 GET  /plans                       → public
 POST /subscriptions               → {plan_id, provider} → checkout url/reference
 DELETE /subscriptions/active      → cancel
 GET  /billing/portal              → portal redirect URL
 app/api/v1/webhooks.py:
 POST /webhooks/stripe   → billing_svc.handle_stripe_webhook
 POST /webhooks/paystack → billing_svc.handle_paystack_webhook
   ⚠ Both read RAW BYTES for signature verification BEFORE parsing, and do not
     use the standard get_db dependency pattern.
 Tests:
 - Stripe webhook invalid signature → 400; Paystack invalid signature → 400
 - checkout.session.completed creates subscription (provider=stripe)
 - charge.success creates subscription (provider=paystack)
 - cancel sets cancel_at_period_end / disables paystack sub
 - Non-subscriber quota check falls back to free plan limits (run_limit=1)
 When done, update CLAUDE.md phase tracker: Phase 4 complete, next = Phase 5.
Verify: Stripe CLI + a mocked Paystack webhook both update subscriptions correctly.

PHASE 5 — Strategy generation (Vibe-Trading + DeepSeek BYOK)
Prompt:
Read CLAUDE.md. Wrap Vibe-Trading strategy generation with DeepSeek BYOK.
 app/services/strategy_svc.py:
 - generate(user_id, prompt, exchange) →
     1. check_quota(user_id, "run") — raises 429 if over limit
     2. load the user's active llm_keys row; if none → raise HTTP 400
        {"error":"add your DeepSeek API key first"}
     3. decrypt the key (worker-side), call
        StrategyAgent(llm_provider="deepseek", api_key=<key>).generate(
        prompt=prompt, exchange=exchange)
     4. save strategy_sessions row
     5. increment usage_records.runs_used atomically
     6. write audit_log (action="strategy_generated")
     7. return session record
 - get / list / delete (soft delete via deleted_at) with ownership checks
 app/api/v1/strategy.py:
 POST /strategy/generate | GET /strategy | GET /strategy/:id | DELETE /strategy/:id
 Generation can take 10-30s. Run with asyncio.to_thread() (StrategyAgent may be
 synchronous) or dispatch to Celery and poll.
 Tests:
 - Free user at run limit (1) → 429 on second generate in the same month
 - generate with NO llm_key → 400
 - User A cannot GET user B's strategy → 403
 - Successful generate increments usage_records.runs_used
 When done, update CLAUDE.md phase tracker: Phase 5 complete, next = Phase 6.
Verify: Strategy generates using the user's DeepSeek key and saves; counter bumps.

PHASE 6 — Backtest service (Celery + S3)
Prompt:
Read CLAUDE.md. Build the async backtest pipeline.
 app/workers/backtest_task.py (Celery task):
 @app.task(bind=True, max_retries=0)
 def run_backtest(self, backtest_id: str):
   1. Fetch backtest row (sync SQLAlchemy — Celery is sync)
   2. Set status="running"
   3. Decrypt exchange key for this user+exchange (encrypted_keys)
   4. Call BacktestRunner(strategy_code=..., params=...).run()
   5. Upload results JSON to S3: key=f"backtests/{user_id}/{backtest_id}.json"
   6. status="done", results={"s3_key":..., "summary":top_metrics}
   7. On exception: status="failed", store error in results
 app/services/backtest_svc.py:
 - create(user_id, session_id, params) → check_quota("backtest") → row(status=
   queued) → run_backtest.delay() → increment backtests_used → return record
 - get / get_results (presigned S3 URL if done, else 409) / list with ownership
 app/api/v1/backtest.py:
 POST /backtest | GET /backtest | GET /backtest/:id | GET /backtest/:id/results |
 DELETE /backtest/:id (cancel if queued via revoke, else 409)
 Tests: POST enqueues task (status=queued); daily limit enforced (free=1/day);
        results on non-done → 409; cross-user access → 403.
 When done, update CLAUDE.md phase tracker: Phase 6 complete, next = Phase 7.
Verify: worker processes task; result uploaded to R2.

PHASE 7 — Bot management (live trading)
Prompt:
Read CLAUDE.md. Build live bot deploy and kill switch.
 app/workers/bot_task.py (Celery task — long running):
 @app.task(bind=True)
 def run_live_bot(self, bot_id: str):
   1. Fetch live_bots row; set status="active"
   2. Decrypt exchange API key
   3. Build mandate dict from live_bots.mandate
   4. LiveAgent(strategy_code=..., mandate=..., credentials=...).run()
      — blocks until revoked or mandate violated
   5. On TaskRevokedError: status="stopped", write audit_log
   6. On other exception: status="errored", store error
 app/services/bot_svc.py:
 - deploy(user_id, session_id, exchange, mandate_params) →
     check_quota("bot"); validate mandate (symbol_universe, order_size_usd,
     max_exposure_usd, daily_loss_cap_usd); require encrypted_keys row for
     user+exchange else 400; create live_bots(status=queued); task=delay();
     store celery_task_id; audit_log(action="bot_deployed", payload=mandate)
 - stop(user_id, bot_id) → verify ownership → revoke(celery_task_id,
     terminate=True, signal="SIGTERM") → status="stopped" → audit_log
 - get / list with ownership
 app/api/v1/bots.py:
 POST /bots | GET /bots | GET /bots/:id | DELETE /bots/:id (kill switch)
 Tests: deploy at bot_limit → 429 (free bot_limit=0 always blocks); deploy
        without exchange key → 400; stop revokes task; cross-user stop → 403.
 When done, update CLAUDE.md phase tracker: Phase 7 complete, next = Phase 8.
Verify: Bot starts, runs, stops cleanly via DELETE; SIGTERM fires within 2s.

PHASE 8 — Admin routes
Prompt:
Read CLAUDE.md. Build the admin API. All routes require role=="admin"
(require_admin). Write audit_log for every mutation.
 app/api/v1/admin.py:
 User management:
 GET  /admin/users | GET /admin/users/:id | PATCH /admin/users/:id (role only)
 POST /admin/users/:id/suspend   → is_suspended=True + revoke all active bot tasks
 POST /admin/users/:id/unsuspend → is_suspended=False
 POST /admin/users/:id/override-plan → set plan bypassing providers; subscription
      row with stripe_subscription_id="manual_override"
 Billing:
 GET /admin/billing/summary → {mrr_cents, total_users, active_subscribers,
      users_by_plan:{free,pro,business}}
 GET /admin/billing/failed  → subscriptions with status=past_due
 Platform config:
 GET /admin/plans | PATCH /admin/plans/:id (run_limit, bot_limit, backtest_daily_limit)
 Monitoring:
 GET /admin/usage/summary → runs + backtests in last 30 days
 GET /admin/bots/active   → all live_bots status=active across users
 Audit logs:
 GET /admin/logs → paginated, filter by actor_id/action/resource_type
 Add is_suspended to users + Alembic migration. Ensure get_current_user returns
 403 when is_suspended.
 Tests: non-admin → 403 on all /admin/*; suspend revokes user's active bots;
        override-plan updates quota correctly.
 When done, update CLAUDE.md phase tracker: Phase 8 complete, next = Phase 9.
Verify: suspend a test user → bots stop + next request gets 403.

PHASE 9 — Frontend (Vite + React)
Split into sub-sessions. One prompt per UI area.
9a — Auth (Supabase)
 src/lib/auth.ts: supabase client; signUp/signInWithPassword/signOut;
   onAuthStateChange → sync to backend /auth/callback; store session in Zustand.
 src/lib/api.ts: typed fetch; inject supabase access token; on 401 call
   supabase.auth.refreshSession() and retry once.
 Pages (react-router):
 /register, /verify (Supabase email confirm landing), /login
 AuthLayout: centered card, no sidebar. Use shadcn-style Card/Input/Button/Alert.
 Inline field errors (email taken → under email field).
9b — Dashboard + strategy generator
 /dashboard: usage meter (runs_used/run_limit, ∞ for business), recent strategies
   (last 5), active bots count + status. Fetch via SWR from /users/me/usage +
   /users/me/plan.
 /strategy: NLP prompt textarea + exchange selector; "Add DeepSeek key" banner if
   no llm_key (links to settings); Generate → POST /strategy/generate → loading
   (can take 20s) → syntax-highlighted code block; buttons "Run backtest" and
   "Deploy as bot"; list of previous strategies (paginated, DELETE each).
   Quota-exceeded (free hits run_limit=1) → upsell card, not a dead end.
 /strategy/:id: full strategy view + actions.
9c — Backtest + bot management
 /backtest: "New backtest" → sheet with exchange, symbol, start/end date, capital,
   slippage; submit → POST /backtest → row status "queued"; auto-refresh every 3s
   (SWR refreshInterval) until done/failed; "View results" when done.
 /backtest/:id/results: key metrics (total return %, Sharpe, max drawdown, win rate)
   from presigned S3 URL or JSON summary.
 /bots: list bots (exchange, strategy, status badge, created_at); "Deploy new bot"
   → sheet: select strategy, exchange, mandate fields; warning "uses real funds";
   red "Stop" per row → DELETE /bots/:id with confirm dialog. Status badges:
   active (green), stopped (gray), errored (red).
9d — Billing + admin panel
 /billing: current plan + price; usage vs limits; provider toggle (Stripe / Paystack)
   on the plan comparison table → POST /subscriptions {plan_id, provider} → redirect
   to checkout/authorization URL; "Manage billing" (Stripe portal); invoice history.
 /admin (guarded by user.role==="admin", else redirect): sidebar → users, billing,
   monitoring, logs.
 /admin/users: searchable table (email, plan, joined, status); actions View,
   Suspend/Unsuspend, Override plan.
 /admin/users/:id: full profile + actions (suspend, override plan, reset email).
 /admin/logs: filter by actor/action/date; table timestamp/actor/action/resource.

PHASE 10 — Testing + hardening
Prompt:
Read CLAUDE.md. Run a full security and integration audit.
 1. Run the full test suite. Fix failures.
 2. Security checks:
    a. Every /api/v1 route (except /auth/*, /plans, /webhooks) returns 401 with no
       Authorization header.
    b. User A cannot access user B's strategy/backtest/bot (403).
    c. /admin/* returns 403 for non-admin.
    d. POST /webhooks/stripe with tampered body → 400; /webhooks/paystack tampered
       → 400.
    e. encrypted_keys and llm_keys never store plaintext (ciphertext != key).
    f. Strategy generation without llm_key → 400; llm_keys GET never returns key.
 3. Add missing indexes: EXPLAIN ANALYZE GET /backtest, GET /bots, GET /admin/logs;
    add via Alembic migration.
 4. Rate limiting: confirm fastapi-limiter on /auth/* (max 10/min per IP) and
    /strategy/generate (per plan limits).
 5. Update CLAUDE.md with new gotchas. Phase 10 = complete → staging ready.

SESSION WORKFLOW (read before every session)
Start: "Read CLAUDE.md. Continue from the current phase tracker. Today's task:
[paste Phase N prompt]." End: update phase tracker + add notes to "## Session notes".
When broken: "Read CLAUDE.md. Issue: [...]. File: [...]. Do not change other files."
To inspect: "Read CLAUDE.md and list all files created for Phase X. Show me [file]."
