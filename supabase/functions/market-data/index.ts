/**
 * market-data — LSE (London Strategic Edge) OHLCV proxy.
 *
 * Auth-gates the caller via Supabase JWT, then proxies candle requests to the
 * LSE API using the platform-managed API key stored as a Supabase secret.
 * The key NEVER reaches the browser — only Edge Function code runs server-side.
 *
 * Entity gate: returns 503 when LSE_API_KEY is not configured, so the function
 * is safe to deploy before the key is set.
 *
 * Request (POST body JSON):
 *   { symbol: string;     // e.g. "BTC/USD"
 *     resolution: string; // e.g. "1d"
 *     from: string;       // ISO date "YYYY-MM-DD"
 *     to: string;         // ISO date "YYYY-MM-DD"
 *   }
 *
 * Response (200):
 *   { bars: PriceBar[] }  // PriceBar = { time, open, high, low, close, volume }
 *
 * Secrets required (supabase secrets set):
 *   LSE_API_KEY   — London Strategic Edge platform API key
 *
 * Optional env:
 *   LSE_API_BASE  — defaults to https://api.londonstrategicedge.com
 *
 * Architecture note (ADR D17/D18):
 *   HTTP historical OHLCV is Phase 2. WebSocket live feed is Phase 6.
 *   This function covers Phase 2 — historical candles only.
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LSE_API_KEY  = Deno.env.get("LSE_API_KEY") ?? "";
const LSE_API_BASE = Deno.env.get("LSE_API_BASE") ?? "https://api.londonstrategicedge.com";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

interface PriceBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Normalise a single raw candle object to PriceBar.
// LSE may return short field names (t/o/h/l/c/v) or long names
// (timestamp/open/high/low/close/volume).
function normaliseBar(raw: Record<string, unknown>): PriceBar | null {
  const time =
    (raw.timestamp as string | undefined) ||
    (raw.t as string | undefined);
  const open   = Number(raw.open   ?? raw.o);
  const high   = Number(raw.high   ?? raw.h);
  const low    = Number(raw.low    ?? raw.l);
  const close  = Number(raw.close  ?? raw.c);
  const volume = Number(raw.volume ?? raw.v ?? 0);

  if (!time || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
    return null;
  }

  // Normalise timestamp → YYYY-MM-DD date string
  const date = time.includes("T")
    ? time.split("T")[0]
    : new Date(time).toISOString().split("T")[0];

  return { time: date, open, high, low, close, volume };
}

// Extract raw candle array from LSE response, which may be:
//   { data: [...] }  |  { candles: [...] }  |  [...]
function extractCandles(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data))    return obj.data    as Record<string, unknown>[];
    if (Array.isArray(obj.candles)) return obj.candles as Record<string, unknown>[];
  }
  return [];
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  // ── Entity gate ─────────────────────────────────────────────────────────────
  if (!LSE_API_KEY) {
    return json(
      { error: "Market data is not yet configured. LSE_API_KEY is missing." },
      503,
    );
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let symbol: string, resolution: string, from: string, to: string;
  try {
    ({ symbol, resolution, from, to } = await req.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!symbol || !resolution || !from || !to) {
    return json({ error: "symbol, resolution, from, and to are required" }, 400);
  }

  // Basic input sanitisation — only allow safe characters in query params
  const safe = /^[A-Z0-9/\-_.]+$/i;
  if (!safe.test(symbol) || !safe.test(resolution)) {
    return json({ error: "Invalid symbol or resolution" }, 400);
  }

  // ── Call LSE API ─────────────────────────────────────────────────────────────
  const url = new URL(`${LSE_API_BASE}/v1/market/candles`);
  url.searchParams.set("symbol",     symbol);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from",       from);
  url.searchParams.set("to",         to);

  let lseResp: Response;
  try {
    lseResp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${LSE_API_KEY}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.error("LSE fetch failed:", msg);
    return json({ error: `LSE API unreachable: ${msg}` }, 502);
  }

  if (!lseResp.ok) {
    const body = await lseResp.text().catch(() => "");
    console.error(`LSE API ${lseResp.status}:`, body.slice(0, 200));
    return json({ error: `LSE API error ${lseResp.status}` }, 502);
  }

  let payload: unknown;
  try {
    payload = await lseResp.json();
  } catch {
    return json({ error: "LSE returned non-JSON response" }, 502);
  }

  // ── Normalise ────────────────────────────────────────────────────────────────
  const rawBars = extractCandles(payload);
  const bars: PriceBar[] = [];
  for (const raw of rawBars) {
    const bar = normaliseBar(raw);
    if (bar) bars.push(bar);
  }

  // Sort ascending by date
  bars.sort((a, b) => a.time.localeCompare(b.time));

  return json({ bars });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
