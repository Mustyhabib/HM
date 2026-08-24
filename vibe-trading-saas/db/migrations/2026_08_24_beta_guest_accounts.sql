-- 2026_08_24_beta_guest_accounts.sql
-- Open-beta guest accounts (anonymous sign-in).
--
-- Why: flipping on auth anonymous sign-in broke user creation —
-- handle_new_user() inserts profiles(id, email), but profiles.email is
-- NOT NULL and anonymous users have NO email → trigger fails → Supabase
-- returns "Database error creating anonymous user" (500).
--
-- Fix:
--   1. profiles.email becomes NULLABLE (guests have no email; they add one
--      when converting to a full account at launch).
--   2. handle_new_user() coalesces new.email to a placeholder so any other
--      NOT NULL assumption keeps working.
--   3. Add a helpful comment documenting the conversion path.
--
-- Conversion at launch: supabase.auth.updateUser({ email, password }) on an
-- is_anonymous session promotes the guest in place (same user_id, so run
-- history / quota carry over). Frontend: BETA_MODE=false removes the guest
-- bootstrap; guests without converted accounts simply can't start new runs.

-- ── 1. Relax profiles.email ──────────────────────────────────────────────────
alter table public.profiles
  alter column email drop not null;

comment on column public.profiles.email is
  'Nullable: anonymous (beta guest) users have no email until they convert
   to a full account via updateUser({email, password}).';

-- ── 2. Make handle_new_user() anon-safe ─────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.profiles (id, email)
  values (
    new.id,
    -- anonymous (beta guest) users have no email; store a stable placeholder
    -- instead of failing the insert. Replaced on account conversion.
    coalesce(new.email, 'anon-' || new.id::text || '@users.hm.local')
  );
  return new;
end;
$$;

-- ── Verify (run after applying) ──────────────────────────────────────────────
--   select is_nullable from information_schema.columns
--     where table_name='profiles' and column_name='email';   -- -> 'YES'
--   Then from an unauthenticated client:
--     supabase.auth.signInAnonymously()                      -- should 200

-- ── Rollback (commented) ─────────────────────────────────────────────────────
-- alter table public.profiles alter column email set not null;
-- create or replace function public.handle_new_user()
-- returns trigger language plpgsql security definer set search_path to ''
-- as $$ begin
--   insert into public.profiles (id, email) values (new.id, new.email);
--   return new;
-- end; $$;
