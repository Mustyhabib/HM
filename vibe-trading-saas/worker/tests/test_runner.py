"""TradiRunner — the subprocess-per-run executor (Day 5).

Driven by a fake `vibe-trading` script so these stay hermetic: no engine, no
LLM, no network, no Supabase. The fake keys its behaviour off the prompt text.
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path

import pytest

from hm_worker.db import ClaimedRun
from hm_worker.runner import (
    ClaimLost,
    RunResult,
    RunTimeout,
    SystemError_,
    TradiRunner,
)

# A stand-in for `vibe-trading`. Receives `run -p <prompt> --json --no-rich
# --max-iter N` and branches on the prompt. Writes a marker into HOME to prove
# per-run isolation.
FAKE_VIBE = r"""
import json, os, sys, time
from pathlib import Path

argv = sys.argv[1:]
prompt = argv[argv.index("-p") + 1] if "-p" in argv else ""

try:
    (Path(os.environ["HOME"]) / "ran.marker").write_text(prompt)
except Exception:
    pass

if prompt == "SUCCEED":
    print(json.dumps({"status": "success", "run_id": "r-ok",
                      "run_dir": os.environ.get("HOME"), "reason": None}))
    sys.exit(0)
if prompt == "FAIL":
    print(json.dumps({"status": "failed", "run_id": "r-bad",
                      "run_dir": None, "reason": "engine boom"}))
    sys.exit(1)
if prompt == "USAGE":
    sys.stderr.write("unrecognized arguments\n")
    sys.exit(2)
if prompt == "BADJSON":
    print("this is not json")
    sys.exit(0)
if prompt == "ARTIFACTS":
    home = Path(os.environ["HOME"])
    (home / "runs" / "r1").mkdir(parents=True, exist_ok=True)
    (home / "runs" / "r1" / "llm_usage.json").write_text('{"tokens": 42}')
    (home / "runs" / "r1" / "strategy.pine").write_text("//@version=5")
    (home / "sessions" / "s1").mkdir(parents=True, exist_ok=True)
    (home / "sessions" / "s1" / "trace.jsonl").write_text(
        '{"type":"step"}\n{"type":"answer","content":"An SMA is the mean price over N periods."}\n'
    )
    (home / "sessions.db").write_bytes(b"BINARYINDEX")
    print(json.dumps({"status": "success", "run_id": "r1",
                      "run_dir": str(home / "runs" / "r1"), "reason": None}))
    sys.exit(0)
if prompt == "SLEEP":
    time.sleep(30)
sys.exit(0)
"""


@pytest.fixture
def fake_command(tmp_path: Path) -> str:
    script = tmp_path / "fake_vibe.py"
    script.write_text(FAKE_VIBE)
    return f"{sys.executable} {script}"


def make_run(prompt: str) -> ClaimedRun:
    return ClaimedRun(id="run-x", user_id="user-1", prompt=prompt, max_iter=5)


def make_runner(fake_command: str, tmp_path: Path, **overrides) -> TradiRunner:
    kw = dict(
        command=fake_command,
        runs_root=str(tmp_path / "runs"),
        timeout_seconds=10,
        heartbeat_seconds=1,
    )
    kw.update(overrides)
    return TradiRunner(**kw)


def test_success_returns_result(fake_command, tmp_path):
    result = make_runner(fake_command, tmp_path).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    assert isinstance(result, RunResult)
    assert "success" in result.output


def test_home_is_isolated_per_run(fake_command, tmp_path):
    make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    marker = tmp_path / "runs" / "run-x" / "ran.marker"
    assert marker.exists() and marker.read_text() == "SUCCEED"


def test_cleanup_removes_run_dir(fake_command, tmp_path):
    make_runner(fake_command, tmp_path, cleanup=True).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    assert not (tmp_path / "runs" / "run-x").exists()


def test_engine_failure_is_refundable_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_) as exc:
        make_runner(fake_command, tmp_path).execute(
            make_run("FAIL"), lambda: True, threading.Event()
        )
    assert exc.value.refundable is True
    assert "engine boom" in str(exc.value)


def test_usage_error_is_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_):
        make_runner(fake_command, tmp_path).execute(
            make_run("USAGE"), lambda: True, threading.Event()
        )


def test_missing_json_is_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_):
        make_runner(fake_command, tmp_path).execute(
            make_run("BADJSON"), lambda: True, threading.Event()
        )


def test_timeout_is_refundable_timeout(fake_command, tmp_path):
    with pytest.raises(RunTimeout) as exc:
        make_runner(fake_command, tmp_path, timeout_seconds=1).execute(
            make_run("SLEEP"), lambda: True, threading.Event()
        )
    assert exc.value.refundable is True
    assert exc.value.status == "timeout"


def test_shutdown_aborts_as_system_error(fake_command, tmp_path):
    stop = threading.Event()
    stop.set()
    with pytest.raises(SystemError_):
        make_runner(fake_command, tmp_path, timeout_seconds=30).execute(
            make_run("SLEEP"), lambda: True, stop
        )


def test_lost_claim_aborts(fake_command, tmp_path):
    with pytest.raises(ClaimLost):
        make_runner(fake_command, tmp_path, timeout_seconds=30, heartbeat_seconds=1).execute(
            make_run("SLEEP"), lambda: False, threading.Event()
        )


def test_collects_artifacts_from_workspace(fake_command, tmp_path):
    result = make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("ARTIFACTS"), lambda: True, threading.Event()
    )
    by_name = {a.name: a for a in result.artifacts}
    # the final answer is extracted from the session trace into a readable report
    assert by_name["answer.md"].kind == "report"
    assert b"SMA is the mean" in by_name["answer.md"].content
    # engine outputs collected + classified; the raw session trace is kept
    assert by_name["runs/r1/strategy.pine"].kind == "pine"
    assert by_name["runs/r1/llm_usage.json"].kind == "json"
    assert by_name["sessions/s1/trace.jsonl"].kind == "trace"
    # the binary FTS index and the worker's own capture logs are excluded
    assert "sessions.db" not in by_name
    assert "stdout.log" not in by_name
    assert "stderr.log" not in by_name
