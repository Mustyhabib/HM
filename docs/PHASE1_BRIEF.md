# PHASE 1 BRIEF — Foundation (research governance substrate + FastAPI monolith)

> **Status:** build brief, ready for the architect→coder→tester→ceo pipeline.
> **Sequencing (R1-Q1):** Phase 1 builds **after the Nigeria MVP launch**. Branch:
> `upgrade/phase-1-foundation` off `main`. Docs commits stay on main.
> **Decisions locked in (UPGRADE_ROADMAP.md §4, grilling R1–R3):** same Railway container
> (two processes) · research domain only · registry in same Supabase Postgres · provenance
> captured by **both** worker and FastAPI · capture-first (pre-registration UX = Phase 4) ·
> minimal `projects` table with auto-default · Redis skeleton on free tier (Upstash),
> minimal + measured · Stripe deferred · **the live run loop never breaks** (strangler-fig).

---

## 1. Problem statement

Runs today produce results with **no persistent provenance** — a completed `agent_runs`
row says *what* happened, not *why it should be trusted*, on what data/params/code, or
how it relates to a hypothesis. The platform cannot answer *"why was model v47 promoted?"*
and cannot stop repeated search on the same historical period from contaminating evidence
(the #1 research-overfitting risk). Phase 1 lays the **scientific substrate**: a
tenant-scoped, persistent experiment/hypothesis/dataset registry + provenance capture on
every run — behind a new FastAPI modular monolith — **without changing any live path**.

## 2. Scope

**IN:** `projects`, `hypotheses`, `experiments`, `dataset_registry`, `promotion_events`
tables + RLS · default-project trigger + backfill · worker-side provenance capture ·
FastAPI app (research domain: registry CRUD + provenance API + health) · Supabase JWT auth ·
two-process container · Upstash Redis skeleton (health + queue smoke, fail-open).

**OUT (explicitly not this phase):** pre-registration UI (Phase 4) · promotion-ladder UX
(Phase 4) · dataset ingestion (Phase 2) · Redis replacing the Postgres queue (deferred) ·
Stripe · ML/RL · any change to `Tradi/` engine internals · any change to existing RPCs
(`start_agent_run`/`start_swarm_run`/`start_shadow_run`) · engine `api/` exposure to the web.

## 3. Architecture overview

```text
Browser (existing SPA) ── Supabase (unchanged: auth, agent_runs, storage, RLS)
        │
        └── NEW: FastAPI modular monolith (platform/, port 8000, same Railway container)
              domains/research: hypotheses · experiments · datasets · promotion
              core: config · jwt (Supabase JWKS) · postgrest (service-role) · redis (fail-open)
        │
Worker (existing hm-worker, :9100, same container)  ── MODIFIED: provenance capture
        └─ on run completion → insert experiments row (service-role, tenant-scoped)
```

- **Auth:** FastAPI validates Supabase JWTs (JWKS from
  `https://wqjdumforbalfmtawwpg.supabase.co/auth/v1/.well-known/jwks.json`). `sub` = user id.
- **Tenancy:** app uses the **service-role key via PostgREST** (same pattern as the worker;
  no DB-password secret needed) and **enforces `user_id = jwt.sub` in every query**. RLS on
  the tables stays as defense-in-depth for direct Supabase access. **JWT validation is the
  tenant boundary — test it like a security feature.**
- **Provenance (both paths, R2-Q5):** worker writes lifecycle provenance on completion
  (service-role insert); FastAPI records API-driven events (manual experiment registration,
  status transitions → `promotion_events`).
- **Redis (R1-Q5):** Upstash REST API, health probe + queue smoke only. **Fail-open:** any
  Redis error logs a warning and never blocks the loop.

## 4. Data contracts (SQL — new migration, applied MANUALLY after code ships)

File: `vibe-trading-saas/db/migrations/2026_08_21_phase1_registry.sql` (plus a commented
rollback section, repo convention). Additive only.

```sql
-- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Default Project',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects(user_id);
create unique index projects_one_default_per_user on public.projects(user_id) where is_default;
alter table public.projects enable row level security;
create policy projects_select on public.projects for select using (user_id = auth.uid());
create policy projects_insert on public.projects for insert with check (user_id = auth.uid());
create policy projects_update on public.projects for update using (user_id = auth.uid());

-- auto-default per NEW user
create or replace function public.ensure_default_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.projects (user_id, name, is_default)
  values (new.id, 'Default Project', true)
  on conflict (user_id) where is_default do nothing;
  return new;
end $$;
create trigger trg_ensure_default_project
after insert on public.profiles
for each row execute function public.ensure_default_project();

-- backfill EXISTING users (one-time, in the same migration)
insert into public.projects (user_id, name, is_default)
select id, 'Default Project', true from public.profiles
on conflict (user_id) where is_default do nothing;

-- hypotheses
create table public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  statement text not null,
  falsifiable_criterion text,
  status text not null default 'proposed'
    check (status in ('proposed','accepted','rejected','tested')),
  created_at timestamptz not null default now()
);
-- RLS: user_id = auth.uid() (select/insert/update), as projects above.

-- experiments (the provenance record; contract from UPGRADE_ROADMAP.md §9)
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  hypothesis_id uuid null references public.hypotheses(id) on delete set null,
  agent_run_id uuid null references public.agent_runs(id) on delete set null,
  dataset_version text, feature_version text, strategy_version text, model_version text,
  parameter_set jsonb,
  train_period text, validation_period text, test_period text,   -- ISO ranges, null for now
  cost_model jsonb, slippage_model jsonb,
  random_seed bigint, code_commit text, data_hash text,
  status text not null default 'candidate'
    check (status in ('candidate','validated','paper','shadow','approved','live','rejected')),
  result jsonb,
  created_at timestamptz not null default now()
);
-- RLS: user_id = auth.uid() (select/insert/update own rows).

-- dataset_registry (read-mostly; Phase 2 populates)
create table public.dataset_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete cascade,  -- null = platform-shared
  provider text not null, venue text, universe jsonb, asset_class text, frequency text,
  timezone text, timestamp_semantics text, coverage_period text,
  adjustment_policy text, corporate_action_policy text,
  pit_capability boolean not null default false,
  license text, version text not null default '1.0.0',
  quality_score numeric, data_hash text, storage_path text,
  created_at timestamptz not null default now()
);
-- RLS: select where user_id = auth.uid() OR user_id is null; insert with check user_id = auth.uid().

-- promotion_events (audited status transitions)
create table public.promotion_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  from_status text not null, to_status text not null,
  actor_id uuid null references public.profiles(id),
  reason text, created_at timestamptz not null default now()
);
-- RLS: select/insert user_id via owning experiment (or service-role only; simplest:
-- zero user policies, writes via service-role RPC — see contract below).
```

RPC (SECURITY DEFINER, service-role callable) for status transitions so `promotion_events`
is only writable through one audited path:

```sql
create or replace function public.record_experiment_status(
  p_experiment_id uuid, p_to_status text, p_reason text default null, p_actor_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  select status into v_from from public.experiments where id = p_experiment_id for update;
  if v_from is null then raise exception 'experiment not found'; end if;
  update public.experiments set status = p_to_status where id = p_experiment_id;
  insert into public.promotion_events (experiment_id, from_status, to_status, actor_id, reason)
  values (p_experiment_id, v_from, p_to_status, p_actor_id, p_reason);
end $$;
-- revoke from anon/authenticated; grant to service_role only.
```

## 5. Worker provenance capture (MODIFY `vibe-trading-saas/worker`)

- New module `src/hm_worker/provenance.py`: builds the `experiments` insert for a completed
  run. Field mapping (what exists today; rest null until their phases land):
  - `user_id`/`project_id` — from the run; project = the user's default project (lookup;
    insert lazily if missing)
  - `agent_run_id` — run id; `parameter_set` = `{kind, max_iter, preset_name, user_vars}`
  - `code_commit` — engine commit constant (`1907e47`) + worker package version
  - `data_hash` — `sha256(prompt + canonical(attachments))` (deterministic → duplicate detection)
  - `status` — `'candidate'` (a run is evidence, not validation); `result` =
    `{run_status, error_message, artifact_count, completed_at}`
