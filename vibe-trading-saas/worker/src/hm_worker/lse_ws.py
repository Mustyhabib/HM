"""
LSE WebSocket adapter — Phase 2 skeleton / Phase 6 implementation target.

IMPORTANT — Phase 2 status: THIS IS A SKELETON.
No live connection is established. No ticks reach users.
Phase 6 will productionise this module per D17 (WebSocket-first architecture).

Why wire the skeleton now?
  Phase 6 will be a PROMOTION of this module, not a rewrite from scratch.
  The class contract, config keys, and storage_path conventions are settled
  in Phase 2 so downstream code (worker, frontend /ws/markets) can reference
  stable symbols even before the wire is live.

Phase 6 will add:
  - Real ``websockets`` async connection (asyncio loop in a thread)
  - Fan-out to the canonical event bus (Redis Streams / NATS — Phase 6 decision)
  - Gap / sequence checks per DATA.md § Feed Health
  - Reconnect-on-drop with exponential back-off
  - Heartbeat monitoring, latency tracking
  - Alert thresholds (>3 reconnects/hour → feed error state)
  - /ws/markets endpoint fan-out to authenticated users
  - Tick archival: buffer → Parquet flush to hm-datalake on close

API reference: https://londonstrategicedge.com/docs/api (WebSocket section)
WSS endpoint: wss://stream.londonstrategicedge.com/v1/live  (verify from LSE docs)
Auth: same LSE_API_KEY as HTTP adapter (one-key model)
"""

from __future__ import annotations

import logging
import threading
from typing import Callable

log = logging.getLogger(__name__)

# TODO (Phase 6): verify WSS endpoint from LSE API docs
_DEFAULT_WS_URL = "wss://stream.londonstrategicedge.com/v1/live"


class LSEWebSocket:
    """
    LSE live-tick WebSocket adapter.

    Phase 2 contract (skeleton):
    - ``connect()``     → logs intent, does NOT open a real connection.
    - ``disconnect()``  → no-op.
    - ``on_tick``       → override to handle ticks (Phase 2: never called).
    - ``is_connected``  → always ``False``.
    - ``status()``      → returns a health snapshot for the /data page.

    Phase 6 contract (live):
    - ``connect()``     → opens WSS, subscribes to ``symbols``, runs recv loop.
    - ``on_tick``       → called for every normalised tick; publishes to event bus.
    - ``is_connected``  → tracks real connection state.
    """

    def __init__(
        self,
        api_key: str,
        symbols: list[str],
        ws_url: str = _DEFAULT_WS_URL,
        on_tick: Callable[[dict], None] | None = None,
    ) -> None:
        self._api_key = api_key
        self.symbols = list(symbols)
        self.ws_url = ws_url
        self._on_tick = on_tick or self._default_on_tick
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._connected = False

    # ── Public API ─────────────────────────────────────────────────────────────

    def connect(self) -> None:
        """
        Start the WebSocket receiver.

        Phase 2: logs the skeleton activation — no actual network connection.
        Phase 6: replaces this with a real ``websockets`` async loop.
        """
        log.info(
            "lse_ws.skeleton_connect — Phase 6 will open WSS here",
            extra={
                "ws_url": self.ws_url,
                "symbols": self.symbols,
                "phase": "2-skeleton",
            },
        )
        # ── Phase 6 implementation (replace this block) ────────────────────────
        # import asyncio, websockets, json
        #
        # async def _recv_loop() -> None:
        #     async with websockets.connect(
        #         self.ws_url,
        #         extra_headers={"Authorization": f"Bearer {self._api_key}"},
        #     ) as ws:
        #         self._connected = True
        #         await ws.send(json.dumps({"op": "subscribe", "symbols": self.symbols}))
        #         async for message in ws:
        #             if self._stop.is_set():
        #                 break
        #             self._on_tick(json.loads(message))
        #         self._connected = False
        #
        # def _thread_target() -> None:
        #     asyncio.run(_recv_loop())
        #
        # self._thread = threading.Thread(target=_thread_target, daemon=True, name="lse-ws")
        # self._thread.start()
        # ── end Phase 6 block ──────────────────────────────────────────────────

    def disconnect(self) -> None:
        """Signal the receiver to stop and wait for the thread to exit."""
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        self._connected = False
        log.info("lse_ws.disconnect", extra={"symbols": self.symbols})

    @property
    def is_connected(self) -> bool:
        """
        Phase 2: always ``False`` (no real connection).
        Phase 6: reflects actual WebSocket connection state.
        """
        return self._connected

    def status(self) -> dict:
        """
        Return a sanitised health snapshot for the /data page feed panel.
        Does NOT expose the API key.
        """
        return {
            "provider": "lse",
            "transport": "websocket",
            "endpoint": self.ws_url,
            "symbols": self.symbols,
            "connected": self.is_connected,
            "phase": "skeleton — Phase 6 will activate",
        }

    # ── Internal ───────────────────────────────────────────────────────────────

    @staticmethod
    def _default_on_tick(tick: dict) -> None:
        """
        Default tick handler: debug-log only.
        Phase 6: override with event bus publisher.
        """
        log.debug("lse_ws.tick", extra={"tick": str(tick)[:120]})
