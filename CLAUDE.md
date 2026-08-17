Vibe-Trading SaaS — Claude Code Memory

Project
Multi-user billing SaaS wrapping HKUDS/Vibe-Trading. Users pay for AI-powered
trading strategy generation, backtesting, and live bot deployment via a web UI.

Tech stack (do not deviate without explicit instruction)
Backend  : Python 3.12 · FastAPI · SQLAlchemy 2 async · Alembic
Frontend : Vite + React 19 · TypeScript · Tailwind CSS · react-router · Zustand
           · Radix/ShadCN-style primitives
Auth     : Supabase Auth (JWT) — access tokens ~15 min, refresh managed by
           Supabase. Backend verifies Supabase JWT and maps to a local users row
           via supabase_id. NO self-managed passwords / bcrypt / SMTP verify.
Billing  : DUAL PROVIDER — Stripe (international) + Paystack (NGN). Both use
           hosted checkout + customer portal + signed webhooks.
LLM      : DeepSeek via BYOK — users supply their own DeepSeek API key. The
           platform NEVER stores it in plaintext and NEVER proxies/marks it up.
           Key is AES-256-GCM encrypted at rest and decrypted only in the worker.
Queue    : Celery 5 + Redis
DB       : PostgreSQL 16 (primary) · Redis (rate limits, Celery broker/result)
Storage  : Cloudflare R2 (S3-compatible) — backtest results, reports
Engine   : vibe-trading-ai (pip) — strategy gen, backtest, live trading

Directory layout
vibe-saas/
 ├── backend/
 │   ├── app/
 │   │   ├── api/v1/          # Route handlers (auth, users, plans, strategy,
 │   │   │                    #   backtest, bots, admin, webhooks, keys, llmkeys)
 │   │   ├── core/            # config.py, security.py, dependencies.py, database.py
 │   │   ├── models/          # SQLAlchemy ORM models
 │   │   ├── schemas/         # Pydantic request/response schemas
 │   │   ├── services/        # Business logic (user_svc, billing_svc,
 │   │   │                    #   strategy_svc, backtest_svc, bot_svc)
 │   │   └── workers/         # Celery tasks (backtest_task, bot_task)
 │   ├── migrations/          # Alembic — never hand-edit migration files
 │   └── tests/               # pytest + pytest-asyncio
 ├── frontend/                # Vite + React
 │   ├── src/
 │   │   ├── pages/           # route components (auth, dashboard, strategy, ...)
 │   │   ├── components/      # ui/ (shadcn-style), shared/, dashboard/
 │   │   ├── lib/             # api.ts (typed fetch), auth.ts (supabase client),
 │   │   │                    #   stripe.ts, paystack.ts
 │   │   ├── store/           # Zustand stores (auth, usage)
 │   │   └── router/          # react-router config
 │   └── index.html
 └── docker-compose.yml       # dev: postgres, redis, backend, worker, frontend

DB models — canonical reference
users           id UUID PK | email UNIQUE | name | supabase_id UNIQUE
                 role ENUM(user,admin) | stripe_customer_id | paystack_customer_code
                 is_suspended | created_at
                 # NOTE: no hashed_password / is_verified — Supabase Auth owns
                 # credentials and email confirmation.
 plans           id UUID PK | name | price_cents | run_limit (int, -1=unlimited)
                 bot_limit | backtest_daily_limit | features JSONB
 subscriptions   id UUID PK | user_id FK | plan_id FK
                 provider ENUM(stripe,paystack)
                 stripe_subscription_id UNIQUE NULL | paystack_subscription_code NULL
                 status | current_period_end
 strategy_sessions  id UUID PK | user_id FK | prompt TEXT | strategy_code TEXT
                    exchange | created_at | deleted_at NULL
 backtests       id UUID PK | user_id FK | session_id FK | exchange | symbol
                 start_date | end_date | capital | status ENUM(queued,running,
                 done,failed) | results JSONB | celery_task_id | created_at
 live_bots       id UUID PK | user_id FK | session_id FK | exchange | status
                 ENUM(active,stopped,errored) | mandate JSONB | celery_task_id
                 created_at
 usage_records   id UUID PK | user_id FK | month DATE | runs_used
                 backtests_used | updated_at
 encrypted_keys  id UUID PK | user_id FK | exchange | ciphertext BYTEA | iv BYTEA
                 created_at                # EXCHANGE API keys
 llm_keys        id UUID PK | user_id FK | provider (default 'deepseek')
                 ciphertext BYTEA | iv BYTEA | created_at   # BYOK DeepSeek keys
 audit_logs      id UUID PK | actor_id FK | action | resource_type | resource_id
                 payload JSONB | ip_address | created_at

