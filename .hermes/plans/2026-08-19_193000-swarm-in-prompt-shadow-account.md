# Swarm-in-Prompt + Shadow Account — Implementation Plan

> **For Hermes:** execute via the hermes-claude-pipeline skill (Architect=Hermes → Coder=Claude Code → Tester=Hermes → Reviewer=Claude Code → CEO=Hermes). No code written in plan mode.

**Goal:** (A) Move swarm launch from the separate `/teams` page into the Agent prompt box via a "+" button; (B) resurface the upstream Shadow Account feature (broker-journal → behavior profile → shadow backtest report) as a first-class HM run kind.

**Architecture:** Both features are thin product layers over engine capabilities that ALREADY exist in the vendored fork (`Tradi/`): the agent has `swarm_tool.py` + 30 presets + CLI `--swarm-run`, and shadow account ships as `shadow_account_tool.py` / `trade_journal_tool.py` / `trade_journal_parsers.py` / `block_trades_tool.py` + skills + CLI `--upload`. Feature A is frontend-only. Feature B adds a DB kind + RPC + worker branch + frontend upload/run/render path.

**Tech Stack:** React 19 + Vite + TS (Tradi/frontend), Supabase RPCs + Storage, Python worker (vibe-trading-saas/worker), Postgres migrations, Paystack tier gates.

---

# Phase 1 — Feature A: "+" swarm picker in the Agent prompt box

## Context (verified 2026-08-19)
- `pages/Teams.tsx` (route `/teams`): 30 presets from `SWARM_PRESETS` (catalogue in `lib/swarm.ts`), category filter + search, vars form, `startSwarmRun(preset.name, vars)` → RPC `start_swarm_run` → `navigate(/run/${id})`.
- `pages/Agent.tsx`: single metered prompt box; `startRun(prompt, {attachments})` → RPC `start_agent_run` (kind `single`). No swarm surface.
- Engine already supports swarm-from-prompt: `agent/src/tools/swarm_tool.py` is in the agent registry; system prompt advertises "29 multi-agent swarm teams". A user can ALREADY type "use the equity research team to analyze NVDA" — the "+" is the discoverability affordance + replaces the page.
- Gate: `start_swarm_run` RPC enforces Pro/Premium — unchanged.

## Design (single decision, no alternatives — design-system rule)
- `Agent.tsx` prompt box gets a **"+" icon button** immediately left of the send button.
- Clicking toggles an **inline expandable panel directly above the prompt box** (not a modal): category filter chips + search + the preset-card grid, reusing the exact components/styling from `Teams.tsx` (same cards, same CATEGORY_LABEL/CATEGORY_ICON, same vars form pattern).
- Selecting a preset → vars form inline → "Start swarm" → `startSwarmRun` → navigate to `/run/:id`. The prompt box's own text is left untouched (a swarm preset carries its own prompts).
- `pages/Teams.tsx` is **removed**; route `/teams` → **redirect to `/agent`**; the Teams entry is removed from the nav/layout. Pricing copy stays (swarm = Pro+).
- The Agent page's existing plan-gate/blocked states also apply to the swarm panel (same `starting`/`blocked` guards).

## Files
- Create: `Tradi/frontend/src/components/chat/SwarmPresetPicker.tsx` (extracted from Teams.tsx: search + category filter + grid + vars form)
- Modify: `Tradi/frontend/src/pages/Agent.tsx` ("+" button, panel state, wire `startSwarmRun`)
- Modify: `Tradi/frontend/src/pages/Teams.tsx` → deleted; `Tradi/frontend/src/router.tsx` (`/teams` → `<Navigate to="/agent" replace />`); nav component that links "Teams" (find via grep — likely `layout/`); `Tradi/frontend/src/lib/__tests__/swarmStatus.test.ts` unchanged
- Tests: `npm run build` (tsc + vite) must pass; vitest suite still green

## Validation
1. `cd Tradi/frontend && npm run build` — exit 0
2. `npm run test:run` — no regressions
3. Manual (dev server): "/" shows no Teams nav entry; /teams redirects to /agent; "+" opens panel; Pro account starts a swarm → /run/:id renders; Starter account sees the plan-gate message.

---

# Phase 2 — Feature B: Shadow Account (resurfaced)

## Context (verified 2026-08-19)
- Engine-side feature is COMPLETE in the fork: `agent/src/tools/shadow_account_tool.py`, `trade_journal_tool.py`, `trade_journal_parsers.py` (同花顺/东方财富/富途/generic CSV), `block_trades_tool.py`; skills `shadow-account`, `trade-journal`; CLI `--upload FILE_PATH` + `cmd_upload`; upstream flow: `vibe-trading --upload trades.csv` then `run -p "Analyze my trading behavior, extract my shadow strategy, and compare it with my actual trades"` → 8-section HTML/PDF report (rule violations, early exits, missed signals, counterfactual trades).
- NOT wired into HM: no run kind, no RPC, no frontend, worker never mounts journals.
- Known risk: the worker's swarm branch already notes "No --json envelope (yet)" — the shadow branch must verify CLI output parsing (JSON envelope or exit-code + artifact glob).

## Design
**DB** (new migration `vibe-trading-saas/db/migrations/2026_08_19_shadow_accounts.sql`, applied manually):
- `agent_runs.kind` CHECK gains `'shadow'` (check the existing constraint in `2026_08_11_agent_teams_uploads.sql`; ALTER to add the value — Postgres CHECK ALTER = drop + re-add constraint)
- New RPC `start_shadow_run(p_prompt, p_journal_paths jsonb, p_max_iter, p_idempotency_key)` — SECURITY DEFINER, search_path pinned, same gate order as `start_agent_run` (auth → active subscription → BYOK key) + **Premium tier** (reuses the existing attachment-upload gate — journal IS an upload; no new carve-out)
- Insert `agent_runs` with `kind='shadow'`, `attachments` = journal file paths from Storage (agent-uploads bucket), `preset_name` NULL

