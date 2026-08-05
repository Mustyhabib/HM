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
class ClaimedRun:
    id: str
    user_id: str
    prompt: str
    max_iter: int

    @classmethod
    def from_row(cls, row: dict) -> "ClaimedRun":
        return cls(
            id=row["run_id"],
            user_id=row["run_user_id"],
            prompt=row["run_prompt"],
            max_iter=row["run_max_iter"],
        )


class RunQueue:
    """Claim/heartbeat/close operations against ``agent_runs``."""

    def __init__(self, config: Config, client: Client | None = None) -> None:
        self._config = config
        self._client = client or create_client(config.supabase_url, config.service_role_key)

    @property
    def worker_id(self) -> str:
        return self._config.worker_id

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

    def complete(self, run_id: str) -> bool:
        response = self._client.rpc(
            "complete_agent_run",
            {"p_run_id": run_id, "p_worker_id": self._config.worker_id},
        ).execute()
        return bool(response.data)

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
