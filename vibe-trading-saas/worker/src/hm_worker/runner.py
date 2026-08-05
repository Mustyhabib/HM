"""Execution of a claimed run.

Day 4 ships :class:`StubRunner` only — it proves the queue mechanics (claim →
running → completed) without invoking Tradi. Day 5 adds a ``TradiRunner`` that
implements the same :class:`Runner` interface by launching

    HOME=/var/vibe-runs/<run_id> vibe-trading run -p "<prompt>" --json --max-iter N

as a subprocess with a wall-clock timeout. Keeping the interface here means the
polling loop in :mod:`hm_worker.main` does not change when that lands.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Callable, Protocol

from .db import ClaimedRun

log = logging.getLogger(__name__)

#: Called periodically during a run to keep the claim alive. Returns False if
#: the claim was lost (another worker reclaimed it), which aborts the run.
Heartbeat = Callable[[], bool]


class RunError(Exception):
    """Base for run failures.

    ``refundable`` follows CLAUDE.md's quota rule: a system-caused failure gives
    the use back, a user-input error does not.
    """

    refundable = False
    status = "failed"


class UserInputError(RunError):
    """The prompt itself was the problem. Not refunded."""


class SystemError_(RunError):
    """Crash, infra fault, or anything not the user's fault. Refunded."""

    refundable = True


class RunTimeout(RunError):
    """Exceeded the wall-clock budget. Refunded."""

    refundable = True
    status = "timeout"


class ClaimLost(RunError):
    """Another worker reclaimed this run mid-flight; drop it silently."""


@dataclass
class RunResult:
    """What a runner produces. Artifacts are wired up on Day 6."""

    output: str = ""
    artifacts: list[dict] = field(default_factory=list)


class Runner(Protocol):
    def execute(
        self,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
    ) -> RunResult: ...


class StubRunner:
    """Day 4 placeholder: sleeps, heartbeats, succeeds.

    Sleeps in short slices so a shutdown signal is honoured promptly instead of
    blocking for the full duration.
    """

    def __init__(self, duration_seconds: int, heartbeat_seconds: int) -> None:
        self._duration = duration_seconds
        self._heartbeat_every = max(1, heartbeat_seconds)

    def execute(
        self,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
    ) -> RunResult:
        log.info("stub-executing run %s (%ss)", run.id, self._duration)

        elapsed = 0
        slice_seconds = 1
        while elapsed < self._duration:
            if stop.wait(timeout=slice_seconds):
                raise SystemError_("Worker shut down mid-run")
            elapsed += slice_seconds

            if elapsed % self._heartbeat_every == 0 and not heartbeat():
                raise ClaimLost(f"Lost claim on run {run.id}")

        return RunResult(output=f"[stub] would have run: {run.prompt[:200]}")
