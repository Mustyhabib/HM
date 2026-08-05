# Decision Log

Format:

```text
[YYYY-MM-DD] Decision: ...
Reason: ...
Alternatives considered: ...
```

---

```text
[2026-08-05] Decision: The worker invokes Tradi as a subprocess per run
  (`vibe-trading run -p "<prompt>" --json --max-iter N`), not as an
  in-process Python import and not as a full container-per-run at MVP.

Reason:
  - Tradi's own config layer is process-global, not multi-tenant-aware:
    `agent/src/config/accessor.py` caches a single `EnvConfig` singleton
    per process (`get_env_config()`), and persistent memory
    (`agent/src/memory/persistent.py: MEMORY_BASE = Path.home() /
    ".vibe-trading" / "memory"`) resolves from the OS `HOME` env var at
    import/call time. Importing Tradi in-process inside a long-lived
    worker would mean every tenant's run shares that process's global
    state unless we serialize execution and reset the singleton between
    every single call — fragile, and an easy way to leak one user's
    memory/session data into another user's run.
  - Running each use as its own OS subprocess gets real isolation for
    free: setting `HOME` (and/or `VIBE_TRADING_HOME`) per subprocess
    redirects config, sessions, runs, uploads, and persistent memory to
    an isolated per-run temp directory with zero engine code changes.
    A crashed or runaway run can't take the worker process down or
    affect a concurrent tenant's run.
  - `vibe-trading run -p "..." --json --max-iter N` already exists as a
    non-interactive, single-shot, machine-readable entry point
    (`agent/cli/_legacy.py` run subparser) — no engine patching needed
    to get a clean worker integration point.
  - Full container-per-run (Docker sibling containers on the worker
    host) would add a stronger sandbox (network egress control,
    filesystem jail, cgroup resource limits) but is more DevOps surface
    than a solo dev needs to stand up before validating the product.
    `CLAUDE.md` explicitly says to avoid heavy DevOps burden at MVP and
    upgrade only when real usage justifies it.

Alternatives considered:
  - In-process import of Tradi's agent loop into the worker. Rejected:
    the global-singleton/`Path.home()` behavior above makes this unsafe
    for concurrent multi-tenant execution without invasive changes to
    Tradi itself, which we've committed to treating as a vendored
    dependency we patch minimally, not rewrite.
  - Container-per-run (Docker) from day one. Rejected for MVP only on
    cost/complexity grounds, not safety — it's the documented upgrade
    path once usage or abuse risk justifies the extra ops burden (see
    `docs/ARCHITECTURE.md` "Future hardening").
  - Reusing Tradi's own `vibe-trading serve` FastAPI server as a shared
    multi-tenant backend. Rejected: it's built around the same
    process-global state and a single local user's session/run history,
    not per-tenant scoping — using it directly would require the same
    isolation problem solved twice (once for it, once for our own API).
```

---

```text
[2026-08-05] Decision: Vendor Tradi (the engine) directly into the HM repo
  as tracked files under `Tradi/`, not as a separate sibling repo pulled at
  build time.

Reason:
  - The original `.gitignore` (commit e943c08) excluded `/Vibe-Trading/`
    and described the engine as a sibling checkout pinned to a commit/tag,
    pulled at worker build time. This was reversed in the same session
    (commit f78487a) to a full vendor: the engine's 2,050 files are tracked
    directly under `Tradi/`, the exclusion rule was dropped, and all
    downstream docs (`PROJECT_BRIEF.md`, `ARCHITECTURE.md`, `CLAUDE.md`)
    were written assuming the vendored layout.
  - Full vendoring is the simpler model for a solo dev: one repo, one
    clone, one `git log`, no build-time fetch step that can break, no
    pinned-commit coordination between two repos. The worker Dockerfile /
    deploy script can just `COPY Tradi/ /app/Tradi/` — no git-clone-at-
    build-time, no deploy key, no submodule.
  - MIT license permits this; the only obligation is keeping
    `Tradi/LICENSE` and `Tradi/NOTICE` intact (verified present).
  - Trade-off: every clone pulls ~13 MB of binary marketing assets
    (`Tradi/assets/`, `Tradi/wiki/assets/`). Acceptable at this scale;
    if clone size becomes a problem later, those assets can be moved to
    LFS or stripped without affecting the engine's runtime code.

Alternatives considered:
  - Sibling-repo with gitignored local checkout, pinned at build time
    (the original plan from commit e943c08). Rejected: adds a second repo
    to coordinate, a deploy-key or PAT for the worker's build step, and a
    pinned-commit file to keep in sync — none of which is justified when
    the engine is MIT and the SaaS wrapper is the only consumer.
  - Git submodule. Rejected: submodules add cognitive overhead and CI
    complexity disproportionate to the benefit for a solo-dev project with
    one consumer of one dependency.
```
