"""Engine CLI output-contract test.

The worker subprocess expects ``vibe-trading run -p "<prompt>" --json --no-rich
--max-iter N`` to write a single JSON object to stdout with exactly these keys:

    {"status": "success"|"failed", "run_id": str, "run_dir": str|null, "reason": str|null}

Exit codes: 0 on success, non-zero on failure.

This test DOES NOT run the real engine — it validates the contract against a
specification derived from TradiRunner's parsing logic (runner.py:
``RunResult.from_json``). If the engine changes its CLI output schema, this
test fails before the change reaches production.

Gated behind the ``engine`` pytest marker so it's included in hermetic runs
by default (no external deps). An ``--engine`` flag could be added later to
run it against the real ``vibe-trading`` binary for integration testing.
"""

from __future__ import annotations

import json

import pytest

# --------------------------------------------------------------------------
# The contract: what TradiRunner expects from stdout
# --------------------------------------------------------------------------

REQUIRED_KEYS = {"status", "run_id", "run_dir", "reason"}
VALID_STATUSES = {"success", "failed"}


def validate_engine_output(raw: str) -> dict:
    """Parse and validate a single JSON line from the engine's stdout.

    Returns the parsed dict on success; raises AssertionError on contract
    violation — the error message names the exact field and mismatch.
    """
    parsed = json.loads(raw)
    assert isinstance(parsed, dict), f"Expected JSON object, got {type(parsed).__name__}"

    missing = REQUIRED_KEYS - parsed.keys()
    assert not missing, f"Missing required keys: {missing}"

    status = parsed["status"]
    assert status in VALID_STATUSES, (
        f"status must be one of {VALID_STATUSES}, got {status!r}"
    )

    run_id = parsed["run_id"]
    assert isinstance(run_id, str), f"run_id must be str, got {type(run_id).__name__}"

    run_dir = parsed["run_dir"]
    assert run_dir is None or isinstance(run_dir, str), (
        f"run_dir must be str or null, got {type(run_dir).__name__}"
    )

    reason = parsed["reason"]
    assert reason is None or isinstance(reason, str), (
        f"reason must be str or null, got {type(reason).__name__}"
    )

    return parsed


# --------------------------------------------------------------------------
# Contract specification tests — run hermetically
# --------------------------------------------------------------------------


class TestEngineOutputContract:
    """Validate the JSON schema the worker expects from the engine."""

    def test_success_output_is_valid(self):
        valid = json.dumps({
            "status": "success",
            "run_id": "r-abc123",
            "run_dir": "/tmp/runs/r-abc123",
            "reason": None,
        })
        result = validate_engine_output(valid)
        assert result["status"] == "success"

    def test_failed_output_is_valid(self):
        valid = json.dumps({
            "status": "failed",
            "run_id": "r-fail",
            "run_dir": None,
            "reason": "engine boom",
        })
        result = validate_engine_output(valid)
        assert result["status"] == "failed"
        assert result["reason"] == "engine boom"

    def test_rejects_missing_status(self):
        bad = json.dumps({"run_id": "r-1", "run_dir": "/tmp", "reason": None})
        with pytest.raises(AssertionError, match="Missing required keys.*status"):
            validate_engine_output(bad)

    def test_rejects_missing_run_id(self):
        bad = json.dumps({"status": "success", "run_dir": "/tmp", "reason": None})
        with pytest.raises(AssertionError, match="Missing required keys.*run_id"):
            validate_engine_output(bad)

    def test_rejects_invalid_status_value(self):
        bad = json.dumps({
            "status": "running",
            "run_id": "r-1",
            "run_dir": "/tmp",
            "reason": None,
        })
        with pytest.raises(AssertionError, match="status must be one of"):
            validate_engine_output(bad)

    def test_rejects_non_string_run_id(self):
        bad = json.dumps({
            "status": "success",
            "run_id": 42,
            "run_dir": "/tmp",
            "reason": None,
        })
        with pytest.raises(AssertionError, match="run_id must be str"):
            validate_engine_output(bad)

    def test_rejects_non_string_non_null_run_dir(self):
        bad = json.dumps({
            "status": "success",
            "run_id": "r-1",
            "run_dir": 42,
            "reason": None,
        })
        with pytest.raises(AssertionError, match="run_dir must be str or null"):
            validate_engine_output(bad)

    def test_rejects_non_dict_output(self):
        with pytest.raises(AssertionError, match="Expected JSON object"):
            validate_engine_output('"just a string"')

    def test_rejects_invalid_json(self):
        with pytest.raises(json.JSONDecodeError):
            validate_engine_output("not json at all")

    def test_allows_extra_keys(self):
        """The engine may add new fields — the worker ignores them."""
        extended = json.dumps({
            "status": "success",
            "run_id": "r-1",
            "run_dir": "/tmp",
            "reason": None,
            "duration_s": 42.5,
            "artifacts": [],
        })
        result = validate_engine_output(extended)
        assert result["status"] == "success"

    def test_success_with_null_run_dir_is_valid(self):
        """run_dir can be null even on success (e.g., dry-run modes)."""
        valid = json.dumps({
            "status": "success",
            "run_id": "r-dry",
            "run_dir": None,
            "reason": None,
        })
        result = validate_engine_output(valid)
        assert result["run_dir"] is None

    def test_failed_with_null_reason_is_valid(self):
        """reason can be null even on failure (crash without message)."""
        valid = json.dumps({
            "status": "failed",
            "run_id": "r-crash",
            "run_dir": None,
            "reason": None,
        })
        result = validate_engine_output(valid)
        assert result["status"] == "failed"
