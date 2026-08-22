import { supabase } from "./supabase";

/**
 * BYOK (bring-your-own-key) — users store their own LLM credentials on the
 * Profile page. Credentials are never held client-side after save: the browser
 * only ever sees masked status ({provider, last4, configured_at}), never
 * plaintext. All reads/writes go through SECURITY DEFINER RPCs backed by
 * Supabase Vault (see the `2026_08_12_byok_api_keys` and
 * `2026_08_22_ollama_byok` migrations) — there is no client-facing table to
 * query directly.
 *
 * Supported providers:
 *   deepseek  — API key (sk-…). Encrypted in Vault. Server-side BYOK.
 *   ollama    — Base URL (http://host:port). Encrypted in Vault. User-hosted.
 *
 * The worker fetches the plaintext credential itself, server-side, immediately
 * before spawning the Tradi subprocess (`worker_get_user_api_key`, granted
 * to `service_role` only). This module never calls that RPC.
 */

export type Provider = "deepseek" | "ollama";

export interface ApiKeyStatus {
  provider: Provider;
  last4: string;
  configured_at: string;
}

// Client-side patterns — mirror the server-side validation in save_user_api_key.
// The RPC is the actual authority; these just skip an obvious round-trip.
const DEEPSEEK_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,}$/;
const OLLAMA_URL_PATTERN = /^https?:\/\/.{3,}$/;

/** Map the RPCs' raise-exception messages to friendly UI copy. */
function friendlyApiKeyError(message: string): string {
  if (message.includes("invalid_key_format"))
    return "That doesn't look like a DeepSeek key (should start with sk-).";
  if (message.includes("invalid_url_format"))
    return "Enter a valid Ollama URL (e.g. http://my-server:11434).";
  if (message.includes("unsupported_provider"))
    return "Unsupported provider. Only DeepSeek and Ollama are supported.";
  if (message.includes("not_authenticated")) return "Please log in again.";
  return message;
}

/**
 * Store (or rotate) the caller's credential for `provider`.
 *
 * Validates the format client-side (sk-… for DeepSeek; http/https URL for
 * Ollama) before calling `save_user_api_key` (SECURITY DEFINER — derives
 * the user from `auth.uid()`, encrypts in Supabase Vault, never returns
 * plaintext back).
 *
 * @throws Error with friendly copy on validation, auth, or RPC failure.
 */
export async function saveApiKey(provider: Provider, key: string): Promise<ApiKeyStatus> {
  const trimmed = key.trim();

  if (provider === "deepseek") {
    if (!DEEPSEEK_KEY_PATTERN.test(trimmed)) {
      throw new Error(friendlyApiKeyError("invalid_key_format"));
    }
  } else if (provider === "ollama") {
    if (!OLLAMA_URL_PATTERN.test(trimmed)) {
      throw new Error(friendlyApiKeyError("invalid_url_format"));
    }
  }

  const { data, error } = await supabase.rpc("save_user_api_key", {
    p_provider: provider,
    p_api_key: trimmed,
  });
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return data as ApiKeyStatus;
}

/**
 * Read the caller's DeepSeek key status — masked metadata only, never
 * plaintext. Returns `null` when not configured.
 *
 * Preserved for backward compat. New code should prefer
 * `listApiKeyStatuses()` to show all configured providers.
 *
 * @throws Error with friendly copy on auth or RPC failure.
 */
export async function getApiKeyStatus(): Promise<ApiKeyStatus | null> {
  const { data, error } = await supabase.rpc("get_user_api_key_status");
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return (data as ApiKeyStatus | null) ?? null;
}

/**
 * Read all configured provider statuses for the current user.
 * Returns an array (empty when nothing is configured).
 *
 * @throws Error with friendly copy on auth or RPC failure.
 */
export async function listApiKeyStatuses(): Promise<ApiKeyStatus[]> {
  const { data, error } = await supabase.rpc("list_user_api_key_statuses");
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return (data as ApiKeyStatus[]) ?? [];
}

/**
 * Delete the caller's credential for `provider` — removes both the metadata
 * row and the underlying Supabase Vault secret. A no-op (not an error) if no
 * credential was configured.
 *
 * @throws Error with friendly copy on auth or RPC failure.
 */
export async function deleteApiKey(provider: Provider): Promise<void> {
  const { error } = await supabase.rpc("delete_user_api_key", { p_provider: provider });
  if (error) throw new Error(friendlyApiKeyError(error.message));
}
