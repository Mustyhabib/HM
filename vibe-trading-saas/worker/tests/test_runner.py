"""TradiRunner — the subprocess-per-run executor (Day 5).

Driven by a fake `vibe-trading` script so these stay hermetic: no engine, no
LLM, no network, no Supabase. The fake keys its behaviour off the prompt text.
"""

from __future__ import annotations

import sys
import threading
from pathlib import Path

import pytest

from hm_worker.db import Attachment, ClaimedRun
from hm_worker.runner import (
    ClaimLost,
    MissingApiKey,
    RunResult,
    RunTimeout,
    SystemError_,
    TradiRunner,
    set_api_key_fetcher,
    set_attachment_downloader,
)

# Every TradiRunner.execute() call now hard-requires a registered key fetcher
# (BYOK pivot 2026-08-12) — the autouse fixture below wires this stub in
# before every test and tears it down after. Individual tests can override
# it with set_api_key_fetcher() for the missing-key / missing-fetcher paths.
# The value is intentionally NOT a real-looking key: TradiRunner just injects
# whatever the fetcher returns into the subprocess env, and the fake CLI only
# echoes it into a marker file — no format validation happens here.
STUB_KEY_VALUE = "deepseek-stub-test-only"


@pytest.fixture(autouse=True)
def _stub_api_key_fetcher():
    """Autouse: register a stub key fetcher before every test, tear down after.

    The BYOK pivot made a registered fetcher a hard precondition of
    ``TradiRunner.execute()``; without this fixture every test in this
    module would raise ``SystemError_: api key fetcher not registered``.
    Tests that want to exercise the fetcher-missing / key-missing paths
    call ``set_api_key_fetcher(...)`` themselves inside the test body.
    """
    set_api_key_fetcher(lambda uid, provider: STUB_KEY_VALUE)
    try:
        yield
    finally:
        set_api_key_fetcher(None)


# A stand-in for `vibe-trading`. Receives `run -p <prompt> --json --no-rich
# --max-iter N` and branches on the prompt. Writes a marker into HOME to prove
# per-run isolation.
FAKE_VIBE = r"""
import json, os, sys, time
from pathlib import Path

argv = sys.argv[1:]
prompt = argv[argv.index("-p") + 1] if "-p" in argv else ""

try:
    (Path(os.environ["HOME"]) / "ran.marker").write_text(prompt)
    # BYOK pivot: TradiRunner must inject DEEPSEEK_API_KEY into the
    # subprocess env; echo it back into a marker so the test can assert
    # the exact value flowed through without leaking it via stdout/stderr.
    (Path(os.environ["HOME"]) / "deepseek_key.marker").write_text(
        os.environ.get("DEEPSEEK_API_KEY", "MISSING")
    )
    # BUG-ENG-4: the engine routing vars must be injected too, or the real
    # engine dies at LLM construction ("LANGCHAIN_MODEL_NAME is not set").
    (Path(os.environ["HOME"]) / "llm_route.marker").write_text(
        os.environ.get("LANGCHAIN_PROVIDER", "MISSING")
        + "|"
        + os.environ.get("LANGCHAIN_MODEL_NAME", "MISSING")
    )
except Exception:
    pass

if prompt == "SUCCEED":
    print(json.dumps({"status": "success", "run_id": "r-ok",
                      "run_dir": os.environ.get("HOME"), "reason": None}))
    sys.exit(0)
if prompt == "FAIL":
    print(json.dumps({"status": "failed", "run_id": "r-bad",
                      "run_dir": None, "reason": "engine boom"}))
    sys.exit(1)
if prompt == "USAGE":
    sys.stderr.write("unrecognized arguments\n")
    sys.exit(2)
if prompt == "BADJSON":
    print("this is not json")
    sys.exit(0)
if prompt == "ARTIFACTS":
    home = Path(os.environ["HOME"])
    (home / "runs" / "r1").mkdir(parents=True, exist_ok=True)
    (home / "runs" / "r1" / "llm_usage.json").write_text('{"tokens": 42}')
    (home / "runs" / "r1" / "strategy.pine").write_text("//@version=5")
    (home / "sessions" / "s1").mkdir(parents=True, exist_ok=True)
    (home / "sessions" / "s1" / "trace.jsonl").write_text(
        '{"type":"step"}\n{"type":"answer","content":"An SMA is the mean price over N periods."}\n'
    )
    (home / "sessions.db").write_bytes(b"BINARYINDEX")
    print(json.dumps({"status": "success", "run_id": "r1",
                      "run_dir": str(home / "runs" / "r1"), "reason": None}))
    sys.exit(0)
if prompt == "SLEEP":
    time.sleep(30)

# Swarm dispatch: `vibe-trading --swarm-run <preset> '<vars_json>'`.
if "--swarm-run" in argv:
    idx = argv.index("--swarm-run")
    preset = argv[idx + 1]
    vars_json = argv[idx + 2] if len(argv) > idx + 2 else "{}"
    (Path(os.environ["HOME"]) / "swarm.marker").write_text(f"{preset}|{vars_json}")
    if preset == "boom_preset":
        sys.stderr.write("preset validation failed\n")
        sys.exit(1)
    sys.exit(0)
sys.exit(0)
"""


