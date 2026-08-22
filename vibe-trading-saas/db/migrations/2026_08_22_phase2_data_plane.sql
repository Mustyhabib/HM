-- ─── Phase 2: Data Plane substrate ───────────────────────────────────────────
-- Migration: 2026_08_22_phase2_data_plane.sql
-- Project:   wqjdumforbalfmtawwpg
-- Decision:  LSE (London Strategic Edge) as primary Phase 2 data provider (overrides R2-Q7)
-- Companion: worker/src/hm_worker/lse_adapter.py, ingestion.py
--
-- Tables:    public.dataset_registry, public.data_feeds
-- Bucket:    hm-datalake (Supabase Storage)
-- RPCs:      list_platform_datasets(), list_feed_status()
--
-- Apply manually:
--   Supabase dashboard → SQL editor → paste + run
--   OR: supabase db execute --file ...
-- Do NOT edit after applying; write a new migration for changes.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- hm-datalake: canonical Parquet store.
-- Phase 2: Supabase Storage. Phase 9: migrate to R2 (billing deferred, R2-Q8).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'hm-datalake',
    'hm-datalake',
    FALSE,
    524288000,                          -- 500 MB per file
    ARRAY['application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- ── dataset_registry ─────────────────────────────────────────────────────────
-- Every dataset in the platform is registered here.
-- is_platform_dataset = TRUE  → maintained by the worker; visible to all authenticated users.
-- is_platform_dataset = FALSE → user-created; owner-scoped (user_id = auth.uid()).
CREATE TABLE IF NOT EXISTS public.dataset_registry (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID         REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- NULL means this is a platform dataset (no per-user owner)

    provider                TEXT         NOT NULL,           -- 'lse', 'okx', 'ccxt'
    venue                   TEXT,                            -- exchange / venue code
    name                    TEXT,                            -- human-readable label
    universe                JSONB        NOT NULL DEFAULT '[]', -- [{"symbol":"BTC/USD"}]
    asset_class             TEXT         NOT NULL
                            CHECK (asset_class IN ('market', 'macro', 'alternative')),
    frequency               TEXT         NOT NULL,           -- tick,1min,5min,1h,1d,1w,1mo
    timezone                TEXT         NOT NULL DEFAULT 'UTC',
    timestamp_semantics     TEXT         NOT NULL DEFAULT 'close'
                            CHECK (timestamp_semantics IN ('open','close','print','publication')),

    coverage_start          DATE,
    coverage_end            DATE,
    adjustment_policy       TEXT         NOT NULL DEFAULT 'raw'
                            CHECK (adjustment_policy IN ('raw','split_adj','div_adj','total_return')),
    corporate_action_policy TEXT,

    pit_capability          BOOLEAN      NOT NULL DEFAULT FALSE,
    license                 TEXT,
    version                 TEXT         NOT NULL DEFAULT '0.1.0',
    quality_score           NUMERIC(4,3),                    -- 0.000 → 1.000
    data_hash               TEXT,                            -- SHA-256 of Parquet file
    storage_path            TEXT,                            -- Supabase Storage key
    row_count               BIGINT,
    size_bytes              BIGINT,

    is_platform_dataset     BOOLEAN      NOT NULL DEFAULT FALSE,
    last_ingested_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Prevent duplicate platform ingestion for the same provider/asset_class/frequency/path
CREATE UNIQUE INDEX IF NOT EXISTS dataset_registry_platform_uq
    ON public.dataset_registry (provider, asset_class, frequency, storage_path)
    WHERE is_platform_dataset = TRUE AND storage_path IS NOT NULL;

-- ── data_feeds ────────────────────────────────────────────────────────────────
-- Adapter configuration + run health log.
-- Service-role only — frontend reads sanitised view via list_feed_status() RPC.
CREATE TABLE IF NOT EXISTS public.data_feeds (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT         NOT NULL UNIQUE,
    provider        TEXT         NOT NULL,
    asset_class     TEXT         NOT NULL
                    CHECK (asset_class IN ('market', 'macro', 'alternative')),
    frequency       TEXT         NOT NULL,
    symbols         JSONB        NOT NULL DEFAULT '[]',
    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('active', 'paused', 'error', 'pending')),
    is_enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
    config          JSONB        NOT NULL DEFAULT '{}',  -- adapter config, NO secrets
    last_run_at     TIMESTAMPTZ,
    last_error      TEXT,
    next_run_at     TIMESTAMPTZ,
    runs_total      BIGINT       NOT NULL DEFAULT 0,
    runs_ok         BIGINT       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the LSE daily OHLCV feed (BTC/ETH/SOL — R3-Q4)
INSERT INTO public.data_feeds (name, provider, asset_class, frequency, symbols, status, config)
VALUES (
    'lse-ohlcv-daily',
    'lse',
    'market',
    '1d',
    '["BTC/USD", "ETH/USD", "SOL/USD"]'::jsonb,
    'pending',
    '{"resolution": "1d", "lookback_days": 365}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.dataset_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_feeds       ENABLE ROW LEVEL SECURITY;

-- dataset_registry — platform datasets visible to all authenticated users
CREATE POLICY "dr_platform_read"
    ON public.dataset_registry FOR SELECT TO authenticated
    USING (is_platform_dataset = TRUE);

-- dataset_registry — user-owned datasets: owner only
CREATE POLICY "dr_user_read_own"
    ON public.dataset_registry FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND is_platform_dataset = FALSE);

CREATE POLICY "dr_user_insert_own"
    ON public.dataset_registry FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND is_platform_dataset = FALSE);

CREATE POLICY "dr_user_update_own"
    ON public.dataset_registry FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND is_platform_dataset = FALSE);

