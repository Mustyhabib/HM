import { supabase } from "./supabase";

/**
 * BYOK (bring-your-own-key) — users store their own DeepSeek API key on the
 * Profile page. The key is never held client-side after save: the browser
 * only ever sees a masked status ({provider, last4, configured_at}), never
 * plaintext. All reads/writes go through SECURITY DEFINER RPCs backed by
 * Supabase Vault (see the `2026_08_12_byok_api_keys` migration) — there is
 * no client-facing table to query directly.
 *
 * The worker fetches the plaintext key itself, server-side, immediately
 * before spawning the Tradi subprocess (`worker_get_user_api_key`, granted
 * to `service_role` only). This module never talks to that RPC.
 */

export type Provider = "deepseek";

export interface ApiKeyStatus {
  provider: Provider;
  last4: string;
  configured_at: string;
}

// Mirrors the server-side check in save_user_api_key — validating here first
// avoids a round trip for an obviously malformed key, but the RPC is the
// actual authority (never trust client-side validation alone).
const DEEPSEEK_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,}$/;

/** Map the RPCs' raise-exception messages to friendly UI copy. */
function friendlyApiKeyError(message: string): string {
  if (message.includes("invalid_key_format"))
    return "That doesn't look like a DeepSeek key (starts with sk-).";
  if (message.includes("unsupported_provider"))
    return "Only DeepSeek is supported right now.";
  if (message.includes("not_authenticated")) return "Please log in again.";
  return message;
}

/**
 * Store (or rotate) the caller's API key for `provider`.
 *
 * Trims whitespace and validates the `sk-...` format client-side before
 * calling `save_user_api_key` (SECURITY DEFINER — derives the user from
 * `auth.uid()`, encrypts the key via Supabase Vault, never returns
 * plaintext back).
 *
 * @throws Error with friendly copy on validation, auth, or RPC failure.
 */
export async function saveApiKey(provider: Provider, key: string): Promise<ApiKeyStatus> {
  const trimmed = key.trim();
  if (!DEEPSEEK_KEY_PATTERN.test(trimmed)) {
    throw new Error(friendlyApiKeyError("invalid_key_format"));
  }

  const { data, error } = await supabase.rpc("save_user_api_key", {
    p_provider: provider,
    p_api_key: trimmed,
  });
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return data as ApiKeyStatus;
}

/**
 * Read the caller's key status — masked metadata only, never plaintext.
 * Returns `null` when no key is configured for any provider.
 *
 * @throws Error with friendly copy on auth or RPC failure.
 */
export async function getApiKeyStatus(): Promise<ApiKeyStatus | null> {
  const { data, error } = await supabase.rpc("get_user_api_key_status");
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return (data as ApiKeyStatus | null) ?? null;
}

/**
 * Delete the caller's key for `provider` — removes both the metadata row
 * and the underlying Supabase Vault secret. A no-op (not an error) if no
 * key was configured.
 *
 * @throws Error with friendly copy on auth or RPC failure.
 */
export async function deleteApiKey(provider: Provider): Promise<void> {
  const { error } = await supabase.rpc("delete_user_api_key", { p_provider: provider });
  if (error) throw new Error(friendlyApiKeyError(error.message));
}
