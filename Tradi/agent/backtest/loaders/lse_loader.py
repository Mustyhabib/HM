"""London Strategic Edge (LSE) OHLCV loader — HM's primary data source.

Covers US equities, US ETFs, FX and crypto via the LSE REST candles API
(https://api.londonstrategicedge.com/v1/candles). Placed FIRST in the
fallback chains for ``us_equity``, ``crypto``, ``fund`` and ``forex`` (HM
decision, ADR D18 promotion): when LSE cannot serve a symbol the chain
degrades to the legacy sources unchanged.

Contract verified against the live API (2026-08-23):

- Auth: ``x-api-key`` header. ``Authorization: Bearer`` is NOT accepted.
- ``GET /v1/candles?symbol=&start=YYYY-MM-DD&end=YYYY-MM-DD&timeframe=``
  — both dates INCLUSIVE; future end dates return bars up to now.
- Timeframes: ``1m 5m 15m 30m 1h 2h 4h 1d`` (no weekly/tick).
- Symbol formats: US equities/ETFs bare (``AAPL``, ``SPY``); FX and crypto
  slashed (``EUR/USD``, ``SOL/USD``). Crypto quotes USD only — there is no
  USDT coverage, so ``*-USDT`` pairs map to their USD quote.
- No pagination: the API returns everything for the requested window in one
  response. Minute windows beyond ~2 weeks can exceed proxy body limits and
  die mid-stream, so sub-daily fetches are chunked into bounded date slices.
- Error taxonomy (verified): 401 = invalid/inactive key · 403 = rate limited ·
  404 = symbol not listed · 422 = malformed params.
- Rate limiting exists but is generous (24 back-to-back requests passed);
  client-side spacing plus retry-on-transient keeps bursts off the wire.
- Daily equity bars stamp at session OPEN (13:30Z for US cash sessions),
  while crypto stamps at midnight UTC. Bars are normalised to midnight UTC
  for ``1d`` so multi-source merges align.

Multi-user hardening (the worker runs one subprocess per user run, many in
parallel): the request throttle is thread-safe and shared per process so
concurrent runs cannot burst the shared API key; every network call carries
a wall-clock budget with bounded retries on transient failures.

Env:
    LSE_API_KEY   required (loader reports unavailable without it)
    LSE_API_BASE  optional override (default https://api.londonstrategicedge.com)
    LSE_TIMEOUT_S / LSE_FETCH_BUDGET_S / LSE_PROBE_TIMEOUT_S /
    LSE_MIN_REQUEST_INTERVAL_S  tunables (positive floats/ints)
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from typing import Dict, List, Optional

import pandas as pd
import requests

from backtest.loaders.base import (
    cached_loader_fetch,
    check_budget,
    positive_env_float,
    positive_env_int,
    retry_with_budget,
    validate_date_range,
    validate_ohlc,
)
from backtest.loaders.registry import register

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("LSE_API_BASE", "https://api.londonstrategicedge.com").rstrip("/")
CANDLES_PATH = f"{BASE_URL}/v1/candles"

# Project interval tokens -> LSE timeframe tokens. LSE is case-sensitive
# lowercase; project code passes both cases (``1D``/``1d``).
_INTERVAL_MAP = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "1H": "1h",
    "2h": "2h",
    "4h": "4h",
    "4H": "4h",
    "1d": "1d",
    "1D": "1d",
}

# Sub-daily windows are fetched in slices no wider than this many days so a
# single response never approaches proxy body limits (a 1-year 1m response
# was observed to die mid-stream around 4-56 MB; two weeks of 1m ≈ 5MB is a
# conservative slice that stays well clear).
_MAX_SLICE_DAYS_SUBDAILY = 14

_LSE_TIMEOUT_S = positive_env_int("LSE_TIMEOUT_S", 30)
_LSE_FETCH_BUDGET_S = positive_env_float("LSE_FETCH_BUDGET_S", 120.0)
_LSE_MIN_INTERVAL_S = positive_env_float("LSE_MIN_REQUEST_INTERVAL_S", 3.0)

_throttle_lock = threading.Lock()
_next_slot_ts = 0.0


def _throttle() -> None:
    """Reserve the next permitted request slot (thread-safe, process-wide).

    Every caller in this process — any user's run thread — shares one API
    key, so the spacing floor must be enforced across threads, not per call
    site. The lock serialises slot allocation; the sleep happens OUTSIDE the
    lock so other threads can queue their own slots concurrently.
    """
    global _next_slot_ts
    while True:
        with _throttle_lock:
            now = time.monotonic()
            wait = _next_slot_ts - now
            if wait <= 0:
                _next_slot_ts = max(now, _next_slot_ts) + _LSE_MIN_INTERVAL_S
                return
        time.sleep(min(wait, 1.0))


def lse_api_key() -> str:
    return os.getenv("LSE_API_KEY", "").strip()


def to_lse_symbol(code: str) -> str:
    """Translate a project symbol onto LSE's per-class spelling.

    Project convention (and what users type): ``AAPL.US`` / ``BTC-USDT`` /
    ``SOL-USDT`` / ``EUR-USD``. LSE wants equities bare and fx/crypto with a
    slash, USD-quoted — it has no USDT pairs (verified live: ``SOL/USDT`` →
    "Symbol not available", ``SOL/USD`` OK), so a ``*-USDT`` crypto pair is
    rewritten to its USD quote. Unknown shapes pass through untouched so the
    API's own error surfaces instead of silent rewrites here.

    Args:
        code: Project-side symbol.

    Returns:
        The LSE-side symbol string.
    """
    symbol = str(code or "").strip().upper()
    # Equity venue suffixes are implicit at LSE: AAPL.US -> AAPL.
    if re.search(r"\.(US|NS|BO|TO|V|HK|SH|SZ)$", symbol):
        return symbol.split(".", 1)[0]
    # Hyphen pairs -> slash (crypto/fx): SOL-USDT -> SOL/USDT, EUR-USD -> EUR/USD.
    base_quote = symbol.split("-", 1)
    if len(base_quote) == 2 and all(base_quote):
        base, quote = base_quote
        # LSE quotes crypto against USD only; USDT pairs map 1:1 for these
        # purposes (both are dollar-pegged quotes; the engine's use case is
        # price history, not stablecoin-basis analysis).
        if quote == "USDT":
            quote = "USD"
        return f"{base}/{quote}"
    return symbol


def _lse_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "x-api-key": lse_api_key(),
            "User-Agent": "hm-trading-institute/1.0",
            "Accept": "application/json",
        }
    )
    return session


def _slice_dates(
    start_date: str, end_date_excl: str, timeframe: str
) -> list[tuple[str, str]]:
    """Split [start, end) into LSE-safe inclusive slices.

    Daily requests span years safely in one shot (verified: a 10-year daily
    window returned all 2513 bars). Sub-daily timeframes are sliced into
    bounded windows because huge minute responses have been observed to die
    mid-stream. Returns ``(start_incl, end_incl)`` pairs covering exactly
    ``[start_date, end_date_excl)``.
    """
    start = pd.Timestamp(start_date)
    end_excl = pd.Timestamp(end_date_excl)
    if timeframe == "1d" or end_excl <= start:
        # Inclusive end one day before the exclusive boundary.
        last_incl = (end_excl - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        return [(start.strftime("%Y-%m-%d"), last_incl)]

    step = pd.Timedelta(days=_MAX_SLICE_DAYS_SUBDAILY)
    slices: list[tuple[str, str]] = []
    cursor = start
    while cursor < end_excl:
        slice_end = min(cursor + step, end_excl) - pd.Timedelta(days=1)
        slices.append((cursor.strftime("%Y-%m-%d"), slice_end.strftime("%Y-%m-%d")))
        cursor += step
    return slices


@register
class DataLoader:
    """London Strategic Edge OHLCV loader (equities / ETFs / FX / crypto)."""

    name = "lse"
    markets = {"us_equity", "crypto", "forex", "fund"}
    requires_auth = True

    def __init__(self) -> None:
        self._session = _lse_session()

    def is_available(self) -> bool:
        """Cheap credential check — no network probe (rate budget matters).

        A present-but-revoked key degrades at fetch time via the 401 path,
        which logs loudly once and yields an empty result so the fallback
        chain takes over; it does not raise into the user's run.
        """
        return bool(lse_api_key())

    def fetch(
        self,
        codes: List[str],
        start_date: str,
        end_date: str,
        *,
        interval: str = "1D",
        fields: Optional[List[str]] = None,
    ) -> Dict[str, pd.DataFrame]:
        """Fetch OHLCV bars from LSE.

        Args:
            codes: Project symbols (``["AAPL.US"]``, ``["SOL-USDT"]``,
                ``["EUR-USD"]``). Venue suffixes are stripped, hyphen pairs
                slash-joined before the request.
            start_date: Inclusive start (YYYY-MM-DD).
            end_date: EXCLUSIVE end per engine convention (YYYY-MM-DD).
                Internally converted to LSE's inclusive form (+1 day).
            fields: Ignored (LSE serves OHLCV only).
            interval: Bar size token (see ``_INTERVAL_MAP``), default ``1D``.

        Returns:
            Mapping of the ORIGINAL project symbol -> DataFrame indexed by
            midnight-UTC ``trade_date`` with open/high/low/close/volume
            columns, validated through :func:`validate_ohlc`.
        """
        validate_date_range(start_date, end_date)

        if not lse_api_key():
            logger.warning("LSE fetch skipped: LSE_API_KEY not set")
            return {}

        if fields:
            logger.warning("LSE ignores extra fields: %s", fields)

        timeframe = _INTERVAL_MAP.get(interval.strip())
        if timeframe is None:
            logger.warning(
                "unsupported LSE timeframe %r; rejecting (supported: %s)",
                interval,
                sorted(set(_INTERVAL_MAP.values())),
            )
            return {}

        deadline = time.monotonic() + _LSE_FETCH_BUDGET_S
        slices = _slice_dates(start_date, end_date, timeframe)

        result: Dict[str, pd.DataFrame] = {}
        for code in codes:
            symbol = to_lse_symbol(code)
            try:
                df = cached_loader_fetch(
                    source=self.name,
                    symbol=symbol,
                    timeframe=timeframe,
                    start_date=start_date,
                    end_date=end_date,
                    fields=None,
                    fetch=lambda symbol=symbol, slices=slices, tf=timeframe: self._fetch_all_slices(
                        symbol, slices, tf, deadline
                    ),
                )
                if df is not None and not df.empty:
                    result[code] = df
            except Exception as exc:
                # One bad symbol must not kill the batch; the chain falls
                # through to the next source for these codes.
                logger.warning("failed to fetch %s (%s): %s", code, symbol, exc)
        return result

    def _fetch_all_slices(
        self, symbol: str, slices: list[tuple[str, str]], timeframe: str,
        deadline: float,
    ) -> pd.DataFrame | None:
        """Fetch every date slice for one symbol and concatenate."""
        frames: list[pd.DataFrame] = []
        for slice_start, slice_end in slices:
            check_budget(deadline, f"LSE fetch for {symbol}")
            frame = retry_with_budget(
                lambda s=slice_start, e=slice_end, tf=timeframe: self._fetch_candles(
                    symbol, s, e, tf
                ),
                transient=(requests.ConnectionError, requests.Timeout),
                deadline=deadline,
                label=f"LSE fetch for {symbol}",
                max_retries=2,
                backoff=(1.0, 3.0),
            )
            if frame is not None and not frame.empty:
                frames.append(frame)

        if not frames:
            return None
        combined = pd.concat(frames).sort_index()
        combined = combined[~combined.index.duplicated(keep="last")]
        return combined if not combined.empty else None

    def _fetch_candles(
        self, symbol: str, start_date_incl: str, end_date_incl: str,
        timeframe: str,
    ) -> pd.DataFrame | None:
        """Single LSE request → normalised DataFrame (or None).

        Args:
            symbol: LSE-side symbol spelling.
            start_date_incl: Inclusive slice start (YYYY-MM-DD).
            end_date_incl: Inclusive slice end (YYYY-MM-DD).
            timeframe: LSE timeframe token (``1m``…``1d``) — sent on the wire
                and echoed back by the API; also drives the daily-bar
                midnight normalisation.

        Raises:
            RuntimeError: transient failures (403 rate-limit, 5xx, timeouts)
                so the retry wrapper can attempt again.
            ValueError: permanent failures (401 bad key) — never retried;
                logged loudly because it means every subsequent fetch in this
                process will degrade until the credential is fixed.
        """
        _throttle()
        try:
            resp = self._session.get(
                CANDLES_PATH,
                params={
                    "symbol": symbol,
                    "start": start_date_incl,
                    "end": end_date_incl,
                    "timeframe": timeframe,
                },
                timeout=_LSE_TIMEOUT_S,
            )
        except requests.ConnectionError as exc:
            raise requests.ConnectionError(f"LSE connection error: {exc}") from exc
        except requests.Timeout as exc:
            raise requests.Timeout(f"LSE timeout after {_LSE_TIMEOUT_S}s") from exc

        detail = ""
        try:
            payload = resp.json()
            raw_detail = payload.get("detail")
            if isinstance(raw_detail, list):
                detail = "; ".join(str(item.get("msg", item)) for item in raw_detail)
            else:
                detail = str(raw_detail or "")
        except Exception:  # noqa: BLE001 — non-JSON body still classified below
            payload = None

        if resp.status_code == 200:
            rows = payload.get("data") if isinstance(payload, dict) else None
            timeframe = ""
            if isinstance(payload, dict):
                timeframe = str(payload.get("timeframe", ""))
            return self._normalise(rows or [], symbol, timeframe=timeframe)

        if resp.status_code == 401:
            # Permanent: the key is dead. Log at ERROR (once per message via
            # dedup is unnecessary — fetch volume per run is small) so ops
            # sees it, and surface empty upward instead of raising: the rest
            # of the chain serves the user's run.
            logger.error(
                "LSE rejected the API key (401): %s — falling back to the "
                "next source; fix LSE_API_KEY to restore LSE service.",
                detail,
            )
            return None

        if resp.status_code == 404:
            # Verified: unknown symbols arrive as 404 "Symbol not available".
            logger.info("LSE has no listing for %s", symbol)
            return None

        if resp.status_code == 403:
            # Verified: rate limit. Transient — retry after backing off.
            raise RuntimeError(f"LSE rate-limited (403): {detail}")

        if resp.status_code == 422:
            # Malformed params — our bug, not transient. Loud and permanent.
            raise ValueError(f"LSE rejected parameters (422): {detail}")

        if resp.status_code >= 500:
            raise RuntimeError(f"LSE server error ({resp.status_code})")

        raise RuntimeError(f"LSE unexpected HTTP {resp.status_code}: {detail}")

    def _normalise(
        self, rows: list, symbol: str, timeframe: str
    ) -> pd.DataFrame | None:
        """API rows → canonical OHLCV frame.

        Daily equity bars stamp at the session OPEN (13:30Z for US cash);
        crypto stamps at midnight UTC. For ``1d`` everything is floored to
        midnight UTC so multi-source merges and cross-market joins align.
        """
        if not isinstance(rows, list) or not rows:
            return None

        df = pd.DataFrame(rows)
        df["trade_date"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(None)
        if timeframe == "1d":
            df["trade_date"] = df["trade_date"].dt.normalize()
        for col in ("open", "high", "low", "close"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["volume"] = pd.to_numeric(df.get("volume"), errors="coerce").fillna(0)
        df = (
            df.dropna(subset=["trade_date"])
            .set_index("trade_date")
            .sort_index()
        )
        df = df[~df.index.duplicated(keep="last")]
        df = df[["open", "high", "low", "close", "volume"]].dropna(
            subset=["open", "high", "low", "close"]
        )
        # Canonical loader-boundary sanity pass (same as every other loader):
        # structurally impossible bars must not reach the backtest.
        df = validate_ohlc(df)
        return df if not df.empty else None
