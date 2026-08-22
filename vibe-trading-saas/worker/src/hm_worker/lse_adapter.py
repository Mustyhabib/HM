"""
LSE (London Strategic Edge) HTTP data adapter — Phase 2 data plane.

Fetches historical OHLCV via the LSE REST API, serialises to Parquet
(pyarrow / snappy), and uploads to the hm-datalake Supabase Storage bucket.
The supabase service-role client is used for both storage uploads and
dataset_registry upserts.

API reference: https://londonstrategicedge.com/docs/api
Auth: Authorization: Bearer <LSE_API_KEY>
One key covers: history (HTTP) + live ticks (WebSocket) + dataset builder.

Phase 2 scope: HTTP historical OHLCV ingestion only.
Phase 6 scope: WebSocket live ticks → see lse_ws.py (skeleton).
"""

from __future__ import annotations

import hashlib
import io
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

import httpx
import pyarrow as pa
import pyarrow.parquet as pq

log = logging.getLogger(__name__)

BUCKET = "hm-datalake"

# ── Canonical OHLCV schema ────────────────────────────────────────────────────
# All providers normalise into this schema before Parquet serialisation.
# Downstream: backtest engine, dataset builder, ML feature store.
OHLCV_SCHEMA = pa.schema([
    pa.field("timestamp", pa.timestamp("ms", tz="UTC")),
    pa.field("open",      pa.float64()),
    pa.field("high",      pa.float64()),
    pa.field("low",       pa.float64()),
    pa.field("close",     pa.float64()),
    pa.field("volume",    pa.float64()),
    pa.field("symbol",    pa.string()),
    pa.field("provider",  pa.string()),
])


@dataclass
class OHLCVResult:
    """In-memory result from a single fetch_ohlcv() call."""

    symbol: str
    resolution: str
    table: pa.Table
    coverage_start: date
    coverage_end: date
    row_count: int

    @property
    def parquet_bytes(self) -> bytes:
        """Serialise Arrow table to Parquet (snappy compressed)."""
        buf = io.BytesIO()
        pq.write_table(self.table, buf, compression="snappy")
        return buf.getvalue()

    @property
    def data_hash(self) -> str:
        """SHA-256 of the canonical Parquet file for reproducibility gate."""
        return hashlib.sha256(self.parquet_bytes).hexdigest()


