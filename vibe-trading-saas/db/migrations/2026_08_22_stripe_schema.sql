-- 2026_08_22_stripe_schema.sql
-- Add Stripe support alongside Paystack (provider-agnostic billing model).
--
-- Context (CLAUDE.md / docs/RECONCILIATION.md R3):
--   Paystack is the live payment provider for Nigeria launch.
--   Stripe activates when an Atlas US LLC entity is established.
--   This migration is additive-only — Paystack billing is untouched.
--
-- Changes:
--   1. plans.stripe_price_id         — Stripe Price ID (price_xxx) per plan
--   2. subscriptions.provider        — which provider owns this subscription
--                                      (default 'paystack', null for legacy rows)
--
-- Safe to apply without downtime:
--   • Both columns are nullable / have defaults — no backfill needed.
--   • No existing constraint is changed.
--
-- Applied: (log here after confirming via Management API)
-- Rollback: see block at the bottom of this file.

-- ── 1. Add stripe_price_id to plans ──────────────────────────────────────────
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT NULL;

COMMENT ON COLUMN public.plans.stripe_price_id IS
  'Stripe Price ID (price_xxx) for this plan tier. NULL until Stripe entity is established.';

-- ── 2. Add provider to subscriptions ─────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'paystack'
    CHECK (provider IN ('paystack', 'stripe'));

COMMENT ON COLUMN public.subscriptions.provider IS
  'Billing provider that owns this subscription row (paystack | stripe).';

-- Back-fill legacy rows (created before this migration) to paystack.
UPDATE public.subscriptions
  SET provider = 'paystack'
  WHERE provider IS NULL;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run after applying:
--   SELECT column_name, data_type, column_default, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('plans', 'subscriptions')
--      AND column_name IN ('stripe_price_id', 'provider')
--    ORDER BY table_name, column_name;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS provider;
-- ALTER TABLE public.plans         DROP COLUMN IF EXISTS stripe_price_id;
