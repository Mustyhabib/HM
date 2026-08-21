"""Shadow Account runner — command shape, journal staging, kind mapping.

Hermetic: a fake `vibe-trading` script records argv; no engine, no LLM,
no network. Mirrors the harness in test_runner.py.
"""

from __future__ import annotations

import json
import sys
import threading
from pathlib import Path

import pytest

from hm_worker.db import Attachment, ClaimedRun
from hm_worker.runner import (
    RunResult,
    SystemError_,
    TradiRunner,
    set_api_key_fetcher,
    set_attachment_downloader,
)

STUB_KEY_VALUE = "deepseek-stub-test-only"

# Fake `vibe-trading` that dumps its argv to a JSON file and exits 0. The
# shadow branch is `--upload <journal> run -p <prompt> --json ...`.
FAKE_VIBE = r"""
import json, os, sys
from pathlib import Path

argv = sys.argv[1:]
try:
    (Path(os.environ["HOME"]) / "argv.json").write_text(json.dumps(argv))
except Exception:
    pass
print(json.dumps({"status": "success", "run_id": "r-shadow",
                  "run_dir": os.environ.get("HOME"), "reason": None}))
sys.exit(0)
"""


@pytest.fixture(autouse=True)
def _stub_api_key_fetcher():
    set_api_key_fetcher(lambda uid, provider: STUB_KEY_VALUE)
    try:
        yield
    finally:
        set_api_key_fetcher(None)


@pytest.fixture(autouse=True)
def _stub_attachment_downloader():
    set_attachment_downloader(lambda path: b"symbol,side,shares,price\nAAPL,BUY,10,150.0\n")
    try:
        yield
    finally:
        set_attachment_downloader(None)


@pytest.fixture
def fake_command(tmp_path: Path) -> str:
    script = tmp_path / "fake_vibe.py"
    script.write_text(FAKE_VIBE)
    return f"{sys.executable} {script}"


def make_runner(fake_command: str, tmp_path: Path, **overrides) -> TradiRunner:
    kw = dict(
        command=fake_command,
        runs_root=str(tmp_path / "runs"),
        timeout_seconds=10,
        heartbeat_seconds=1,
    )
    kw.update(overrides)
    return TradiRunner(**kw)


def make_shadow_run(**overrides) -> ClaimedRun:
    kw = dict(
        id="run-shadow",
        user_id="user-1",
        prompt="Analyze my trading behavior, extract my shadow strategy",
        max_iter=5,
        kind="shadow",
        attachments=(
            Attachment(name="journal.csv", path="user-1/uploads/journal.csv", size=10, kind="csv"),
        ),
    )
    kw.update(overrides)
    return ClaimedRun(**kw)


def test_shadow_argv_upload_precedes_run(fake_command, tmp_path):
    runner = make_runner(fake_command, tmp_path)
    run = make_shadow_run()
    run_dir = tmp_path / "runs" / run.id
    argv = runner._argv_for(run, run_dir)  # noqa: SLF001 — white-box unit test

    assert argv[0:2] == [sys.executable, str(tmp_path / "fake_vibe.py")]
    # --upload is a MAIN-parser flag: it must come BEFORE the `run` subcommand.
    upload_idx = argv.index("--upload")
    run_idx = argv.index("run")
    assert upload_idx < run_idx
    assert argv[upload_idx + 1] == str(run_dir / "inputs" / "journal.csv")
    assert argv[run_idx + 1 : run_idx + 3] == ["-p", run.prompt]
    assert "--json" in argv and "--no-rich" in argv
    assert argv[argv.index("--max-iter") + 1] == "5"


def test_shadow_missing_journal_raises(fake_command, tmp_path):
    runner = make_runner(fake_command, tmp_path)
    run = make_shadow_run(attachments=())
    with pytest.raises(SystemError_) as exc:
        runner._argv_for(run, tmp_path / "runs" / run.id)  # noqa: SLF001
    assert "journal" in str(exc.value)


def test_shadow_execute_mounts_journal_and_completes(fake_command, tmp_path):
    runner = make_runner(fake_command, tmp_path, cleanup=False)
    result = runner.execute(make_shadow_run(), lambda: True, threading.Event())

    assert isinstance(result, RunResult)
    assert "success" in result.output

    # The staged journal must exist next to the recorded argv (the engine
    # receives the same path we build into the command).
    home = tmp_path / "runs" / "run-shadow"
    staged = home / "inputs" / "journal.csv"
    assert staged.exists()
    assert staged.read_bytes().startswith(b"symbol,side")

    argv = json.loads((home / "argv.json").read_text())
    assert argv[argv.index("--upload") + 1] == str(staged)
    assert argv[argv.index("run") + 1 : argv.index("run") + 3] == [
        "-p",
        "Analyze my trading behavior, extract my shadow strategy",
    ]
