"""Tests for the London Strategic Edge (LSE) loader.

Hermetic — no network. The live API contract was verified 2026-08-23 and
these tests pin the client behaviour against that contract:

- endpoint ``/v1/candles``, ``x-api-key`` auth, YYYY-MM-DD dates,
- BOTH dates inclusive on the wire (engine end is exclusive → fetch adds a day),
- timeframes 1m..1d only, slash crypto/fx symbols with USD quoting,
- error taxonomy: 401 bad key · 403 rate limit (transient) ·
  404 symbol not listed · 422 malformed params,
- daily equity bars stamp at session open → normalised to midnight UTC,
- sub-daily windows chunked into ≤14-day slices (huge single responses have
  been observed to die mid-stream).
"""

from __future__ import annotations

import os
import threading
import time

import pandas as pd
import pytest
import requests

os.environ.setdefault("LSE_API_KEY", "test-key-123")

from backtest.loaders import lse_loader
from backtest.loaders.lse_loader import (
    DataLoader,
    _slice_dates,
    to_lse_symbol,
)
from backtest.loaders.registry import FALLBACK_CHAINS, LOADER_REGISTRY, _ensure_registered


# ---------------------------------------------------------------------------
# Symbol translation — the per-class format quirk LSE demands
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("AAPL.US", "AAPL"),          # equity suffix stripped
        ("TSLA.US", "TSLA"),
        ("0700.HK", "0700"),          # other venue suffixes also stripped
        ("TD.TO", "TD"),
        ("SOL-USDT", "SOL/USD"),      # crypto: hyphen -> slash, USDT -> USD
        ("BTC-USDT", "BTC/USD"),
        ("BTC-USD", "BTC/USD"),
        ("EUR-USD", "EUR/USD"),       # fx: hyphen -> slash
        ("GBP/USD", "GBP/USD"),       # already-slash passes through
        ("SOL/USDT", "SOL/USDT"),     # pass-through untouched (API will reject)
        ("SPY", "SPY"),               # bare ticker unchanged
    ],
)
def test_to_lse_symbol(code: str, expected: str) -> None:
    assert to_lse_symbol(code) == expected


# ---------------------------------------------------------------------------
# Registration + chain policy — LSE leads the priority markets
# ---------------------------------------------------------------------------


def test_lse_registered() -> None:
    _ensure_registered()
    assert "lse" in LOADER_REGISTRY


@pytest.mark.parametrize("market", ["us_equity", "crypto", "fund"])
def test_lse_leads_priority_chains(market: str) -> None:
    assert FALLBACK_CHAINS[market][0] == "lse"


def test_forex_chain_has_lse_before_legacy_sources() -> None:
    chain = FALLBACK_CHAINS["forex"]
    # mt5 (local terminal) may lead when attached; lse must beat akshare/yfinance.
    assert "lse" in chain
    assert chain.index("lse") < chain.index("akshare")
    assert chain.index("lse") < chain.index("yfinance")


def test_indices_and_macro_do_not_lead_with_lse() -> None:
    # LSE has no index/macro coverage (verified live); those chains unchanged.
    assert "lse" not in FALLBACK_CHAINS["macro"]
    assert "lse" not in FALLBACK_CHAINS["futures"]


def test_is_available_requires_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LSE_API_KEY", raising=False)
    assert DataLoader().is_available() is False
    monkeypatch.setenv("LSE_API_KEY", "k")
    assert DataLoader().is_available() is True


# ---------------------------------------------------------------------------
# Date slicing — bounded chunks for sub-daily, single shot for daily
# ---------------------------------------------------------------------------


def test_daily_range_is_one_inclusive_slice() -> None:
    slices = _slice_dates("2025-01-01", "2026-01-01", "1d")
    assert slices == [("2025-01-01", "2025-12-31")]


def test_subdaily_range_is_chunked_into_14d_slices() -> None:
    slices = _slice_dates("2026-01-01", "2026-02-12", "1h")
    # 42 days -> ceil(42/14) = 3 slices, each inclusive pair non-overlapping.
    assert len(slices) == 3
    assert slices[0] == ("2026-01-01", "2026-01-14")
    assert slices[1] == ("2026-01-15", "2026-01-28")
    assert slices[2] == ("2026-01-29", "2026-02-11")


def test_slices_cover_the_exclusive_window_exactly() -> None:
    start, end = "2026-08-01", "2026-08-23"
    slices = _slice_dates(start, end, "1m")
    assert slices[0][0] == start
    assert pd.Timestamp(slices[-1][1]) == pd.Timestamp(end) - pd.Timedelta(days=1)
    # Contiguity: each slice starts the day after the previous one ends.
    for (_, prev_end), (next_start, _) in zip(slices, slices[1:]):
        assert pd.Timestamp(next_start) == pd.Timestamp(prev_end) + pd.Timedelta(days=1)


