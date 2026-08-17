"""Sentry error tracking — optional, DSN-driven, fail-open (design D-M1).

No ``SENTRY_DSN`` -> :func:`init_sentry` is a no-op: ``sentry_sdk.init`` is
never called, so there is zero network activity and zero behaviour change.
Set the DSN and the worker starts reporting run failures with PII scrubbed
out first (design D-M2) — see :func:`scrub_event` for the exact rules.
"""

from __future__ import annotations

import logging
import re
from importlib import metadata as importlib_metadata

log = logging.getLogger(__name__)

# Matches a DeepSeek-style API key fragment (sk-...) so it never reaches
# Sentry even if it ended up inside a free-text error message.
_SECRET_RE = re.compile(r"sk-[A-Za-z0-9]{8,}")
# extra/tag keys that must never be sent, regardless of what a call site
# passes — prompts and credentials are the two things CLAUDE.md forbids
# leaking off the platform.
_DENYLIST_RE = re.compile(r"(prompt|api[_-]?key|token|secret|email)", re.IGNORECASE)
# Anything this long in a context value is assumed to be free text (a prompt,
# a stack dump, an engine reason string) rather than a short structured
# field like a run id or status — dropped rather than guessed at.
_FREE_TEXT_LEN_THRESHOLD = 200


def _worker_release() -> str:
    try:
        version = importlib_metadata.version("hm-worker")
    except importlib_metadata.PackageNotFoundError:  # pragma: no cover - dev checkout
        version = "0.0.0"
    return f"hm-worker@{version}"


def _scrub_text(value: str) -> str:
    return _SECRET_RE.sub("sk-***", value)


def scrub_event(event: dict, hint: dict) -> dict:
    """Sentry ``before_send`` hook: sanitize an event, never drop it.

    Per design D-M2, this always returns the (sanitized) event — dropping
    events silently would hide real failures. Rules:
      - ``message`` / ``logentry.message``: redact any ``sk-...`` fragment.
      - ``extra``: drop any key matching the credential/PII denylist.
      - ``contexts``: drop any value that looks like free text (long string)
        rather than trying to allowlist every possible key. Callers that want
        run metadata in Sentry should pass short, explicit ``extra`` keys via
        :func:`capture_run_error` instead of attaching a context blob.
    """
    message = event.get("message")
    if isinstance(message, str):
        event["message"] = _scrub_text(message)

    logentry = event.get("logentry")
    if isinstance(logentry, dict) and isinstance(logentry.get("message"), str):
        logentry["message"] = _scrub_text(logentry["message"])

    extra = event.get("extra")
    if isinstance(extra, dict):
        event["extra"] = {
            key: value for key, value in extra.items() if not _DENYLIST_RE.search(key)
        }

    contexts = event.get("contexts")
    if isinstance(contexts, dict):
        for ctx in contexts.values():
            if not isinstance(ctx, dict):
                continue
            for key in list(ctx.keys()):
                value = ctx[key]
                if isinstance(value, str) and len(value) > _FREE_TEXT_LEN_THRESHOLD:
                    del ctx[key]

    return event


def init_sentry(dsn: str | None, release: str | None = None) -> bool:
    """Initialize Sentry if ``dsn`` is set. Returns whether it initialized.

    Safe to call unconditionally at process start — with no DSN this does
    not import ``sentry_sdk`` at all, so a broken/missing sentry-sdk install
    can never take the worker down.
    """
    if not dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - dependency always present in prod
        log.warning("SENTRY_DSN is set but sentry-sdk is not installed — skipping")
        return False

    sentry_sdk.init(
        dsn=dsn,
        release=release or _worker_release(),
        before_send=scrub_event,
        # MVP: errors only, no performance tracing — nothing here carries user
        # content, but traces are a scope decision for a later increment.
        traces_sample_rate=0.0,
    )
    return True


def capture_run_error(error: BaseException, run_id: str | None, status: str) -> None:
    """Report a run failure to Sentry. No-op if Sentry was never initialized.

    ``run_id`` and ``status`` are short, structured fields — they pass
    :func:`scrub_event`'s denylist untouched, unlike a raw exception message
    which may embed engine output derived from the user's prompt.
    """
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - dependency always present in prod
        return
    if not sentry_sdk.is_initialized():
        return
    with sentry_sdk.push_scope() as scope:
        scope.set_extra("run_id", run_id)
        scope.set_extra("status", status)
        sentry_sdk.capture_exception(error)
