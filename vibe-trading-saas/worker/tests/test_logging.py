"""JsonFormatter + run_id thread-local correlation."""

from __future__ import annotations

import json
import logging

import pytest

from hm_worker.logging_config import JsonFormatter, get_run_id, set_run_id


@pytest.fixture(autouse=True)
def clean_run_id():
    """set_run_id is thread-local state — never let one test leak into another."""
    set_run_id(None)
    yield
    set_run_id(None)


def make_record(
    msg: str = "hello",
    level: int = logging.INFO,
    logger_name: str = "hm_worker.test",
    exc_info=None,
) -> logging.LogRecord:
    return logging.LogRecord(
        name=logger_name,
        level=level,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=(),
        exc_info=exc_info,
    )


def test_output_parses_as_json_with_required_keys():
    line = JsonFormatter().format(make_record("hello world"))

    obj = json.loads(line)
    assert obj["level"] == "INFO"
    assert obj["logger"] == "hm_worker.test"
    assert obj["msg"] == "hello world"
    assert "ts" in obj


def test_output_is_single_line():
    line = JsonFormatter().format(make_record("no newlines here"))

    assert "\n" not in line


def test_run_id_present_when_set():
    set_run_id("run-123")

    obj = json.loads(JsonFormatter().format(make_record()))

    assert obj["run_id"] == "run-123"


def test_run_id_absent_when_not_set():
    assert get_run_id() is None

    obj = json.loads(JsonFormatter().format(make_record()))

    assert "run_id" not in obj


def test_run_id_absent_after_clearing():
    set_run_id("run-123")
    set_run_id(None)

    obj = json.loads(JsonFormatter().format(make_record()))

    assert "run_id" not in obj


def test_event_field_included_when_extra_event_set():
    record = make_record()
    record.event = "run.completed"

    obj = json.loads(JsonFormatter().format(record))

    assert obj["event"] == "run.completed"


def test_event_field_absent_by_default():
    obj = json.loads(JsonFormatter().format(make_record()))

    assert "event" not in obj


def test_exc_info_renders_into_exc_field():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys

        record = make_record("run crashed", level=logging.ERROR, exc_info=sys.exc_info())

    obj = json.loads(JsonFormatter().format(record))

    assert "exc" in obj
    assert "ValueError" in obj["exc"]
    assert "boom" in obj["exc"]
    # The traceback's internal newlines must stay inside the JSON string
    # value, not break the single-line-per-record invariant.
    formatted = JsonFormatter().format(record)
    assert formatted.count("\n") == 0


def test_get_run_id_is_thread_local():
    import threading

    set_run_id("main-thread-run")
    seen = {}

    def worker():
        seen["other_thread"] = get_run_id()

    t = threading.Thread(target=worker)
    t.start()
    t.join()

    assert seen["other_thread"] is None
    assert get_run_id() == "main-thread-run"
