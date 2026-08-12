-- =====================================================================
-- Migration: 2026-08-12 — Paystack billing tables finalization
-- Author: Auroras
-- Purpose:
--   1. Ensure plans.provider_price_id column exists (Paystack Plan code)
--   2. Ensure subscriptions table has all required columns + RLS
--   3. Ensure webhook_events table exists for idempotency
--   4. Add upsert_subscription service-role RPC (used by webhook handler)
--
-- All statements are idempotent (IF NOT EXISTS / IF NOT COLUMN EXISTS).
-- Safe to run multiple times.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. plans — add Paystack plan code column if missing
-- ---------------------------------------------------------------------
alter table public.plans
  add column if not exists provider_price_id text;

comment on column public.plans.provider_price_id is
  'Paystack Plan code, e.g. PLN_abc123. Set after creating plans in Paystack dashboard.';

-- ---------------------------------------------------------------------
-- 2. subscriptions — ensure all columns exist
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  plan_id                   text not null references public.plans(id),
  provider_subscription_id  text unique,
  status                    text not null default 'incomplete'
                              check (status in ('active','trialing','past_due','canceled','incomplete')),
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Add columns that may be missing from the original Day-2 migration
alter table public.subscriptions
  add column if not exists current_period_start     timestamptz,
  add column if not exists current_period_end       timestamptz,
  add column if not exists cancel_at_period_end     boolean not null default false,
  add column if not exists updated_at               timestamptz not null default now();

-- Enable RLS (idempotent)
alter table public.subscriptions enable row level security;

-- Users can read their own subscriptions (needed for Agent.tsx subscription gate)
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- Index for fast subscription lookup by user
create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status)
  where status in ('active','trialing');

-- ---------------------------------------------------------------------
-- 3. webhook_events — idempotency ledger (service-role only)
-- ---------------------------------------------------------------------
create table if not exists public.webhook_events (
  id                uuid primary key default gen_random_uuid(),
  provider_event_id text unique not null,
  type              text not null,
  payload           jsonb,
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- RLS enabled with zero policies — service-role bypasses, clients can't read
alter table public.webhook_events enable row level security;

-- ---------------------------------------------------------------------
-- 4. upsert_subscription — service-role RPC for webhook handler
--    Called by the paystack-webhook Edge Function (service-role key).
-- ---------------------------------------------------------------------
create or replace function public.upsert_subscription(
  p_user_id                  uuid,
  p_plan_id                  text,
  p_provider_subscription_id text,
  p_status                   text,
  p_period_start             timestamptz,
  p_period_end               timestamptz
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  insert into public.subscriptions (
    user_id,
    plan_id,
    provider_subscription_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    updated_at
  )
  values (
    p_user_id,
    p_plan_id,
    p_provider_subscription_id,
    p_status,
    p_period_start,
    p_period_end,
    false,
    now()
  )
  on conflict (provider_subscription_id) do update
    set status               = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end   = excluded.current_period_end,
        updated_at           = now();
end;
$$;

-- Only service_role can call this — the webhook handler runs under service_role
grant execute on function public.upsert_subscription(uuid, text, text, text, timestamptz, timestamptz)
  to service_role;
revoke execute on function public.upsert_subscription(uuid, text, text, text, timestamptz, timestamptz)
  from anon, authenticated;

comment on function public.upsert_subscription is
  'Service-role–only RPC. Creates or updates a subscription row from a Paystack webhook event.';

commit;
