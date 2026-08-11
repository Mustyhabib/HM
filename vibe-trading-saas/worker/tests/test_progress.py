"""TraceTailer — reads engine trace events and pushes progress lines."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from hm_worker.progress import TraceTailer, _friendly


def test_friendly_maps_start_event():
    assert _friendly({"type": "start", "iter": 0}) == "Starting agent"


def test_friendly_maps_tool_call_with_known_verb():
    msg = _friendly({"type": "tool_call", "tool": "get_market_data", "iter": 1})
    assert msg == "Fetching market data"


def test_friendly_maps_tool_call_with_ticker_hint():
    msg = _friendly({
        "type": "tool_call", "tool": "get_market_data",
        "args": {"ticker": "AAPL"},
    })
    assert msg == "Fetching market data: AAPL"


def test_friendly_maps_unknown_tool_to_generic_verb():
    msg = _friendly({"type": "tool_call", "tool": "obscure_thing"})
    assert msg == "Calling obscure_thing"


def test_friendly_tool_result_ok_is_done():
    msg = _friendly({"type": "tool_result", "tool": "backtest", "status": "ok"})
    assert msg == "Running backtest — done"


def test_friendly_tool_result_error_is_retry():
    msg = _friendly({"type": "tool_result", "tool": "backtest", "status": "error"})
    assert "retrying after error" in msg


def test_friendly_skips_terminal_events():
    for et in ("answer", "end", "cancelled"):
        assert _friendly({"type": et}) is None


def test_friendly_skips_unknown_types():
    assert _friendly({"type": "totally_unknown"}) is None
    assert _friendly({}) is None


def test_tailer_pushes_new_events(tmp_path: Path):
    """Write two trace events; the tailer should push both progress lines."""
    trace_dir = tmp_path / "sessions" / "s1"
    trace_dir.mkdir(parents=True)
    trace = trace_dir / "trace.jsonl"
    trace.write_text('{"type":"start","iter":0}\n')

    pushed: list[tuple[str, int | None]] = []
    tailer = TraceTailer(run_dir=tmp_path, push=lambda m, i: pushed.append((m, i)))
    tailer.start()
    # Give the tailer one poll cycle to see the initial line
    time.sleep(1.3)
    # Append a second event
    with trace.open("a") as f:
        f.write('{"type":"tool_call","tool":"backtest","iter":2}\n')
    time.sleep(1.3)
    tailer.stop()

    messages = [m for m, _ in pushed]
    assert "Starting agent" in messages
    assert "Running backtest" in messages


def test_tailer_coalesces_identical_messages(tmp_path: Path):
    """Two identical thinking events in a row should push only once."""
    trace_dir = tmp_path / "sessions" / "s1"
    trace_dir.mkdir(parents=True)
    trace = trace_dir / "trace.jsonl"
    trace.write_text(
        '{"type":"thinking","iter":1}\n{"type":"thinking","iter":2}\n'
    )

    pushed: list[str] = []
    tailer = TraceTailer(run_dir=tmp_path, push=lambda m, _i: pushed.append(m))
    tailer.start()
    time.sleep(1.3)
    tailer.stop()

    # Only one "Reasoning..." line even though there were two thinking events
    assert pushed.count("Reasoning about the next step") == 1


def test_tailer_handles_missing_trace_file(tmp_path: Path):
    """Trace file may not exist yet when the tailer starts — no crash."""
    pushed: list[str] = []
    tailer = TraceTailer(run_dir=tmp_path, push=lambda m, _i: pushed.append(m))
    tailer.start()
    time.sleep(1.2)
    tailer.stop()
    assert pushed == []


def test_tailer_ignores_malformed_json(tmp_path: Path):
    """A truncated or bad JSON line should be skipped, not crash the thread."""
    trace_dir = tmp_path / "sessions" / "s1"
    trace_dir.mkdir(parents=True)
    trace = trace_dir / "trace.jsonl"
    trace.write_text(
        'not-json\n'
        '{"type":"start"}\n'
        '{"broken\n'
    )
    pushed: list[str] = []
    tailer = TraceTailer(run_dir=tmp_path, push=lambda m, _i: pushed.append(m))
    tailer.start()
    time.sleep(1.3)
    tailer.stop()
    assert "Starting agent" in pushed
    # Broken lines don't produce anything
    assert len(pushed) == 1


def test_tailer_stops_promptly(tmp_path: Path):
    """stop() must return within its timeout even if the thread is idle."""
    tailer = TraceTailer(run_dir=tmp_path, push=lambda _m, _i: None)
    tailer.start()
    start = time.monotonic()
    tailer.stop(timeout=2.5)
    assert time.monotonic() - start < 2.5
