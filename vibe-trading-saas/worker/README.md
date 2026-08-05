# H~M Worker

Polls `agent_runs` for queued work, executes it, and writes the result back.
Long-running process — not serverless, because an agent run outlives any
function timeout (see `docs/ARCHITECTURE.md`).

**Day 4 status:** queue mechanics only. `StubRunner` sleeps and succeeds; it
does not invoke Tradi. Day 5 replaces it with a real subprocess runner.

## Setup

```bash
cd vibe-trading-saas/worker
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env    # then fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

The service-role key is in **Supabase → Project Settings → API → service_role**.
It bypasses Row Level Security, so it belongs only here — never in the frontend,
never in a `VITE_*` variable, never in git.

## Run

```bash
hm-worker
```

## Test

```bash
pytest
```

## How a run moves through the queue

```
queued ──claim_agent_run()──► running ──complete_agent_run()──► completed
                                 │
                                 ├──fail_agent_run(status='failed')───► failed
                                 └──fail_agent_run(status='timeout')──► timeout
```

Claiming uses `SELECT ... FOR UPDATE SKIP LOCKED` inside the
`claim_agent_run` database function — PostgREST can't express that, and it's
what stops two workers from taking the same row. Several workers can run
concurrently with no extra coordination.

While a run is in flight the worker calls `heartbeat_agent_run` every
`WORKER_HEARTBEAT_SECONDS`, refreshing `claimed_at`. A run whose heartbeat goes
stale (worker crashed, container was killed) is reclaimed by the next worker to
poll. `WORKER_STALE_AFTER_SECONDS` must stay above `WORKER_RUN_TIMEOUT_SECONDS`,
or a healthy long run gets reclaimed and executed twice — the default derives it
as `timeout + 300` for exactly that reason.

Every close is guarded by `claimed_by = <this worker>`, so a worker that lost
its claim can't overwrite the result of the worker that took over.

## Quota refunds

`CLAUDE.md`'s rule: a system-caused failure gives the use back, a user-input
error does not. That maps to the exception raised by the runner:

| Exception | Status | Refunded |
|---|---|---|
| `UserInputError` | `failed` | no |
| `SystemError_` | `failed` | yes |
| `RunTimeout` | `timeout` | yes |
| unexpected `Exception` | `failed` | yes |
| `ClaimLost` | *row untouched* | — |

## Database functions

Added by the `add_worker_run_lifecycle_functions` migration. All are
`SECURITY DEFINER` and granted to `service_role` only:

- `claim_agent_run(worker_id, stale_after)` → oldest queued or abandoned run
- `heartbeat_agent_run(run_id, worker_id)` → keeps a claim alive
- `complete_agent_run(run_id, worker_id)`
- `fail_agent_run(run_id, worker_id, error, status, refund)`

## Deployment

Railway, Fly.io, or Hetzner — a plain always-on process. Set the same
environment variables as `.env`. Scale by running more instances; the
`SKIP LOCKED` claim makes them safe to run in parallel.
