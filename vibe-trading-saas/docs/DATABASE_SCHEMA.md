# Database Schema

Postgres (Supabase). Every user-owned table carries `user_id` and an RLS
policy scoping to it (`CLAUDE.md` → "SECURITY PRINCIPLES"). Types are
Postgres/Supabase-flavored; adjust when the actual migration is written, but
keep the constraints — they encode the transactional/idempotency/immutability
rules from `CLAUDE.md` → "DATABASE PRINCIPLES", not just naming.

## `profiles`

One row per authenticated user, 1:1 with `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `= auth.users.id` |
| `email` | `text` | mirrored from auth for convenience/admin views |
| `billing_customer_id` | `text` | provider (Paystack) customer ref; nullable until first checkout |
| `is_admin` | `boolean` | default `false` |
| `created_at` | `timestamptz` | default `now()` |

RLS: `select`/`update` where `id = auth.uid()`. No `delete` policy (soft-close
account via a status field later if needed — no such field at MVP).

## `plans`

Static reference table for the 3 tiers. Seeded via migration, not user-writable.

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | `'starter' \| 'pro' \| 'premium'` |
| `name` | `text` | display name |
| `price_ngn` | `integer` | monthly price in whole Naira: `70000 \| 120000 \| 200000` |
| `monthly_uses` | `integer` | `3 \| 7 \| 15` |
| `provider_price_id` | `text` | Paystack Plan id |
| `active` | `boolean` | default `true`; lets a tier be retired without deleting history |

RLS: `select` for all authenticated users (needed for the pricing page);
no client writes.

## `subscriptions`

Mirrors the provider (Paystack) subscription state. One active row per user in the common
case, but keep it a table (not a column on `profiles`) so history survives
plan changes/cancellations.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `user_id` | `uuid` FK → `profiles.id` | |
| `plan_id` | `text` FK → `plans.id` | |
| `provider_subscription_id` | `text` UNIQUE | Paystack subscription/payment-plan ref |
| `status` | `text` | `'active' \| 'past_due' \| 'canceled' \| 'incomplete'` (normalized from the provider) |
| `current_period_start` | `timestamptz` | |
| `current_period_end` | `timestamptz` | drives `usage_periods` boundaries |
| `cancel_at_period_end` | `boolean` | default `false` |
| `created_at` / `updated_at` | `timestamptz` | |

RLS: `select` where `user_id = auth.uid()`. All writes go through the
service-role webhook handler only — never client-writable, since this table
is the billing source of truth and must match the provider (Paystack) exactly.

## `usage_periods`

One row per user per billing period. Holds the transactional quota counter
so "is there a use left" is a single-row check, not an aggregate over
`usage_events` on every run-start.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles.id` | |
| `subscription_id` | `uuid` FK → `subscriptions.id` | |
| `period_start` | `timestamptz` | |
| `period_end` | `timestamptz` | |
| `uses_allowed` | `integer` | snapshot of `plans.monthly_uses` at period start (plan changes mid-period don't retroactively change an in-progress period) |
| `uses_consumed` | `integer` | default `0`; incremented transactionally, never decremented directly — refunds insert an offsetting `usage_events` row instead (see below) and decrement here inside the same transaction |
| `created_at` | `timestamptz` | |

Constraint: `UNIQUE (user_id, period_start)`.

RLS: `select` where `user_id = auth.uid()`. Writes only via a Postgres
function (`SECURITY DEFINER`) or the service role — the "start a run"
transaction must `SELECT ... FOR UPDATE` this row, check
`uses_consumed < uses_allowed`, increment, and insert the `agent_runs` row
all in one transaction, so two concurrent run-starts can't both pass the
check (`CLAUDE.md` safety rule 7: never trust client-side quota checks
alone).

## `usage_events`

Immutable audit trail of every quota-affecting event. `usage_periods.
uses_consumed` is the fast-path counter; this table is the append-only
ledger it's derived from, kept for dispute resolution and admin visibility.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles.id` | |
| `usage_period_id` | `uuid` FK → `usage_periods.id` | |
| `agent_run_id` | `uuid` FK → `agent_runs.id` | |
| `kind` | `text` | `'consume' \| 'refund'` |
| `reason` | `text` | e.g. `'run_completed'`, `'system_failure'`, `'user_input_error'` (not refunded) |
| `created_at` | `timestamptz` | |

No `update`/`delete` at the application layer — enforce via a `REVOKE UPDATE,
DELETE` grant or a trigger, not just convention, since "immutable" is a hard
requirement in `CLAUDE.md`.

RLS: `select` where `user_id = auth.uid()`. Insert only via service role /
the same transaction that touches `usage_periods`.

## `agent_runs`

One row per agent invocation. Central table the worker polls.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | this **is** the run id used for the isolated `HOME=/var/vibe-runs/<id>` directory (`ARCHITECTURE.md`) |
| `user_id` | `uuid` FK → `profiles.id` | |
| `usage_period_id` | `uuid` FK → `usage_periods.id` | |
| `idempotency_key` | `text` UNIQUE | client-supplied (e.g. UUID generated on "Run" button click) so a retried request never creates a second run — `CLAUDE.md`: "Agent runs must have idempotency keys" |
| `prompt` | `text` | the user's research request |
| `status` | `text` | `'queued' \| 'running' \| 'completed' \| 'failed' \| 'cancelled' \| 'timeout'` — matches `ARCHITECTURE.md` run states |
| `max_iter` | `integer` | passed to `vibe-trading run --max-iter` |
| `claimed_by` | `text` | worker instance id, set by `SELECT ... FOR UPDATE SKIP LOCKED` claim |
| `claimed_at` | `timestamptz` | |
| `started_at` / `completed_at` | `timestamptz` | |
| `error_message` | `text` | nullable, set on `failed`/`timeout` |
| `refunded` | `boolean` | default `false`; set when a system-caused failure refunds the use |
| `created_at` | `timestamptz` | |

RLS: `select` where `user_id = auth.uid()`. `insert` allowed for the owning
user (goes through the quota-check transaction above); `update` only via
service role (the worker updates status).

## `agent_artifacts`

Output files/reports from a completed run, stored in Supabase Storage behind
signed URLs — never a public bucket (`ARCHITECTURE.md`).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `agent_run_id` | `uuid` FK → `agent_runs.id` | |
| `user_id` | `uuid` FK → `profiles.id` | denormalized for a simpler RLS policy |
| `kind` | `text` | `'report' \| 'chart' \| 'json_result' \| ...` |
| `storage_path` | `text` | path within the Supabase Storage bucket |
| `created_at` | `timestamptz` | |

RLS: `select` where `user_id = auth.uid()`. Insert only via service role
(worker, after parsing the subprocess result).

## `webhook_events`

Idempotency ledger for Paystack webhooks — `CLAUDE.md` safety rule 9: "Never
implement payment logic without webhook idempotency."

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `provider_event_id` | `text` UNIQUE | the actual dedupe key (Paystack event/transaction id) |
| `type` | `text` | e.g. `'charge.success'`, `'subscription.disable'` |
| `payload` | `jsonb` | raw event, for replay/debugging |
| `processed_at` | `timestamptz` | nullable until handled successfully |
| `created_at` | `timestamptz` | |

Handler flow: insert (or no-op on unique-violation if already seen) →
process → set `processed_at`. No RLS needed (service-role only table, never
queried from the client).

## `audit_logs`

Append-only log for admin-visible/security-relevant actions (plan changes,
refunds, admin overrides). Not the same as `usage_events` (that's
quota-specific); this is general.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `actor_user_id` | `uuid` FK → `profiles.id`, nullable | null for system-initiated actions |
| `action` | `text` | e.g. `'refund_issued'`, `'plan_changed'`, `'admin_login'` |
| `target_table` | `text` | nullable |
| `target_id` | `uuid` | nullable |
| `metadata` | `jsonb` | |
| `created_at` | `timestamptz` | |

RLS: no client access at MVP (admin views go through a service-role-backed
API route, not direct table access) — see `CLAUDE.md` "Basic admin
visibility" (MVP feature, not "complex admin dashboard", which is a
non-goal).

## Not yet decided

- Exact Postgres function signatures for the quota-check-and-consume
  transaction and the worker's `SKIP LOCKED` claim query — write these as
  the first migration, not just prose here.
- Index list (obvious candidates: `agent_runs(user_id, status)`,
  `usage_periods(user_id, period_start)`) — add once query patterns from
  the actual dashboard queries are known, don't guess ahead of need.
