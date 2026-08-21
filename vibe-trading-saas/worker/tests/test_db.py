"""RunQueue — Supabase RPC interaction layer.

Exercises the client‐interaction contract: RPC calls, response parsing,
Realtime subscription, attachment download, and key decryption. Uses
``unittest.mock`` to stub the ``supabase.Client``; no network.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest

from hm_worker.config import Config
from hm_worker.db import Attachment, ClaimedRun, RunQueue


def make_config(**overrides) -> Config:
    defaults = dict(
        supabase_url="https://test.supabase.co",
        service_role_key="test-key",
        worker_id="test-worker",
        poll_interval_seconds=0,
        idle_backoff_seconds=0,
        heartbeat_seconds=1,
        run_timeout_seconds=900,
        stale_after_seconds=1200,
        execute_tradi=False,
        stub_duration_seconds=0,
    )
    defaults.update(overrides)
    return Config(**defaults)


def make_client() -> MagicMock:
    """Return a mock Supabase ``Client`` with the patterns RunQueue uses."""
    client = MagicMock()
    return client


def make_rpc_response(data):
    """Build a mock that mimics ``client.rpc(...).execute().data``."""
    resp = MagicMock()
    resp.data = data
    return resp


# ─── ClaimedRun.from_row ──────────────────────────────────────────


class TestClaimedRunFromRow:
    """The row-to-dataclass parser that handles DB quirks."""

    def test_parses_a_standard_row(self):
        row = {
            "run_id": "r-1",
            "run_user_id": "u-1",
            "run_prompt": "Backtest AAPL",
            "run_max_iter": 10,
            "run_kind": "single",
            "run_attachments": [],
            "run_preset_name": None,
            "run_user_vars": None,
        }
        run = ClaimedRun.from_row(row)
        assert run.id == "r-1"
        assert run.user_id == "u-1"
        assert run.prompt == "Backtest AAPL"
        assert run.max_iter == 10
        assert run.kind == "single"
        assert run.attachments == ()

    def test_parses_attachments_from_list_of_dicts(self):
        row = {
            "run_id": "r-2",
            "run_user_id": "u-1",
            "run_prompt": "with file",
            "run_max_iter": 5,
            "run_attachments": [
                {"name": "data.csv", "path": "u-1/data.csv", "size": 1024, "kind": "csv"},
            ],
        }
        run = ClaimedRun.from_row(row)
        assert len(run.attachments) == 1
        assert run.attachments[0] == Attachment(
            name="data.csv", path="u-1/data.csv", size=1024, kind="csv",
        )

    def test_handles_json_string_attachments(self):
        """Some Postgres clients return JSONB as a raw string."""
        row = {
            "run_id": "r-3",
            "run_user_id": "u-1",
            "run_prompt": "json string",
            "run_max_iter": 5,
            "run_attachments": json.dumps([
                {"name": "file.xlsx", "path": "u-1/file.xlsx", "size": 2048, "kind": "xlsx"},
            ]),
        }
        run = ClaimedRun.from_row(row)
        assert len(run.attachments) == 1
        assert run.attachments[0].name == "file.xlsx"

    def test_handles_null_attachments(self):
        row = {
            "run_id": "r-4",
            "run_user_id": "u-1",
            "run_prompt": "no files",
            "run_max_iter": 5,
            "run_attachments": None,
        }
        run = ClaimedRun.from_row(row)
        assert run.attachments == ()

    def test_handles_empty_dict_attachments(self):
        """Older rows might store {} instead of [] or NULL."""
        row = {
            "run_id": "r-5",
            "run_user_id": "u-1",
            "run_prompt": "empty dict",
            "run_max_iter": 5,
            "run_attachments": {},
        }
        run = ClaimedRun.from_row(row)
        assert run.attachments == ()

    def test_skips_attachment_entries_without_path(self):
        row = {
            "run_id": "r-6",
            "run_user_id": "u-1",
            "run_prompt": "bad att",
            "run_max_iter": 5,
            "run_attachments": [
                {"name": "ok.csv", "path": "u-1/ok.csv", "size": 100, "kind": "csv"},
                {"name": "missing-path.csv", "size": 50, "kind": "csv"},
                "not-a-dict",
            ],
        }
        run = ClaimedRun.from_row(row)
        assert len(run.attachments) == 1
        assert run.attachments[0].name == "ok.csv"

    def test_defaults_kind_to_single_when_missing(self):
        row = {
            "run_id": "r-7",
            "run_user_id": "u-1",
            "run_prompt": "old row",
            "run_max_iter": 5,
        }
        run = ClaimedRun.from_row(row)
        assert run.kind == "single"

    def test_parses_swarm_run_with_preset(self):
        row = {
            "run_id": "r-8",
            "run_user_id": "u-1",
            "run_prompt": "swarm",
            "run_max_iter": 15,
            "run_kind": "swarm",
            "run_preset_name": "equity-research",
            "run_user_vars": {"tickers": "AAPL,MSFT"},
        }
        run = ClaimedRun.from_row(row)
        assert run.kind == "swarm"
        assert run.preset_name == "equity-research"
        assert run.user_vars == {"tickers": "AAPL,MSFT"}

    def test_handles_invalid_json_string_attachments(self):
        row = {
            "run_id": "r-9",
            "run_user_id": "u-1",
            "run_prompt": "bad json",
            "run_max_iter": 5,
            "run_attachments": "not-valid-json{{{",
        }
        run = ClaimedRun.from_row(row)
        assert run.attachments == ()


# ─── RunQueue ─────────────────────────────────────────────────────


class TestRunQueueClaim:
    def test_returns_claimed_run_on_success(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response([
            {
                "run_id": "r-claimed",
                "run_user_id": "u-1",
                "run_prompt": "test claim",
                "run_max_iter": 10,
                "run_kind": "single",
                "run_attachments": [],
            },
        ])
        queue = RunQueue(make_config(), client=client)

        run = queue.claim()

        assert run is not None
        assert run.id == "r-claimed"
        client.rpc.assert_called_once_with(
            "claim_agent_run",
            {"p_worker_id": "test-worker", "p_stale_after": "1200 seconds"},
        )

    def test_returns_none_when_queue_is_empty(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response([])
        queue = RunQueue(make_config(), client=client)

        assert queue.claim() is None

    def test_returns_none_when_response_data_is_none(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(None)
        queue = RunQueue(make_config(), client=client)

        assert queue.claim() is None


class TestRunQueueHeartbeat:
    def test_heartbeat_calls_rpc_with_run_and_worker_ids(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        result = queue.heartbeat("run-1")

        assert result is True
        client.rpc.assert_called_once_with(
            "heartbeat_agent_run",
            {"p_run_id": "run-1", "p_worker_id": "test-worker"},
        )

    def test_heartbeat_returns_false_when_claim_lost(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(False)
        queue = RunQueue(make_config(), client=client)

        assert queue.heartbeat("run-1") is False


class TestRunQueueProgress:
    def test_progress_calls_rpc_and_returns_true(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        result = queue.progress("run-1", "Processing iteration 3", iteration=3)

        assert result is True
        client.rpc.assert_called_once_with(
            "update_run_progress",
            {
                "p_run_id": "run-1",
                "p_worker_id": "test-worker",
                "p_message": "Processing iteration 3",
                "p_iter": 3,
            },
        )

    def test_progress_truncates_long_messages_to_240_chars(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        long_msg = "x" * 500
        queue.progress("run-1", long_msg)

        call_args = client.rpc.call_args[0][1]
        assert len(call_args["p_message"]) == 240

    def test_progress_swallows_exceptions_and_returns_false(self):
        client = make_client()
        client.rpc.side_effect = Exception("network error")
        queue = RunQueue(make_config(), client=client)

        result = queue.progress("run-1", "test")

        assert result is False


class TestRunQueueComplete:
    def test_complete_calls_rpc_and_returns_true(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        result = queue.complete("run-1")

        assert result is True
        client.rpc.assert_called_once_with(
            "complete_agent_run",
            {"p_run_id": "run-1", "p_worker_id": "test-worker"},
        )


class TestRunQueueFail:
    def test_fail_calls_rpc_with_status_and_refund(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        result = queue.fail("run-1", "engine boom", status="failed", refund=True)

        assert result is True
        client.rpc.assert_called_once_with(
            "fail_agent_run",
            {
                "p_run_id": "run-1",
                "p_worker_id": "test-worker",
                "p_error": "engine boom",
                "p_status": "failed",
                "p_refund": True,
            },
        )

    def test_fail_truncates_error_to_2000_chars(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        long_error = "e" * 5000
        queue.fail("run-1", long_error)

        call_args = client.rpc.call_args[0][1]
        assert len(call_args["p_error"]) == 2000

    def test_fail_defaults_to_failed_status_no_refund(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(True)
        queue = RunQueue(make_config(), client=client)

        queue.fail("run-1", "user error")

        call_args = client.rpc.call_args[0][1]
        assert call_args["p_status"] == "failed"
        assert call_args["p_refund"] is False


class TestRunQueueDownloadAttachment:
    def test_download_reads_from_agent_uploads_bucket(self):
        client = make_client()
        client.storage.from_.return_value.download.return_value = b"col1,col2\n1,2\n"
        queue = RunQueue(make_config(), client=client)

        data = queue.download_attachment("u-1/2026-08-15/data.csv")

        assert data == b"col1,col2\n1,2\n"
        client.storage.from_.assert_called_once_with("agent-uploads")
        client.storage.from_.return_value.download.assert_called_once_with(
            "u-1/2026-08-15/data.csv",
        )


class TestRunQueueGetUserApiKey:
    def test_returns_decrypted_key(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response("sk-test-key-abc123")
        queue = RunQueue(make_config(), client=client)

        key = queue.get_user_api_key("user-1", "deepseek")

        assert key == "sk-test-key-abc123"
        client.rpc.assert_called_once_with(
            "worker_get_user_api_key",
            {"p_user_id": "user-1", "p_provider": "deepseek"},
        )

    def test_returns_none_when_no_key_configured(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response(None)
        queue = RunQueue(make_config(), client=client)

        assert queue.get_user_api_key("user-1", "deepseek") is None

    def test_returns_none_for_empty_string_key(self):
        client = make_client()
        client.rpc.return_value.execute.return_value = make_rpc_response("")
        queue = RunQueue(make_config(), client=client)

        assert queue.get_user_api_key("user-1", "deepseek") is None

    def test_propagates_rpc_errors(self):
        client = make_client()
        client.rpc.return_value.execute.side_effect = Exception("vault error")
        queue = RunQueue(make_config(), client=client)

        with pytest.raises(Exception, match="vault error"):
            queue.get_user_api_key("user-1", "deepseek")


class TestRunQueueRealtime:
    def test_subscribe_swallows_not_implemented_error(self):
        """Sync client raises NotImplementedError — RunQueue must not crash."""
        client = make_client()
        client.realtime.channel.side_effect = NotImplementedError("sync client")
        queue = RunQueue(make_config(), client=client)

        # Must not raise
        queue.subscribe_new_runs(threading.Event())

    def test_unsubscribe_is_a_no_op_without_prior_subscribe(self):
        """Calling unsubscribe without a prior subscribe must not crash."""
        client = make_client()
        queue = RunQueue(make_config(), client=client)

        # No prior subscribe — must not raise
        queue.unsubscribe()

    def test_unsubscribe_removes_the_channel(self):
        client = make_client()
        fake_channel = MagicMock()
        client.realtime.channel.return_value = fake_channel
        fake_channel.on_postgres_changes.return_value = fake_channel
        fake_channel.subscribe.return_value = fake_channel
        queue = RunQueue(make_config(), client=client)

        queue.subscribe_new_runs(threading.Event())
        queue.unsubscribe()

        client.realtime.remove_channel.assert_called_once_with(fake_channel)


class TestRunQueueWorkerIdProperty:
    def test_worker_id_comes_from_config(self):
        queue = RunQueue(make_config(worker_id="w-42"), client=make_client())
        assert queue.worker_id == "w-42"

    def test_client_property_returns_the_injected_client(self):
        client = make_client()
        queue = RunQueue(make_config(), client=client)
        assert queue.client is client
