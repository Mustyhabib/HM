-- Migration: 2026_08_12_byok_revoke_anon_execute
-- Applied: 2026-08-12
-- Context: The 2026_08_12_byok_api_keys migration created three user-facing
--   SECURITY DEFINER RPCs (save_user_api_key, get_user_api_key_status,
--   delete_user_api_key) with a REVOKE inside the file.  Supabase's default
--   CREATE FUNCTION auto-grant re-granted EXECUTE to anon before our REVOKE
--   ran, so the revoke had no effect.  This patch migration removes the anon
--   EXECUTE grant explicitly, applied after function creation.
--
-- Defense-in-depth: each RPC already raises 'not_authenticated' when
--   auth.uid() is null, but the anon role must not have EXECUTE access
--   at all — zero-trust at the privilege layer.
--
-- Rollback: see 2026_08_12_byok_revoke_anon_execute_rollback.sql

REVOKE EXECUTE ON FUNCTION public.save_user_api_key(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_api_key_status()      FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_user_api_key(text)      FROM anon;
