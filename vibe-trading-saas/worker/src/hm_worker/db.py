"""Supabase access for the run queue.

Every call here goes through a ``SECURITY DEFINER`` RPC that is granted to
``service_role`` only (see the ``add_worker_run_lifecycle_functions`` migration).
The worker holds the service-role key, so it bypasses RLS by design — this
module is the only place that is allowed to.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from supabase import Client, create_client

from .config import Config

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Attachment:
    """A file the user attached to a run (Premium tier only).

    ``path`` is the object path inside the ``agent-uploads`` bucket. The worker
    downloads to ``HOME/inputs/<name>`` before the subprocess starts, so the
    engine sees only local files — never a Supabase Storage URL.
    """

    name: str
    path: str
    size: int
    kind: str


@dataclass(frozen=True)
class ClaimedRun:
    id: str
    user_id: str
    prompt: str
    max_iter: int
    # New in 2026-08-11 migration — default so any older RPC row still parses.
    kind: str = "single"
    attachments: tuple[Attachment, ...] = ()
    preset_name: str | None = None
    user_vars: dict | None = None

    @classmethod
    def from_row(cls, row: dict) -> "ClaimedRun":
        # Defensively coerce attachments — the DB stores an array, but a stale
        # single-run row could have {} or NULL. Older workers never wrote this.
        raw_atts = row.get("run_attachments") or []
        if isinstance(raw_atts, str):
            # Some Postgres clients hand JSONB back as string
            import json as _json

            try:
                raw_atts = _json.loads(raw_atts)
            except _json.JSONDecodeError:
                raw_atts = []
        atts = tuple(
            Attachment(
                name=str(a.get("name", "")),
                path=str(a.get("path", "")),
                size=int(a.get("size", 0)),
                kind=str(a.get("kind", "")),
            )
            for a in (raw_atts if isinstance(raw_atts, list) else [])
            if isinstance(a, dict) and a.get("path")
        )
        return cls(
            id=row["run_id"],
            user_id=row["run_user_id"],
            prompt=row["run_prompt"],
            max_iter=row["run_max_iter"],
            kind=str(row.get("run_kind") or "single"),
            attachments=atts,
            preset_name=row.get("run_preset_name") or None,
            user_vars=row.get("run_user_vars") or None,
        )


class RunQueue:
    """Claim/heartbeat/close operations against ``agent_runs``."""

    def __init__(self, config: Config, client: Client | None = None) -> None:
        self._config = config
        self._client = client or create_client(config.supabase_url, config.service_role_key)

    @property
    def worker_id(self) -> str:
        return self._config.worker_id

    @property
    def client(self) -> Client:
        return self._client

    def claim(self) -> ClaimedRun | None:
        """Atomically take the oldest queued run, or reclaim an abandoned one.

        Returns ``None`` when the queue is empty. Concurrent workers never get
        the same row — the RPC uses ``FOR UPDATE SKIP LOCKED``.
        """
        response = self._client.rpc(
            "claim_agent_run",
            {
                "p_worker_id": self._config.worker_id,
                "p_stale_after": f"{self._config.stale_after_seconds} seconds",
            },
        ).execute()

        rows = response.data or []
        if not rows:
            return None
        return ClaimedRun.from_row(rows[0])

    def heartbeat(self, run_id: str) -> bool:
        """Push out the staleness deadline. False means we no longer own the run."""
        response = self._client.rpc(
            "heartbeat_agent_run",
            {"p_run_id": run_id, "p_worker_id": self._config.worker_id},
        ).execute()
        return bool(response.data)

    def progress(self, run_id: str, message: str, iteration: int | None = None) -> bool:
        """Push a human-readable progress line to the DB.

        Safe to call frequently: no quota impact, no state transitions, no-op
        if the run is not running or the worker no longer owns the claim.
        Message is server-side truncated to 240 chars.

        Returns False on any transient failure — callers should NOT abort
        the run just because a progress push flapped.
        """
        try:
            response = self._client.rpc(
                "update_run_progress",
                {
                    "p_run_id": run_id,
                    "p_worker_id": self._config.worker_id,
                    "p_message": message[:240],
                    "p_iter": iteration,
                },
            ).execute()
            return bool(response.data)
        except Exception:  # noqa: BLE001
            log.debug("progress push failed for run %s (non-fatal)", run_id, exc_info=True)
            return False

    def complete(self, run_id: str) -> bool:
        response = self._client.rpc(
            "complete_agent_run",
            {"p_run_id": run_id, "p_worker_id": self._config.worker_id},
        ).execute()
        return bool(response.data)

    def download_attachment(self, storage_path: str) -> bytes:
        """Download an ``agent-uploads`` object by path.

        Uses the service-role client so private-bucket access works. Callers
        must be prepared for the download to raise on any network/auth failure —
        the runner treats that as ``SystemError_`` and refunds the run.
        """
        # supabase-py returns bytes directly for storage downloads
        return self._client.storage.from_("agent-uploads").download(storage_path)

    def fail(
        self,
        run_id: str,
        error: str,
        *,
        status: str = "failed",
        refund: bool = False,
    ) -> bool:
        """Close a run as failed/timeout.

        ``refund=True`` gives the user's quota back — reserved for system-caused
        failures (crash, timeout, infra). User-input errors are not refunded.
        """
        response = self._client.rpc(
            "fail_agent_run",
            {
                "p_run_id": run_id,
                "p_worker_id": self._config.worker_id,
                "p_error": error[:2000],
                "p_status": status,
                "p_refund": refund,
            },
        ).execute()
        return bool(response.data)
