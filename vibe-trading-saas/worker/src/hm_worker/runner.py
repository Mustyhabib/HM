"""Execution of a claimed run.

Day 4 ships :class:`StubRunner` only — it proves the queue mechanics (claim →
running → completed) without invoking Tradi. Day 5 adds a ``TradiRunner`` that
implements the same :class:`Runner` interface by launching

    HOME=/var/vibe-runs/<run_id> vibe-trading run -p "<prompt>" --json --max-iter N

as a subprocess with a wall-clock timeout. Keeping the interface here means the
polling loop in :mod:`hm_worker.main` does not change when that lands.
"""

from __future__ import annotations

import json
import logging
import os
import shlex
import shutil
import subprocess
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol

from .catalog import get_catalog, _provider_resolver
from .db import Attachment, ClaimedRun
from .logging_config import set_run_id
from .progress import TraceTailer

# Optional injection point for the storage downloader — set by main.py when the
# worker boots. Kept as a module-level callable so the Runner protocol stays
# unchanged and StubRunner/tests don't need a real client. Signature: (path) -> bytes.
_attachment_downloader: Callable[[str], bytes] | None = None

# Optional injection point for progress push. Signature:
#   (run_id: str, message: str, iteration: int | None) -> None
_progress_push: Callable[[str, str, int | None], None] | None = None

# Optional injection point for the per-user API key fetch (BYOK pivot).
# Signature: (user_id: str, provider: str) -> str | None
_api_key_fetcher: Callable[[str, str], str | None] | None = None


def set_attachment_downloader(fn: Callable[[str], bytes] | None) -> None:
    """Register the function used to fetch attachments from Supabase Storage.

    Called by main.py once the RunQueue exists. Passing ``None`` in tests
    disables downloads (attachments-bearing runs will raise SystemError_).
    """
    global _attachment_downloader
    _attachment_downloader = fn


def set_progress_push(fn: Callable[[str, str, int | None], None] | None) -> None:
    """Register the progress pusher (usually queue.progress bound to run_id).

    None (default) disables trace tailing — useful in tests.
    """
    global _progress_push
    _progress_push = fn


def set_api_key_fetcher(fn: Callable[[str, str], str | None] | None) -> None:
    """Register the function used to fetch a user's decrypted API key.

    Called by main.py once the RunQueue exists (BYOK pivot — every
    ``TradiRunner`` execution needs a per-user key, unlike attachments,
    which are optional). Passing ``None`` disables lookups: every
    ``TradiRunner.execute()`` call will then raise ``SystemError_`` before
    doing any other work — mirrors ``set_attachment_downloader``'s
    test-friendly default of failing loudly rather than silently.
    """
    global _api_key_fetcher
    _api_key_fetcher = fn


log = logging.getLogger(__name__)

#: Called periodically during a run to keep the claim alive. Returns False if
#: the claim was lost (another worker reclaimed it), which aborts the run.
Heartbeat = Callable[[], bool]


class RunError(Exception):
    """Base for run failures.

    ``refundable`` follows CLAUDE.md's quota rule: a system-caused failure gives
    the use back, a user-input error does not.
    """

    refundable = False
    status = "failed"


class UserInputError(RunError):
    """The prompt itself was the problem. Not refunded."""


class MissingApiKey(UserInputError):
    """No API key configured for the requested provider (BYOK pivot).

    Not refundable — the user needs to add a key on the Profile page before
    a run can execute. This is not a system fault, so it's treated the same
    as any other user-input error.
    """


class SystemError_(RunError):
    """Crash, infra fault, or anything not the user's fault. Refunded."""

    refundable = True


class RunTimeout(RunError):
    """Exceeded the wall-clock budget. Refunded."""

    refundable = True
    status = "timeout"


class ClaimLost(RunError):
    """Another worker reclaimed this run mid-flight; drop it silently."""


@dataclass(frozen=True)
class Artifact:
    """One file produced by a run, read into memory before the workspace is
    cleaned up. ``name`` is the path relative to the run workspace."""

    kind: str
    name: str
    content: bytes


