# Project Brief: Vibe-Trading SaaS MVP

## One-line pitch

A hosted, multi-user, subscription-billed version of Vibe-Trading — users sign
up, subscribe to a plan, and run an AI research/analysis agent a limited
number of times per month.

## Problem

Vibe-Trading (the open-source engine) is built for a single local user running
their own copy. There's no auth, no billing, no per-user quota, no isolation
between runs, and no hosted UI a non-technical user could sign up for. This
project turns it into a real SaaS product without touching what the engine
already does well (research, backtesting, the skill/tool system).

## What it is NOT

Not a live trading execution platform. MVP scope is analysis/research/
backtesting only — see "Non-Goals" in `CLAUDE.md`.

## Target users

Retail traders / finance hobbyists who want AI-assisted research and
backtesting without running Python locally or managing their own LLM API
keys.

## Provenance & licensing

- Engine: forked from `HKUDS/Vibe-Trading` (MIT), vendored into this repo at
  `Tradi/`. MIT permits private modification and commercial hosting; the only
  obligation is keeping `Tradi/LICENSE` and `Tradi/NOTICE` intact.
- SaaS wrapper (this directory, `vibe-trading-saas/`): proprietary, owned by
  the operator.

## Pricing (see `CLAUDE.md` for full detail)

| Tier | Price/mo | Agent uses/mo |
|---|---|---|
| Starter | ₦70,000 (~$54) | 3 |
| Pro | ₦120,000 (~$92) | 7 |
| Premium | ₦200,000 (~$154) | 15 |

1 "use" = 1 completed agent run. System-caused failures refund the use;
user-caused invalid input may not. No rollover at MVP. Resets on billing
period.

## MVP feature set

See "MVP FEATURES" in `CLAUDE.md` for the full 15-item list (landing page,
pricing, auth, dashboard, Paystack checkout, quota, run queue/status/results,
usage history, billing settings, admin visibility, legal pages, monitoring).

## Target scale & budget

Long-term target: 1,000+ users. MVP phase: launch small, validate, then
scale — do not build for 1,000 users on day one. Target infra budget ~$100/mo
core, separate LLM/API usage budget, Paystack fees expected. Full constraints in
`CLAUDE.md` ("SOLO DEVELOPER CONSTRAINTS" / "BUDGET CONSTRAINTS").

## Stack

Next.js + Tailwind + TypeScript (Vercel/Cloudflare Pages) · Supabase (Postgres
+ Auth + Storage + RLS) · Paystack (Checkout + Plans + Webhooks) · Python
worker (Railway/Fly.io/Hetzner) wrapping the `Tradi/` engine · Sentry +
uptime monitoring. Full detail: `CLAUDE.md` → "PREFERRED STACK",
`docs/ARCHITECTURE.md` (TODO).

## Repo layout

```
HM/                      (this repo, Mustyhabib/HM, private)
├── Tradi/                the vendored engine — do not fork its behavior here,
│                         wrap it. See Tradi/CLAUDE.md for engine internals.
└── vibe-trading-saas/    this project — frontend, worker orchestration, docs
    ├── CLAUDE.md          operating charter / rules for AI-assisted dev
    ├── docs/              this file, STATE.md, DECISIONS.md, etc.
    └── .claude/           commands + skills for this project
```

## Success criteria for MVP

Not yet defined numerically — capture target signup/conversion/run-volume
numbers here once decided. Placeholder until first planning session covers
this explicitly.

## Related docs

- `CLAUDE.md` — full operating rules, safety rules, DB/security principles,
  agent execution principles, workflow rules.
- `docs/STATE.md` — current sprint status, updated every session.
- `docs/DECISIONS.md` — append-only decision log.
- `docs/30_DAY_PLAN.md` — day-by-day plan (TODO, not yet populated).
- `docs/ARCHITECTURE.md` — system architecture (TODO, not yet populated).
- `docs/DATABASE_SCHEMA.md` — table definitions (TODO, not yet populated).
- `docs/SECURITY_CHECKLIST.md` — pre-launch security checklist (TODO, not yet
  populated).
