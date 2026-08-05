# Architecture

MVP system architecture for the Vibe-Trading SaaS wrapper. See
`docs/PROJECT_BRIEF.md` for product scope and `CLAUDE.md` for the
constraints this design is built under (solo-dev, cost-conscious, boring
stack, no live trading at MVP).

## System diagram

```
                        ┌─────────────────────┐
                        │   Browser (user)     │
                        └──────────┬───────────┘
                                   │ HTTPS
                                   ▼
                  ┌────────────────────────────────┐
                  │  Next.js app (Vercel/CF Pages)  │
                  │  - landing, pricing, dashboard  │
                  │  - Supabase Auth (session cookie)│
                  │  - Stripe Checkout redirect      │
                  └───────┬───────────────┬─────────┘
                          │               │
              Postgres/RLS│               │ Stripe API
                          ▼               ▼
              ┌───────────────────┐  ┌──────────────┐
              │      Supabase      │  │    Stripe     │
              │  - Auth            │  │  - Checkout   │
              │  - Postgres (RLS)  │  │  - Portal     │
              │  - Storage         │  │  - Webhooks   │──┐
              └─────────┬──────────┘  └───────────────┘  │
                        │ ▲                                │ webhook POST
              claim job │ │ status/results                 ▼
                        │ │                    ┌─────────────────────────┐
                        ▼ │                    │ Next.js API route        │
              ┌────────────────────┐           │ /api/webhooks/stripe     │
              │  Python worker      │           │ (idempotent, verifies    │
              │  (Railway/Fly/      │           │  signature, writes to    │
              │   Hetzner)          │           │  webhook_events table)   │
              │                     │           └─────────────────────────┘
              │  poll agent_runs    │
              │  WHERE status=      │
              │  'queued'           │
              │  (SKIP LOCKED)      │
              └─────────┬───────────┘
                        │ subprocess, per run
                        │ HOME=/isolated/run/<run_id>
                        │ --json --max-iter N, wall-clock timeout
                        ▼
              ┌────────────────────┐
              │  Tradi (agent/cli)  │  ← vendored engine, HM/Tradi/
              │  vibe-trading run   │    live trading left unconfigured
              │  -p "<prompt>"      │    (mandate-gated, off by default)
              └─────────┬───────────┘
                        │ stdout JSON + workspace artifacts
                        ▼
              worker parses result, uploads artifacts to Supabase
              Storage, writes agent_artifacts + updates agent_runs.status
```

## Components

### Frontend — Next.js (App Router)

Landing, pricing, auth (via Supabase Auth), dashboard, run start/status/
result pages, usage history, billing settings (Stripe Customer Portal
redirect), legal pages, basic admin view. Talks to Supabase directly for
reads the RLS policies allow, and to a small set of Next.js API routes for
anything that needs the service-role key (webhook handling, run creation
that must double-check server-side quota — see "Quota enforcement" below).

### Supabase — Auth, Postgres, Storage

Source of truth for users, plans, subscriptions, usage, and run records.
Every user-owned table gets RLS scoping by `user_id`. See
`docs/DATABASE_SCHEMA.md` (TODO) for table definitions. Storage holds run
artifacts (reports, charts) behind signed URLs, not public buckets.

### Stripe — Checkout, Customer Portal, Webhooks

Subscription billing for the three tiers (`CLAUDE.md` → "PRICING MODEL").
Webhook handler must be idempotent (`webhook_events` table keyed by Stripe
event ID) — this is a hard rule (`CLAUDE.md` → safety rule 9), not
optional.

### Worker — Python, long-running process

Polls `agent_runs` for `status = 'queued'` and claims a row with
`SELECT ... FOR UPDATE SKIP LOCKED` (or Supabase's equivalent transactional
claim) so two worker instances never double-process the same run. Hosted on
Railway, Fly.io, or Hetzner per `CLAUDE.md`'s preferred stack — not
serverless, because runs are long-running (agent tool loops, multiple LLM
round-trips) and don't fit a request/response function's time budget.

**How it invokes Tradi:** see `docs/DECISIONS.md` (2026-08-05) for the full
reasoning. Summary: each run is a fresh subprocess —

```bash
HOME=/var/vibe-runs/<run_id> \
VIBE_TRADING_ALLOWED_RUN_ROOTS=/var/vibe-runs/<run_id> \
vibe-trading run -p "<prompt>" --json --max-iter <N>
```

launched with a wall-clock timeout the worker enforces itself (Tradi has no
built-in overall-run timeout; it only has a per-LLM-call timeout
`TIMEOUT_SECONDS`, default 120s, and a per-tool timeout
`VIBE_TRADING_TOOL_TIMEOUT_SECONDS`, default 1800s — both far above what an
MVP "use" should cost). `VIBE_TRADING_ENABLE_SHELL_TOOLS` is left unset
(defaults `False`) so shell-capable tools stay off. No broker/live-trading
env vars are ever set, so live trading stays disabled by Tradi's own
mandate gate.

On completion the worker:
1. Parses the `--json` stdout for the structured result.
2. Uploads any workspace artifacts (reports, charts) to Supabase Storage.
3. Writes `agent_artifacts` rows and updates `agent_runs.status` →
   `completed` / `failed` / `timeout`.
4. On a system-caused failure (crash, timeout, infra error — not a
   user-input error), refunds the use per `CLAUDE.md`'s quota rule.
5. Deletes the isolated `/var/vibe-runs/<run_id>` directory (ephemeral —
   see "Deferred: persistent per-user memory" below).

### Quota enforcement

Client-side quota checks are never trusted alone (`CLAUDE.md` safety rule
7). Run creation must re-check remaining uses for the current billing
period inside the same transaction that inserts the `agent_runs` row, so
two concurrent "start run" clicks can't both slip through. Quota logic is
transactional; `usage_events` rows are immutable.

## Run states

`queued → running → completed | failed | cancelled | timeout`, matching
`CLAUDE.md` → "AGENT EXECUTION PRINCIPLES".

## Deferred: persistent per-user memory

Tradi supports cross-session persistent memory
(`agent/src/memory/persistent.py`, `~/.vibe-trading/memory/`) so a single
local user's agent "remembers" preferences across runs. At MVP each run
gets a **fully ephemeral** isolated `HOME`, so this cross-run memory
feature is not available to hosted users — it's not in the MVP feature list
(`CLAUDE.md` → "MVP FEATURES") and adding it means persisting each user's
memory directory (e.g. in Supabase Storage or a mounted volume keyed by
`user_id`), mounting it into the per-run `HOME` before the run and
persisting changes back after. Worth revisiting post-MVP; not a blocker
now.

## Future hardening (post-MVP, not blocking launch)

- Container-per-run (Docker) instead of a bare subprocess, for stronger
  filesystem/network/cgroup isolation — upgrade path once usage or abuse
  risk justifies the added ops burden (`CLAUDE.md`: "upgrade only when
  real usage justifies it").
- Rate limiting agent-run creation (`CLAUDE.md` → "SECURITY PRINCIPLES")
  beyond the monthly quota, e.g. a short per-user cooldown between run
  starts.
- Upstash Redis for cross-worker coordination if a single Postgres-backed
  queue (`SKIP LOCKED`) stops being enough — `CLAUDE.md` explicitly allows
  deferring this ("Postgres-only quota is acceptable for early MVP").

## Open questions

- Worker host choice (Railway vs Fly.io vs Hetzner) — not yet decided,
  revisit once budget/traffic assumptions firm up.
- Exact wall-clock timeout and `--max-iter` default per plan tier (Starter
  vs Pro vs Premium may warrant different limits) — not yet decided.
