-- Rollback: 2026_08_12_byok_revoke_anon_execute
-- Restores the anon EXECUTE grants removed by the forward migration.
--
-- ⚠️  Only run this if you are also rolling back the entire BYOK feature
--   (2026_08_12_byok_api_keys_rollback.sql).  Restoring anon EXECUTE on
--   these RPCs while the BYOK feature is live is a security regression —
--   each RPC self-defends via auth.uid() checks, but anon should not have
--   EXECUTE access to authenticated-only endpoints.

GRANT EXECUTE ON FUNCTION public.save_user_api_key(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_api_key_status()      TO anon;
GRANT EXECUTE ON FUNCTION public.delete_user_api_key(text)      TO anon;
