"""LLM provider catalog — mirrors Tradi/agent/src/providers/llm_providers.json.

The worker must not import the engine (D1), so this module provides a
self-contained copy of the provider catalog.  The Docker image also installs
the engine, so we attempt to read the canonical JSON first; if that fails
(local dev, test, path change), we fall back to the embedded constant.

Each entry tells ``_build_env()`` which environment variables to set so the
engine's ``_sync_provider_env()`` picks the right LLM adapter at runtime.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderEntry:
    """One supported LLM provider."""

    name: str
    label: str
    api_key_env: str | None
    base_url_env: str | None
    default_model: str
    default_base_url: str
    api_key_required: bool

    @property
    def is_base_url_provider(self) -> bool:
        """True for providers that store a URL instead of an API key (ollama, copilot)."""
        return not self.api_key_required


# Paths to try when loading the canonical JSON, ordered by likelihood.
_CATALOG_JSON_PATHS = [
    Path("/app/Tradi/agent/src/providers/llm_providers.json"),  # Docker image
]

# Embedded fallback — synced from llm_providers.json 2026-08-22.
# openai-codex is excluded (requires OAuth, not viable for SaaS BYOK).
_EMBEDDED_CATALOG: list[dict] = [
    {"name": "openrouter", "label": "OpenRouter", "api_key_env": "OPENROUTER_API_KEY", "base_url_env": "OPENROUTER_BASE_URL", "default_model": "deepseek/deepseek-v4-pro", "default_base_url": "https://openrouter.ai/api/v1", "api_key_required": True},
    {"name": "requesty", "label": "Requesty", "api_key_env": "REQUESTY_API_KEY", "base_url_env": "REQUESTY_BASE_URL", "default_model": "openai/gpt-4o-mini", "default_base_url": "https://router.requesty.ai/v1", "api_key_required": True},
    {"name": "openai", "label": "OpenAI", "api_key_env": "OPENAI_API_KEY", "base_url_env": "OPENAI_BASE_URL", "default_model": "gpt-5.5", "default_base_url": "https://api.openai.com/v1", "api_key_required": True},
    {"name": "anthropic", "label": "Anthropic", "api_key_env": "ANTHROPIC_API_KEY", "base_url_env": "ANTHROPIC_BASE_URL", "default_model": "claude-sonnet-4-6", "default_base_url": "https://api.anthropic.com", "api_key_required": True},
    {"name": "deepseek", "label": "DeepSeek", "api_key_env": "DEEPSEEK_API_KEY", "base_url_env": "DEEPSEEK_BASE_URL", "default_model": "deepseek-v4-pro", "default_base_url": "https://api.deepseek.com/v1", "api_key_required": True},
    {"name": "siliconflow-cn", "label": "SiliconFlow (CN)", "api_key_env": "SILICONFLOW_API_KEY", "base_url_env": "SILICONFLOW_BASE_URL", "default_model": "deepseek-ai/DeepSeek-V3.1-Terminus", "default_base_url": "https://api.siliconflow.cn/v1", "api_key_required": True},
    {"name": "siliconflow-global", "label": "SiliconFlow (Global)", "api_key_env": "SILICONFLOW_GLOBAL_API_KEY", "base_url_env": "SILICONFLOW_GLOBAL_BASE_URL", "default_model": "deepseek-ai/DeepSeek-V3.1-Terminus", "default_base_url": "https://api.siliconflow.com/v1", "api_key_required": True},
    {"name": "nvidia", "label": "NVIDIA NIM", "api_key_env": "NVIDIA_API_KEY", "base_url_env": "NVIDIA_BASE_URL", "default_model": "nvidia/nemotron-3-ultra-550b-a55b", "default_base_url": "https://integrate.api.nvidia.com/v1", "api_key_required": True},
    {"name": "gemini", "label": "Gemini", "api_key_env": "GEMINI_API_KEY", "base_url_env": "GEMINI_BASE_URL", "default_model": "gemini-3.5-flash", "default_base_url": "https://generativelanguage.googleapis.com/v1beta/openai/", "api_key_required": True},
    {"name": "groq", "label": "Groq", "api_key_env": "GROQ_API_KEY", "base_url_env": "GROQ_BASE_URL", "default_model": "meta-llama/llama-4-maverick-17b-128e-instruct", "default_base_url": "https://api.groq.com/openai/v1", "api_key_required": True},
    {"name": "novita", "label": "Novita AI", "api_key_env": "NOVITA_API_KEY", "base_url_env": "NOVITA_BASE_URL", "default_model": "moonshotai/kimi-k3", "default_base_url": "https://api.novita.ai/openai", "api_key_required": True},
    {"name": "dashscope", "label": "DashScope / Qwen", "api_key_env": "DASHSCOPE_API_KEY", "base_url_env": "DASHSCOPE_BASE_URL", "default_model": "qwen-plus-latest", "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "api_key_required": True},
    {"name": "qwen", "label": "Qwen", "api_key_env": "DASHSCOPE_API_KEY", "base_url_env": "DASHSCOPE_BASE_URL", "default_model": "qwen-plus-latest", "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "api_key_required": True},
    {"name": "zhipu", "label": "Zhipu", "api_key_env": "ZHIPU_API_KEY", "base_url_env": "ZHIPU_BASE_URL", "default_model": "glm-5.1", "default_base_url": "https://open.bigmodel.cn/api/paas/v4", "api_key_required": True},
    {"name": "glm", "label": "GLM (Zhipu)", "api_key_env": "ZHIPU_API_KEY", "base_url_env": "ZHIPU_BASE_URL", "default_model": "glm-5.1", "default_base_url": "https://open.bigmodel.cn/api/paas/v4", "api_key_required": True},
    {"name": "moonshot", "label": "Moonshot / Kimi", "api_key_env": "MOONSHOT_API_KEY", "base_url_env": "MOONSHOT_BASE_URL", "default_model": "kimi-k2.6", "default_base_url": "https://api.moonshot.ai/v1", "api_key_required": True},
    {"name": "kimi-coding", "label": "Kimi for Coding", "api_key_env": "KIMI_CODING_API_KEY", "base_url_env": "KIMI_CODING_BASE_URL", "default_model": "kimi-for-coding", "default_base_url": "https://api.kimi.com/coding/v1", "api_key_required": True},
    {"name": "minimax", "label": "MiniMax", "api_key_env": "MINIMAX_API_KEY", "base_url_env": "MINIMAX_BASE_URL", "default_model": "MiniMax-M3", "default_base_url": "https://api.minimax.io/v1", "api_key_required": True},
    {"name": "mimo", "label": "Xiaomi MIMO", "api_key_env": "MIMO_API_KEY", "base_url_env": "MIMO_BASE_URL", "default_model": "MiMo-72B-A27B", "default_base_url": "https://api.xiaomimimo.com/v1", "api_key_required": True},
    {"name": "spark", "label": "iFlytek Spark", "api_key_env": "SPARK_API_KEY", "base_url_env": "SPARK_BASE_URL", "default_model": "4.0Ultra", "default_base_url": "https://spark-api-open.xf-yun.com/v1", "api_key_required": True},
    {"name": "zai", "label": "Z.ai", "api_key_env": "ZAI_API_KEY", "base_url_env": "ZAI_BASE_URL", "default_model": "glm-5.1", "default_base_url": "https://api.z.ai/api/coding/paas/v4", "api_key_required": True},
    {"name": "modelscope", "label": "ModelScope", "api_key_env": "MODELSCOPE_API_KEY", "base_url_env": "MODELSCOPE_BASE_URL", "default_model": "Qwen/Qwen3.5-27B", "default_base_url": "https://api-inference.modelscope.cn/v1", "api_key_required": True},
    {"name": "ollama", "label": "Ollama", "api_key_env": None, "base_url_env": "OLLAMA_BASE_URL", "default_model": "qwen2.5:32b", "default_base_url": "http://localhost:11434", "api_key_required": False},
    {"name": "copilot", "label": "GitHub Copilot SDK", "api_key_env": "COPILOT_GITHUB_TOKEN", "base_url_env": "COPILOT_BASE_URL", "default_model": "claude-sonnet-5", "default_base_url": "https://api.githubcopilot.com", "api_key_required": False},
]

# Resolution priority: deepseek first (backward compat with existing users),
# then popular API-key providers, regional providers, base-URL providers last.
_RESOLUTION_ORDER = [
    "deepseek",
    "openai",
    "anthropic",
    "gemini",
    "groq",
    "openrouter",
    "requesty",
    "nvidia",
    "novita",
    "siliconflow-cn",
    "siliconflow-global",
    "dashscope",
    "qwen",
    "zhipu",
    "glm",
    "moonshot",
    "kimi-coding",
    "minimax",
    "mimo",
    "spark",
    "zai",
    "modelscope",
    "ollama",
    "copilot",
]


def _load_catalog() -> tuple[dict[str, ProviderEntry], list[str]]:
    """Load the provider catalog, returning ``(lookup, resolution_order)``."""
    raw: list[dict] = _EMBEDDED_CATALOG

    for path in _CATALOG_JSON_PATHS:
        try:
            raw = json.loads(path.read_text())
            log.debug("loaded provider catalog from %s (%d entries)", path, len(raw))
            break
        except (OSError, json.JSONDecodeError):
            continue

    lookup: dict[str, ProviderEntry] = {}
    for entry in raw:
        name = entry.get("name", "")
        if not name:
            continue
        # Skip openai-codex — requires OAuth, not viable for SaaS BYOK.
        if name == "openai-codex":
            continue
        lookup[name] = ProviderEntry(
            name=name,
            label=entry.get("label", name),
            api_key_env=entry.get("api_key_env"),
            base_url_env=entry.get("base_url_env"),
            default_model=entry.get("default_model", ""),
            default_base_url=entry.get("default_base_url", ""),
            api_key_required=entry.get("api_key_required", True),
        )

    # Build resolution order: prefer the defined priority list, then append
    # any new providers from the catalog that weren't in it.
    order = [n for n in _RESOLUTION_ORDER if n in lookup]
    for name in lookup:
        if name not in order:
            order.append(name)

    return lookup, order


PROVIDER_CATALOG, RESOLUTION_ORDER = _load_catalog()


def get_provider(name: str) -> ProviderEntry | None:
    """Look up a provider by name.  Returns ``None`` if unknown."""
    return PROVIDER_CATALOG.get(name)


def all_provider_names() -> Sequence[str]:
    """All supported provider names in resolution order."""
    return RESOLUTION_ORDER
