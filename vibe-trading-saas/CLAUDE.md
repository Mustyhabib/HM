# vibe-trading-saas — subproject notes

> **SOURCE OF TRUTH: `/home/aurora/HM/CLAUDE.md`** (repo root).
> Read it first. It owns the architecture, schema, RPCs, pricing, sprint tracker,
> and session workflow. This file only covers what lives in THIS directory and
> deliberately contains no product decisions that could contradict the root.

## What lives here

```
vibe-trading-saas/
 ├── worker/                 Python 3.11+ worker (package name: hm-worker)
 │   ├── src/hm_worker/      main.py (polling loop) · runner.py (subprocess runner)
 │   │                       artifacts.py · progress.py · db.py · config.py
 │   │                       logging_config.py (JSON logs + run_id) · sentry.py
 │   │                       health.py (GET /health on 127.0.0.1:9100)
 │   └── tests/              8 files — 74 hermetic tests
 ├── db/migrations/          SQL migrations, applied to Supabase MANUALLY
 └── docs/                   LEGACY pre-pivot planning (30_DAY_PLAN, STATE,
                             DECISIONS, PROJECT_BRIEF, ARCHITECTURE,
                             DATABASE_SCHEMA, SECURITY_CHECKLIST) — historical
                             only; the root CLAUDE.md supersedes them.
```

## Worker (hm-worker)

- **Entry point**: `hm-worker` console script (pyproject.toml `[project]`), Docker
  CMD in the root `Dockerfile`; Railway via root `railway.toml`.
- **Core loop**: polls `agent_runs WHERE status='queued'` claiming with
  `FOR UPDATE SKIP LOCKED` (atomic, no Redis, N workers safe). One subprocess per
  run: `vibe-trading run -p "<prompt>" --json --no-rich --max-iter N` with an
  isolated `HOME` per run and the user's BYOK key injected into the subprocess env
  (decrypted server-side via `worker_get_user_api_key`, service-role only).
- **Runner contract** (verified against main.py):
  `TradiRunner.execute(run, heartbeat: Heartbeat, stop: threading.Event) -> RunResult`.
- **Monitoring**: structured single-line JSON logs with a thread-local `run_id`
  (`logging_config.py`), Sentry fail-open with PII scrubber (`sentry.py`),
  stdlib `health.py` loopback-only endpoint.
- **Env vars** (all in `worker/.env.example`): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_EXECUTE_TRADI` (default false = stub —
  must be `true` in production), `WORKER_ID`, `WORKER_RUNS_ROOT`,
  `WORKER_TRADI_COMMAND`, poll/backoff/heartbeat/timeout tunables, `LOG_LEVEL`,
  `SENTRY_DSN`, `WORKER_HEALTH_PORT` (default 9100).
- **Tests** (hermetic, no network):
  ```bash
  cd vibe-trading-saas/worker
  env -u PYTHONPATH -u VIRTUAL_ENV .venv/bin/python -m pytest -q   # 74 pass
  ```
  (The `env -u` prefix is required on this machine — the Hermes shell leaks
  PYTHONPATH/VIRTUAL_ENV and pip would otherwise skip deps.)

## Migrations

Applied manually to Supabase (project `wqjdumforbalfmtawwpg`) — no migration
runner. Order matters; newest first:

1. `2026_08_11_agent_teams_uploads.sql` — teams/swarm data, agent-uploads bucket
2. `2026_08_12_byok_api_keys.sql` — BYOK RPCs + Vault integration
3. `2026_08_12_byok_revoke_anon_execute.sql` — privilege lockdown
4. `2026_08_12_paystack_billing.sql` — billing tables + webhook_events
5. `2026_08_17_admin_dashboard.sql` — admin_users + audit_logs + 10 admin RPCs
   (APPLIED to production 2026-08-18; forward = lines 1–917, rollback section
   commented below line 919)
6. `2026_08_21_shadow_account.sql` — shadow run kind + start_shadow_run RPC
   (APPLIED to production 2026-08-22 via Management API; kind constraint had
   already been added, RPC was the missing piece — verified post-apply)
7. `2026_08_22_phase2_data_plane.sql` — Phase 2 data plane (D18/D19)
   (APPLIED to production 2026-08-22 via Management API; {"success":true})
   Creates: dataset_registry table (22 fields, RLS), data_feeds table (service-role only),
   hm-datalake storage bucket (500MB private), list_platform_datasets() RPC,
   list_feed_status() RPC, updated_at triggers, lse-ohlcv-daily seed row.
8. `2026_08_22_ollama_byok.sql` — Ollama as second BYOK provider
   (APPLIED to production 2026-08-22 via Supabase MCP; {"success":true})
   Expands provider CHECK (deepseek|ollama) on user_api_keys + agent_runs;
   updates save_user_api_key with URL validation; adds list_user_api_key_statuses()
   RPC; updates start_agent_run/start_swarm_run/start_shadow_run gates.
9. `2026_08_23_multi_provider_byok.sql` — Multi-provider BYOK (catalog-driven)
   (APPLIED to production 2026-08-23 via Supabase MCP execute_sql, 3 parts)
   Opens web BYOK to all 23 key/URL providers from the engine's
   llm_providers.json (excludes the 2 OAuth/gh_cli providers: openai-codex,
   copilot). Adds llm_provider_catalog table + list_supported_llm_providers() RPC
   (single source of truth for worker + frontend); expands both provider FKs
   (replaces old CHECK constraints); rewrites save_user_api_key with generic
   catalog-driven validation (non-empty secret for key-type, http(s) URL for
   url-type); adds user_llm_prefs + get/set_selected_provider RPCs (per-user
   active provider); adds resolve_run_provider() helper; start_*_run gates
   resolve + record the selected provider on agent_runs.provider;
   claim_agent_run now returns run_provider. Worker: catalog.py + generalized
   _build_env + provider resolver wired in main.py. Frontend: catalog-driven
   ProviderByok component replaces the hardcoded DeepSeek/Ollama sections in
   AccountSettings; Agent gate uses getSelectedProvider().

Do not edit applied migrations; write new numbered files. The admin migration's
rollback block is a comment — copy it out if a rollback is ever needed.
