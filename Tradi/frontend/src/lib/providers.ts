/**
 * LLM provider catalog — frontend mirror of llm_providers.json.
 *
 * Defines every LLM provider the platform supports for BYOK (bring your own
 * key). The worker uses the same catalog (providers.py) to resolve the user's
 * configured credential at run time.
 *
 * openai-codex is excluded — it requires OAuth, which isn't viable for our
 * SaaS BYOK model where the worker runs the credential server-side.
 */

export interface LlmProvider {
  /** Machine name — matches the DB provider column and llm_providers.json "name". */
  name: string;
  /** Human-readable display label. */
  label: string;
  /** True if this provider uses an API key; false if it uses a base URL. */
  apiKeyRequired: boolean;
  /** Placeholder for the input field. */
  placeholder: string;
  /** Input type: "password" for API keys, "url" for base URLs. */
  inputType: "password" | "url";
  /** Optional help URL where users can get their key. */
  helpUrl?: string;
  /** Short description shown under the provider name. */
  description: string;
  /** Whether this is a "featured" / popular provider (shown first in the UI). */
  featured: boolean;
  /** Category for grouping in the UI. */
  category: "popular" | "router" | "regional" | "self-hosted";
}

/**
 * All supported providers, ordered for display.
 * Popular providers first, then routers, then regional, then self-hosted.
 */
