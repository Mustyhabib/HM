import { supabase } from "./supabase";
import { PROVIDER_MAP, type LlmProvider } from "./providers";

/**
 * BYOK (bring-your-own-key) — users store their own LLM credentials on the
 * Profile page. Credentials are never held client-side after save: the browser
 * only ever sees masked status ({provider, last4, configured_at}), never
 * plaintext. All reads/writes go through SECURITY DEFINER RPCs backed by
 * Supabase Vault — there is no client-facing table to query directly.
 *
 * Multi-provider support (2026-08-22): any provider from the llm_providers.json
 * catalog can be configured. The worker resolves the user's first configured
 * provider at run time (see providers.py for the resolution order).
 */

/** Provider name — any string from the catalog. */
export type Provider = string;

export interface ApiKeyStatus {
  provider: Provider;
  last4: string;
  configured_at: string;
}

// Client-side patterns — mirror the server-side validation in save_user_api_key.
// The RPC is the actual authority; these just skip an obvious round-trip.
const DEEPSEEK_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,}$/;
const URL_PATTERN = /^https?:\/\/.{3,}$/;
const MIN_KEY_LENGTH = 10;

/** Map the RPCs' raise-exception messages to friendly UI copy. */
function friendlyApiKeyError(message: string, provider?: string): string {
  if (message.includes("invalid_key_format")) {
    if (provider === "deepseek")
      return "That doesn't look like a DeepSeek key (should start with sk-).";
    return "Invalid API key format. Check that you copied the full key.";
  }
  if (message.includes("invalid_url_format"))
    return "Enter a valid URL (e.g. http://my-server:11434).";
  if (message.includes("unsupported_provider"))
    return "Unsupported provider.";
  if (message.includes("not_authenticated")) return "Please log in again.";
  return message;
}

/**
 * Client-side validation for a credential before calling the RPC.
 * Returns an error message or null if valid.
 */
function validateCredential(provider: Provider, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Please enter a value.";

  const entry = PROVIDER_MAP.get(provider);
  if (!entry) return null; // unknown provider — let the server validate

  if (!entry.apiKeyRequired) {
    // Base-URL providers: validate URL format
    if (!URL_PATTERN.test(trimmed)) {
      return "Enter a valid URL (e.g. http://my-server:11434).";
    }
    return null;
  }

  // API-key providers
  if (provider === "deepseek") {
    if (!DEEPSEEK_KEY_PATTERN.test(trimmed)) {
      return "Should start with sk- followed by at least 20 characters.";
    }
    return null;
  }

  // Generic API key — at least 10 chars
  if (trimmed.length < MIN_KEY_LENGTH) {
    return `API key seems too short (minimum ${MIN_KEY_LENGTH} characters).`;
  }
  return null;
}

/**
 * Store (or rotate) the caller's credential for `provider`.
 *
 * Validates the format client-side before calling `save_user_api_key`
 * (SECURITY DEFINER — derives the user from `auth.uid()`, encrypts in
 * Supabase Vault, never returns plaintext back).
 *
 * @throws Error with friendly copy on validation, auth, or RPC failure.
 */
export async function saveApiKey(provider: Provider, key: string): Promise<ApiKeyStatus> {
  const trimmed = key.trim();

  const validationError = validateCredential(provider, key);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await supabase.rpc("save_user_api_key", {
    p_provider: provider,
    p_api_key: trimmed,
  });
  if (error) throw new Error(friendlyApiKeyError(error.message, provider));
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
  if (error) throw new Error(friendlyApiKeyError(error.message, provider));
}

/**
 * Get the display label for a provider, resolving from the catalog.
 */
export function getProviderLabel(provider: Provider): string {
  return PROVIDER_MAP.get(provider)?.label ?? provider;
}

/**
 * Get the provider entry from the catalog.
 */
export function getProviderInfo(provider: Provider): LlmProvider | undefined {
  return PROVIDER_MAP.get(provider);
}
