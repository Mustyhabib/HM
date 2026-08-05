"""Polling loop: claim a run, execute it, close it out. Repeat until signalled."""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading

from .config import Config, ConfigError, load_config
from .db import ClaimedRun, RunQueue
from .runner import ClaimLost, Runner, RunError, StubRunner, SystemError_

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
        # Day 5 wires the real subprocess runner in here.
        raise ConfigError("WORKER_EXECUTE_TRADI is set but TradiRunner is not implemented yet")
    return StubRunner(config.stub_duration_seconds, config.heartbeat_seconds)


def process_run(queue: RunQueue, runner: Runner, run: ClaimedRun, stop: threading.Event) -> None:
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
    else:
        # Claim was lost between the last heartbeat and the close.
        log.warning("run %s could not be completed — claim no longer held", run.id)

    if result.output:
        log.debug("run %s output: %s", run.id, result.output[:200])


def run_forever(config: Config, queue: RunQueue, runner: Runner, stop: threading.Event) -> None:
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

        process_run(queue, runner, run, stop)

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

    run_forever(config, RunQueue(config), runner, stop)
    return 0


if __name__ == "__main__":
    sys.exit(main())