export const LLM_PROVIDERS: LlmProvider[] = [
  // ─── Popular ──────────────────────────────────────────────
  {
    name: "deepseek",
    label: "DeepSeek",
    apiKeyRequired: true,
    placeholder: "sk-...",
    inputType: "password",
    helpUrl: "https://platform.deepseek.com/api_keys",
    description: "DeepSeek AI — recommended for trading research.",
    featured: true,
    category: "popular",
  },
  {
    name: "openai",
    label: "OpenAI",
    apiKeyRequired: true,
    placeholder: "sk-...",
    inputType: "password",
    helpUrl: "https://platform.openai.com/api-keys",
    description: "GPT-5.5 and other OpenAI models.",
    featured: true,
    category: "popular",
  },
  {
    name: "anthropic",
    label: "Anthropic",
    apiKeyRequired: true,
    placeholder: "sk-ant-...",
    inputType: "password",
    helpUrl: "https://console.anthropic.com/settings/keys",
    description: "Claude models via the Anthropic API.",
    featured: true,
    category: "popular",
  },
  {
    name: "gemini",
    label: "Gemini",
    apiKeyRequired: true,
    placeholder: "AIza...",
    inputType: "password",
    helpUrl: "https://aistudio.google.com/apikey",
    description: "Google Gemini models.",
    featured: true,
    category: "popular",
  },
  {
    name: "groq",
    label: "Groq",
    apiKeyRequired: true,
    placeholder: "gsk_...",
    inputType: "password",
    helpUrl: "https://console.groq.com/keys",
    description: "Ultra-fast inference — Llama, Mixtral, and more.",
    featured: true,
    category: "popular",
  },

  // ─── Routers ──────────────────────────────────────────────
  {
    name: "openrouter",
    label: "OpenRouter",
    apiKeyRequired: true,
    placeholder: "sk-or-...",
    inputType: "password",
    helpUrl: "https://openrouter.ai/keys",
    description: "Access 200+ models through one API key.",
    featured: true,
    category: "router",
  },
  {
    name: "requesty",
    label: "Requesty",
    apiKeyRequired: true,
    placeholder: "Your Requesty API key",
    inputType: "password",
    helpUrl: "https://requesty.ai",
    description: "AI model router with smart routing.",
    featured: false,
    category: "router",
  },

  // ─── Regional / Specialized ───────────────────────────────
  {
    name: "nvidia",
    label: "NVIDIA NIM",
    apiKeyRequired: true,
    placeholder: "nvapi-...",
    inputType: "password",
    helpUrl: "https://build.nvidia.com",
    description: "NVIDIA NIM inference microservices.",
    featured: false,
    category: "regional",
  },
  {
    name: "novita",
    label: "Novita AI",
    apiKeyRequired: true,
    placeholder: "Your Novita API key",
    inputType: "password",
    helpUrl: "https://novita.ai",
    description: "Affordable model inference.",
    featured: false,
    category: "regional",
  },
  {
    name: "siliconflow-cn",
    label: "SiliconFlow (CN)",
    apiKeyRequired: true,
    placeholder: "Your SiliconFlow API key",
    inputType: "password",
    helpUrl: "https://siliconflow.cn",
    description: "SiliconFlow China region.",
    featured: false,
    category: "regional",
  },
  {
    name: "siliconflow-global",
    label: "SiliconFlow (Global)",
    apiKeyRequired: true,
    placeholder: "Your SiliconFlow API key",
    inputType: "password",
    helpUrl: "https://siliconflow.com",
    description: "SiliconFlow global region.",
    featured: false,
    category: "regional",
  },
  {
    name: "dashscope",
    label: "DashScope / Qwen",
    apiKeyRequired: true,
    placeholder: "Your DashScope API key",
    inputType: "password",
    helpUrl: "https://dashscope.console.aliyun.com",
    description: "Alibaba Cloud DashScope — Qwen models.",
    featured: false,
    category: "regional",
  },
  {
    name: "qwen",
    label: "Qwen",
    apiKeyRequired: true,
    placeholder: "Your DashScope API key",
    inputType: "password",
    helpUrl: "https://dashscope.console.aliyun.com",
    description: "Qwen models via DashScope.",
    featured: false,
    category: "regional",
  },
  {
    name: "zhipu",
    label: "Zhipu",
    apiKeyRequired: true,
    placeholder: "Your Zhipu API key",
    inputType: "password",
    helpUrl: "https://open.bigmodel.cn",
    description: "Zhipu AI — GLM models.",
    featured: false,
    category: "regional",
  },
  {
    name: "glm",
    label: "GLM (Zhipu)",
    apiKeyRequired: true,
    placeholder: "Your Zhipu API key",
    inputType: "password",
    helpUrl: "https://open.bigmodel.cn",
    description: "GLM models via Zhipu.",
    featured: false,
    category: "regional",
  },
  {
    name: "moonshot",
    label: "Moonshot / Kimi",
    apiKeyRequired: true,
    placeholder: "Your Moonshot API key",
    inputType: "password",
    helpUrl: "https://platform.moonshot.cn",
    description: "Moonshot AI — Kimi models.",
    featured: false,
    category: "regional",
  },
  {
    name: "kimi-coding",
    label: "Kimi for Coding",
    apiKeyRequired: true,
    placeholder: "Your Kimi Coding API key",
    inputType: "password",
    helpUrl: "https://platform.moonshot.cn",
    description: "Kimi optimized for code generation.",
    featured: false,
    category: "regional",
  },
  {
    name: "minimax",
    label: "MiniMax",
    apiKeyRequired: true,
    placeholder: "Your MiniMax API key",
    inputType: "password",
    helpUrl: "https://platform.minimax.io",
    description: "MiniMax AI models.",
    featured: false,
    category: "regional",
  },
  {
    name: "mimo",
    label: "Xiaomi MIMO",
    apiKeyRequired: true,
    placeholder: "Your MIMO API key",
    inputType: "password",
    helpUrl: "https://xiaomimimo.com",
    description: "Xiaomi MIMO large language models.",
    featured: false,
    category: "regional",
  },
  {
    name: "spark",
    label: "iFlytek Spark",
    apiKeyRequired: true,
    placeholder: "Your Spark API key",
    inputType: "password",
    helpUrl: "https://xinghuo.xfyun.cn",
    description: "iFlytek Spark AI models.",
    featured: false,
    category: "regional",
  },
  {
    name: "zai",
    label: "Z.ai",
    apiKeyRequired: true,
    placeholder: "Your Z.ai API key",
    inputType: "password",
    helpUrl: "https://z.ai",
    description: "Z.ai model API.",
    featured: false,
    category: "regional",
  },
  {
    name: "modelscope",
    label: "ModelScope",
    apiKeyRequired: true,
    placeholder: "Your ModelScope API key",
    inputType: "password",
    helpUrl: "https://modelscope.cn",
    description: "Alibaba ModelScope inference.",
    featured: false,
    category: "regional",
  },

  // ─── Self-hosted ──────────────────────────────────────────
  {
    name: "ollama",
    label: "Ollama",
    apiKeyRequired: false,
    placeholder: "http://localhost:11434",
    inputType: "url",
    helpUrl: "https://ollama.com",
    description: "Self-hosted — no API key needed, just a URL.",
    featured: true,
    category: "self-hosted",
  },
  {
    name: "copilot",
    label: "GitHub Copilot",
    apiKeyRequired: false,
    placeholder: "https://api.githubcopilot.com",
    inputType: "url",
    helpUrl: "https://github.com/features/copilot",
    description: "GitHub Copilot SDK — base URL.",
    featured: false,
    category: "self-hosted",
  },
];

/** Lookup map for O(1) access by name. */
export const PROVIDER_MAP = new Map(LLM_PROVIDERS.map((p) => [p.name, p]));

/** Featured providers (shown in the main grid). */
export const FEATURED_PROVIDERS = LLM_PROVIDERS.filter((p) => p.featured);

/** Non-featured providers (shown in the expandable "More providers" section). */
export const MORE_PROVIDERS = LLM_PROVIDERS.filter((p) => !p.featured);

/** All valid provider names. */
export const PROVIDER_NAMES = LLM_PROVIDERS.map((p) => p.name);
