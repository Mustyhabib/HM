"""Tests for session-aware worker processing (Task 3).

Mirrors the plan's intent but targets the REAL worker architecture:
  * ClaimedRun / RunQueue (not DbQueue), and the runner reaches the DB via
    module-level injection hooks (set_session_history_fetcher / set_session_completer)
    — not via a private _queue attribute.
"""
import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from hm_worker.db import ClaimedRun
from hm_worker.runner import TradiRunner, set_session_completer, set_session_history_fetcher


def _make_run(session_id=None):
    return ClaimedRun(
        id="run-abc",
        user_id="user-123",
        prompt="Test prompt",
        max_iter=5,
        kind="single",
        attachments=(),
        preset_name=None,
        user_vars=None,
        provider="deepseek",
        model=None,
        session_id=session_id,
    )


# ── ClaimedRun.session_id ──────────────────────────────────────────────────────


class TestClaimedRunSessionId:
    def test_session_id_default_is_none(self):
        assert _make_run().session_id is None

    def test_session_id_is_set(self):
        assert _make_run(session_id="sess-xyz").session_id == "sess-xyz"

    def test_from_row_without_session_id(self):
        row = {
            "run_id": "run-abc", "run_user_id": "user-123",
            "run_prompt": "p", "run_max_iter": 5, "run_kind": "single",
            "run_attachments": [], "run_preset_name": None,
            "run_user_vars": None, "run_provider": "deepseek",
            "run_model": None,
            # no run_session_id
        }
        assert ClaimedRun.from_row(row).session_id is None

    def test_from_row_with_session_id(self):
        row = {
            "run_id": "run-abc", "run_user_id": "user-123",
            "run_prompt": "p", "run_max_iter": 5, "run_kind": "single",
            "run_attachments": [], "run_preset_name": None,
            "run_user_vars": None, "run_provider": "deepseek",
            "run_model": None, "run_session_id": "sess-xyz",
        }
        assert ClaimedRun.from_row(row).session_id == "sess-xyz"

    def test_from_row_session_id_null_string(self):
        # DB returns None for a NULL session_id; from_row must normalise.
        row = {
            "run_id": "r", "run_user_id": "u", "run_prompt": "p",
            "run_max_iter": 1, "run_kind": "single", "run_attachments": [],
            "run_preset_name": None, "run_user_vars": None,
            "run_provider": "deepseek", "run_model": None,
            "run_session_id": None,
        }
        assert ClaimedRun.from_row(row).session_id is None


# ── RunQueue session methods (exercised via real client.rpc mocking) ──────────


class TestRunQueueSessionMethods:
    def _queue(self):
        # Build a RunQueue without touching Supabase by bypassing __init__.
        from hm_worker.db import RunQueue
        q = RunQueue.__new__(RunQueue)
        q._client = MagicMock()
        q._config = MagicMock()
        q._config.worker_id = "worker-test"
        return q

    def test_get_session_history_calls_rpc(self):
        q = self._queue()
        q._client.rpc.return_value.execute.return_value.data = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
        result = q.get_session_history("sess-xyz", "user-123", limit=8)
        q._client.rpc.assert_called_once_with(
            "get_session_history",
            {"p_session_id": "sess-xyz", "p_user_id": "user-123", "p_limit": 8},
        )
        assert result == [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]

    def test_get_session_history_empty(self):
        q = self._queue()
        q._client.rpc.return_value.execute.return_value.data = None
        assert q.get_session_history("sess-xyz", "user-123") == []

    def test_complete_session_turn_calls_rpc(self):
        q = self._queue()
        ok = q.complete_session_turn("run-abc", "sess-xyz", "The answer is 42", [{"tool": "backtest"}])
        q._client.rpc.assert_called_once_with(
            "complete_session_turn",
            {
                "p_run_id": "run-abc",
                "p_session_id": "sess-xyz",
                "p_content": "The answer is 42",
                "p_tool_trail": [{"tool": "backtest"}],
            },
        )
        assert ok is True

    def test_complete_session_turn_swallows_error(self):
        q = self._queue()
        q._client.rpc.return_value.execute.side_effect = RuntimeError("boom")
        assert q.complete_session_turn("run-abc", "sess-xyz", "x") is False


# ── TradiRunner session-history injection (uses the injected fetcher hook) ─────