@pytest.fixture
def fake_command(tmp_path: Path) -> str:
    script = tmp_path / "fake_vibe.py"
    script.write_text(FAKE_VIBE)
    return f"{sys.executable} {script}"


def make_run(prompt: str) -> ClaimedRun:
    return ClaimedRun(id="run-x", user_id="user-1", prompt=prompt, max_iter=5)


def make_runner(fake_command: str, tmp_path: Path, **overrides) -> TradiRunner:
    kw = dict(
        command=fake_command,
        runs_root=str(tmp_path / "runs"),
        timeout_seconds=10,
        heartbeat_seconds=1,
    )
    kw.update(overrides)
    return TradiRunner(**kw)


def test_success_returns_result(fake_command, tmp_path):
    result = make_runner(fake_command, tmp_path).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    assert isinstance(result, RunResult)
    assert "success" in result.output


def test_home_is_isolated_per_run(fake_command, tmp_path):
    make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    marker = tmp_path / "runs" / "run-x" / "ran.marker"
    assert marker.exists() and marker.read_text() == "SUCCEED"


def test_cleanup_removes_run_dir(fake_command, tmp_path):
    make_runner(fake_command, tmp_path, cleanup=True).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    assert not (tmp_path / "runs" / "run-x").exists()


def test_engine_failure_is_refundable_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_) as exc:
        make_runner(fake_command, tmp_path).execute(
            make_run("FAIL"), lambda: True, threading.Event()
        )
    assert exc.value.refundable is True
    assert "engine boom" in str(exc.value)


def test_usage_error_is_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_):
        make_runner(fake_command, tmp_path).execute(
            make_run("USAGE"), lambda: True, threading.Event()
        )


def test_missing_json_is_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_):
        make_runner(fake_command, tmp_path).execute(
            make_run("BADJSON"), lambda: True, threading.Event()
        )


def test_timeout_is_refundable_timeout(fake_command, tmp_path):
    with pytest.raises(RunTimeout) as exc:
        make_runner(fake_command, tmp_path, timeout_seconds=1).execute(
            make_run("SLEEP"), lambda: True, threading.Event()
        )
    assert exc.value.refundable is True
    assert exc.value.status == "timeout"


def test_shutdown_aborts_as_system_error(fake_command, tmp_path):
    stop = threading.Event()
    stop.set()
    with pytest.raises(SystemError_):
        make_runner(fake_command, tmp_path, timeout_seconds=30).execute(
            make_run("SLEEP"), lambda: True, stop
        )


def test_lost_claim_aborts(fake_command, tmp_path):
    with pytest.raises(ClaimLost):
        make_runner(fake_command, tmp_path, timeout_seconds=30, heartbeat_seconds=1).execute(
            make_run("SLEEP"), lambda: False, threading.Event()
        )


# ─── Swarm dispatch ─────────────────────────────────────────────────────────


def make_swarm_run(preset: str, user_vars: dict | None = None) -> ClaimedRun:
    return ClaimedRun(
        id="swarm-x",
        user_id="user-1",
        prompt="[swarm]",
        max_iter=50,
        kind="swarm",
        preset_name=preset,
        user_vars=user_vars or {"market": "US"},
    )


def test_swarm_success_returns_result(fake_command, tmp_path):
    result = make_runner(fake_command, tmp_path).execute(
        make_swarm_run("equity_research_team"),
        lambda: True,
        threading.Event(),
    )
    assert isinstance(result, RunResult)
    assert "[swarm]" in result.output


def test_swarm_invokes_swarm_run_flag(fake_command, tmp_path):
    make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_swarm_run("equity_research_team", {"market": "US", "ticker": "AAPL"}),
        lambda: True,
        threading.Event(),
    )
    marker = tmp_path / "runs" / "swarm-x" / "swarm.marker"
    assert marker.exists()
    contents = marker.read_text()
    assert contents.startswith("equity_research_team|")
    assert '"market": "US"' in contents
    assert '"ticker": "AAPL"' in contents


