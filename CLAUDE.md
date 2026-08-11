# H~Mltd — Root CLAUDE.md

This is the single-source-of-truth CLAUDE.md for the H~Mltd multi-user trading research platform. It works in concert with `~/.claude/CLAUDE.md` (global orchestration rules) and the sub-project CLAUDE.mds.

**Global rules** (from `~/.claude/CLAUDE.md`) apply always: I am Auroras, the orchestrator. You are my strategic executor. Decompose, delegate, synthesize, deliver. Suggest one next step. Never proceed autonomously. Use the Architect→Coder→Tester→CEO pipeline when building from scratch.

This file defines everything ELSE: the product, the domain, the architecture, the design, and what's already been decided vs what you need to figure out.

---

## Project Identity

| Field | Value |
|-------|-------|
| **Brand** | H~Mltd |
| **Product** | Multi-user SaaS AI trading research platform |
| **Elevator pitch** | Users subscribe, ask trading questions in natural language, and get AI-powered backtested analysis — no live execution at MVP |
| **Repo** | `/home/aurora/HM` |
| **Sprint** | Day 7 of 30 |
| **Solo dev** | Yes — keep it simple, boring tech, cost-conscious |

---

## Domain Model (Ubiquitous Language)

These are the canonical terms. Use them consistently. If you need to add a term, update `.wiki/pages/project-overview.md` and flag it.

### Core Entities

| Term | Definition | DB Table |
|------|------------|----------|
| **User** | Authenticated person with a subscription plan. Owns all their data. | `profiles` |
| **Plan** | Subscription tier: Starter (3 runs), Pro (7), Premium (15). Defines monthly run quota. | `plans` |
| **Subscription** | Active billing relationship between a User and a Plan. Tracks Paystack subscription code, status, period. | `subscriptions` |
| **Usage Period** | The current billing month for a subscription. Has a run allowance and a consumed count. | `usage_periods` |
| **Usage Event** | Immutable record of one consumed run. Created atomically when a run is claimed. | `usage_events` |

### Agent Pipeline

| Term | Definition | DB Table |
|------|------------|----------|
| **Agent Run** | A single execution of the Tradi engine from a user's natural-language prompt. Has status, inputs, outputs, artifacts. | `agent_runs` |
| **Prompt** | The natural-language question the user submits (e.g., "Backtest a momentum strategy on BTC/USDT"). | (stored in `agent_runs.prompt`) |
| **Artifact** | A shippable output of a run: report PDF, CSV data, chart image, JSON result. Stored in Supabase Storage, referenced by signed URL. | `agent_artifacts` |
| **Run Status** | Lifecycle state: `queued` → `running` → `completed` / `failed` / `timeout` / `cancelled` |

### Billing

| Term | Definition |
|------|------------|
| **Paystack** | Sole MVP billing provider. Charges in NGN. Stripe is parked. |
| **Webhook Event** | Idempotent Paystack event (subscription created, payment success, etc.). Verified by HMAC-SHA512 signature. | `webhook_events` |
| **Refund** | System-caused failures refund the run (typed exception → policy). User-input errors do not. |
| **Plan** | Paystack Plan object + our `plans` row. Price in NGN. |
| **Billing Period** | Monthly. Unused runs do NOT roll over. Reset on billing renewal. |

### Workflow States (Per-User Lifecycle)

```
auth → billing → plan → ground → execute → validate → deliver → profile
```

| State | What it means | Implementation |
|-------|--------------|----------------|
| **auth** | User is authenticated | Supabase Auth (email/password) |
| **billing** | User has an active subscription | Paystack Plans + webhook verification |
| **plan** | User is assigned a tier with run quota | `plans` → `subscriptions` → `usage_periods` |
| **ground** | User enters a research question (prompt) | Agent page: gradient prompt box |
| **execute** | Tradi engine runs the prompt | Python worker claims `agent_runs` row, subprocess per run |
| **validate** | Run completes or fails | Status + artifacts saved, usage consumed |
| **deliver** | User views results | RunView page: report, charts, data exports |
| **profile** | User manages account, billing, history | Dashboard: settings, usage history, subscription |

### Admin Entities

| Term | Definition |
|------|------------|
| **Admin Dashboard** | Monitoring view for operators: token cost, user count, run volume, revenue. Not built yet. |
| **Token Cost** | Per-run LLM token expenditure. Tracked per `agent_runs` row. |
| **Audit Log** | Immutable record of security-relevant events. | `audit_logs` |

---

## Architecture

