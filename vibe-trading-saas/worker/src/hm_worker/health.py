"""Minimal stdlib HTTP health endpoint — no framework, no new dependency.

Railway has no way to healthcheck a worker with no HTTP surface. This adds
just enough of one: ``GET /health`` on a daemon thread. Default bind is
``0.0.0.0`` so Railway's healthcheck probe can reach it (Railway checks from
outside the container). The endpoint carries no sensitive data (queue depth,
a timestamp, version). Override the host via ``WORKER_HEALTH_HOST`` if you
want loopback-only for local development.
"""

from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import metadata as importlib_metadata

log = logging.getLogger(__name__)


def _worker_version() -> str:
    try:
        return importlib_metadata.version("hm-worker")
    except importlib_metadata.PackageNotFoundError:  # pragma: no cover - dev checkout
        return "0.0.0"


@dataclass(frozen=True)
class HealthStatus:
    """A point-in-time snapshot the health endpoint reports."""

    queue_depth: int
    last_poll_at: str | None  # ISO 8601, or None before the first poll


#: Supplied by the caller at construction — main.py wires this to whatever it
#: is already tracking (see main._LiveState) so this module doesn't need to
#: know anything about the polling loop.
StatusFn = Callable[[], HealthStatus]


def _make_handler(status_fn: StatusFn) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # stdlib method name, not our naming convention
            if self.path != "/health":
                self.send_response(404)
                self.end_headers()
                return
            status = status_fn()
            body = json.dumps(
                {
                    "status": "ok",
                    "version": _worker_version(),
                    "queue_depth": status.queue_depth,
                    "last_poll_at": status.last_poll_at,
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            # Silence BaseHTTPRequestHandler's default stderr access log —
            # structured logs (logging_config.py) are the source of truth.
            pass

    return Handler


class HealthServer:
    """Wraps :class:`http.server.ThreadingHTTPServer` in a daemon thread.

    Binding failure (port already in use, etc.) is logged and swallowed —
    uptime is best-effort at MVP (design edge case: "must NOT crash the
    worker").
    """

    def __init__(self, status_fn: StatusFn, host: str = "0.0.0.0", port: int = 9100) -> None:
        self._status_fn = status_fn
        self._host = host
        self._port = port
        self._httpd: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> bool:
        """Bind and start serving. Returns False if the port can't be bound."""
        try:
            self._httpd = ThreadingHTTPServer(
                (self._host, self._port), _make_handler(self._status_fn)
            )
        except OSError as exc:
            log.warning("could not bind health server on %s:%s: %s", self._host, self._port, exc)
            return False
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, name="hm-worker-health", daemon=True
        )
        self._thread.start()
        log.info("health server listening on %s:%s", self._host, self._port)
        return True

    def stop(self) -> None:
        """Best-effort shutdown — never raises, safe to call even if start() failed."""
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
