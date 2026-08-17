"""Worker configuration, read once at startup from the environment."""

from __future__ import annotations

import os
import socket
import uuid
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or invalid."""


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ConfigError(f"Missing required environment variable: {name}")
    return value


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer, got {raw!r}") from exc


def _default_worker_id() -> str:
    return f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"


@dataclass(frozen=True)
class Config:
    supabase_url: str
    service_role_key: str
    worker_id: str

    poll_interval_seconds: int
    idle_backoff_seconds: int
    heartbeat_seconds: int
    run_timeout_seconds: int
    stale_after_seconds: int

    # Day 4: no real Tradi invocation yet. Flip via env once Day 5 lands.
    execute_tradi: bool
    stub_duration_seconds: int

    # Day 5: how the worker launches the engine and where per-run HOME dirs live.
    tradi_command: str = "vibe-trading"
    runs_root: str = "/var/vibe-runs"

    # Phase 7 monitoring: both optional — absent means "off", not an error.
    # sentry_dsn: manual per-env setup in sentry.io (D-M1: DSN-driven, fail-open).
    # health_port: stdlib HTTP health endpoint (see health.py).
    sentry_dsn: str | None = None
    health_port: int = 9100

    def __repr__(self) -> str:  # pragma: no cover - defensive, keeps the key out of logs
        return (
            f"Config(supabase_url={self.supabase_url!r}, worker_id={self.worker_id!r}, "
            f"poll_interval_seconds={self.poll_interval_seconds}, "
            f"run_timeout_seconds={self.run_timeout_seconds}, "
            f"execute_tradi={self.execute_tradi}, health_port={self.health_port}, "
            f"sentry_dsn={'<redacted>' if self.sentry_dsn else None}, "
            f"service_role_key=<redacted>)"
        )


def load_config() -> Config:
    """Build a Config from the environment, failing loudly on anything missing."""
    stale_default = _int("WORKER_RUN_TIMEOUT_SECONDS", 900) + 300
    return Config(
        supabase_url=_require("SUPABASE_URL"),
        service_role_key=_require("SUPABASE_SERVICE_ROLE_KEY"),
        worker_id=os.environ.get("WORKER_ID", "").strip() or _default_worker_id(),
        poll_interval_seconds=_int("WORKER_POLL_INTERVAL_SECONDS", 2),
        idle_backoff_seconds=_int("WORKER_IDLE_BACKOFF_SECONDS", 30),
        heartbeat_seconds=_int("WORKER_HEARTBEAT_SECONDS", 30),
        run_timeout_seconds=_int("WORKER_RUN_TIMEOUT_SECONDS", 900),
        stale_after_seconds=_int("WORKER_STALE_AFTER_SECONDS", stale_default),
        execute_tradi=os.environ.get("WORKER_EXECUTE_TRADI", "").strip().lower()
        in {"1", "true", "yes"},
        stub_duration_seconds=_int("WORKER_STUB_DURATION_SECONDS", 3),
        tradi_command=os.environ.get("WORKER_TRADI_COMMAND", "").strip() or "vibe-trading",
        runs_root=os.environ.get("WORKER_RUNS_ROOT", "").strip() or "/var/vibe-runs",
        sentry_dsn=os.environ.get("SENTRY_DSN", "").strip() or None,
        health_port=_int("WORKER_HEALTH_PORT", 9100),
    )