-- data_feeds: service_role bypasses RLS; default deny for everyone else.
-- Frontend reads sanitised data via list_feed_status() RPC below.

-- hm-datalake storage: authenticated users can read (generate signed URLs)
-- Worker writes via service_role (bypasses RLS automatically)
CREATE POLICY "datalake_auth_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'hm-datalake');

-- ── RPCs ───────────────────────────────────────────────────────────────────────

-- list_platform_datasets: catalog for the /data page
CREATE OR REPLACE FUNCTION public.list_platform_datasets(
    p_asset_class TEXT DEFAULT NULL,
    p_frequency   TEXT DEFAULT NULL
)
RETURNS TABLE (
    id               UUID,
    provider         TEXT,
    name             TEXT,
    universe         JSONB,
    asset_class      TEXT,
    frequency        TEXT,
    coverage_start   DATE,
    coverage_end     DATE,
    quality_score    NUMERIC,
    row_count        BIGINT,
    size_bytes       BIGINT,
    storage_path     TEXT,
    last_ingested_at TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id, provider, name, universe, asset_class, frequency,
        coverage_start, coverage_end, quality_score, row_count, size_bytes,
        storage_path, last_ingested_at, updated_at
    FROM  public.dataset_registry
    WHERE is_platform_dataset = TRUE
      AND (p_asset_class IS NULL OR asset_class = p_asset_class)
      AND (p_frequency   IS NULL OR frequency   = p_frequency)
    ORDER BY asset_class, provider, coverage_end DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_platform_datasets TO authenticated;

-- list_feed_status: sanitised feed health (no config secrets) for the /data page
CREATE OR REPLACE FUNCTION public.list_feed_status()
RETURNS TABLE (
    name         TEXT,
    provider     TEXT,
    asset_class  TEXT,
    frequency    TEXT,
    symbols      JSONB,
    status       TEXT,
    is_enabled   BOOLEAN,
    last_run_at  TIMESTAMPTZ,
    next_run_at  TIMESTAMPTZ,
    runs_total   BIGINT,
    runs_ok      BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT name, provider, asset_class, frequency, symbols, status,
           is_enabled, last_run_at, next_run_at, runs_total, runs_ok
    FROM  public.data_feeds
    ORDER BY provider, name;
$$;

GRANT EXECUTE ON FUNCTION public.list_feed_status TO authenticated;

-- ── updated_at triggers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Guard: only create the trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'dataset_registry_updated_at'
          AND tgrelid = 'public.dataset_registry'::regclass
    ) THEN
        CREATE TRIGGER dataset_registry_updated_at
            BEFORE UPDATE ON public.dataset_registry
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'data_feeds_updated_at'
          AND tgrelid = 'public.data_feeds'::regclass
    ) THEN
        CREATE TRIGGER data_feeds_updated_at
            BEFORE UPDATE ON public.data_feeds
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END;
$$;

COMMIT;

-- ── Rollback (copy out if needed — keep below the COMMIT line) ────────────────
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.list_feed_status();
-- DROP FUNCTION IF EXISTS public.list_platform_datasets(TEXT, TEXT);
-- DROP TABLE IF EXISTS public.data_feeds;
-- DROP TABLE IF EXISTS public.dataset_registry;
-- DELETE FROM storage.buckets WHERE id = 'hm-datalake';
-- COMMIT;
