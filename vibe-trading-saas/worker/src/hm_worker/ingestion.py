"""
hm-ingest — Phase 2 LSE OHLCV ingestion CLI.

Entry point: ``hm-ingest`` (pyproject.toml [project.scripts])

Fetches historical OHLCV from the LSE HTTP API for the configured symbol list,
converts to Parquet (pyarrow/snappy), uploads to hm-datalake (Supabase Storage),
and registers each dataset in the public.dataset_registry table.

The hm-worker agent-run poll loop runs independently; this process does NOT
affect it. Run hm-ingest as a separate Railway cron / manual trigger.

Usage::

    hm-ingest                              # default symbols: BTC/USD ETH/USD SOL/USD
    hm-ingest --symbols BTC/USD ETH/USD   # specific symbols only
    hm-ingest --lookback-days 90           # shorter history window
    hm-ingest --dry-run                    # validate config + fetch, skip upload

Environment::

    LSE_API_KEY          (required)  LSE platform API key
    SUPABASE_URL         (required)  shared with hm-worker
    SUPABASE_SERVICE_ROLE_KEY (required)

Exit codes:
    0 — all symbols ingested successfully
    1 — one or more symbols failed (see logs)
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timedelta, timezone

log = logging.getLogger(__name__)

# Phase 2 defaults (R3-Q4: first dataset = BTC/ETH/SOL daily OHLCV)
_DEFAULT_SYMBOLS = ["BTC/USD", "ETH/USD", "SOL/USD"]
_DEFAULT_RESOLUTION = "1d"
_DEFAULT_LOOKBACK_DAYS = 365
_FEED_NAME = "lse-ohlcv-daily"


def main() -> None:
    from hm_worker.logging_config import configure_logging

    configure_logging()
    args = _parse_args()

    from hm_worker.config import load_config

    cfg = load_config()
    if not cfg.lse_api_key:
        log.error(
            "hm_ingest.no_key",
            extra={"msg": "LSE_API_KEY not configured — add to Railway HM service env vars and redeploy"},
        )
        sys.exit(1)

    from supabase import create_client

    from hm_worker.lse_adapter import LSEAdapter

    sb = create_client(cfg.supabase_url, cfg.service_role_key)
    adapter = LSEAdapter(api_key=cfg.lse_api_key, supabase_client=sb, base_url=cfg.lse_api_base)

    symbols = args.symbols or _DEFAULT_SYMBOLS
    end = datetime.now(timezone.utc).date().isoformat()
    start = (
        datetime.now(timezone.utc) - timedelta(days=args.lookback_days)
    ).date().isoformat()

    log.info(
        "hm_ingest.start",
        extra={
            "symbols": symbols,
            "resolution": _DEFAULT_RESOLUTION,
            "start": start,
            "end": end,
            "dry_run": args.dry_run,
        },
    )

    successes, failures = 0, 0

    for symbol in symbols:
        try:
            result = adapter.fetch_ohlcv(
                symbol,
                resolution=_DEFAULT_RESOLUTION,
                start=start,
                end=end,
            )

            if args.dry_run:
                log.info(
                    "hm_ingest.dry_run",
                    extra={"symbol": symbol, "rows": result.row_count, "hash": result.data_hash[:12]},
                )
                successes += 1
                continue

            path = adapter.upload_and_register(result)
            log.info(
                "hm_ingest.uploaded",
                extra={"symbol": symbol, "rows": result.row_count, "path": path},
            )
            successes += 1

        except Exception as exc:
            log.error(
                "hm_ingest.symbol_failed",
                extra={"symbol": symbol, "error": str(exc)},
                exc_info=True,
            )
            failures += 1

    # Update feed health in data_feeds (best-effort — don't fail the process)
    if not args.dry_run:
        _update_feed_status(
            sb,
            status="active" if failures == 0 else "error",
            last_error=f"{failures}/{len(symbols)} symbols failed" if failures else None,
        )

    log.info(
        "hm_ingest.done",
        extra={"successes": successes, "failures": failures, "total": len(symbols)},
    )

    if failures:
        sys.exit(1)


# ── Feed health helpers ───────────────────────────────────────────────────────

def _update_feed_status(sb: object, status: str, last_error: str | None) -> None:
    """Update data_feeds row for lse-ohlcv-daily. Best-effort, no raise."""
    try:
        sb.table("data_feeds").update(  # type: ignore[union-attr]
            {
                "status": status,
                "last_run_at": datetime.now(timezone.utc).isoformat(),
                "last_error": last_error,
            }
        ).eq("name", _FEED_NAME).execute()
    except Exception as exc:
        log.warning("hm_ingest.feed_update_failed", extra={"error": str(exc)})


# ── Arg parsing ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="hm-ingest",
        description="H~M Phase 2 — LSE OHLCV ingestion to hm-datalake",
    )
    p.add_argument(
        "--symbols",
        nargs="+",
        metavar="SYM",
        help=f"Symbols to ingest (default: {' '.join(_DEFAULT_SYMBOLS)})",
    )
    p.add_argument(
        "--lookback-days",
        type=int,
        default=_DEFAULT_LOOKBACK_DAYS,
        metavar="N",
        help=f"Days of history to request (default: {_DEFAULT_LOOKBACK_DAYS})",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate but skip Parquet upload + registry upsert",
    )
    return p.parse_args()
