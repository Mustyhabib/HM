"""Polling loop: claim a run, execute it, close it out. Repeat until signalled."""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading

from .artifacts import ArtifactStore
from .config import Config, ConfigError, load_config
from .db import ClaimedRun, RunQueue
from .runner import (
    ClaimLost,
    Runner,
    RunError,
    StubRunner,
    SystemError_,
    TradiRunner,
    set_attachment_downloader,
    set_progress_push,
)

log = logging.getLogger("hm_worker")


def _setup_logging() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )


def _install_signal_handlers(stop: threading.Event) -> None:
    def handle(signum, _frame):
        log.info("received %s, finishing current run then exiting", signal.Signals(signum).name)
        stop.set()

    signal.signal(signal.SIGINT, handle)
    signal.signal(signal.SIGTERM, handle)


def build_runner(config: Config) -> Runner:
    if config.execute_tradi:
        return TradiRunner(
            command=config.tradi_command,
            runs_root=config.runs_root,
            timeout_seconds=config.run_timeout_seconds,
            heartbeat_seconds=config.heartbeat_seconds,
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
    log.info("claimed run %s (user %s)", run.id, run.user_id)

    try:
        result = runner.execute(run, lambda: queue.heartbeat(run.id), stop)
    except ClaimLost as exc:
        # Someone else owns it now — leave the row alone.
        log.warning("%s", exc)
        return
    except RunError as exc:
        log.error("run %s failed (%s): %s", run.id, exc.status, exc)
        queue.fail(run.id, str(exc), status=exc.status, refund=exc.refundable)
        return
    except Exception as exc:  # noqa: BLE001 - unexpected failures are the worker's fault
        log.exception("run %s crashed", run.id)
        queue.fail(run.id, f"{type(exc).__name__}: {exc}", refund=SystemError_.refundable)
        return

    if queue.complete(run.id):
        log.info("completed run %s", run.id)
        # Best-effort: only persist artifacts for a run we actually closed.
        if artifacts is not None and result.artifacts:
            stored = artifacts.persist(run, result.artifacts)
            log.info("stored %d/%d artifact(s) for run %s", stored, len(result.artifacts), run.id)
    else:
        # Claim was lost between the last heartbeat and the close.
        log.warning("run %s could not be completed — claim no longer held", run.id)

    if result.output:
        log.debug("run %s output: %s", run.id, result.output[:200])


def run_forever(
    config: Config,
    queue: RunQueue,
    runner: Runner,
    stop: threading.Event,
    artifacts: ArtifactStore | None = None,
) -> None:
    log.info("worker %s polling %s", config.worker_id, config.supabase_url)

    consecutive_errors = 0
    while not stop.is_set():
        try:
            run = queue.claim()
            consecutive_errors = 0
        except Exception:  # noqa: BLE001 - transient network/API faults must not kill the loop
            consecutive_errors += 1
            backoff = min(config.idle_backoff_seconds * consecutive_errors, 60)
            log.exception("claim failed, retrying in %ss", backoff)
            stop.wait(timeout=backoff)
            continue

        if run is None:
            stop.wait(timeout=config.idle_backoff_seconds)
            continue

        process_run(queue, runner, run, stop, artifacts)

        if not stop.is_set():
            stop.wait(timeout=config.poll_interval_seconds)

    log.info("worker %s stopped", config.worker_id)


def main() -> int:
    _setup_logging()

    try:
        config = load_config()
        runner = build_runner(config)
    except ConfigError as exc:
        log.error("%s", exc)
        return 1

    stop = threading.Event()
    _install_signal_handlers(stop)

    queue = RunQueue(config)
    artifacts = ArtifactStore(queue.client) if config.execute_tradi else None
    # Register the storage downloader so TradiRunner can stage Premium
    # attachments into HOME/inputs/ before spawning the engine. StubRunner
    # never calls this, so tests that skip Tradi don't need Storage.
    set_attachment_downloader(queue.download_attachment)
    # Register the progress pusher so TraceTailer can stream trace.jsonl events
    # into agent_runs.progress_message. StubRunner never triggers this path.
    set_progress_push(lambda run_id, msg, itr: queue.progress(run_id, msg, itr))
    run_forever(config, queue, runner, stop, artifacts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
