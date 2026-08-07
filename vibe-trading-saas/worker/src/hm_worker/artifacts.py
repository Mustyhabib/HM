"""Persist run artifacts to Supabase Storage + the ``agent_artifacts`` table.

The service-role client bypasses Storage RLS and the ``agent_artifacts`` insert
policy (writes are service-role only, per ``DATABASE_SCHEMA.md``). Uploads are
best-effort: a failure is logged and the run still closes as completed — the
artifact is a bonus, not the thing the user paid for.
"""

from __future__ import annotations

import logging
import posixpath

from supabase import Client

from .db import ClaimedRun
from .runner import Artifact

log = logging.getLogger(__name__)

BUCKET = "agent-artifacts"

_CONTENT_TYPES = {
    ".md": "text/markdown",
    ".json": "application/json",
    ".jsonl": "application/json",
    ".csv": "text/csv",
    ".py": "text/x-python",
    ".pine": "text/plain",
    ".txt": "text/plain",
}


def _content_type(name: str) -> str:
    _, ext = posixpath.splitext(name)
    return _CONTENT_TYPES.get(ext.lower(), "application/octet-stream")


class ArtifactStore:
    """Uploads a run's artifacts to Storage and records them in the DB."""

    def __init__(self, client: Client, bucket: str = BUCKET) -> None:
        self._sb = client
        self._bucket = bucket

    def persist(self, run: ClaimedRun, artifacts: list[Artifact]) -> int:
        """Upload each artifact + insert its row. Returns how many succeeded.

        Objects are stored at ``<user_id>/<run_id>/<name>`` so RLS/signed-URL
        access can be scoped by the owning user.
        """
        stored = 0
        for artifact in artifacts:
            path = f"{run.user_id}/{run.id}/{artifact.name}"
            try:
                self._sb.storage.from_(self._bucket).upload(
                    path,
                    artifact.content,
                    {"content-type": _content_type(artifact.name), "upsert": "true"},
                )
                self._sb.table("agent_artifacts").insert(
                    {
                        "agent_run_id": run.id,
                        "user_id": run.user_id,
                        "kind": artifact.kind,
                        "storage_path": path,
                    }
                ).execute()
                stored += 1
            except Exception as exc:  # noqa: BLE001 - artifacts are best-effort
                log.warning("artifact persist failed (%s): %s", path, exc)
        return stored
