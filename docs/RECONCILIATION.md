# RECONCILIATION.md — Unified Spec vs. Existing Decisions

> **Purpose:** `docs/UNIFIED_SPEC.md` is the single source of truth (adopted
> 2026-08-21). This register records every point where it **conflicts with or
> refines** decisions already made in CLAUDE.md / [[architecture-decisions]] /
> the live stack, and how the conflict is **resolved**. Per FOUNDATIONS.md
> Architecture Authority: the unified spec wins unless a documented ADR
> changes it. Where this register says "keep ADR", the ADR stands and the spec
> line is interpreted through it.

## Conflicts

| # | Unified spec says | Existing decision (ADR/live) | Resolution |
|---|---|---|---|
| R1 | Frontend: **Next.js** (spec §11, §30, §32) | **D3**: reuse Tradi React 19 + Vite SPA (the live frontend) | **Keep D3 for the live product.** Spec's Next.js is "recommended initial choice" for a greenfield repo. Migration to Next.js is a **frontend refactor** decision for a future phase (Phase 1+ review); it must not break the live run loop (D16). The Quant Workspace UI can be built on the existing SPA. |
| R2 | AWS primary cloud (EC2/RDS/S3/Secrets Mgr — §30, §32) | **D15**: Railway = compute container; Supabase = Postgres; Cloudflare = edge | **Keep the live stack (Railway + Supabase + Cloudflare) until scale justifies AWS.** Spec §58 itself says add AWS-scale infra "only when justified". The spec's AWS topology is the *future* target (Phase 9/10); the $150–250/mo budget governs either way. Supabase IS Postgres; R2 IS S3-compatible for the lake. |
| R3 | Billing: **Stripe** (BillingProvider abstraction, §36) | **D8**: Paystack (NGN, Nigeria launch) + Stripe planned (entity-gated) | **Keep D8.** Spec's BillingProvider abstraction matches D8's provider-agnostic model exactly. Stripe activates when the entity exists (Atlas). Spec tiers (Free/$29/$99, §37) are "starting product concepts, not final prices" — the live NGN tiers (₦20k/₦35k/₦75k) stand until the international tier launches. |
| R4 | Job queue: **Celery/RQ/Dramatiq via Redis** (§19, §31) | **D14**: no Celery/Redis — Python polling loop + SQL SKIP LOCKED | **Keep D14 for the MVP service loop.** Spec §19 mandates "choose one" async queue — that becomes **Phase 1+** (when FastAPI + Redis skeleton land). The live run loop keeps its proven polling claim until the queue exists and is gated E2E. |
| R5 | LLM gateway/router abstraction (§30) | **D11**: BYOK DeepSeek, worker decrypts via Vault | **Compatible — refine.** BYOK is the key model; the LLM Gateway adds provider routing/failover/token metering on top. Gateway is a **Phase 3+ (Research)** concern; BYOK+Vault stays the key-handling mechanism (D12). |
| R6 | MLflow for experiment tracking + model registry (§30) | Roadmap: `experiments`/`models` in Phase 1 schema/Phase 4-5, engine-agnostic | **Adopt MLflow as the Phase 5 candidate implementation** (self-hosted per spec §30). Our provenance schema (hypotheses/experiments/dataset_registry) remains the *canonical record*; MLflow tracks runs/artifacts. Decision recorded, implementation Phase 5. |
| R7 | Redis for cache/queue/rate-limit (§19, §30) | Live: Supabase-only, Postgres-backed rate limit (30/hr) | **Keep live behavior.** Redis enters with Phase 1 FastAPI skeleton per spec; Postgres rate limit stays until then. Redis is never the system of record (spec §30, rule §61). |
| R8 | Feature store / registry, versioned (§15) | FOUNDATIONS data stack: canonical → features; roadmap Phase 2 | **Agree — no conflict.** Spec §15 (registry + versioned pipeline first, not a full feature-store product) matches Phase 2. Adopt. |
| R9 | **Vibe-Trading = foundation** (§1, §20, §60 Phase 0) | D1: subprocess-per-run, wrap don't modify | **Agree.** Spec Phase 0 (map + decouple, don't rewrite) matches the vendored-engine posture. D1 subprocess isolation stays the integration mechanism until the decoupling work replaces it deliberately. |
| R10 | Admin plane: RBAC/MFA/audit, separate logical surface (§4.2, §7, §9) | D13: admin as protected `/admin` SPA route; admin_users/audit_logs tables | **Agree — expand.** Keep the SPA `/admin` surface (no separate deploy); add spec's roles/permissions granularity + MFA (TOTP) as roadmap items (Phase 1/9). |
| R11 | WebSocket-first for market data/orders/fills/P&L (§18, §51) | **D17 (recorded in CLAUDE.md)**: WebSocket-first commitment, implementation Phase 6 | **Agree.** D17 was recorded 2026-08-21 from the spec's §18/§51. REST stays for request/response (spec §51); run-status polling stays (D10) until the WS plane exists. |
| R12 | Strategy/Model/Experiment registries with explicit lifecycles (§46, §47) | Roadmap Phase 1 schema: hypotheses/experiments/dataset_registry/promotion_events | **Agree — the spec refines the Phase 1 schema.** Adopt spec lifecycles (TRAINED→…→RETIRED; DRAFT→…→LIVE→PAUSED) into the Phase 1 DDL. The Research Card (v0) uses these lifecycles. |
| R13 | Repository layout: `apps/ services/ workers/ packages/ …` (§59) | Current monorepo: `Tradi/` + `vibe-trading-saas/` + `supabase/` + `infra/` | **Target layout for the strangler-fig.** New code (Phase 1+) is organized per §59; the live directories stay untouched until each is migrated (D16). No big-bang restructure. |
| R14 | TanStack Query for server state (§11, §52) | Frontend: direct Supabase client (no SWR/React Query) | **Defer.** When the FastAPI API exists (Phase 1+), adopting TanStack Query for server state is a frontend refactor decision — not before. Zustand already covers client state (spec §52 agrees). |
| R15 | Cost/budget: $150–250/mo, cost attribution, health score (§34–§38, §56–§57) | Live: ~$100/mo MVP budget target (CLAUDE.md) | **Adopt spec's $150–250 + attribution model** as the Phase 9 metered-billing/cost-attribution target. Live budget stays ~$100 until SaaS features (Phases 1/9) add metering. |
| R16 | Paper + live share interfaces (§24, §61) | Roadmap Phases 6–8 | **Agree — adopt as the Phase 6+ design rule** (same strategy/risk interfaces, simulated vs real execution). |
| R17 | No fake numbers on dashboard (§5) | — | **Adopt** — empty states + paper-account offer when no account. Ties to constitution #4 (backtest ≠ proof) and UI_VISION. |
| R18 | Spec's build phases (§60) vs our roadmap (UPGRADE_ROADMAP) | Our 10-phase roadmap (Phase 0 baseline → Phase 10 expansion) | **Our roadmap's phasing stays authoritative** for execution order (D16); spec §60 phases map onto it (see REQUIREMENTS.md traceability). Notably spec runs Research (P3) before Backtesting (P4) while ours runs Quant Engine (P3) before Research AI (P4) — resolved by dependency: experiment registry (Phase 1) precedes both. |

## How to use this register

1. When a build task cites the unified spec, check this table for the
   governing interpretation.
2. New conflicts discovered during implementation → append a row here AND
   record an ADR if it changes a live decision.
3. Rows marked "adopt" are decisions already taken; rows marked "defer" are
   future-phase decisions with a trigger.
