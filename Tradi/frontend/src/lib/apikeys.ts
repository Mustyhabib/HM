import { supabase } from "./supabase";

/**
 * BYOK (bring-your-own-key) — users store their own LLM credentials on the
 * Profile page. Credentials are never held client-side after save: the browser
 * only ever sees masked status ({provider, last4, configured_at}), never
 * plaintext. All reads/writes go through SECURITY DEFINER RPCs backed by
 * Supabase Vault (see the `2026_08_23_multi_provider_byok` migration) — there
 * is no client-facing table to query directly.
 *
 * Supported providers are NOT hardcoded here — they come from the database
 * `llm_provider_catalog` table (seeded to match the engine's
 * `llm_providers.json`, minus the 2 OAuth/gh_cli providers) via the
 * `list_supported_llm_providers()` RPC. That same catalog drives the worker,
 * so the frontend and the run loop can never drift apart.
 *
 * Each provider is either:
 *   - "key":  the user supplies an API key (OpenAI, DeepSeek, Gemini, …).
 *   - "url":  the user supplies a base URL (self-hosted Ollama).
 *
 * The worker fetches the plaintext credential itself, server-side, immediately
 * before spawning the Tradi subprocess (`worker_get_user_api_key`, granted to
 * `service_role` only). This module never calls that RPC.
 */

export type ProviderType = "key" | "url";

export interface ProviderCatalogEntry {
  name: string;
  label: string;
  provider_type: ProviderType;
  api_key_env: string | null;
  base_url_env: string | null;
  default_model: string;
  default_base_url: string;
  base_url_options: string[];
  auth_type: string | null;
  login_command: string | null;
}

export interface ApiKeyStatus {
  provider: string;
  last4: string;
  configured_at: string;
}

export interface SelectedProvider {
  selected_provider: string | null;
  configured: boolean;
  selected_model?: string | null;
}

// Client-side pattern for URL-type providers (ollama): http(s) URL.
const URL_PATTERN = /^https?:\/\/.{3,}$/;

/**
 * Fetch the supported-provider catalog from the DB. Single source of truth
 * shared with the worker. Returns an empty array on error (the UI then shows
 * a graceful "could not load providers" state rather than crashing).
 */
export async function listSupportedProviders(): Promise<ProviderCatalogEntry[]> {
  const { data, error } = await supabase.rpc("list_supported_llm_providers");
  if (error) {
    // Non-fatal: surface empty so the page can render a fallback message.
    console.error("Failed to load provider catalog:", error.message);
    return [];
  }
  return (data as ProviderCatalogEntry[]) ?? [];
}

/**
 * Store (or rotate) the caller's credential for `provider`.
 *
 * Validation: url-type providers require an http(s) URL; key-type providers
 * require a non-empty secret (no prefix enforcement — OpenAI/Anthropic/Gemini
 * etc. do not all share the `sk-` prefix). The RPC is the actual authority;
 * these just skip an obvious round-trip.
 *
 * @throws Error with friendly copy on validation, auth, or RPC failure.
 */