- Wire into `runner.py` completion path (completed/failed/timeout all captured).
- Env flag `WORKER_PROVENANCE_ENABLED` (default `true`; `false` = instant rollback).
- Uses the existing service-role client (`db.py`) — no new secrets. Hermetic tests with the
  db client mocked (`worker/tests/test_provenance.py`).

## 6. FastAPI modular monolith (NEW — `platform/` at repo root, NOT inside `Tradi/`)

```text
platform/
 ├── pyproject.toml            # fastapi, uvicorn, pydantic v2, pydantic-settings,
 │                             # PyJWT[crypto], httpx, pytest, pytest-asyncio
 ├── app/
 │   ├── main.py               # create_app(); /health (no auth); mounts api/v1
 │   ├── core/
 │   │   ├── config.py         # pydantic-settings: SUPABASE_URL, SERVICE_ROLE_KEY, PLATFORM_PORT
 │   │   ├── security.py       # get_current_user dependency: Bearer JWT → verify via Supabase
 │   │   │                     #   JWKS (cached, PyJWKClient) → sub = user_id; 401 on any failure
 │   │   └── db.py             # PostgREST client (httpx) with service-role key; tenant-scoped
 │   └── domains/
 │       └── research/
 │           ├── router.py     # /api/v1/... endpoints
 │           ├── schemas.py    # pydantic request/response models
 │           └── service.py    # tenant-scoped queries (user_id injected everywhere)
 ├── tests/                    # hermetic; mock httpx postgrest + JWKS
 └── README.md                 # run/verify instructions
```