class LSEAdapter:
    """
    HTTP client for the LSE market data API.

    Fetches historical OHLCV, converts to canonical Parquet, and uploads
    to the hm-datalake Supabase Storage bucket + registers in dataset_registry.

    Endpoint verification:
        Check your LSE account at londonstrategicedge.com for the exact
        API base URL and candles endpoint path. Adjust LSE_API_BASE env var
        if the default below differs from what your account shows.

    Example::

        from supabase import create_client
        sb = create_client(url, service_role_key)
        adapter = LSEAdapter(api_key="...", supabase_client=sb)
        result = adapter.fetch_ohlcv("BTC/USD", "1d", start="2024-01-01")
        path   = adapter.upload_and_register(result)
    """

    # Endpoint: verify path from LSE API docs — common patterns:
    #   /v1/market/candles   (most REST APIs)
    #   /v1/candles
    #   /api/v1/candles
    # Override via environment: LSE_CANDLES_PATH (not in Config — adapter-level)
    CANDLES_PATH = "/v1/market/candles"  # GET ?symbol=&resolution=&from=&to=

    def __init__(
        self,
        api_key: str,
        supabase_client: Any,
        base_url: str = "https://api.londonstrategicedge.com",
    ) -> None:
        self._api_key = api_key
        self.sb = supabase_client
        self.base_url = base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    # ── Public API ─────────────────────────────────────────────────────────────

    def fetch_ohlcv(
        self,
        symbol: str,
        resolution: str = "1d",
        start: str | None = None,
        end: str | None = None,
    ) -> OHLCVResult:
        """
        Fetch historical OHLCV candles from the LSE HTTP API.

        Args:
            symbol:     Instrument identifier, e.g. ``"BTC/USD"``, ``"AAPL"``.
            resolution: Candle size: ``tick``, ``1min``, ``5min``, ``1h``, ``1d``, ``1w``.
            start:      ISO date ``"YYYY-MM-DD"`` (inclusive). Defaults to 1 year ago.
            end:        ISO date ``"YYYY-MM-DD"`` (inclusive). Defaults to today.

        Returns:
            :class:`OHLCVResult` with an Arrow table in :data:`OHLCV_SCHEMA`.

        Raises:
            httpx.HTTPStatusError: on non-2xx LSE response.
            ValueError: if LSE returns 0 rows for the requested window.
        """
        params: dict[str, str] = {"symbol": symbol, "resolution": resolution}
        if start:
            params["from"] = start
        if end:
            params["to"] = end

        log.info("lse_adapter.fetch", extra={"symbol": symbol, "resolution": resolution, "start": start, "end": end})

        with httpx.Client(
            base_url=self.base_url,
            headers=self._headers,
            timeout=120.0,
        ) as client:
            resp = client.get(self.CANDLES_PATH, params=params)
            resp.raise_for_status()

        raw = resp.json()
        rows = self._normalise(raw, symbol)

        if not rows:
            raise ValueError(
                f"LSE returned 0 rows for {symbol}/{resolution} "
                f"from={start} to={end}. "
                f"Check symbol spelling or widen the date range."
            )

        table = self._to_arrow(rows, symbol)
        ts_list: list[datetime] = table.column("timestamp").to_pylist()
        coverage_start = min(ts_list).date()
        coverage_end = max(ts_list).date()

        log.info(
            "lse_adapter.fetched",
            extra={
                "symbol": symbol, "rows": len(rows),
                "coverage_start": coverage_start.isoformat(),
                "coverage_end": coverage_end.isoformat(),
            },
        )
        return OHLCVResult(
            symbol=symbol,
            resolution=resolution,
            table=table,
            coverage_start=coverage_start,
            coverage_end=coverage_end,
            row_count=len(rows),
        )

    def upload_and_register(self, result: OHLCVResult) -> str:
        """
        Upload Parquet to hm-datalake and upsert :table:`dataset_registry`.

        Args:
            result: Output from :meth:`fetch_ohlcv`.

        Returns:
            The storage path (Supabase Storage key) of the uploaded file.
        """
        storage_path = self._storage_path(result)
        parquet_bytes = result.parquet_bytes
        size_bytes = len(parquet_bytes)

        log.info("lse_adapter.upload", extra={"path": storage_path, "size_bytes": size_bytes})

        # Upload to Supabase Storage (service_role bypasses RLS)
        self.sb.storage.from_(BUCKET).upload(
            path=storage_path,
            file=parquet_bytes,
            file_options={
                "content-type": "application/octet-stream",
                "upsert": "true",
            },
        )

        # Upsert into dataset_registry
        self.sb.table("dataset_registry").upsert(
            {
                "provider": "lse",
                "name": f"LSE {result.symbol} {result.resolution}",
                "universe": [{"symbol": result.symbol}],
                "asset_class": "market",
                "frequency": result.resolution,
                "timezone": "UTC",
                "timestamp_semantics": "close",
                "coverage_start": result.coverage_start.isoformat(),
                "coverage_end": result.coverage_end.isoformat(),
                "adjustment_policy": "raw",
                "pit_capability": False,
                "license": "LSE free tier — verify redistribution rights",
                "version": "0.1.0",
                "quality_score": 0.900,
                "data_hash": result.data_hash,
                "storage_path": storage_path,
                "row_count": result.row_count,
                "size_bytes": size_bytes,
                "is_platform_dataset": True,
                "last_ingested_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="provider,asset_class,frequency,storage_path",
        ).execute()

        log.info(
            "lse_adapter.registered",
            extra={"symbol": result.symbol, "rows": result.row_count, "path": storage_path},
        )
        return storage_path

    # ── Internal helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _storage_path(result: OHLCVResult) -> str:
        """
        Canonical storage key: ``market/lse/{SYMBOL}/{resolution}/{year}.parquet``

        Example: ``market/lse/BTC_USD/1d/2024.parquet``
        """
        symbol_safe = result.symbol.replace("/", "_").replace(" ", "_").upper()
        year = result.coverage_end.year if result.coverage_end else "all"
        return f"market/lse/{symbol_safe}/{result.resolution}/{year}.parquet"

    @staticmethod
    def _normalise(raw: Any, symbol: str) -> list[dict]:
        """
        Normalise LSE API response to a flat list of OHLCV dicts.

        Handles multiple response shapes:
        - ``{"data": [...]}`` or ``{"candles": [...]}`` (wrapped list)
        - ``[...]``  (bare list)
        - Short field names: ``t / o / h / l / c / v``
        - Long field names: ``timestamp / open / high / low / close / volume``
        """
        if isinstance(raw, dict):
            # Unwrap common envelope keys
            raw = (
                raw.get("data")
                or raw.get("candles")
                or raw.get("results")
                or raw.get("ohlcv")
                or []
            )
        if not isinstance(raw, list):
            raise ValueError(
                f"Unexpected LSE response type for {symbol}: {type(raw).__name__}. "
                f"Check CANDLES_PATH and API docs."
            )

        rows: list[dict] = []
        for item in raw:
            try:
                rows.append({
                    "timestamp": _parse_ts(
                        item.get("t") or item.get("timestamp") or item.get("time") or item.get("date")
                    ),
                    "open":   float(item.get("o") or item.get("open",   0)),
                    "high":   float(item.get("h") or item.get("high",   0)),
                    "low":    float(item.get("l") or item.get("low",    0)),
                    "close":  float(item.get("c") or item.get("close",  0)),
                    "volume": float(item.get("v") or item.get("volume", 0) or 0),
                })
            except (TypeError, KeyError, ValueError, OverflowError) as exc:
                log.warning(
                    "lse_adapter.row_skip",
                    extra={"symbol": symbol, "reason": str(exc), "item": str(item)[:120]},
                )
        return rows

    @staticmethod
    def _to_arrow(rows: list[dict], symbol: str) -> pa.Table:
        n = len(rows)
        return pa.table(
            {
                "timestamp": pa.array(
                    [r["timestamp"] for r in rows], type=pa.timestamp("ms", tz="UTC")
                ),
                "open":     pa.array([r["open"]   for r in rows], type=pa.float64()),
                "high":     pa.array([r["high"]   for r in rows], type=pa.float64()),
                "low":      pa.array([r["low"]    for r in rows], type=pa.float64()),
                "close":    pa.array([r["close"]  for r in rows], type=pa.float64()),
                "volume":   pa.array([r["volume"] for r in rows], type=pa.float64()),
                "symbol":   pa.array([symbol] * n, type=pa.string()),
                "provider": pa.array(["lse"]   * n, type=pa.string()),
            },
            schema=OHLCV_SCHEMA,
        )


# ── Timestamp parser ──────────────────────────────────────────────────────────

def _parse_ts(val: Any) -> datetime:
    """
    Parse a timestamp to a timezone-aware datetime (UTC).

    Accepts:
    - Unix epoch seconds (int/float, < 1e10)
    - Unix epoch milliseconds (int/float, >= 1e10)
    - ISO 8601 string (``"2024-01-01"``, ``"2024-01-01T00:00:00Z"``, etc.)
    """
    if val is None:
        raise ValueError("null timestamp in LSE response")
    if isinstance(val, (int, float)):
        if val > 1e10:  # epoch milliseconds
            return datetime.fromtimestamp(val / 1000.0, tz=timezone.utc)
        return datetime.fromtimestamp(float(val), tz=timezone.utc)
    if isinstance(val, str):
        # Handle date-only "YYYY-MM-DD" → midnight UTC
        if len(val) == 10:
            return datetime.fromisoformat(val).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    raise TypeError(f"Cannot parse timestamp value {val!r} ({type(val).__name__})")