@dataclass
class RunResult:
    """What a runner produces: a short summary plus the run's artifacts."""

    output: str = ""
    artifacts: list[Artifact] = field(default_factory=list)


class Runner(Protocol):
    def execute(
        self,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
    ) -> RunResult: ...


class StubRunner:
    """Day 4 placeholder: sleeps, heartbeats, succeeds.

    Sleeps in short slices so a shutdown signal is honoured promptly instead of
    blocking for the full duration.
    """

    def __init__(self, duration_seconds: int, heartbeat_seconds: int) -> None:
        self._duration = duration_seconds
        self._heartbeat_every = max(1, heartbeat_seconds)

    def execute(
        self,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
    ) -> RunResult:
        log.info("stub-executing run %s (%ss)", run.id, self._duration)

        elapsed = 0
        slice_seconds = 1
        while elapsed < self._duration:
            if stop.wait(timeout=slice_seconds):
                raise SystemError_("Worker shut down mid-run")
            elapsed += slice_seconds

            if elapsed % self._heartbeat_every == 0 and not heartbeat():
                raise ClaimLost(f"Lost claim on run {run.id}")

        return RunResult(output=f"[stub] would have run: {run.prompt[:200]}")


# Exit codes emitted by `vibe-trading run` (engine: agent/cli/_legacy.py).
# Duplicated here rather than imported — the worker must not import the engine.
EXIT_SUCCESS = 0
EXIT_RUN_FAILED = 1
EXIT_USAGE_ERROR = 2

# Artifacts are read into memory before cleanup — skip anything oversized.
MAX_ARTIFACT_BYTES = 15 * 1024 * 1024
# Worker-internal capture / engine index files that are never user artifacts.
_ARTIFACT_EXCLUDE = {"stdout.log", "stderr.log", "sessions.db"}


