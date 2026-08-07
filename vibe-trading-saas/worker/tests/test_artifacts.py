"""ArtifactStore — uploads artifacts to Storage + records agent_artifacts rows.

Hermetic: a fake Supabase client records what would have been uploaded/inserted.
"""

from __future__ import annotations

from hm_worker.artifacts import ArtifactStore, _content_type
from hm_worker.db import ClaimedRun
from hm_worker.runner import Artifact


class FakeBucket:
    def __init__(self, fail_on: str | None = None):
        self.uploads: list[tuple] = []
        self._fail_on = fail_on

    def upload(self, path, content, options):
        if self._fail_on and self._fail_on in path:
            raise RuntimeError("upload boom")
        self.uploads.append((path, content, options))


class FakeStorage:
    def __init__(self, bucket):
        self._bucket = bucket

    def from_(self, name):
        return self._bucket


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
        self._pending = None

    def insert(self, row):
        self._pending = row
        return self

    def execute(self):
        self._rows.append(self._pending)
        return self


class FakeSupabase:
    def __init__(self, fail_on: str | None = None):
        self.bucket = FakeBucket(fail_on)
        self.storage = FakeStorage(self.bucket)
        self.rows: list[dict] = []

    def table(self, name):
        assert name == "agent_artifacts"
        return FakeTable(self.rows)


def _run() -> ClaimedRun:
    return ClaimedRun(id="run-1", user_id="user-9", prompt="p", max_iter=5)


def _artifacts() -> list[Artifact]:
    return [
        Artifact("report", "answer.md", b"# answer"),
        Artifact("trace", "sessions/s1/trace.jsonl", b'{"type":"answer"}'),
        Artifact("pine", "runs/r1/strategy.pine", b"//@version=5"),
    ]


def test_persist_uploads_and_records_each():
    sb = FakeSupabase()
    stored = ArtifactStore(sb).persist(_run(), _artifacts())

    assert stored == 3
    # object paths are scoped by owning user + run
    assert [u[0] for u in sb.bucket.uploads] == [
        "user-9/run-1/answer.md",
        "user-9/run-1/sessions/s1/trace.jsonl",
        "user-9/run-1/runs/r1/strategy.pine",
    ]
    assert sb.rows[0] == {
        "agent_run_id": "run-1",
        "user_id": "user-9",
        "kind": "report",
        "storage_path": "user-9/run-1/answer.md",
    }
    assert {r["kind"] for r in sb.rows} == {"report", "trace", "pine"}


def test_upload_failure_is_best_effort():
    sb = FakeSupabase(fail_on="strategy.pine")
    stored = ArtifactStore(sb).persist(_run(), _artifacts())

    assert stored == 2  # pine upload failed; report + trace still succeeded
    assert len(sb.rows) == 2  # no row written for the failed upload
    assert all("strategy.pine" not in r["storage_path"] for r in sb.rows)


def test_content_type_by_extension():
    assert _content_type("answer.md") == "text/markdown"
    assert _content_type("m.csv") == "text/csv"
    assert _content_type("blob.unknown") == "application/octet-stream"