Plan limits (enforce in middleware before every engine call)
| Tier     | price_cents | run_limit | bot_limit | backtest_daily_limit |
|----------|-------------|-----------|-----------|----------------------|
| free     | 0           | 1         | 0         | 1                    |
| pro      | 2900        | 100       | 1         | 20                   |
| business | 9900        | -1        | 5         | -1                   |

Security rules — enforce in EVERY feature, no exceptions
Row isolation   — every DB query: WHERE user_id = current_user.id
Exchange keys   — AES-256-GCM encrypt before INSERT, never log plaintext
LLM keys (BYOK) — AES-256-GCM encrypt before INSERT into llm_keys; decrypt only
                  inside the Celery worker right before the engine call; never
                  return plaintext via any API; never proxy/mark up LLM calls
Auth gate       — verify Supabase JWT on every protected route; map supabase_id
                  → users row; suspended users → 403
Quota check     — call check_quota(user, action) BEFORE invoking Vibe-Trading
Admin gate      — role == "admin" AND 2FA verified on every /admin/* route
Webhooks        — reject Stripe events with invalid Stripe-Signature; reject
                  Paystack events whose x-paystack-signature HMAC is invalid
Rate limiting   — fastapi-limiter on all endpoints, per-plan Redis keys
CORS            — whitelist frontend origin only

API conventions
Response shape : `{"data": ..., "error": null}` or `{"data": null, "error": "msg"}`
Auth header    : `Authorization: Bearer <supabase_access_token>`
Pagination     : `?page=1&limit=20` → `{data: [...], total, page, limit}`
HTTP errors    : raise HTTPException(status_code=..., detail="...")

Vibe-Trading integration patterns
# Strategy generation — DeepSeek BYOK. Decrypt the user's llm_key first.
from vibe_trading_ai import StrategyAgent
user_llm_key = decrypt_llm_key(user_id)          # from llm_keys (worker-side)
agent = StrategyAgent(llm_provider="deepseek", api_key=user_llm_key)
result = await agent.generate(prompt=user_prompt, exchange=exchange)
# If the user has no llm_keys row → return 400 "add your DeepSeek API key first".

# Backtest (always run in Celery worker — never in request thread)
from vibe_trading_ai import BacktestRunner
runner = BacktestRunner(strategy_code=code, params=backtest_params)
results = runner.run()  # blocking — run in worker

# Live bot (long-running Celery task with revoke for kill switch)
from vibe_trading_ai import LiveAgent

Testing requirements (must pass before moving to next phase)
Auth  : supabase sign_up → sign_in → protected route → refresh → logout happy path
Multi-tenant isolation : user A cannot access user B's resources (403)
Quota : exceeding plan limit returns 429
Stripe webhook : checkout.session.completed + customer.subscription.deleted handled
Paystack webhook : charge.success + subscription.disable handled
BYOK  : strategy generation without an llm_key → 400; llm_keys GET never returns key
Admin gate : non-admin gets 403 on all /admin/* routes

Env vars required
DATABASE_URL          REDIS_URL             SECRET_KEY
ENCRYPTION_KEY        # 32-byte hex for AES-256-GCM (exchange + llm keys)
# Stripe (international)
STRIPE_SECRET_KEY     STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_FREE     STRIPE_PRICE_PRO      STRIPE_PRICE_BUSINESS
# Paystack (NGN)
PAYSTACK_SECRET_KEY   PAYSTACK_CALLBACK_URL
PAYSTACK_PLAN_FREE    PAYSTACK_PLAN_PRO     PAYSTACK_PLAN_BUSINESS
# Supabase Auth
SUPABASE_URL          SUPABASE_KEY          SUPABASE_JWT_SECRET
# Storage
S3_BUCKET             S3_ACCESS_KEY         S3_SECRET_KEY  S3_ENDPOINT
# Misc
SMTP_HOST             SMTP_PORT             SMTP_USER      SMTP_PASS
DEEPSEEK_BASE_URL     # optional, default https://api.deepseek.com
ADMIN_EMAIL

Current phase tracker — UPDATE AT END OF EVERY SESSION
Phase     : 0 — scaffold
Completed : (nothing yet)
Next task : create project scaffold with docker-compose