def test_swarm_engine_failure_is_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_) as exc:
        make_runner(fake_command, tmp_path).execute(
            make_swarm_run("boom_preset"),
            lambda: True,
            threading.Event(),
        )
    assert exc.value.refundable is True
    assert "swarm run failed" in str(exc.value)


def test_swarm_missing_preset_is_system_error(fake_command, tmp_path):
    with pytest.raises(SystemError_) as exc:
        make_runner(fake_command, tmp_path).execute(
            ClaimedRun(
                id="s2", user_id="u", prompt="[swarm]", max_iter=5, kind="swarm", preset_name=None
            ),
            lambda: True,
            threading.Event(),
        )
    assert "missing preset_name" in str(exc.value)


# ─── Attachment mounting ────────────────────────────────────────────────────


def test_attachments_are_downloaded_into_inputs(fake_command, tmp_path):
    """Attachments should land under HOME/inputs/ before the subprocess runs."""
    fake_content = b"date,close\n2024-01-01,100.0\n"
    downloaded_paths = []

    def fake_downloader(path: str) -> bytes:
        downloaded_paths.append(path)
        return fake_content

    set_attachment_downloader(fake_downloader)
    try:
        run = ClaimedRun(
            id="run-att",
            user_id="u",
            prompt="SUCCEED",
            max_iter=5,
            attachments=(
                Attachment(
                    name="prices.csv",
                    path="u/2026-08-11/aaa-prices.csv",
                    size=len(fake_content),
                    kind="csv",
                ),
            ),
        )
        make_runner(fake_command, tmp_path, cleanup=False).execute(
            run,
            lambda: True,
            threading.Event(),
        )
    finally:
        set_attachment_downloader(None)

    assert downloaded_paths == ["u/2026-08-11/aaa-prices.csv"]
    dest = tmp_path / "runs" / "run-att" / "inputs" / "prices.csv"
    assert dest.exists() and dest.read_bytes() == fake_content


def test_attachment_download_failure_is_refundable(fake_command, tmp_path):
    def broken_downloader(_path: str) -> bytes:
        raise RuntimeError("storage 503")

    set_attachment_downloader(broken_downloader)
    try:
        run = ClaimedRun(
            id="r-brk",
            user_id="u",
            prompt="SUCCEED",
            max_iter=5,
            attachments=(Attachment(name="x.csv", path="u/x.csv", size=1, kind="csv"),),
        )
        with pytest.raises(SystemError_) as exc:
            make_runner(fake_command, tmp_path).execute(
                run,
                lambda: True,
                threading.Event(),
            )
        assert exc.value.refundable is True
        assert "Failed to stage attachments" in str(exc.value)
    finally:
        set_attachment_downloader(None)


def test_attachment_filename_is_sanitized(fake_command, tmp_path):
    """A malicious name like '../../etc/passwd' must not escape HOME/inputs/."""

    def d(_p: str) -> bytes:
        return b"x"

    set_attachment_downloader(d)
    try:
        run = ClaimedRun(
            id="r-esc",
            user_id="u",
            prompt="SUCCEED",
            max_iter=5,
            attachments=(
                Attachment(name="../../etc/passwd", path="u/legit.csv", size=1, kind="csv"),
            ),
        )
        make_runner(fake_command, tmp_path, cleanup=False).execute(
            run,
            lambda: True,
            threading.Event(),
        )
    finally:
        set_attachment_downloader(None)

    inputs = tmp_path / "runs" / "r-esc" / "inputs"
    # sanitized name is 'passwd' (Path().name strips leading path)
    assert (inputs / "passwd").exists()
    # nothing escaped upward
    assert not (tmp_path / "etc" / "passwd").exists()


def test_collects_artifacts_from_workspace(fake_command, tmp_path):
    result = make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("ARTIFACTS"), lambda: True, threading.Event()
    )
    by_name = {a.name: a for a in result.artifacts}
    # the final answer is extracted from the session trace into a readable report
    assert by_name["answer.md"].kind == "report"
    assert b"SMA is the mean" in by_name["answer.md"].content
    # engine outputs collected + classified; the raw session trace is kept
    assert by_name["runs/r1/strategy.pine"].kind == "pine"
    assert by_name["runs/r1/llm_usage.json"].kind == "json"
    assert by_name["sessions/s1/trace.jsonl"].kind == "trace"
    # the binary FTS index and the worker's own capture logs are excluded
    assert "sessions.db" not in by_name
    assert "stdout.log" not in by_name
    assert "stderr.log" not in by_name


