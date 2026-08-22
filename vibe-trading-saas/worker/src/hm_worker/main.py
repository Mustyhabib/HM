"""Polling loop: claim a run, execute it, close it out. Repeat until signalled."""

from __future__ import annotations

import logging
import signal
import sys
import threading
from datetime import UTC, datetime

from .artifacts import ArtifactStore
from .config import Config, ConfigError, load_config
from .db import ClaimedRun, RunQueue
from .health import HealthServer, HealthStatus
from .logging_config import set_run_id, setup_logging
from .runner import (
    ClaimLost,
    Runner,
    RunError,
    StubRunner,
    SystemError_,
    TradiRunner,
    set_api_key_fetcher,
    set_attachment_downloader,
    set_progress_push,
)
from .sentry import capture_run_error, init_sentry

log = logging.getLogger("hm_worker")


class _LiveState:
    """What the health endpoint reports. One instance per worker process.

    Thread-safe: written from the polling loop's thread, read from the
    health server's request-handling threads.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_poll_at: str | None = None
        self._active = False

    def mark_poll(self) -> None:
        with self._lock:
            self._last_poll_at = datetime.now(UTC).isoformat()

    def mark_active(self, active: bool) -> None:
        with self._lock:
            self._active = active

    def snapshot(self) -> HealthStatus:
        with self._lock:
            # The worker executes one run at a time, so "queue depth" here
            # means "is a run in flight" (0 or 1) rather than a true count of
            # rows waiting in agent_runs — getting the latter needs an extra
            # query this endpoint deliberately avoids (see design D-M4 scope).
            return HealthStatus(
                queue_depth=1 if self._active else 0,
                last_poll_at=self._last_poll_at,
            )


def _install_signal_handlers(stop: threading.Event, wake: threading.Event | None = None) -> None:
    def handle(signum, _frame):
        log.info("received %s, finishing current run then exiting", signal.Signals(signum).name)
        stop.set()
        if wake is not None:
            wake.set()  # unblock the idle wait immediately

    signal.signal(signal.SIGINT, handle)
    signal.signal(signal.SIGTERM, handle)


def build_runner(config: Config) -> Runner:
    if config.execute_tradi:
        return TradiRunner(
            command=config.tradi_command,
            runs_root=config.runs_root,
            timeout_seconds=config.run_timeout_seconds,
            heartbeat_seconds=config.heartbeat_seconds,
            llm_provider=config.llm_provider,
            llm_model=config.llm_model,
        )
    return StubRunner(config.stub_duration_seconds, config.heartbeat_seconds)


def process_run(
    queue: RunQueue,
    runner: Runner,
    run: ClaimedRun,
    stop: threading.Event,
    artifacts: ArtifactStore | None = None,
) -> None:
    """Execute one claimed run and record its outcome.

    Never raises: a run that blows up must close the row, not kill the worker.
    """
    set_run_id(run.id)
    try:
        log.info("claimed run %s (user %s)", run.id, run.user_id, extra={"event": "run.claimed"})

        try:
            result = runner.execute(run, lambda: queue.heartbeat(run.id), stop)
        except ClaimLost as exc:
            # Someone else owns it now — leave the row alone. Expected under
            # normal reclaim races, so it's not a Sentry-worthy event.
            log.warning("%s", exc)
            return
        except RunError as exc:
            log.error(
                "run %s failed (%s): %s",
                run.id,
                exc.status,
                exc,
                extra={"event": "run.failed"},
            )
            # Only report system-caused faults (refundable) — user-input
            # errors like a missing API key are expected traffic, not bugs.
            if exc.refundable:
                capture_run_error(exc, run.id, exc.status)
            queue.fail(run.id, str(exc), status=exc.status, refund=exc.refundable)
            return
        except Exception as exc:  # noqa: BLE001 - unexpected failures are the worker's fault
            log.exception("run %s crashed", run.id, extra={"event": "run.crashed"})
            capture_run_error(exc, run.id, "failed")
            queue.fail(run.id, f"{type(exc).__name__}: {exc}", refund=SystemError_.refundable)
            return

        if queue.complete(run.id):
            log.info("completed run %s", run.id, extra={"event": "run.completed"})
            # Best-effort: only persist artifacts for a run we actually closed.
            if artifacts is not None and result.artifacts:
                stored = artifacts.persist(run, result.artifacts)
                log.info(
                    "stored %d/%d artifact(s) for run %s", stored, len(result.artifacts), run.id
                )
        else:
            # Claim was lost between the last heartbeat and the close.
            log.warning("run %s could not be completed — claim no longer held", run.id)

        if result.output:
            log.debug("run %s output: %s", run.id, result.output[:200])
    finally:
        # Clear so any log line between this run and the next doesn't
        # inherit a stale run_id (get_run_id() must be None outside a run).
        set_run_id(None)


def run_forever(
    config: Config,
    queue: RunQueue,
    runner: Runner,
    stop: threading.Event,
    artifacts: ArtifactStore | None = None,
    state: _LiveState | None = None,
) -> None:
    log.info("worker %s polling %s", config.worker_id, config.supabase_url)

    # Realtime wakes the loop instantly when a new run is inserted.
    # The fallback poll (idle_backoff_seconds, default 30s) still fires so a
    # missed notification never means a stuck queue — just slightly higher latency.
    wake = threading.Event()

    try:
        queue.subscribe_new_runs(wake)
    except Exception:  # noqa: BLE001
        log.warning(
            "Realtime subscription failed — falling back to poll every %ss",
            config.idle_backoff_seconds,
            exc_info=True,
        )

    consecutive_errors = 0
    while not stop.is_set():
        try:
            run = queue.claim()
            consecutive_errors = 0
        except Exception:  # noqa: BLE001 - transient network/API faults must not kill the loop
            consecutive_errors += 1
            backoff = min(config.idle_backoff_seconds * consecutive_errors, 60)
            log.exception("claim failed, retrying in %ss", backoff)
            if state is not None:
                state.mark_poll()
            stop.wait(timeout=backoff)
            continue

        if state is not None:
            state.mark_poll()

        if run is None:
            # Wait for either: Realtime notification (instant), stop signal,
            # or fallback timeout (idle_backoff_seconds).
            wake.clear()
            wake.wait(timeout=config.idle_backoff_seconds)
            if stop.is_set():
                break
            continue

        if state is not None:
            state.mark_active(True)
        try:
            process_run(queue, runner, run, stop, artifacts)
        finally:
            if state is not None:
                state.mark_active(False)

        if not stop.is_set():
            stop.wait(timeout=config.poll_interval_seconds)

    queue.unsubscribe()
    log.info("worker %s stopped", config.worker_id)


def main() -> int:
    setup_logging()

    try:
        config = load_config()
        runner = build_runner(config)
    except ConfigError as exc:
        log.error("%s", exc)
        return 1

    # Fully optional (design D-M1): no SENTRY_DSN -> no-op, zero network calls.
    if init_sentry(config.sentry_dsn):
        log.info("Sentry error tracking enabled")

    stop = threading.Event()
    _install_signal_handlers(stop)

    queue = RunQueue(config)
    artifacts = ArtifactStore(queue.client) if config.execute_tradi else None
    # Register the storage downloader so TradiRunner can stage Premium
    # attachments into HOME/inputs/ before spawning the engine. StubRunner
    # never calls this, so tests that skip Tradi don't need Storage.
    set_attachment_downloader(queue.download_attachment)
    # Register the API key fetcher so TradiRunner can inject DEEPSEEK_API_KEY
    # into the subprocess env before spawning the engine (BYOK pivot).
    # StubRunner never calls this, so tests that skip Tradi don't need a
    # configured key.
    set_api_key_fetcher(lambda uid, provider: queue.get_user_api_key(uid, provider))
    # Register the progress pusher so TraceTailer can stream trace.jsonl events
    # into agent_runs.progress_message. StubRunner never triggers this path.
    set_progress_push(lambda run_id, msg, itr: queue.progress(run_id, msg, itr))

    state = _LiveState()
    health = HealthServer(state.snapshot, host=config.health_host, port=config.health_port)
    health.start()  # best-effort — logs a warning and continues if the bind fails
    try:
        run_forever(config, queue, runner, stop, artifacts, state)
    finally:
        health.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