class TradiRunner:
    """Day 5: run Tradi as an isolated subprocess, one per use.

    Launches ``vibe-trading run -p "<prompt>" --json --no-rich --max-iter N`` with
    ``HOME`` / ``VIBE_TRADING_HOME`` / ``VIBE_TRADING_ALLOWED_RUN_ROOTS`` pointed at
    a fresh per-run directory, so config, sessions, runs, and persistent memory are
    isolated per tenant with zero engine changes (decision D1, ARCHITECTURE.md). The
    worker owns the wall-clock timeout because Tradi has no overall-run timeout.

    BYOK pivot: before doing anything else, ``execute()`` resolves the run's
    owner's LLM credential via the module-level ``_api_key_fetcher`` injection
    point (same pattern as ``_attachment_downloader`` / ``_progress_push`` —
    registered by ``main.py``, ``None`` by default so StubRunner-only tests
    don't need Supabase).  Provider resolution order: DeepSeek first, Ollama
    fallback.  The credential is injected into the subprocess env in
    ``_build_env`` (as ``DEEPSEEK_API_KEY`` or ``OLLAMA_BASE_URL``) and is
    never logged.

    Outcome mapping (CLAUDE.md refund rule; unknown fault -> refund, D7):
      - exit 0 + ``{"status": "success"}``  -> RunResult
      - no key configured for any provider   -> MissingApiKey (not refunded)
      - wall-clock exceeded                 -> RunTimeout (refund)
      - worker shutdown mid-run             -> SystemError_ (refund)
      - claim lost (heartbeat False)        -> ClaimLost (row left untouched)
      - any other exit / status / bad JSON  -> SystemError_ (refund)

    Tradi's ``--json`` envelope is ``{"status", "run_id", "run_dir", "reason"}`` and
    does not distinguish a bad *prompt* from an engine fault, so a plain ``failed`` is
    treated as system-caused (refunded) — we don't charge a user for a failure we
    can't prove was theirs.
    """

    def __init__(
        self,
        *,
        command: str = "vibe-trading",
        runs_root: str = "/var/vibe-runs",
        timeout_seconds: int,
        heartbeat_seconds: int,
        env: Mapping[str, str] | None = None,
        cleanup: bool = True,
        llm_provider: str = "deepseek",
        llm_model: str = "deepseek-v4-pro",
        ollama_model: str = "qwen2.5:32b",
    ) -> None:
        self._command = shlex.split(command)
        self._runs_root = Path(runs_root)
        self._timeout = timeout_seconds
        self._heartbeat_every = max(1, heartbeat_seconds)
        self._extra_env = dict(env or {})
        self._cleanup = cleanup
        self._llm_provider = llm_provider
        self._llm_model = llm_model
        self._ollama_model = ollama_model

    def execute(
        self,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
    ) -> RunResult:
        # Tag subsequent log lines on this thread with the run id so the
        # structured JSON logs correlate a whole claim→complete cycle.
        # Cleared by main.process_run in its finally block.
        set_run_id(run.id)
        run_dir = self._runs_root / str(run.id)
        run_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = run_dir / "stdout.log"
        stderr_path = run_dir / "stderr.log"

        # 1. Resolve the user's LLM credential (BYOK pivot) before anything else —
        #    attachments and the engine subprocess both cost real time/bandwidth,
        #    and there is no point spending either on a run that can never
        #    execute. A missing fetcher is a worker misconfiguration
        #    (SystemError_, refunded); a missing/never-configured key is the
        #    user's to fix (MissingApiKey, not refunded).
        #
        #    Provider resolution is catalog-driven: the selected provider
        #    (user_llm_prefs, via the resolver hook wired in main.py) wins;
        #    the start_*_run RPCs already resolved it to a configured provider
        #    and recorded it on agent_runs.provider, so the worker trusts that
        #    value when present otherwise it asks the resolver hook. Either
        #    way the worker fetches the credential for exactly that provider.
        if _api_key_fetcher is None:
            raise SystemError_("api key fetcher not registered")
        try:
            return self._execute_checked(run, heartbeat, stop, run_dir)
        finally:
            # Cleanup covers EVERY path — including failures raised before the
            # subprocess section (missing key, attachment staging, bad preset),
            # which previously leaked the per-run directory.
            if self._cleanup:
                shutil.rmtree(run_dir, ignore_errors=True)

    def _execute_checked(
        self,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
        run_dir: Path,
    ) -> RunResult:
        catalog = get_catalog()
        # Prefer the provider recorded on the run row (set by start_*_run),
        # else defer to the per-user resolver hook.
        resolved_provider = getattr(run, "provider", None) or (
            _provider_resolver(run.user_id) if _provider_resolver else None
        )
        if not resolved_provider or resolved_provider not in catalog:
            # Fail closed: do not guess. The run row should always carry a
            # valid provider from the DB gate; a mismatch means data drift.
            raise MissingApiKey(
                f"no usable provider resolved for run {run.id}"
            )
        api_key = _api_key_fetcher(run.user_id, resolved_provider)
        if not api_key:
            raise MissingApiKey(
                f"no api key configured for provider '{resolved_provider}'"
            )

        # 2. Mount any Premium attachments into HOME/inputs/ before the engine boots.
        #    Failure to download is treated as SystemError_ (refunded) — the user
        #    should not be charged when we couldn't stage their inputs.
        try:
            self._mount_attachments(run, run_dir)
        except SystemError_:
            raise
        except Exception as exc:  # noqa: BLE001 — coerce to refundable failure
            raise SystemError_(f"Failed to stage attachments: {exc}") from exc

        # 3. Build argv per run kind. Swarm dispatch reuses Tradi's
        #    ``--swarm-run PRESET '{vars_json}'`` legacy CLI (see agent/cli/_legacy.py);
        #    shadow dispatch passes the journal via the main-parser ``--upload`` flag.
        argv = self._argv_for(run, run_dir)

        stdout_path = run_dir / "stdout.log"
        stderr_path = run_dir / "stderr.log"

        log.info(
            "tradi run %s: kind=%s HOME=%s max_iter=%s attachments=%d",
            run.id,
            run.kind,
            run_dir,
            run.max_iter,
            len(run.attachments),
        )

        # Start the trace tailer in a background thread — pushes progress lines
        # to the DB as the engine writes them. Never fatal if the pusher is
        # missing (tests, stub runs).
        tailer: TraceTailer | None = None
        if _progress_push is not None:

            def _bound(message: str, iteration: int | None) -> None:
                assert _progress_push is not None  # narrowed above
                _progress_push(run.id, message, iteration)

            tailer = TraceTailer(run_dir=run_dir, push=_bound)
            tailer.start()

        try:
            with open(stdout_path, "w") as out, open(stderr_path, "w") as err:
                proc = subprocess.Popen(
                    argv,
                    cwd=str(run_dir),
                    env=self._build_env(run_dir, resolved_provider, api_key, run.model),
                    stdout=out,
                    stderr=err,
                    text=True,
                )
                self._supervise(proc, run, heartbeat, stop)
            result = self._interpret(
                proc.returncode,
                stdout_path.read_text(errors="replace"),
                stderr_path,
                is_swarm=run.kind == "swarm",
            )
            # Read artifacts into memory before the workspace is cleaned up.
            result.artifacts = self._collect_artifacts(run_dir)
            return result
        finally:
            if tailer is not None:
                tailer.stop()

    # -- internals ---------------------------------------------------------

    def _argv_for(self, run: ClaimedRun, run_dir: Path) -> list[str]:
        """Pick the right Tradi invocation for the run kind."""
        if run.kind == "swarm":
            if not run.preset_name:
                raise SystemError_("swarm run missing preset_name")
            vars_json = json.dumps(run.user_vars or {}, ensure_ascii=False)
            # Legacy CLI: `vibe-trading --swarm-run PRESET '{vars}'`.
            # No --json envelope (yet) — we scrape success from exit code + swarm dir.
            return [*self._command, "--swarm-run", run.preset_name, vars_json]
        if run.kind == "shadow":
            if not run.attachments:
                raise SystemError_("shadow run missing journal attachment")
            att = run.attachments[0]
            # Safe filename — mirrors _mount_attachments() so the staged path
            # always matches what the downloader wrote under run_dir/inputs/.
            safe_name = Path(att.name).name.replace("/", "_") or "journal.csv"
            journal = run_dir / "inputs" / safe_name
            # `--upload` is a MAIN-parser flag in agent/cli/_legacy.py — it must
            # precede the `run` subcommand. The engine agent then runs the
            # journal → profile → shadow-backtest → report chain via its tools
            # (analyze_trade_journal / extract_shadow_strategy / ...).
            return [
                *self._command,
                "--upload",
                str(journal),
                "run",
                "-p",
                run.prompt,
                "--json",
                "--no-rich",
                "--max-iter",
                str(run.max_iter),
            ]
        return [
            *self._command,
            "run",
            "-p",
            run.prompt,
            "--json",
            "--no-rich",
            "--max-iter",
            str(run.max_iter),
        ]

    def _mount_attachments(self, run: ClaimedRun, run_dir: Path) -> None:
        """Download every attachment into ``run_dir/inputs/{name}``.

        Files are staged BEFORE the engine subprocess starts. The engine sees
        only local paths under its isolated HOME — Supabase URLs are never
        propagated. Missing downloader is treated as a bug and raises.
        """
        if not run.attachments:
            return
        if _attachment_downloader is None:
            raise SystemError_(
                "attachment downloader not registered — main.py must call "
                "set_attachment_downloader() before starting the runner"
            )
        inputs_dir = run_dir / "inputs"
        inputs_dir.mkdir(parents=True, exist_ok=True)
        for att in run.attachments:
            # Safe filename — do NOT allow the client-supplied name to escape.
            safe_name = Path(att.name).name.replace("/", "_") or "attachment.bin"
            dest = inputs_dir / safe_name
            data = _attachment_downloader(att.path)
            if not isinstance(data, (bytes, bytearray)):
                raise SystemError_(
                    f"attachment downloader returned {type(data).__name__}, expected bytes"
                )
            dest.write_bytes(bytes(data))
            log.info("run %s: mounted attachment %s (%d bytes)", run.id, safe_name, len(data))

    def _build_env(
        self, run_dir: Path, provider: str, credential: str,
        model_override: str | None = None,
    ) -> dict[str, str]:
        # Inherit the worker's environment (PATH, locale, ...), then isolate all
        # engine state under the per-run directory. Broker / live-trading vars
        # are never set here, so Tradi's mandate gate keeps live trading off
        # (ARCHITECTURE.md, CLAUDE.md VIBE-TRADING INTEGRATION RULES).
        env = os.environ.copy()
        env.update(self._extra_env)
        env["HOME"] = str(run_dir)
        env["VIBE_TRADING_HOME"] = str(run_dir)
        env["VIBE_TRADING_ALLOWED_RUN_ROOTS"] = str(run_dir)

        # BYOK pivot: inject provider-specific credential from the catalog.
        # The user's own credential always wins over any value the worker
        # process inherited (e.g. a dev-only default in the OS environment).
        # Never logged.
        #
        # BUG-ENG-4 (2026-08-22): upstream engine (>= 1907e47) hard-requires
        # LANGCHAIN_PROVIDER / LANGCHAIN_MODEL_NAME — the container ships no
        # agent/.env so without these every run dies at LLM construction.
        catalog = get_catalog()
        spec = catalog.get(provider)
        if spec is None:
            # Fail closed — a provider not in the catalog is a misconfig.
            raise SystemError_(f"unsupported provider: {provider!r}")

        # Route the engine to the right provider + model. A user-pinned
        # model (agent_runs.model, resolved at enqueue time) wins; then the
        # worker's url-type env override; then the catalog default.
        env["LANGCHAIN_PROVIDER"] = provider
        env["LANGCHAIN_MODEL_NAME"] = model_override or self._model_for(spec)

        if spec.is_url_type:
            # url-type provider (e.g. self-hosted Ollama): the credential IS
            # the base URL; inject it into the provider's base_url_env.
            if spec.base_url_env:
                env[spec.base_url_env] = credential
        else:
            # key-type provider: inject the API key into the provider's
            # api_key_env (e.g. OPENAI_API_KEY, DEEPSEEK_API_KEY). The engine
            # falls back to its bundled catalog for the base URL if the
            # base_url_env is unset.
            if spec.api_key_env:
                env[spec.api_key_env] = credential

        return env

    def _model_for(self, spec) -> str:
        """Pick the model to inject for a provider.

        url-type (Ollama) uses the worker's ollama_model override when set,
        since the model tag must match what the user pulled locally. key-type
        providers use the catalog default_model.
        """
        if spec.is_url_type and self._ollama_model:
            return self._ollama_model
        return spec.default_model

    def _supervise(
        self,
        proc: subprocess.Popen,
        run: ClaimedRun,
        heartbeat: Heartbeat,
        stop: threading.Event,
    ) -> None:
        """Block until the process exits, or abort it on shutdown/timeout/claim-loss."""
        deadline = time.monotonic() + self._timeout
        next_heartbeat = time.monotonic() + self._heartbeat_every

        while proc.poll() is None:
            now = time.monotonic()
            if stop.is_set():
                self._terminate(proc)
                raise SystemError_("Worker shut down mid-run")
            if now >= deadline:
                self._terminate(proc)
                raise RunTimeout(f"exceeded {self._timeout}s wall-clock budget")
            if now >= next_heartbeat:
                if not heartbeat():
                    self._terminate(proc)
                    raise ClaimLost(f"Lost claim on run {run.id}")
                next_heartbeat = now + self._heartbeat_every
            # Wake early if a shutdown signal arrives mid-slice.
            stop.wait(timeout=min(1.0, max(0.05, deadline - now)))

    @staticmethod
    def _terminate(proc: subprocess.Popen) -> None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

    def _collect_artifacts(self, workspace: Path) -> list[Artifact]:
        """Read every run output under the isolated workspace into memory.

        The workspace holds the engine's ``runs/<id>/`` (metadata, generated
        code, metrics, pine) and ``sessions/<id>/trace.jsonl`` (the trace, which
        carries the final answer). We also synthesize an ``answer.md`` report so
        the result page has readable text, not just raw files.
        """
        artifacts: list[Artifact] = []
        answer = self._extract_answer(workspace)
        if answer:
            artifacts.append(Artifact("report", "answer.md", answer.encode("utf-8")))
        for path in sorted(workspace.rglob("*")):
            if not path.is_file() or path.name in _ARTIFACT_EXCLUDE:
                continue
            rel = path.relative_to(workspace).as_posix()
            try:
                if path.stat().st_size > MAX_ARTIFACT_BYTES:
                    log.warning("skipping oversized artifact %s", rel)
                    continue
                content = path.read_bytes()
            except OSError:
                continue
            artifacts.append(Artifact(self._classify(rel), rel, content))
        return artifacts

    @staticmethod
    def _extract_answer(workspace: Path) -> str | None:
        """Pull the last ``answer`` event's text out of any trace.jsonl."""
        for trace in workspace.rglob("trace.jsonl"):
            answer: str | None = None
            try:
                lines = trace.read_text(errors="replace").splitlines()
            except OSError:
                continue
            for line in lines:
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    evt = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(evt, dict) and evt.get("type") == "answer":
                    text = evt.get("content") or evt.get("text") or evt.get("answer")
                    if text:
                        answer = text if isinstance(text, str) else json.dumps(text)
            if answer:
                return answer
        return None

    @staticmethod
    def _classify(rel: str) -> str:
        n = rel.lower()
        if n.endswith(".pine"):
            return "pine"
        if n.endswith("trace.jsonl"):
            return "trace"
        if n.endswith(".csv"):
            return "metrics"
        if n.startswith("code/") or "/code/" in n or n.endswith(".py"):
            return "code"
        return "json"

    def _interpret(
        self,
        returncode: int,
        stdout_text: str,
        stderr_path: Path,
        *,
        is_swarm: bool = False,
    ) -> RunResult:
        # Swarm runs don't currently emit --json envelopes. Fall back to
        # exit-code interpretation and let _collect_artifacts pull the swarm
        # store's per-agent outputs from HOME/swarm/<run_id>/.
        if is_swarm:
            stderr_tail = self._tail(stderr_path)
            if returncode == EXIT_SUCCESS:
                return RunResult(
                    output=f"[swarm] exit=0 ({len(stdout_text.splitlines())} log lines)"
                )
            if returncode == EXIT_USAGE_ERROR:
                raise SystemError_(f"swarm preset rejected (exit 2): {stderr_tail}")
            raise SystemError_(f"swarm run failed (exit {returncode}): {stderr_tail}")

        payload = self._parse_json_envelope(stdout_text)
        status = (payload or {}).get("status")

        if returncode == EXIT_SUCCESS and status == "success":
            return RunResult(output=self._summarize(payload))

        stderr_tail = self._tail(stderr_path)
        if returncode == EXIT_USAGE_ERROR:
            raise SystemError_(f"vibe-trading rejected the arguments (exit 2): {stderr_tail}")
        if payload is None:
            raise SystemError_(
                f"no JSON result from vibe-trading (exit {returncode}): {stderr_tail}"
            )
        reason = payload.get("reason") or stderr_tail or f"exit {returncode}"
        raise SystemError_(f"run failed (status={status!r}, exit {returncode}): {reason}")

    @staticmethod
    def _parse_json_envelope(stdout_text: str) -> dict | None:
        # The machine envelope is one JSON line; scan from the end so any earlier
        # progress lines are ignored.
        for line in reversed(stdout_text.splitlines()):
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and "status" in data:
                return data
        return None

    @staticmethod
    def _summarize(payload: dict) -> str:
        parts = [f"status={payload.get('status')}", f"run_id={payload.get('run_id')}"]
        if payload.get("reason"):
            parts.append(f"reason={payload['reason']}")
        return " ".join(parts)

    @staticmethod
    def _tail(path: Path, limit: int = 2000) -> str:
        try:
            return path.read_text(errors="replace").strip()[-limit:]
        except OSError:
            return ""
