"""LLM provider catalog for the worker.

The SaaS BYOK layer accepts a fixed set of providers, seeded into the
Supabase ``llm_provider_catalog`` table by the 2026_08_23 migration. The
worker caches that catalog at boot (via ``list_supported_llm_providers``)
so ``TradiRunner`` can map a provider name to the env vars the engine
expects (``LANGCHAIN_PROVIDER`` + the provider's ``api_key_env`` /
``base_url_env``) without reading the engine's own JSON file — the worker
must not import the engine.

A provider is either:
  * ``key``  — the user supplies an API key (e.g. OpenAI, DeepSeek).
  * ``url``  — the user supplies a base URL, no key (e.g. self-hosted Ollama).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Callable

from supabase import Client

log = __import__("logging").getLogger(__name__)


@dataclass(frozen=True)
class ProviderSpec:
    """One catalog entry."""

    name: str
    label: str
    provider_type: str  # "key" | "url"
    api_key_env: str | None
    base_url_env: str | None
    default_model: str
    default_base_url: str
    base_url_options: tuple[str, ...] = ()
    auth_type: str | None = None

    @property
    def is_url_type(self) -> bool:
        return self.provider_type == "url"


class ProviderCatalog:
    """Cached, read-only view of the supported providers.

    Populated once at worker boot via :meth:`load`. Thread-safe reads
    after load (the dict is frozen at load time). Lookups by name are
    O(1). A missing provider is treated as unsupported by the caller.
    """

    def __init__(self) -> None:
        self._by_name: dict[str, ProviderSpec] = {}
        self._loaded = False
        self._lock = threading.Lock()

    def load(self, client: Client) -> None:
        """Fetch the catalog from Supabase and cache it.

        Best-effort: on any failure we log and keep whatever we had (an
        empty catalog if this is the first load). The runner will then
        fail closed (unsupported provider) rather than silently mis-route
        a run — safer than inventing env vars.
        """
        try:
            rows = client.rpc("list_supported_llm_providers").execute()
            data = rows.data or []
        except Exception:  # noqa: BLE001 — catalog is best-effort at boot
            log.warning("failed to load LLM provider catalog; runs will fail closed", exc_info=True)
            return

        with self._lock:
            self._by_name = {
                str(entry["name"]): ProviderSpec(
                    name=str(entry["name"]),
                    label=str(entry.get("label", entry["name"])),
                    provider_type=str(entry.get("provider_type", "key")),
                    api_key_env=entry.get("api_key_env"),
                    base_url_env=entry.get("base_url_env"),
                    default_model=str(entry.get("default_model", "")),
                    default_base_url=str(entry.get("default_base_url", "")),
                    base_url_options=tuple(entry.get("base_url_options") or ()),
                    auth_type=entry.get("auth_type"),
                )
                for entry in data
            }
            self._loaded = True
        log.info("loaded %d supported LLM providers", len(self._by_name))

    def get(self, name: str) -> ProviderSpec | None:
        return self._by_name.get(name)

    def __contains__(self, name: str) -> bool:
        return name in self._by_name

    @property
    def loaded(self) -> bool:
        return self._loaded

    def names(self) -> list[str]:
        return sorted(self._by_name)


# Module-level singleton, populated by main.py at boot. Kept as a plain
# module global (not a fixture) so the runner can read it without DI
# churn; tests register their own catalog via set_catalog().
_CATALOG = ProviderCatalog()
# Resolver: given (user_id, preferred_provider) -> the provider name the
# run should use, or None. Wired by main.py (reads user_llm_prefs +
# resolved_run_provider). Signature mirrors the DB helper.
_provider_resolver: Callable[[str], str | None] | None = None


def set_provider_resolver(fn: Callable[[str], str | None] | None) -> None:
    global _provider_resolver
    _provider_resolver = fn


def set_catalog(catalog: ProviderCatalog) -> None:
    global _CATALOG
    _CATALOG = catalog


def get_catalog() -> ProviderCatalog:
    return _CATALOG
