"""PII scrubbing for the worker's Sentry before_send hook.

Not in the Architect's file list explicitly, but required by acceptance
criterion 5 (scrubber unit-tested with a synthetic sk-... + prompt event).
Added as a small, justified deviation — see the Coder's final report.
"""

from __future__ import annotations

from hm_worker.sentry import init_sentry, scrub_event


def test_scrubs_api_key_fragment_from_message():
    event = {"message": "engine failed: key sk-abcdefgh12345678 rejected"}

    scrubbed = scrub_event(event, {})

    assert "sk-abcdefgh12345678" not in scrubbed["message"]
    assert "sk-***" in scrubbed["message"]


def test_scrubs_api_key_fragment_from_logentry_message():
    event = {"logentry": {"message": "bad key sk-zyxwvutsrqponm"}}

    scrubbed = scrub_event(event, {})

    assert "sk-zyxwvutsrqponm" not in scrubbed["logentry"]["message"]
    assert "sk-***" in scrubbed["logentry"]["message"]


def test_drops_denylisted_extra_keys():
    event = {
        "extra": {
            "prompt": "backtest AAPL with my secret strategy",
            "api_key": "sk-abcdefgh12345678",
            "user_email": "user@example.com",
            "token": "abc123",
            "secret": "shh",
            "run_id": "run-1",
            "status": "failed",
        }
    }

    scrubbed = scrub_event(event, {})

    assert set(scrubbed["extra"].keys()) == {"run_id", "status"}
    assert scrubbed["extra"]["run_id"] == "run-1"
    assert scrubbed["extra"]["status"] == "failed"


def test_drops_long_free_text_context_values():
    event = {
        "contexts": {
            "run": {
                "prompt_reason": "x" * 250,
                "run_id": "run-1",
            }
        }
    }

    scrubbed = scrub_event(event, {})

    assert "prompt_reason" not in scrubbed["contexts"]["run"]
    assert scrubbed["contexts"]["run"]["run_id"] == "run-1"


def test_never_drops_the_event_itself():
    event = {"message": "sk-abcdefgh12345678", "extra": {"prompt": "..."}}

    scrubbed = scrub_event(event, {})

    assert scrubbed is not None
    assert isinstance(scrubbed, dict)


def test_synthetic_full_event_scrubbed_correctly():
    """The exact synthetic case called out in the design doc's edge cases."""
    event = {
        "message": "MissingApiKey for user, tried key sk-abc123def456ghijk",
        "extra": {
            "prompt": "long user prompt text that must never leave the platform",
            "api_key": "sk-abc123def456ghijk",
            "email": "user@example.com",
            "run_id": "run-42",
            "status": "failed",
        },
    }

    scrubbed = scrub_event(event, {})

    assert "sk-abc123def456ghijk" not in scrubbed["message"]
    assert set(scrubbed["extra"].keys()) == {"run_id", "status"}


def test_init_sentry_is_noop_without_dsn():
    assert init_sentry(None) is False
    assert init_sentry("") is False