Endpoints (response envelope `{"data": ..., "error": null}`; auth on everything except `/health`):
- `GET /health` — liveness
- `GET /api/v1/projects` · `POST /api/v1/projects` — list/create (default first)
- `GET /api/v1/experiments?project_id=` — list own (join agent_runs kind/status)
- `POST /api/v1/experiments` — manual registration (validates ownership of hypothesis/run)
- `GET /api/v1/experiments/{id}` — detail
- `PATCH /api/v1/experiments/{id}/status` — audited transition → `record_experiment_status`
- `GET/POST /api/v1/hypotheses` · `GET /api/v1/hypotheses/{id}`
- `GET /api/v1/datasets` (own + shared) · `POST /api/v1/datasets`

## 7. Two-process container + Redis skeleton

- `scripts/start.sh` (NEW): starts uvicorn (`platform.app.main:app`, port `PLATFORM_PORT`=8000)
  + `hm-worker`; traps SIGTERM and drains both (worker already drains on SIGTERM). Docker CMD
  and `railway.toml startCommand` switch to `scripts/start.sh`. Railway health probe stays on
  worker `:9100` (one probe per service — do not move it).
- Upstash Redis (free): env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; module
  `platform/app/core/redis.py` — health (`SET probe` + `GET`) + queue smoke (`RPUSH/LPOP`
  probe list with TTL). **Fail-open:** exceptions logged, never raised to the request path.
- Env additions (worker `.env.example` + Railway): `PLATFORM_PORT`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`, `WORKER_PROVENANCE_ENABLED`.

## 8. Done criteria (the six — all must pass)

1. **Every completed run auto-writes a tenant-scoped provenance record** (worker path;
   verify by running a real run, then `SELECT` the `experiments` row via the API).
2. **FastAPI research API exposes the registry behind Supabase JWT** (no-auth → 401;
   cross-tenant probe → empty/403).
3. **uvicorn + worker loop run in ONE Railway container** (deploy `upgrade/phase-1-foundation`,
   both ports healthy, loop E2E green).
4. **Redis skeleton up** — health + queue smoke pass; **Redis outage does not break the loop**
   (stop Redis → API still serves, worker still runs).
5. **Run loop E2E green** (prompt → queued → claim → engine → artifacts → completed) —
   unchanged behavior.
6. **Suites pass**: worker 74 (+ new provenance tests) · frontend build + 261/265 (4
   pre-existing Layout flake — do NOT chase) · engine `pytest --ignore=agent/tests/e2e_backtest -q`.

## 9. Verification recipe (tester + ceo)

1. `cd vibe-trading-saas/worker && env -u PYTHONPATH -u VIRTUAL_ENV .venv/bin/python -m pytest -q`
2. `cd platform && env -u PYTHONPATH -u VIRTUAL_ENV .venv/bin/python -m pytest -q` (new suite)
3. `cd Tradi/frontend && npm run build` (frontend untouched — must still pass)
4. Migrations applied to Supabase (manual, AFTER code ships): `2026_08_21_phase1_registry.sql`
5. Real E2E run → provenance row exists → read back via `GET /api/v1/experiments` with a real JWT
6. Cross-tenant probe: user B's token cannot see user A's experiments
7. `gh api repos/Mustyhabib/HM/commits/<sha>/status` → Vercel + Railway green (deploy checks)

## 10. Rollback (all additive — instant)

- `WORKER_PROVENANCE_ENABLED=false` stops provenance writes (loop unaffected).
- Stop uvicorn only → worker keeps running (strangler-fig: the loop never depended on it).
- Drop the Phase 1 tables via the migration's rollback section (no data loss for live paths).

## 11. Risks / edge cases

| Risk | Mitigation |
|---|---|
| JWT validation leak → cross-tenant exposure | JWKS-verified + exp-checked; test matrix: valid/expired/malformed/foreign-issuer; **the tenant boundary** |
| Migration ordering (code-first, manual apply) | Repo convention: push code → then apply SQL; verify RPC grants (service-role only) |
| Existing users lack a project | Backfill in the migration + lazy insert in the worker path |
| Two-process container: SIGTERM/drain | `start.sh` traps and drains both; worker already drains claims on SIGTERM |
| Redis outage | Fail-open (logged, never blocking) — the queue is still Postgres |
| Engine `api/` accidentally exposed | Out of scope; platform FastAPI is the only new web surface |
| Vendored engine drift | No `Tradi/` edits in this phase |

## 12. Handoff notes for the pipeline

- Architect: read this brief + `UPGRADE_ROADMAP.md` §9 + `docs/UPGRADE_INVENTORY.md` §E;
  produce the design doc (component tree, data flow, interface contracts, acceptance).
- Coder: implement per design; **no `Tradi/` edits**; keep migrations additive; follow the
  existing worker patterns (service-role client, hermetic tests, black-clean).
- Tester: the six done-criteria + the cross-tenant probe are the gate.
- CEO: approve only with all six green + deploy checks green; update CLAUDE.md sprint tracker.
