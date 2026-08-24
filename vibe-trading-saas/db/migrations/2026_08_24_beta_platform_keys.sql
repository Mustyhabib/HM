-- Beta guest runs: platform key pool for anonymous users.
--
-- Problem: guest (is_anonymous) runs route to a provider the GUEST has no
-- key for — worker_get_user_api_key returns nothing and the run fails with
-- "no api key configured for provider 'openrouter'". Guests can't add keys
-- by design, so the platform must supply one.
--
-- Fix: seed ONE platform-owned user_api_keys row per enabled key-type
-- catalog provider. The secret lives in Supabase Vault like every other
-- credential; the row's owner is a dedicated service account so no real
-- user is ever billed or exposed.
--
-- IMPORTANT: paste the actual platform API keys into the vault secrets
-- below before applying (marked <<PLATFORM_KEY>>). The openrouter key from
-- ~/.hm-test.env is already filled in as an example.
--
-- Rollback: delete from user_api_keys where user_id = PLATFORM_USER_ID;

-- 1. Dedicated platform service account (idempotent)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token,
                        email_change_token_new, email_token_current)
select '00000000-0000-0000-0000-000000000000',
       '00000000-0000-4000-8000-000000000001',
       'authenticated', 'authenticated',
       'platform-runner@hm.local',
       crypt('x-no-login-' || gen_random_uuid()::text, gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}', '{}',
       now(), now(), '', '', '', ''
where not exists (
  select 1 from auth.users where id = '00000000-0000-4000-8000-000000000001'
);

-- 2. Platform profile row
insert into public.profiles (id, email)
values ('00000000-0000-4000-8000-000000000001', 'platform-runner@hm.local')
on conflict (id) do nothing;

-- 3. Platform keys in Vault + user_api_keys (openrouter example; repeat the
--    two INSERTs per additional provider you want guests to be able to use).
do $$
declare
  v_secret_id uuid;
begin
  if not exists (
    select 1 from public.user_api_keys
    where user_id = '00000000-0000-4000-8000-000000000001'
      and provider = 'openrouter'
  ) then
    -- PASTE THE REAL PLATFORM OPENROUTER KEY HERE:
    select id into v_secret_id
      from vault.create_secret('<<PLATFORM_OPENROUTER_KEY>>',
                               'platform-openrouter');
    insert into public.user_api_keys (user_id, provider, secret_id)
    values ('00000000-0000-4000-8000-000000000001', 'openrouter', v_secret_id);
  end if;
end $$;