### System Diagram (text)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Supabase   │◀────│   Worker     │
│  React 19    │     │  PostgreSQL   │     │  Python      │
│  Vite SPA    │     │  Auth+Storage │     │  subprocess  │
│  :5899 dev   │     │  RLS + RPC   │     │  TradiRunner │
└──────────────┘     └──────────────┘     └──────┬───────┘
       │                                          │
       │  Paystack checkout                       │  vibe-trading run
       │  (hosted page)                           │  --json --max-iter
       ▼                                          ▼
┌──────────────┐                        ┌──────────────────┐
│   Paystack   │                        │   Tradi Engine   │
│  Billing     │                        │  (vendored)      │
│  Plans +     │                        │  462 alphas      │
│  Webhooks    │                        │  8 backtest eng  │
└──────────────┘                        │  24 data sources │
                                        └──────────────────┘
```

### Component Map

| Component | Path | Role |
|-----------|------|------|
| **Root CLAUDE.md** | `/home/aurora/HM/CLAUDE.md` | This file — project-wide context |
| **Tradi Engine** | `Tradi/` | Vendored Vibe-Trading (fork of HKUDS/Vibe-Trading, MIT) |
| **SaaS Docs** | `vibe-trading-saas/` | Product spec, architecture, decisions, 30-day plan |
| **Frontend** | `Tradi/frontend/` | React 19 + Vite + TypeScript + Tailwind + react-router 8 |
| **Worker** | `vibe-trading-saas/worker/` | Python worker that claims runs and invokes Tradi |
| **LLM Wiki** | `.wiki/` | Auto-updated project memory (tasks, decisions, file paths) |
| **Obsidian Vault** | `/home/aurora/Brain/hydro/` | Personal knowledge base with project notes |

### Key Architecture Decisions (all documented in `.wiki/pages/architecture-decisions.md`)

| ID | Decision | Why |
|----|----------|-----|
| D1 | Worker invokes Tradi as subprocess per run | Process-global singletons make in-process unsafe |
| D2 | Tradi vendored into HM repo | Single clone, simplified CI |
| D3 | Reuse Tradi frontend (React SPA) | Avoid second framework, leverage existing components |
| D4 | Dual layout: PublicLayout + AppLayout | Clean marketing vs app separation in one SPA |
| D5 | Job claiming in SQL (`FOR UPDATE SKIP LOCKED`) | Atomic, no Redis needed, safe with N workers |
| D6 | Crash recovery via heartbeat + guarded close | Stale runs reclaimed safely |
| D7 | Refund decision by exception type | Runner decides fault; loop applies policy |
| D8 | Paystack + NGN billing (Stripe parked) | Nigerian entity can't onboard Stripe |
| D9 | Auth store set synchronously | Prevents race between signIn and AuthGuard redirect |
| D10 | Single prompt entry point (`/agent`) | Only metered path; retired live-SSE Agent chat |

### Tech Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Frontend | React 19 + Vite + TypeScript + Tailwind 3 + react-router 8 + Zustand | Built |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage + RLS) | Built |
| Billing | Paystack (NGN) — Plans + Hosted Checkout + Webhooks | Spec'd |
| Worker | Python subprocess (`TradiRunner`) — polls `agent_runs`, invokes Tradi | Built + verified E2E |
| LLM | DeepSeek (dev) via Tradi's provider abstraction | Configured |
| Monitoring | Sentry + structured logs (planned) | Not yet |

---

## Design System — ABSOLUTE

There is **ONE design**. Claude must never deviate, never suggest alternatives, never lighten the theme. This is the law.

### Design Skills & References (installed)

These are the **tools** Claude uses to enforce the ONE design — they never change it:

| Resource | Location | How to invoke |
|----------|----------|---------------|
| **impeccable** (global skill) | `~/.claude/skills/impeccable` | Auto-triggers on UI work; `/impeccable polish|audit|critique` commands |
| **taste-skill** (global skill) | `~/.claude/skills/taste-skill` | Auto-triggers on frontend/landing/redesign work — anti-slop guard |
| **output-skill** (global skill) | `~/.claude/skills/output-skill` | Auto-triggers — prevents truncated code output |
| **awesome-design-md** (reference) | `/home/aurora/repos/design-skills/awesome-design-md/design-md/` | 74 brand DESIGN.md files (airbnb, binance, figma, stripe...) — read for *craft patterns* only, NEVER to change the H~Mltd palette |
| **ui-craft** (plugin) | enabled | Design critique/audit commands via plugin |

**Rule:** impeccable / taste-skill / awesome-design-md are craft *advisors*. The H~Mltd tokens below are the *law*. If a skill suggests a color, font, or component that conflicts with the tokens below, the tokens win. Always.

### Brand

- **Name**: H~Mltd
- **Logo**: "H~Mltd" text
- **Theme**: Dark navy and light mode.
#
### Typography

- UI: **Inter**
- Code/numbers/prices: **JetBrains Mono** (`font-mono`)

### Component Rules

- Cards: `rounded-xl border border-border bg-card p-5`
- Inputs: `bg-[#05060F] border border-border rounded-lg`
- Primary button: `gradient-bg glow-gradient text-white rounded-lg`
- Ghost button: `border border-border hover:bg-[#101730]`
- Status badges: `rounded-full px-2 py-0.5 text-xs`
- Green = profit/success ONLY. Never use green as brand color.
- Red = loss/danger ONLY.

### Don't-Even-Think-About-It Rules

- ❌ No green/teal as brand colors
- ❌ No new CSS framework (Tailwind is it)
- ❌ No changing font pairings
- ❌ Only ONE design. Claude must never offer "option A vs option B" for visuals.

---

## What's Decided vs What Claude Figures Out

### ✅ DECIDED (do not change unless I explicitly direct)

- Brand, colors, typography, component patterns
- Tech stack (React SPA, Supabase, Paystack, Python worker)
- Billing provider (Paystack NGN, Stripe parked)
- Architecture pattern (subprocess-per-run, SQL job claiming)
- Pricing tiers (Starter/Pro/Premium, NGN pricing)
- Domain model terms
- All 10 architecture decisions (D1–D10)
- Safety rules (see below)
- MVP feature set (see vibe-trading-saas/CLAUDE.md)

### 🔧 CLAUDE FIGURES OUT (you design, propose, I approve)

- Implementation details within the decided architecture
- Component structure and file organization for new features
- API route design and RPC function signatures
- Test strategy for new features
- Error handling specifics
- Performance optimizations within the stack
- Admin dashboard design (when we get there)
- Monitoring setup specifics
- Migration scripts
- CI/CD pipeline details

### ❓ OPEN QUESTIONS (need decision)

- Deployment host for the worker (Railway, Fly.io, or Hetzner)
- Redis vs Postgres-only for caching (Postgres-only for now)
- When to add Stripe as a second billing provider (after US/UK entity)
- Admin dashboard scope (what exactly to monitor)

---

## Safety Rules — NEVER VIOLATE

From `vibe-trading-saas/CLAUDE.md` and `.wiki/pages/safety-rules.md`:

1. Never put secrets in code, logs, or docs
2. Never use production Paystack keys in development
3. Never store unencrypted broker API keys
4. Never enable live trading without explicit approval
5. Never delete database tables without confirmation
6. Never bypass Row Level Security
7. Never trust client-side quota checks alone
8. Never allow one user to access another user's data
9. Never implement payment logic without webhook idempotency
10. Never make irreversible infrastructure changes without asking first
11. Every user-owned table includes `user_id`
12. Every query is user-scoped
13. Agent runs: isolated HOME per run, timeout enforced, no shared state
14. Tradi is a vendored dependency — wrap it, don't modify its behavior

---

## Obsidian Vault Integration

The Obsidian vault at `/home/aurora/Brain/hydro/` is the personal knowledge base for this project. Claude accesses it via `--add-dir`.

### Project Notes in Vault

Create and maintain these notes:

| Note | Purpose | Update When |
|------|---------|-------------|
| `[[HM - Project Dashboard]]` | Living index of the project | New milestones, phase changes |
| `[[HM - Domain Model]]` | Ubiquitous language glossary | New terms defined |
| `[[HM - Architecture]]` | High-level architecture reference | Major structural changes |
| `[[HM - Sprint Log]]` | Daily progress log | End of every session |
| `[[HM - Decisions]]` | ADR-style decision log | Every D-numbered decision |

### Vault Conventions

- Use `#hm` tag on all project notes
- Wikilinks between related notes: `[[HM - Domain Model]]`
- Frontmatter with `tags: [hm, ...]` and `date: YYYY-MM-DD`
- Dataview queries for sprint progress tracking
- Callouts for decisions: `> [!decision] D11: ...`

### .obsidian/ config

The project already has `.obsidian/` in the repo root. Obsidian opens the HM directory as a secondary vault or within the main vault. When working with project files outside the main vault path, use the filesystem directly.

---

## MCPs, Skills & Plugins

### Active (already configured)

| Resource | Type | Purpose |
|----------|------|---------|
| **Supabase MCP** | MCP | Database, Auth, Storage operations on `wqjdumforbalfmtawwpg` |
| **supabase skill** | Skill | Supabase API patterns and best practices |
| **supabase-postgres-best-practices** | Skill | PostgreSQL optimization for Supabase |
| **obsidian@obsidian-skills** | Plugin | Obsidian-flavored markdown support |

### Recommended (install when needed)

| Resource | Type | Purpose | Priority |
|----------|------|---------|----------|
| **Paystack API skill** | Skill | Paystack webhook verification, Plans, checkout integration | HIGH — billing work ahead |
| **Sentry MCP** | MCP | Error tracking and monitoring dashboard | MEDIUM — after MVP core |
| **Stripe MCP** | MCP | Future billing provider (parked) | LOW — after US/UK entity |
| **polymarket** | Skill | Prediction market data (reference for market data API patterns) | LOW — educational |

### Global Skills Available (from `~/.claude/skills/`)

These are always available and load on-demand:
- `claude-code`, `claude-code-extensions` — Claude Code orchestration
- `github-*` — GitHub workflow skills (PRs, issues, cloning, auth)
- `obsidian` — Vault read/write/search
- `plan` — Write markdown implementation plans
- `codebase-design` — Deep module design vocabulary
- `domain-modeling` — Build ubiquitous language
- `architecture-diagram` — Dark-themed SVG architecture diagrams
- `design-md` — Google DESIGN.md token specs

---

## Wiki Rules (LLM Wiki)

A project wiki lives at `.wiki/` — it tracks key decisions, file paths, and tasks. It grows as we work.

### ALWAYS update the wiki when:
1. A key decision is made → update `[[architecture-decisions]]`
2. A new file/route is created → update `[[active-file-paths]]`
3. A task is completed or started → update `[[current-tasks]]`
4. A new concept worth remembering appears → create a new page

### ALWAYS check the wiki when:
- Starting a new session → read `[[current-tasks]]`
- Looking for a file → check `[[active-file-paths]]`
- Making an architecture decision → check `[[architecture-decisions]]`

---

## Project Milestones

### 30-Day Sprint (current: Day 7)

| Week | Theme | Key Deliverables | Status |
|------|-------|-----------------|--------|
| **Week 1** (Days 1–7) | Foundation | Repo setup, Tradi vendored, Supabase schema, Auth, Landing/Pricing/Login/Signup/Dashboard, Worker E2E verified | ✅ COMPLETE |
| **Week 2** (Days 8–14) | Run Flow | Dashboard "Start a Run" wiring, RunView page, Usage history, Billing settings, Paystack integration | 🔨 IN PROGRESS |
| **Week 3** (Days 15–21) | Polish + Admin | Admin dashboard, Error handling, Monitoring, Legal pages, QA/bug fixing | ⏳ PENDING |
| **Week 4** (Days 22–30) | Launch Prep | Performance, Security audit, Deployment, Documentation, Launch checklist | ⏳ PENDING |

### Current Focus (Week 2)

1. Wire the Agent page to the worker (start_agent_run RPC → RunView)
2. Build the RunView page (status polling, artifact display)
3. Paystack Plans + Hosted Checkout integration
4. Webhook handling (idempotent, signature-verified)
5. Usage history page
6. Billing settings page

---

## Sub-Project References

| Project | CLAUDE.md | Purpose |
|---------|-----------|---------|
| **Tradi Engine** | `Tradi/CLAUDE.md` | Vibe-Trading engine: setup, architecture, tests, safety-critical surfaces |
| **SaaS Layer** | `vibe-trading-saas/CLAUDE.md` | Product spec, pricing, MVP features, stack, solo-dev constraints, billing rules |

When working inside `Tradi/`, Claude loads `Tradi/CLAUDE.md` automatically. When working on the SaaS layer, `vibe-trading-saas/CLAUDE.md` applies. This root CLAUDE.md provides the overarching context that binds them together.

---

## Session Workflow

When I start a session in this repo:

1. **You check the wiki** — read `.wiki/pages/current-tasks.md` for sprint status
2. **You check the global CLAUDE.md** — your orchestration rules are in `~/.claude/CLAUDE.md`
3. **You respect the pipeline** — if I say "Build X," run Architect→Coder→Tester→CEO
4. **You respect the design** — ONE design system, never deviate
5. **You update the wiki** — after every meaningful change
6. **You suggest one next step** — never chain autonomously