class TestTradiRunnerSessionHistoryInjection:
    def _runner(self, tmp_path, fetcher=None):
        r = TradiRunner.__new__(TradiRunner)
        r._command = ["echo"]
        r._runs_root = tmp_path
        r._timeout = 1
        r._heartbeat_every = 1
        r._extra_env = {}
        r._cleanup = False
        r._llm_provider = "deepseek"
        r._llm_model = "deepseek-v4-pro"
        r._ollama_model = "qwen2.5:32b"
        if fetcher is not None:
            set_session_history_fetcher(fetcher)
        else:
            set_session_history_fetcher(None)
        return r

    def test_history_file_written_for_session_run(self, tmp_path):
        run = _make_run(session_id="sess-xyz")

        def fetcher(sid, uid, limit):
            assert sid == "sess-xyz" and uid == "user-123"
            return [
                {"role": "user", "content": "prior prompt"},
                {"role": "assistant", "content": "prior answer"},
            ]

        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        history_path = self._runner(tmp_path, fetcher)._write_session_history(run, run_dir)

        assert history_path is not None and history_path.exists()
        assert json.loads(history_path.read_text()) == [
            {"role": "user", "content": "prior prompt"},
            {"role": "assistant", "content": "prior answer"},
        ]

    def test_no_history_file_for_standalone_run(self, tmp_path):
        run = _make_run(session_id=None)
        called = {"n": 0}
        set_session_history_fetcher(lambda s, u, l: called.__setitem__("n", called["n"] + 1) or [])
        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        history_path = self._runner(tmp_path)._write_session_history(run, run_dir)
        assert history_path is None
        assert called["n"] == 0

    def test_no_history_file_when_fetcher_unset(self, tmp_path):
        run = _make_run(session_id="sess-xyz")
        set_session_history_fetcher(None)
        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        assert self._runner(tmp_path)._write_session_history(run, run_dir) is None

    def test_argv_includes_history_flag(self, tmp_path):
        run = _make_run(session_id="sess-xyz")
        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        hist = run_dir / "session_history.json"
        hist.write_text("[]")
        argv = self._runner(tmp_path)._argv_for(run, run_dir, history_path=hist)
        assert "--history-file" in argv
        assert str(hist) in argv

    def test_argv_omits_history_flag_for_standalone(self, tmp_path):
        run = _make_run(session_id=None)
        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        argv = self._runner(tmp_path)._argv_for(run, run_dir)
        assert "--history-file" not in argv


# ── Tool trail builder (parsed from trace.jsonl) ──────────────────────────────


class TestBuildToolTrail:
    def _write_trace(self, tmp_path, events):
        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        trace = run_dir / "sessions" / "run-abc"
        trace.mkdir(parents=True)
        t = trace / "trace.jsonl"
        t.write_text("\n".join(json.dumps(e) for e in events))
        return run_dir

    def test_pairs_tool_calls_with_results(self, tmp_path):
        events = [
            {"type": "tool_call", "iter": 1, "tool": "backtest", "call_id": "c1", "args": {"symbol": "SOL"}},
            {"type": "tool_result", "iter": 1, "tool": "backtest", "call_id": "c1",
             "status": "ok", "elapsed_ms": 1200, "preview": "Sharpe=1.4"},
            {"type": "tool_call", "iter": 2, "tool": "web_search", "call_id": "c2", "args": {}},
            {"type": "tool_result", "iter": 2, "tool": "web_search", "call_id": "c2",
             "status": "ok", "elapsed_ms": 300, "preview": "SOL news..."},
        ]
        run_dir = self._write_trace(tmp_path, events)
        trail = TradiRunner._build_tool_trail(run_dir)
        assert len(trail) == 2
        assert trail[0]["tool"] == "backtest"
        assert trail[0]["status"] == "ok"
        assert trail[0]["elapsed_ms"] == 1200
        assert "Sharpe" in trail[0]["preview"]

    def test_empty_events(self, tmp_path):
        run_dir = tmp_path / "run-abc"
        run_dir.mkdir()
        assert TradiRunner._build_tool_trail(run_dir) == []

    def test_tool_error_status_preserved(self, tmp_path):
        events = [
            {"type": "tool_call", "iter": 1, "tool": "get_market_data", "call_id": "c1", "args": {}},
            {"type": "tool_result", "iter": 1, "tool": "get_market_data", "call_id": "c1",
             "status": "error", "elapsed_ms": 100, "preview": "404 symbol not found"},
        ]
        run_dir = self._write_trace(tmp_path, events)
        trail = TradiRunner._build_tool_trail(run_dir)
        assert trail[0]["status"] == "error"

    def test_fallback_key_when_no_call_id(self, tmp_path):
        events = [
            {"type": "tool_call", "iter": 1, "tool": "alpha_zoo", "args": {}},
            {"type": "tool_result", "iter": 1, "tool": "alpha_zoo",
             "status": "ok", "elapsed_ms": 50, "preview": "p"},
        ]
        run_dir = self._write_trace(tmp_path, events)
        trail = TradiRunner._build_tool_trail(run_dir)
        assert trail[0]["tool"] == "alpha_zoo"


