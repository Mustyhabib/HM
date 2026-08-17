"""Structured JSON logging for the worker.

Every log line becomes one JSON object on stdout:
``{ts, level, logger, msg, run_id?, event?, exc?}``. ``run_id`` is pulled from
a thread-local so a single claim -> execute -> complete cycle correlates
without threading a run id through every call site — existing ``log.info(...)``
call sites in the rest of the package need no changes.

Threading note: the worker processes runs synchronously, one at a time, on
the poller's own thread. The run_id set at claim time (see
``main.process_run``) is therefore visible to every synchronous log call made
while that run is in flight, including calls made deep inside
:mod:`hm_worker.runner`. The one exception is ``TraceTailer``
(:mod:`hm_worker.progress`), which runs on its own background thread — its log
lines simply carry no ``run_id``, which is the correct behaviour for a
thread-local (no cross-thread leakage of a stale id).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
from datetime import UTC, datetime

_run_id_local = threading.local()


def set_run_id(run_id: str | None) -> None:
    """Tag subsequent log lines made on the *current thread* with ``run_id``.

    Call with ``None`` to clear (e.g. once a run finishes) so later,
    unrelated log lines on the same thread don't inherit a stale id.
    """
    _run_id_local.value = run_id


def get_run_id() -> str | None:
    """The run_id tagged on the current thread, or ``None`` outside a run."""
    return getattr(_run_id_local, "value", None)


class JsonFormatter(logging.Formatter):
    """Renders every :class:`logging.LogRecord` as one line of JSON.

    ``msg`` uses ``record.getMessage()`` (the already %-formatted string, not
    a raw object), so normal log calls can never break the single-line
    invariant. Only ``exc_info`` — an intentional multi-line traceback — is
    allowed to carry newlines, and it is scoped to its own ``exc`` field so a
    naive line-oriented log shipper never sees an unescaped newline outside
    a JSON string value.
    """

    def format(self, record: logging.LogRecord) -> str:
        obj: dict[str, object] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        run_id = get_run_id()
        if run_id:
            obj["run_id"] = run_id
        event = getattr(record, "event", None)
        if event:
            obj["event"] = event
        if record.exc_info:
            obj["exc"] = self.formatException(record.exc_info)
        return json.dumps(obj, default=str, ensure_ascii=False)


def setup_logging() -> None:
    """Install structured JSON logging. Replaces the old ``_setup_logging``.

    - ``hm_worker`` (and its children, e.g. ``hm_worker.db``) log JSON to
      stdout at ``LOG_LEVEL`` (default ``INFO``); the ``hm_worker`` logger
      itself does not propagate to the root logger, so lines aren't handled
      twice.
    - The root logger gets the same JSON handler but is capped at WARNING,
      so third-party libraries (``supabase``, ``httpx``, ...) don't flood
      stdout with INFO noise while still going through the same formatter if
      they do log something worth seeing.
    """
    level = os.environ.get("LOG_LEVEL", "INFO").upper()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    worker_logger = logging.getLogger("hm_worker")
    worker_logger.handlers = [handler]
    worker_logger.setLevel(level)
    worker_logger.propagate = False

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.WARNING)