# ─── BYOK: api key fetch + injection ────────────────────────────────────────


def test_api_key_injected_into_subprocess_env(fake_command, tmp_path):
    """The stub fetcher's value must land in the subprocess as DEEPSEEK_API_KEY."""
    make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    marker = tmp_path / "runs" / "run-x" / "deepseek_key.marker"
    assert marker.exists()
    assert marker.read_text() == STUB_KEY_VALUE


def test_llm_routing_vars_injected_into_subprocess_env(fake_command, tmp_path):
    """BUG-ENG-4: LANGCHAIN_PROVIDER/MODEL_NAME must reach the engine, or every
    run dies at LLM construction (\"LANGCHAIN_MODEL_NAME is not set\")."""
    make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    marker = tmp_path / "runs" / "run-x" / "llm_route.marker"
    assert marker.exists()
    assert marker.read_text() == "deepseek|deepseek-v4-pro"


def test_ollama_byok_routing(fake_command, tmp_path):
    """Ollama BYOK: when only an Ollama credential exists the engine is routed
    via OLLAMA_BASE_URL + LANGCHAIN_PROVIDER=ollama + LANGCHAIN_MODEL_NAME=<model>.

    The model is taken from the providers catalog (qwen2.5:32b for ollama).
    """
    # Fetcher returns None for all providers except ollama.
    set_api_key_fetcher(
        lambda uid, provider: "http://my-gpu:11434" if provider == "ollama" else None
    )
    make_runner(
        fake_command,
        tmp_path,
        cleanup=False,
    ).execute(make_run("SUCCEED"), lambda: True, threading.Event())
    marker = tmp_path / "runs" / "run-x" / "llm_route.marker"
    assert marker.exists()
    assert marker.read_text() == "ollama|qwen2.5:32b"


def test_multi_provider_resolution_openai(fake_command, tmp_path):
    """Multi-provider BYOK: when a user has only an OpenAI key configured,
    the resolution loop skips deepseek and picks openai."""
    set_api_key_fetcher(
        lambda uid, provider: "sk-openai-fake-key-1234" if provider == "openai" else None
    )
    make_runner(fake_command, tmp_path, cleanup=False).execute(
        make_run("SUCCEED"), lambda: True, threading.Event()
    )
    marker = tmp_path / "runs" / "run-x" / "llm_route.marker"
    assert marker.exists()
    assert marker.read_text() == "openai|gpt-5.5"


def test_missing_key_fetcher_is_system_error(fake_command, tmp_path):
    """No registered fetcher = worker misconfiguration → refundable SystemError_."""
    # Override the autouse fixture's stub for this one test.
    set_api_key_fetcher(None)
    with pytest.raises(SystemError_) as exc:
        make_runner(fake_command, tmp_path).execute(
            make_run("SUCCEED"), lambda: True, threading.Event()
        )
    assert exc.value.refundable is True
    assert "api key fetcher not registered" in str(exc.value)


def test_missing_key_is_user_input_error(fake_command, tmp_path):
    """Fetcher returning None = user has no key configured → MissingApiKey, not refunded."""
    set_api_key_fetcher(lambda uid, provider: None)
    with pytest.raises(MissingApiKey) as exc:
        make_runner(fake_command, tmp_path).execute(
            make_run("SUCCEED"), lambda: True, threading.Event()
        )
    assert exc.value.refundable is False
    assert "no api key configured for any provider" in str(exc.value)


def test_key_fetcher_called_before_attachment_download(fake_command, tmp_path):
    """A missing key must short-circuit BEFORE attachments are downloaded —
    no point spending bandwidth on a run that can never execute."""
    downloader_calls = []

    def tracking_downloader(path: str) -> bytes:
        downloader_calls.append(path)
        return b"unused"

    set_api_key_fetcher(lambda uid, provider: None)
    set_attachment_downloader(tracking_downloader)
    try:
        run = ClaimedRun(
            id="r-order",
            user_id="u",
            prompt="SUCCEED",
            max_iter=5,
            attachments=(Attachment(name="x.csv", path="u/x.csv", size=1, kind="csv"),),
        )
        with pytest.raises(MissingApiKey):
            make_runner(fake_command, tmp_path).execute(
                run,
                lambda: True,
                threading.Event(),
            )
    finally:
        set_attachment_downloader(None)

    assert downloader_calls == []