# ── End-to-end session completion via the injected completer hook ─────────────


class TestSessionCompletionHook:
    def test_completer_invoked_on_session_run(self, tmp_path):
        # Drive TradiRunner.execute() with a fake engine that writes a trace +
        # answers, and assert the completer hook fires with the answer + trail.
        captured = {}

        def fake_engine_script():
            return (
                "import json, os, sys, pathlib\n"
                "home = pathlib.Path(os.environ['HOME'])\n"
                "sess = home / 'sessions' / 'run-abc'\n"
                "sess.mkdir(parents=True, exist_ok=True)\n"
                "(sess / 'trace.jsonl').write_text(json.dumps({\n"
                "  'type': 'tool_call', 'iter': 1, 'tool': 'backtest',\n"
                "  'call_id': 'c1', 'args': {}}) + '\\n' + json.dumps({\n"
                "  'type': 'tool_result', 'iter': 1, 'tool': 'backtest',\n"
                "  'call_id': 'c1', 'status': 'ok', 'elapsed_ms': 999,\n"
                "  'preview': 'Sharpe=2.1'}) + '\\n' + json.dumps({\n"
                "  'type': 'answer', 'content': 'BTC looks bullish'}) + '\\n')\n"
                "print(json.dumps({'status': 'success', 'run_id': 'run-abc',\n"
                "                   'run_dir': str(home), 'reason': None}))\n"
            )

        engine = tmp_path / "engine.py"
        engine.write_text(fake_engine_script())

        run = _make_run(session_id="sess-xyz")
        set_session_history_fetcher(lambda s, u, l: [])
        set_session_completer(
            lambda rid, sid, content, trail: captured.setdefault("v", (rid, sid, content, trail)) or True
        )

        r = TradiRunner.__new__(TradiRunner)
        r._command = ["python3", str(engine)]
        r._runs_root = tmp_path
        r._timeout = 30
        r._heartbeat_every = 1
        r._extra_env = {}
        r._cleanup = False
        r._llm_provider = "deepseek"
        r._llm_model = "deepseek-v4-pro"
        r._ollama_model = "qwen2.5:32b"

        # Minimal hooks so execute() doesn't raise: key fetcher + provider resolver.
        from hm_worker import runner as runner_mod
        runner_mod.set_api_key_fetcher(lambda uid, provider: "k")

        from hm_worker.catalog import get_catalog, set_catalog, set_provider_resolver, ProviderCatalog, ProviderSpec
        cat = ProviderCatalog()
        cat._by_name = {"deepseek": ProviderSpec(
            name="deepseek", label="DeepSeek", provider_type="key",
            api_key_env="DEEPSEEK_API_KEY", base_url_env="DEEPSEEK_BASE_URL",
            default_model="deepseek-v4-pro", default_base_url="https://api.deepseek.com/v1")}
        cat._loaded = True
        set_catalog(cat)
        set_provider_resolver(lambda uid: "deepseek")

        result = r.execute(run, lambda: True, _StubStop())
        assert result is not None
        assert captured["v"][0] == "run-abc"
        assert captured["v"][1] == "sess-xyz"
        assert "bullish" in captured["v"][2]
        assert captured["v"][3][0]["tool"] == "backtest"
        assert captured["v"][3][0]["elapsed_ms"] == 999

    def teardown_method(self):
        set_session_completer(None)
        set_session_history_fetcher(None)


class _StubStop:
    def is_set(self):
        return False

    def wait(self, timeout=None):
        return False
