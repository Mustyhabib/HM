"""Trace-tail progress streamer.

Runs alongside a TradiRunner subprocess. Watches the engine's ``trace.jsonl``,
parses each new event, maps it to a human-readable line, and forwards it via
a caller-supplied ``push`` callback (usually ``RunQueue.progress``).

Design notes:
* Thread-based, not asyncio — the TradiRunner supervise loop is sync too.
* Byte-offset tracking so we only parse new lines each tick.
* Never raises upward — a broken trace file must not kill a real run.
* Rate-limits identical messages (thinking/tool_call floods) so the UI stays
  readable and the DB update rate stays polite.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

log = logging.getLogger(__name__)

# Called by the tailer for every distinct progress line.
# Signature: (message, iteration | None) -> None
ProgressPush = Callable[[str, Optional[int]], None]

# Poll cadence — how often to check the trace file for new bytes.
POLL_INTERVAL_SEC = 1.0

# Same-message coalescing: don't push identical text twice in a row.
# Same-tool coalescing window: back-to-back tool_call events for the same tool
# collapse to one line for this many seconds.
COALESCE_TOOL_WINDOW_SEC = 3.0

# Tool-name → user-facing verb. Anything unmapped falls back to the raw name.
_TOOL_VERB: Dict[str, str] = {
    "bash":            "Running computation",
    "read_file":       "Reading file",
    "write_file":      "Writing file",
    "load_skill":      "Loading skill",
    "get_market_data": "Fetching market data",
    "read_url":        "Reading web page",
    "web_search":      "Searching the web",
    "backtest":        "Running backtest",
    "remember":        "Saving to memory",
    "recall":          "Recalling from memory",
    "list_skills":     "Listing available skills",
    "swarm_run":       "Launching sub-team",
}


def _friendly(event: Dict[str, Any]) -> Optional[str]:
    """Translate one trace event to a user-facing progress line.

    Returns None to skip: uninteresting types, malformed events, or types
    that the terminal-status transitions already cover (start/end/answer).
    """
    et = event.get("type")
    if not isinstance(et, str):
        return None

    if et == "start":
        return "Starting agent"
    if et == "thinking":
        return "Reasoning about the next step"
    if et == "tool_call":
        tool = str(event.get("tool") or event.get("name") or "").strip()
        verb = _TOOL_VERB.get(tool, f"Calling {tool}" if tool else "Calling a tool")
        # Include the arg preview if short and useful
        args = event.get("args") or event.get("arguments") or ""
        if isinstance(args, dict):
            # Prefer meaningful hints without exposing full args
            hint = args.get("symbol") or args.get("ticker") or args.get("skill")
            if hint:
                return f"{verb}: {hint}"
        return verb
    if et == "tool_result":
        tool = str(event.get("tool") or "").strip()
        status = str(event.get("status") or "")
        verb = _TOOL_VERB.get(tool, tool or "Tool")
        if status == "error":
            return f"{verb} — retrying after error"
        return f"{verb} — done"
    if et == "message":
        return "Drafting response"
    if et == "compact" or et == "compact_requested":
        return "Compacting context"
    if et == "goal_intermediate_answer":
        return "Assembling partial answer"
    # Terminal states are reported via status column, not progress.
    if et in ("answer", "end", "cancelled"):
        return None
    return None


class TraceTailer:
    """Polls ``trace.jsonl``, forwards each new event to ``push`` in a thread.

    Usage:
        tailer = TraceTailer(run_dir=..., push=queue.progress_bound_to_run_id)
        tailer.start()
        try:
            ... run the subprocess ...
        finally:
            tailer.stop()
    """

    def __init__(self, *, run_dir: Path, push: ProgressPush) -> None:
        self._run_dir = Path(run_dir)
        self._push = push
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_msg: Optional[str] = None
        self._last_tool_key: Optional[str] = None
        self._last_tool_at: float = 0.0

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._loop,
            name=f"trace-tailer:{self._run_dir.name}",
            daemon=True,
        )
        self._thread.start()

    def stop(self, timeout: float = 2.0) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)

    # ---- internals -----------------------------------------------------

    def _loop(self) -> None:
        trace_paths: list[Path] = []
        offsets: dict[Path, int] = {}
        try:
            while not self._stop.wait(POLL_INTERVAL_SEC):
                # Trace files may not exist yet — discover them each tick.
                new_paths = list(self._run_dir.rglob("trace.jsonl"))
                for p in new_paths:
                    if p not in trace_paths:
                        trace_paths.append(p)
                        offsets[p] = 0
                for p in trace_paths:
                    self._read_new(p, offsets)
        except Exception:  # noqa: BLE001
            # A broken trace file must never kill the run. Log and exit thread.
            log.debug("trace tailer crashed for %s", self._run_dir, exc_info=True)

    def _read_new(self, path: Path, offsets: dict[Path, int]) -> None:
        try:
            size = path.stat().st_size
        except OSError:
            return
        if size <= offsets[path]:
            return
        try:
            with path.open("rb") as f:
                f.seek(offsets[path])
                data = f.read(size - offsets[path])
            offsets[path] = size
        except OSError:
            return

        for raw_line in data.splitlines():
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line.startswith("{"):
                continue
            try:
                evt = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(evt, dict):
                continue
            self._maybe_push(evt)

    def _maybe_push(self, evt: Dict[str, Any]) -> None:
        message = _friendly(evt)
        if message is None:
            return

        iteration = evt.get("iter")
        iteration = int(iteration) if isinstance(iteration, (int, float)) else None

        # Coalesce: don't repeat the exact same line
        if message == self._last_msg:
            return

        # Coalesce: same tool_call/tool_result within a short window collapses
        et = evt.get("type")
        tool = str(evt.get("tool") or evt.get("name") or "")
        if et in ("tool_call", "tool_result") and tool:
            key = f"{et}:{tool}"
            now = time.monotonic()
            if key == self._last_tool_key and (now - self._last_tool_at) < COALESCE_TOOL_WINDOW_SEC:
                return
            self._last_tool_key = key
            self._last_tool_at = now

        self._last_msg = message
        try:
            self._push(message, iteration)
        except Exception:  # noqa: BLE001
            log.debug("progress push failed (non-fatal)", exc_info=True)