**Worker** (`vibe-trading-saas/worker/src/hm_worker/`):
- `runner.py`: new `kind == 'shadow'` branch — download journal file(s) from Storage into the run dir (reuse artifact-mount logic), command ≈ `[vibe-trading, --upload, <journal>, run, -p, <prompt or default shadow prompt>, --json, --no-rich, --max-iter, N]` — verify exact CLI arg order against `agent/cli/_legacy.py` (cmd_upload + run subcommand composition) during Coder phase
- `artifacts.py`: ensure shadow outputs (HTML/PDF report, extracted rules) are globbed + uploaded to `agent-artifacts`
- `db.py`: `Run` dataclass + row mapping already carries `kind`/`attachments`/`preset_name` — confirm no changes beyond kind

**Frontend:**
- The Agent page "+" panel gains a second entry: **"Shadow Account — analyze my trading"** (chip/section in the same picker panel; keeps one design system)
- Flow: choose journal file (CSV/XLSX — reuse existing upload component + Premium gate) → upload to `agent-uploads` → optional prompt (default: upstream's canonical shadow prompt) → `startShadowRun` (lib/shadow.ts, mirrors `swarm.ts`) → navigate `/run/:id`
- `RunView`: render shadow artifacts — HTML report inline preview + PDF download link (artifact kinds: `report_html`, `report_pdf`, `shadow_rules` — align with what the engine writes)
- Nav/pricing: shadow listed under Premium capabilities on Pricing page

## Files
- Create: `vibe-trading-saas/db/migrations/2026_08_19_shadow_accounts.sql`
- Modify: `vibe-trading-saas/worker/src/hm_worker/runner.py`, `artifacts.py` (+ tests in `tests/` — command construction, journal download, artifact glob)
- Create: `Tradi/frontend/src/lib/shadow.ts`, `Tradi/frontend/src/components/chat/ShadowUploadPanel.tsx`
- Modify: `Tradi/frontend/src/pages/Agent.tsx` (panel entry), `Tradi/frontend/src/pages/RunView.tsx` (artifact render), `Tradi/frontend/src/pages/Pricing.tsx` (capability line), router if needed
- Engine: NO changes expected (feature exists) — Tester verifies the CLI compose path; if `--upload` + `run` don't compose, that's an engine-side fix routed through Reviewer

## Validation
1. Migration applied to `wqjdumforbalfmtawwpg` (manual, per repo rule) — constraint + RPC present
2. Worker tests: `cd vibe-trading-saas/worker && env -u PYTHONPATH -u VIRTUAL_ENV .venv/bin/python -m pytest -q` (74 existing + new shadow tests) — all pass
3. Local engine smoke: `WORKER_EXECUTE_TRADI=true` run of a shadow run with a sample journal CSV → completed run, report artifacts in Storage
4. Frontend: `npm run build` green; manual: Premium user uploads journal → shadow run → report renders in RunView; Starter/Pro user blocked by gate
5. RPC integration: `start_shadow_run` via service role — gate order verified (no sub → error; no key → error; suspended → account_suspended)

---

# Pipeline workflow (hermes ↔ claude chainlink)

| Stage | Agent | Input → Output | Tooling |
|---|---|---|---|
| 1. Architect | **Hermes** | user intent → design doc (this plan, per phase) | read-only repo inspection |
| 2. Coder | **Claude Code** (sonnet, `--permission-mode bypassPermissions --max-turns 80`) | design doc ONLY → implementation + files + deviations | `claude -p` in `/home/aurora/HM` (loads CLAUDE.md) |
| 3. Tester | **Hermes** | code → PASS / bug report ([BUG]/[EDGE]/[PERF]/[STYLE]) | worker pytest, `npm run build`, RPC smoke |
| 4. Reviewer | **Claude Code** (sonnet) | bug report ONLY → fix + notes | `claude -p`, max 3 debate rounds |
| 5. CEO | **Hermes** | final review → APPROVED/REVISION → deliver + plan ahead | review + minor behavior-preserving fixes |

- **Run order:** Phase 1 pipeline → user review → Phase 2 pipeline → user review. (Phase 1 is a fast frontend win; Phase 2 is full-stack.)
- **Handoff rules:** one artifact per handoff; strict isolation; `[BUG]`/`[EDGE]` must fix, `[PERF]`/`[STYLE]` debatable; 3-round cap then escalate.
- **Commit discipline:** per-task commits from Coder; Tester/CEO do not commit engine-adjacent changes without the repo's DCO rule (this repo: no AI-attribution trailers — only `Signed-off-by:` if community; HM repo commits follow the `docs(claude)`/`fix(worker)` conventions seen in history).

# Risks & open questions

1. **CLI compose risk (Phase 2):** `--upload` + `run` composition and `--json` envelope for shadow runs unverified — Tester must prove it locally before the RPC goes live; fallback = exit-code scraping like the swarm branch.
2. **Tier gating:** decided Premium for shadow (reuses upload gate). If you'd rather Pro, the upload gate needs a carve-out — say so and I'll amend.
3. **/teams redirect:** keeping a redirect for bookmarks (decided) — zero-cost, avoids 404s.
4. **Kind CHECK constraint:** must confirm exact constraint text in `2026_08_11_agent_teams_uploads.sql` before writing the migration (Coder step 1 reads it).
5. **Worker command env:** shadow runs need the same isolated HOME + BYOK injection as existing kinds — reuse `_command` builder (runner.py:498 area).
