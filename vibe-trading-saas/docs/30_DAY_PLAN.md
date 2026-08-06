# 30-Day Plan

Solo-dev pace, one person, cost-conscious (`CLAUDE.md`). Each week ends with
something runnable, not just docs. Update `docs/STATE.md` at the end of each
day worked, and update this file when a week's actual pace diverges from
plan — this is a plan, not a commitment log.

## Week 1 (Days 1–7): Foundations

- **Day 1** ✅ (2026-08-05) — GitHub/SSH setup, `HM` repo, `Tradi` engine
  merged in, `vibe-trading-saas` scaffold, `PROJECT_BRIEF.md`,
  `ARCHITECTURE.md`, worker-invocation decision.
- **Day 2** — `docs/DATABASE_SCHEMA.md` → first Supabase migration. Create
  the Supabase project, apply `profiles`/`plans`/`subscriptions`/
  `usage_periods`/`usage_events`/`agent_runs`/`agent_artifacts`/
  `webhook_events`/`audit_logs`, seed `plans` with the 3 tiers, write RLS
  policies for every table per `SECURITY_CHECKLIST.md`.
- **Day 3** — Next.js app skeleton (App Router, Tailwind, TypeScript).
  Supabase Auth wired (signup/login/session). Deploy an empty shell to
  Vercel so the pipeline exists from day one.
- **Day 4** — Worker skeleton: Python project, polling loop against
  `agent_runs` with `SELECT ... FOR UPDATE SKIP LOCKED`, no real Tradi
  invocation yet — just claim → mark running → mark completed, to prove the
  queue mechanics work.
- **Day 5** — Wire the worker to actually invoke `Tradi` as a subprocess
  per `ARCHITECTURE.md` (`HOME=/var/vibe-runs/<run_id>`, `--json`,
  `--max-iter`, wall-clock timeout). Get one real end-to-end run working
  manually (insert a row by hand, watch the worker process it).
- **Day 6** — Artifact handling: parse the subprocess `--json` output,
  upload workspace artifacts to Supabase Storage, write `agent_artifacts`,
  verify signed-URL access works and RLS blocks a second test account.
- **Day 7** — Buffer / catch-up. Re-walk anything from Days 2–6 that slipped.

**Week 1 exit criteria:** a run can be inserted directly in Supabase and
come back completed with a real Tradi-generated artifact, end to end,
without touching Paystack or the frontend UI yet.

## Week 2 (Days 8–14): Core product loop

- **Day 8** — Dashboard shell: authenticated layout, nav, empty states.
- **Day 9** — "Start a run" flow: prompt input → server-side quota
  check-and-consume transaction → `agent_runs` insert with idempotency key.
- **Day 10** — Run status page: poll or subscribe (Supabase Realtime) for
  `queued → running → completed/failed/timeout`.
- **Day 11** — Run result/report page: render the artifact(s) from Day 6.
- **Day 12** — Usage history page (list of past runs + quota remaining this
  period).
- **Day 13** — System-failure refund path: worker marks a use refunded on
  crash/timeout, `usage_events` reflects it, dashboard shows it correctly.
- **Day 14** — Buffer / catch-up.

**Week 2 exit criteria:** a logged-in test user can start a run from the UI,
watch it complete, and see the result — with real quota decrementing.

## Week 3 (Days 15–21): Billing

- **Day 15** — Pricing page (3 tiers, static copy from `PROJECT_BRIEF.md`).
- **Day 16** — Paystack checkout integration (Plan per tier) for
  subscribing to a plan (test keys only, per `SECURITY_CHECKLIST.md`).
- **Day 17** — Webhook handler (`charge.success`,
  `subscription.disable`) writing to `subscriptions`, idempotent via
  `webhook_events` and authenticated with the `x-paystack-signature` header.
- **Day 18** — `usage_periods` creation tied to subscription period
  start/end; verify a new billing period actually resets usable quota.
- **Day 19** — Billing settings page: cancel / change plan via our own API
  route calling Paystack (no hosted customer portal like Stripe's).
- **Day 20** — End-to-end billing test: subscribe → consume quota → hit
  the cap → confirm run creation is blocked with a clear message.
- **Day 21** — Buffer / catch-up.

**Week 3 exit criteria:** a real (test-mode) subscription controls real
quota, start to finish, with no manual DB edits required.

## Week 4 (Days 22–28): Polish, safety, launch prep

- **Day 22** — Landing page copy + design pass (this is the first thing a
  stranger sees — don't ship the placeholder).
- **Day 23** — Legal pages (ToS, Privacy — including the "research only,
  not investment advice, not live trading" disclosure per
  `SECURITY_CHECKLIST.md`).
- **Day 24** — Sentry wired on frontend + worker; basic uptime monitoring
  configured and actually alerting, not just installed.
- **Day 25** — Basic admin visibility (per-user usage/run lookup for
  support purposes — not the "complex admin dashboard" non-goal).
- **Day 26** — Full `SECURITY_CHECKLIST.md` walk-through with two real test
  accounts (cross-user RLS check, concurrent quota race check, webhook
  replay check).
- **Day 27** — Load/timeout tuning: confirm the worker's wall-clock timeout
  and per-tier `--max-iter` values (`ARCHITECTURE.md` open question)
  actually get resolved here, not left open.
- **Day 28** — Buffer / catch-up.

**Week 4 exit criteria:** `SECURITY_CHECKLIST.md` fully checked off, ready
to flip Paystack to live mode.

## Days 29–30: Launch

- **Day 29** — Switch Paystack to live keys (explicit, deliberate step per
  `CLAUDE.md` rule 2). Deploy worker to its final host (resolve the
  `ARCHITECTURE.md` open question on Railway/Fly.io/Hetzner if not already
  settled). Final smoke test with a real card in live mode (refund it
  after).
- **Day 30** — Soft launch. Update `docs/STATE.md` with launch status and
  the actual sprint-day pace vs. this plan for next time.

## Notes

- This plan assumes Weeks 1–3 go roughly to schedule; the buffer days exist
  because they won't exactly. If a week's buffer isn't enough, it's better
  to slip the plan than to skip `SECURITY_CHECKLIST.md` items to stay on
  schedule.
- Nothing here builds live trading execution, team accounts, a public API,
  or anything else in `CLAUDE.md`'s "NON-GOALS FOR MVP" — if a day's work
  starts drifting toward one of those, that's a signal to stop and check
  `CLAUDE.md`, not push forward.
