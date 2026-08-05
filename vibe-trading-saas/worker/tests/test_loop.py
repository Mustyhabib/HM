"""Queue mechanics: what the loop writes back for each run outcome."""

from __future__ import annotations

import threading

import pytest

from hm_worker.config import Config
from hm_worker.db import ClaimedRun
from hm_worker.main import process_run, run_forever
from hm_worker.runner import (
    ClaimLost,
    RunResult,
    RunTimeout,
    StubRunner,
    SystemError_,
    UserInputError,
)


def make_config(**overrides) -> Config:
    defaults = dict(
        supabase_url="https://test.supabase.co",
        service_role_key="test-key",
        worker_id="test-worker",
        poll_interval_seconds=0,
        idle_backoff_seconds=0,
        heartbeat_seconds=1,
        run_timeout_seconds=900,
        stale_after_seconds=1200,
        execute_tradi=False,
        stub_duration_seconds=0,
    )
    defaults.update(overrides)
    return Config(**defaults)


class FakeQueue:
    """Records what the loop would have written."""

    def __init__(self, runs: list[ClaimedRun] | None = None, claim_error: Exception | None = None):
        self._runs = list(runs or [])
        self._claim_error = claim_error
        self.claim_calls = 0
        self.completed: list[str] = []
        self.failed: list[dict] = []
        self.heartbeats: list[str] = []
        self.heartbeat_result = True

    def claim(self) -> ClaimedRun | None:
        self.claim_calls += 1
        if self._claim_error:
            raise self._claim_error
        return self._runs.pop(0) if self._runs else None

    def heartbeat(self, run_id: str) -> bool:
        self.heartbeats.append(run_id)
        return self.heartbeat_result

    def complete(self, run_id: str) -> bool:
        self.completed.append(run_id)
        return True

    def fail(self, run_id, error, *, status="failed", refund=False) -> bool:
        self.failed.append(
            {"run_id": run_id, "error": error, "status": status, "refund": refund}
        )
        return True


class ScriptedRunner:
    def __init__(self, outcome):
        self._outcome = outcome
        self.calls = 0

    def execute(self, run, heartbeat, stop):
        self.calls += 1
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


@pytest.fixture
def run() -> ClaimedRun:
    return ClaimedRun(id="run-1", user_id="user-1", prompt="backtest AAPL", max_iter=10)


def test_successful_run_is_completed(run):
    queue = FakeQueue()
    process_run(queue, ScriptedRunner(RunResult(output="ok")), run, threading.Event())

    assert queue.completed == ["run-1"]
    assert queue.failed == []


def test_user_input_error_is_not_refunded(run):
    queue = FakeQueue()
    process_run(queue, ScriptedRunner(UserInputError("bad prompt")), run, threading.Event())

    assert queue.completed == []
    assert queue.failed == [
        {"run_id": "run-1", "error": "bad prompt", "status": "failed", "refund": False}
    ]


def test_system_error_is_refunded(run):
    queue = FakeQueue()
    process_run(queue, ScriptedRunner(SystemError_("engine crashed")), run, threading.Event())

    assert queue.failed[0]["refund"] is True
    assert queue.failed[0]["status"] == "failed"


def test_timeout_is_refunded_with_timeout_status(run):
    queue = FakeQueue()
    process_run(queue, ScriptedRunner(RunTimeout("exceeded 900s")), run, threading.Event())

    assert queue.failed[0]["status"] == "timeout"
    assert queue.failed[0]["refund"] is True


def test_unexpected_exception_closes_the_run_as_refundable(run):
    queue = FakeQueue()
    process_run(queue, ScriptedRunner(ValueError("boom")), run, threading.Event())

    assert queue.failed[0]["refund"] is True
    assert "ValueError" in queue.failed[0]["error"]


def test_lost_claim_leaves_the_row_untouched(run):
    """Another worker owns it now — writing would clobber their result."""
    queue = FakeQueue()
    process_run(queue, ScriptedRunner(ClaimLost("reclaimed")), run, threading.Event())

    assert queue.completed == []
    assert queue.failed == []


def test_loop_stops_on_signal_and_drains_queue(run):
    queue = FakeQueue(runs=[run])
    stop = threading.Event()

    class StopAfterRun(ScriptedRunner):
        def execute(self, run, heartbeat, stop_event):
            stop.set()
            return RunResult()

    run_forever(make_config(), queue, StopAfterRun(None), stop)

    assert queue.completed == ["run-1"]


def test_claim_failure_backs_off_without_crashing():
    queue = FakeQueue(claim_error=ConnectionError("network down"))
    stop = threading.Event()

    original = queue.claim

    def claim_then_stop():
        stop.set()
        return original()

    queue.claim = claim_then_stop

    run_forever(make_config(), queue, ScriptedRunner(RunResult()), stop)

    assert queue.claim_calls == 1


def test_stub_runner_aborts_when_claim_is_lost(run):
    queue = FakeQueue()
    queue.heartbeat_result = False
    runner = StubRunner(duration_seconds=2, heartbeat_seconds=1)

    with pytest.raises(ClaimLost):
        runner.execute(run, lambda: queue.heartbeat(run.id), threading.Event())


def test_stub_runner_aborts_on_shutdown(run):
    stop = threading.Event()
    stop.set()
    runner = StubRunner(duration_seconds=5, heartbeat_seconds=1)

    with pytest.raises(SystemError_):
        runner.execute(run, lambda: True, stop)
