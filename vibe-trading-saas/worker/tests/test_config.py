"""Config loading — especially that the service-role key never leaks into logs."""

from __future__ import annotations

import pytest

from hm_worker.config import ConfigError, load_config


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for key in list(os_environ_keys()):
        monkeypatch.delenv(key, raising=False)


def os_environ_keys():
    import os

    return [k for k in os.environ if k.startswith(("SUPABASE_", "WORKER_"))]


def test_missing_url_is_rejected(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    with pytest.raises(ConfigError, match="SUPABASE_URL"):
        load_config()


def test_missing_service_key_is_rejected(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    with pytest.raises(ConfigError, match="SUPABASE_SERVICE_ROLE_KEY"):
        load_config()


def test_non_integer_setting_is_rejected(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("WORKER_POLL_INTERVAL_SECONDS", "soon")
    with pytest.raises(ConfigError, match="must be an integer"):
        load_config()


def test_repr_redacts_the_service_role_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "super-secret-key")

    rendered = repr(load_config())

    assert "super-secret-key" not in rendered
    assert "<redacted>" in rendered


def test_stale_window_defaults_above_the_run_timeout(monkeypatch):
    """Otherwise a healthy long run gets reclaimed and executed twice."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("WORKER_RUN_TIMEOUT_SECONDS", "600")

    config = load_config()

    assert config.stale_after_seconds > config.run_timeout_seconds


def test_worker_id_is_generated_when_unset(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

    assert load_config().worker_id


def test_llm_routing_defaults(monkeypatch):
    """BUG-ENG-4: DeepSeek routing vars default to the provider catalog values."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

    config = load_config()

    assert config.llm_provider == "deepseek"
    assert config.llm_model == "deepseek-v4-pro"


def test_llm_routing_env_overrides(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("WORKER_LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("WORKER_LLM_MODEL", "deepseek/deepseek-v4-pro")

    config = load_config()

    assert config.llm_provider == "openrouter"
    assert config.llm_model == "deepseek/deepseek-v4-pro"