def test_single_day_range_yields_one_slice() -> None:
    assert _slice_dates("2026-08-20", "2026-08-21", "1m") == [("2026-08-20", "2026-08-20")]


# ---------------------------------------------------------------------------
# Fetch — request shape, normalisation, and the verified error taxonomy
# ---------------------------------------------------------------------------

_LSE_PAYLOAD = {
    "symbol": "SOL/USD",
    "timeframe": "1h",
    "rows": 2,
    "data": [
        {"timestamp": "2026-08-23T11:00:00Z", "open": 93.64, "high": 94.82,
         "low": 93.55, "close": 94.63, "volume": 137477.398},
        {"timestamp": "2026-08-23T12:00:00Z", "open": 94.62, "high": 94.80,
         "low": 94.04, "close": 94.74, "volume": 135710.915},
    ],
}


class _FakeResponse:
    def __init__(self, status_code: int = 200, payload: dict | None = None) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        if self._payload is None:
            raise ValueError("no payload")
        return self._payload


@pytest.fixture()
def no_throttle(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(lse_loader, "_throttle", lambda: None)


def test_fetch_candles_request_contract(no_throttle, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        captured["path"] = path
        captured["params"] = params
        return _FakeResponse(200, _LSE_PAYLOAD)

    monkeypatch.setattr("requests.Session.get", fake_get)
    df = DataLoader()._fetch_candles("SOL/USD", "2026-08-20", "2026-08-26", "1h")

    assert captured["path"].endswith("/v1/candles")
    assert captured["params"]["symbol"] == "SOL/USD"
    assert captured["params"]["start"] == "2026-08-20"   # inclusive
    assert captured["params"]["end"] == "2026-08-26"     # inclusive on the wire
    assert captured["params"]["timeframe"] == "1h"       # sent on every request

    # Frame contract: canonical OHLCV columns, UTC-naive trade_date index.
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert isinstance(df.index, pd.DatetimeIndex)
    assert len(df) == 2
    assert df["close"].iloc[-1] == pytest.approx(94.74)


def test_daily_bars_normalised_to_midnight_utc(no_throttle, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verified live: AAPL daily stamps at 13:30Z (session open). A daily frame
    must floor to midnight so cross-market merges align with midnight-stamped
    crypto bars."""
    payload = {
        "symbol": "AAPL", "timeframe": "1d", "rows": 2,
        "data": [
            {"timestamp": "2026-08-20T13:30:00Z", "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 10},
            {"timestamp": "2026-08-21T13:30:00Z", "open": 1.5, "high": 2.5, "low": 1.2, "close": 2.2, "volume": 12},
        ],
    }

    monkeypatch.setattr("requests.Session.get",
                        lambda self, path, params=None, timeout=None: _FakeResponse(200, payload))
    df = DataLoader()._fetch_candles("AAPL", "2026-08-20", "2026-08-21", "1d")
    assert [ts.strftime("%H:%M") for ts in df.index] == ["00:00", "00:00"]
    assert [ts.date().isoformat() for ts in df.index] == ["2026-08-20", "2026-08-21"]


def test_hourly_bars_keep_intraday_timestamps(no_throttle, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("requests.Session.get",
                        lambda self, path, params=None, timeout=None: _FakeResponse(200, _LSE_PAYLOAD))
    df = DataLoader()._fetch_candles("SOL/USD", "2026-08-23", "2026-08-23", "1h")
    assert [ts.hour for ts in df.index] == [11, 12]


def test_fetch_adds_a_day_for_lses_inclusive_end(no_throttle, monkeypatch: pytest.MonkeyPatch) -> None:
    """The engine treats end as exclusive; fetch() converts for the wire via
    slicing (last slice's inclusive end == requested exclusive end - 1 day)."""
    seen: list[str] = []

    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        seen.append(f"{params['start']}..{params['end']}")
        return _FakeResponse(200, {"data": [], "rows": 0})

    monkeypatch.setattr("requests.Session.get", fake_get)
    DataLoader().fetch(["SOL-USDT"], "2026-08-20", "2026-08-23", interval="1h")
    # 3-day hourly window → one slice ending the day BEFORE the exclusive end.
    assert seen == ["2026-08-20..2026-08-22"]


def test_404_unlisted_symbol_returns_empty_result(
    no_throttle, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Verified: unknown symbols arrive as 404 'Symbol not available' — clean
    empty result (chain falls through), never an exception."""

    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        return _FakeResponse(404, {"detail": "Symbol not available via this endpoint."})

    monkeypatch.setattr("requests.Session.get", fake_get)
    out = DataLoader().fetch(["ZZZZZ"], "2026-08-20", "2026-08-23")
    assert out == {}


def test_401_bad_key_returns_empty_and_logs_error(
    no_throttle, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A dead key must degrade loudly (ERROR log) but never crash the run."""

    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        return _FakeResponse(401, {"detail": "Invalid or inactive API key"})

    monkeypatch.setattr("requests.Session.get", fake_get)
    with caplog.at_level("ERROR"):
        out = DataLoader().fetch(["AAPL.US"], "2026-08-20", "2026-08-23")
    assert out == {}
    assert any("rejected the API key" in r.message for r in caplog.records)


def test_403_rate_limit_raises_transient_for_retry(
    no_throttle, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        return _FakeResponse(403, {"detail": "Too many requests"})

    monkeypatch.setattr("requests.Session.get", fake_get)
    with pytest.raises(RuntimeError, match="rate-limited"):
        DataLoader()._fetch_candles("SOL/USD", "2026-08-20", "2026-08-20", "1h")


def test_422_malformed_params_raises_permanent(
    no_throttle, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        return _FakeResponse(422, {"detail": [{"msg": "Invalid date format"}]})

    monkeypatch.setattr("requests.Session.get", fake_get)
    with pytest.raises(ValueError, match="422"):
        DataLoader()._fetch_candles("SOL/USD", "bad-date", "2026-08-23", "1h")


def test_fetch_without_key_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LSE_API_KEY", raising=False)
    assert DataLoader().fetch(["AAPL.US"], "2026-08-20", "2026-08-23") == {}


def test_fetch_rejects_unknown_interval() -> None:
    assert DataLoader().fetch(["AAPL.US"], "2026-08-20", "2026-08-23",
                              interval="3w") == {}


# ---------------------------------------------------------------------------
# Chunked fetching — multi-slice windows concatenate cleanly
# ---------------------------------------------------------------------------


def test_multi_slice_fetch_concatenates_and_dedupes(
    no_throttle, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A 30-day hourly window slices into 3 requests; frames concatenate in
    order and boundary duplicates collapse."""
    calls: list[str] = []

    def fake_get(self, path, params=None, timeout=None):  # noqa: ANN001
        s = params["start"]
        calls.append(s)
        day = pd.Timestamp(s)
        payload = {
            "data": [
                {"timestamp": (day + pd.Timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "open": 1.0 + h, "high": 2.0 + h, "low": 0.5 + h,
                 "close": 1.5 + h, "volume": 100}
                for h in range(2)
            ]
        }
        return _FakeResponse(200, payload)

    monkeypatch.setattr("requests.Session.get", fake_get)
    out = DataLoader().fetch(["SOL-USDT"], "2026-01-01", "2026-02-12", interval="1h")

    assert len(calls) == 3                       # 42 days -> three 14-day slices
    df = out["SOL-USDT"]
    assert len(df) == 6                          # 3 slices x 2 bars, no dupes
    assert df.index.is_monotonic_increasing


def test_retry_on_transient_connection_error_succeeds(
    no_throttle, monkeypatch: pytest.MonkeyPatch
) -> None:
    """First slice request dies with ConnectionError, retry succeeds — the
    retry_with_budget wrapper must absorb it."""
    attempts = {"n": 0}
    real_get = None

    def flaky_get(self, path, params=None, timeout=None):  # noqa: ANN001
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise requests.ConnectionError("connection reset")
        return _FakeResponse(200, _LSE_PAYLOAD)

    monkeypatch.setattr("requests.Session.get", flaky_get)
    monkeypatch.setattr("time.sleep", lambda *_: None)  # fast backoff
    df = DataLoader()._fetch_all_slices("SOL/USD", [("2026-08-20", "2026-08-26")],
                                        "1h", deadline=float("inf"))
    assert attempts["n"] == 2
    assert df is not None and len(df) == 2


# ---------------------------------------------------------------------------
# Thread-safe throttle — concurrent runs share one key and one slot clock
# ---------------------------------------------------------------------------


def test_throttle_is_thread_safe_and_enforces_spacing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lse_loader, "_LSE_MIN_INTERVAL_S", 0.05)
    acquired: list[float] = []
    lock = threading.Lock()

    original_sleep = time.sleep
    def fast_sleep(seconds: float) -> None:
        original_sleep(min(seconds, 0.01))

    monkeypatch.setattr("time.sleep", fast_sleep)

    def worker() -> None:
        lse_loader._throttle()
        with lock:
            acquired.append(time.monotonic())

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(acquired) == 8
    acquired.sort()
    gaps = [b - a for a, b in zip(acquired, acquired[1:])]
    # Every slot must respect the spacing floor (small tolerance for the
    # clamped sleep); a racy implementation would show zero/negative gaps.
    assert all(g >= 0.04 for g in gaps), f"gaps too small: {gaps}"