export async function saveApiKey(
  provider: ProviderCatalogEntry,
  key: string,
): Promise<ApiKeyStatus> {
  const trimmed = key.trim();

  if (provider.provider_type === "url") {
    if (!URL_PATTERN.test(trimmed)) {
      throw new Error(
        friendlyApiKeyError(
          "invalid_url_format",
          provider.label,
        ),
      );
    }
  } else if (!trimmed) {
    throw new Error(
      friendlyApiKeyError("invalid_key_format", provider.label),
    );
  }

  const { data, error } = await supabase.rpc("save_user_api_key", {
    p_provider: provider.name,
    p_api_key: trimmed,
  });
  if (error) throw new Error(friendlyApiKeyError(error.message, provider.label));
  return data as ApiKeyStatus;
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
export async function deleteApiKey(provider: string): Promise<void> {
  const { error } = await supabase.rpc("delete_user_api_key", {
    p_provider: provider,
  });
  if (error) throw new Error(friendlyApiKeyError(error.message));
}

/**
 * Get the caller's selected (active) provider + whether a credential exists
 * for it.
 */
export async function getSelectedProvider(): Promise<SelectedProvider> {
  const { data, error } = await supabase.rpc("get_selected_provider");
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return (data as SelectedProvider) ?? {
    selected_provider: null,
    configured: false,
  };
}

/**
 * Set the caller's active provider for runs. The provider must be in the
 * enabled catalog (the RPC enforces this).
 *
 * @throws Error with friendly copy on auth, unsupported provider, or RPC failure.
 */
export async function setSelectedProvider(
  provider: string,
  model?: string | null,
): Promise<SelectedProvider> {
  const { data, error } = await supabase.rpc("set_selected_provider", {
    p_provider: provider,
    p_model: model ?? null,
  });
  if (error) throw new Error(friendlyApiKeyError(error.message));
  return (data as SelectedProvider) ?? {
    selected_provider: provider,
    configured: false,
  };
}

// ---------------------------------------------------------------------------
// Provider credential tester — browser-side direct API call
// ---------------------------------------------------------------------------

export interface TestResult {
  ok: boolean;
  model: string;
  message: string;
}

/**
 * Test a provider credential by making a minimal real API call.
 *
 * Called from the BYOK settings UI with the draft key (before or after
 * saving). The call goes directly from the browser to the provider's API —
 * most LLM providers are CORS-enabled. For url-type (Ollama) we just call
 * GET /api/tags to confirm the server is reachable.
 *
 * Never touches the Vault — this uses the credential string the user just
 * typed, not the stored copy.
 *
 * @throws Error with provider-specific copy on auth or network failure.
 */
export async function testProviderCredential(
  provider: ProviderCatalogEntry,
  credential: string,
): Promise<TestResult> {
  const model = provider.default_model;
  const name = provider.name.toLowerCase();

  // ── URL-type (Ollama) ────────────────────────────────────────────────────
  if (provider.provider_type === "url") {
    const base = credential.trim().replace(/\/$/, "");
    const res = await fetch(`${base}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
    }).catch((e: Error) => {
      throw new Error(`Cannot reach server: ${e.message}`);
    });
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = data?.models?.map((m) => m.name) ?? [];
    const found = models.some((m) => m === model || m.startsWith(`${model}:`));
    return {
      ok: true,
      model,
      message: found
        ? `Connected · ${model} available`
        : `Connected · ${models.length} model(s) found${models.length ? ` (${model} not yet pulled)` : ""}`,
    };
  }

  // ── Anthropic ────────────────────────────────────────────────────────────
  if (name === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Hi" }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    return { ok: true, model, message: `${model} — key valid` };
  }

  // ── Google Gemini ────────────────────────────────────────────────────────
  if (name === "google" || name.includes("gemini")) {
    const bareModel = model.replace(/^models\//, "");
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${bareModel}:generateContent?key=${credential}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hi" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    return { ok: true, model, message: `${model} — key valid` };
  }

  // ── OpenAI-compatible (DeepSeek, OpenAI, Groq, Mistral, xAI, …) ─────────
  const base = (provider.default_base_url || "https://api.openai.com").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "Hi" }],
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
    throw new Error(body?.error?.message ?? body?.message ?? `HTTP ${res.status}`);
  }
  return { ok: true, model, message: `${model} — key valid` };
}

// ---------------------------------------------------------------------------

/** Map the RPCs' raise-exception messages to friendly UI copy. */
function friendlyApiKeyError(message: string, providerLabel?: string): string {
  if (message.includes("invalid_key_format"))
    return "That doesn't look like a valid API key.";
  if (message.includes("invalid_url_format"))
    return "Enter a valid URL (e.g. http://my-server:11434).";
  if (message.includes("unsupported_provider"))
    return `Unsupported provider${providerLabel ? `: ${providerLabel}` : ""}.`;
  if (message.includes("not_authenticated")) return "Please log in again.";
  return message;
}
