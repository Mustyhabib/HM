# H~M Worker

Polls `agent_runs` for queued work, executes it, and writes the result back.
Long-running process — not serverless, because an agent run outlives any
function timeout (see `docs/ARCHITECTURE.md`).

**Day 5 status:** real execution via `TradiRunner` (one subprocess per run) —
**verified end-to-end** (queued row → claim → DeepSeek run → `completed`). Set
`WORKER_EXECUTE_TRADI=true` to use it; unset falls back to `StubRunner` (sleeps
and succeeds, no engine). See "Running the real engine" below.

## Setup

```bash
cd vibe-trading-saas/worker
python3 -m venv .venv && source .venv/bin/activate
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

## Running the real engine (TradiRunner)

By default `WORKER_EXECUTE_TRADI` is false → the stub runner is used. To run the
real Tradi engine:

1. **Install the engine** (separate package + venv; from repo root):
   ```bash
   cd Tradi && python3 -m venv .venv && .venv/bin/pip install -e ".[longbridge,deepseek]"
   ```
2. **Enable it** in `worker/.env`:
   ```
   WORKER_EXECUTE_TRADI=true
   WORKER_TRADI_COMMAND=/home/aurora/HM/Tradi/.venv/bin/vibe-trading
   WORKER_RUNS_ROOT=/tmp/vibe-runs   # must be WRITABLE; default /var/vibe-runs needs root
   ```
3. **Configure the LLM in `Tradi/agent/.env`** — the engine's own env, loaded by
   absolute path, so it's read even under the worker's isolated per-run `HOME`.
   **Do NOT put LLM config (`LANGCHAIN_*`, `*_API_KEY`) in `worker/.env`** — the
   engine loads `agent/.env` with `override=False`, so worker-env copies would
   shadow it and win.

`TradiRunner` launches one subprocess per run with `HOME` / `VIBE_TRADING_HOME` /
`VIBE_TRADING_ALLOWED_RUN_ROOTS` pointed at a fresh `<runs_root>/<run_id>` dir,
then runs `vibe-trading run -p "<prompt>" --json --no-rich --max-iter N`.

**Verify the engine + keys load under isolation** (mirrors the worker's env):

```bash
HOME=$(mktemp -d) /home/aurora/HM/Tradi/.venv/bin/vibe-trading \
  run -p "reply OK" --json --no-rich --max-iter 2
```

`{"status": "success", ...}` is good; a `provider_stream_error … 404` means the
LLM endpoint/model is wrong — see below.

### DeepSeek gotchas (these cost a 404)

- **Base URL:** `DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"` (or the bare
  root). **Not** `…/anthropic` — that's DeepSeek's Anthropic-SDK endpoint and
  404s the OpenAI-style path the DeepSeek provider uses.
- **Model names** here are `deepseek-v4-flash` (cheap; dev) and `deepseek-v4-pro`
  — there is no `deepseek-chat`. List them with `GET https://api.deepseek.com/models`.
- Keep exactly one active `LANGCHAIN_PROVIDER=` line, and keys flush-left (a
  leading space can make dotenv skip the variable).

## BYOK — per-user DeepSeek keys

Since the BYOK pivot (2026-08-12, [[architecture-decisions]] D11), the API key
that reaches the engine subprocess is **not** a shared platform key — it's the
individual user's own DeepSeek key, fetched from Supabase Vault right before
`TradiRunner.execute()` spawns the subprocess (`worker_get_user_api_key` RPC,
`service_role`-only). It's injected as `DEEPSEEK_API_KEY` in `_build_env()` and
overrides whatever the process would otherwise have inherited — including a
`DEEPSEEK_API_KEY` left in `Tradi/agent/.env` (that file's dotenv load uses
`override=False`, so it never clobbers a var the subprocess already has).

What this means in practice:

- **`Tradi/agent/.env` still needs `DEEPSEEK_BASE_URL` and `LANGCHAIN_PROVIDER`**
  (provider/model routing is not per-user) — but any `DEEPSEEK_API_KEY` line in
  there is dead weight for runs executed through the worker. Keep one there only
  for the standalone manual verification command above (`HOME=$(mktemp -d) ...`),
  which bypasses the worker entirely and so still needs its own key.
- A run with no key configured raises `MissingApiKey` (not refunded — the user
  needs to add a key on the Profile page) rather than falling back to any
  worker- or engine-level default key. There is no shared fallback key by design.
- Never log `DEEPSEEK_API_KEY` or the value returned by
  `RunQueue.get_user_api_key()` — both `runner.py` and `db.py` are written to
  avoid this; keep new logging additions the same way.

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
