"""HealthServer — GET /health contract, 404 elsewhere, binds the given port."""

from __future__ import annotations

import http.client
import socket

import pytest

from hm_worker.health import HealthServer, HealthStatus


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def running_server():
    port = _free_port()
    server = HealthServer(
        lambda: HealthStatus(queue_depth=1, last_poll_at="2026-08-17T00:00:00+00:00"),
        port=port,
    )
    started = server.start()
    assert started
    yield server, port
    server.stop()


def test_health_returns_200_with_expected_shape(running_server):
    _server, port = running_server

    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", "/health")
    resp = conn.getresponse()
    body = resp.read()
    conn.close()

    assert resp.status == 200
    assert resp.getheader("Content-Type") == "application/json"

    import json

    payload = json.loads(body)
    assert payload["status"] == "ok"
    assert payload["queue_depth"] == 1
    assert payload["last_poll_at"] == "2026-08-17T00:00:00+00:00"
    assert "version" in payload


def test_other_paths_return_404(running_server):
    _server, port = running_server

    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", "/does-not-exist")
    resp = conn.getresponse()
    resp.read()
    conn.close()

    assert resp.status == 404


def test_reflects_updated_status_via_callable():
    """The status is pulled live from the injected callable, not cached."""
    port = _free_port()
    state = {"queue_depth": 0, "last_poll_at": None}
    server = HealthServer(
        lambda: HealthStatus(queue_depth=state["queue_depth"], last_poll_at=state["last_poll_at"]),
        port=port,
    )
    server.start()
    try:
        state["queue_depth"] = 1
        state["last_poll_at"] = "2026-08-17T01:00:00+00:00"

        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        conn.request("GET", "/health")
        resp = conn.getresponse()
        import json

        payload = json.loads(resp.read())
        conn.close()

        assert payload["queue_depth"] == 1
        assert payload["last_poll_at"] == "2026-08-17T01:00:00+00:00"
    finally:
        server.stop()


def test_binds_to_the_requested_port():
    port = _free_port()
    server = HealthServer(lambda: HealthStatus(queue_depth=0, last_poll_at=None), port=port)

    try:
        assert server.start() is True
        # A second server on the same port must fail to bind — proves the
        # first one actually holds it, not just that start() returned True.
        other = HealthServer(lambda: HealthStatus(queue_depth=0, last_poll_at=None), port=port)
        assert other.start() is False
    finally:
        server.stop()


def test_stop_is_safe_to_call_when_bind_failed():
    port = _free_port()
    blocker = HealthServer(lambda: HealthStatus(queue_depth=0, last_poll_at=None), port=port)
    blocker.start()
    try:
        failed = HealthServer(lambda: HealthStatus(queue_depth=0, last_poll_at=None), port=port)
        assert failed.start() is False
        failed.stop()  # must not raise
    finally:
        blocker.stop()
