# Skill: the agent worker

Implements the subprocess-per-run pattern decided in `docs/DECISIONS.md`
(2026-08-05) and diagrammed in `docs/ARCHITECTURE.md`. Read both before
changing this — the shape here isn't arbitrary, it's a direct consequence
of `Tradi`'s config being a process-global singleton
(`Tradi/agent/src/config/accessor.py`) and its persistent memory resolving
off `Path.home()` (`Tradi/agent/src/memory/persistent.py`).

## Claim loop

```python
def claim_next_run(conn) -> Run | None:
    row = conn.execute("""
        update agent_runs
        set status = 'running', claimed_by = %s, claimed_at = now(), started_at = now()
        where id = (
            select id from agent_runs
            where status = 'queued'
            order by created_at
            for update skip locked
            limit 1
        )
        returning *
    """, (worker_instance_id,)).fetchone()
    return row
```

`SKIP LOCKED` is what lets multiple worker instances poll the same table
safely without a separate lock/queue service — this is the "Postgres-only
quota is acceptable for early MVP" simplicity `CLAUDE.md` explicitly allows.

## Invoking Tradi

```python
import subprocess, os, shutil, tempfile

def run_agent(run: Run) -> RunResult:
    run_home = f"/var/vibe-runs/{run.id}"
    os.makedirs(run_home, exist_ok=True)

    env = {
        # Minimal explicit env — do NOT inherit the worker's full
        # environment wholesale, and never add broker/OAuth/shell-tool
        # vars here (CLAUDE.md safety rules 3 & 4).
        "HOME": run_home,
        "VIBE_TRADING_HOME": run_home,
        "VIBE_TRADING_ALLOWED_RUN_ROOTS": run_home,
        "PATH": os.environ["PATH"],
        # LLM provider key(s) only — nothing else from the worker's env.
        "LANGCHAIN_PROVIDER": os.environ["LANGCHAIN_PROVIDER"],
        "DEEPSEEK_API_KEY": os.environ["DEEPSEEK_API_KEY"],  # or whichever provider
    }

    try:
        proc = subprocess.run(
            ["vibe-trading", "run", "-p", run.prompt, "--json", "--max-iter", str(run.max_iter)],
            env=env,
            capture_output=True,
            text=True,
            timeout=run.wall_clock_timeout_seconds,  # worker-enforced; Tradi has no overall-run timeout
        )
    except subprocess.TimeoutExpired:
        return RunResult(status="timeout", refundable=True)

    if proc.returncode != 0:
        return RunResult(status="failed", refundable=True, error=proc.stderr[-4000:])

    result = json.loads(proc.stdout)
    artifacts = collect_artifacts(run_home)  # walk the workspace for report/chart files
    return RunResult(status="completed", result=result, artifacts=artifacts)
    # Caller is responsible for shutil.rmtree(run_home) after artifacts are
    # uploaded — don't delete before upload, don't skip deletion after.
```

Notes that matter here specifically:

- **Timeout is the worker's job.** `TIMEOUT_SECONDS` (Tradi, default 120s)
  caps a single LLM call; `VIBE_TRADING_TOOL_TIMEOUT_SECONDS` (default
  1800s) caps a single tool call. Neither caps the whole run. Pick
  `run.wall_clock_timeout_seconds` deliberately per `docs/30_DAY_PLAN.md`
  Day 27 — don't leave it at some inherited default.
- **`subprocess.TimeoutExpired` and non-zero exit are both refundable**
  (system-caused) — route both to `refund_agent_run` (see
  `.claude/skills/quota-enforcement.md`), not just one of them.
- **Don't reuse `run_home` across runs.** Even for the same user — MVP
  scope is fully ephemeral per-run isolation (`docs/ARCHITECTURE.md` →
  "Deferred: persistent per-user memory"). Reusing it defeats the isolation
  this whole design exists for.
- **Never pass through the worker's full `os.environ`.** Build `env`
  explicitly as shown — an inherited stray var is exactly how a
  shell-tool-enabling or broker-credential env var ends up reaching Tradi
  by accident.

## On completion

Update `agent_runs.status`, insert `agent_artifacts` rows (after upload to
Supabase Storage, signed-URL-only per `.claude/skills/supabase-rls.md`),
call `refund_agent_run` if applicable, then delete `run_home`.
