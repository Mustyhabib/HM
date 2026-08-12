#!/bin/bash
# ── H~Mltd Tradi API startup script ─────────────────────────────────────────
# Runs inside the Railway container.
# Process model:
#   1. Start Tradi FastAPI (uvicorn) on loopback :8899
#   2. Substitute ${PORT} into nginx.conf template
#   3. Start Nginx on ${PORT} (Railway-assigned, typically 8080)
#
# If either process exits, the script exits (Railway restarts the container).

set -euo pipefail

PORT="${PORT:-8080}"
export PORT

echo "=== H~Mltd Tradi API starting ==="
echo "    PORT=$PORT"
echo "    TRADI_VERSION=$(vibe-trading --version 2>/dev/null || echo unknown)"

# ── 1. Start Tradi FastAPI on loopback ────────────────────────────────────────
# Binds to 127.0.0.1:8899 by default (CLAUDE.md security note).
# Nginx is the only external caller; uvicorn is never reachable from outside.
vibe-trading serve --port 8899 &
UVICORN_PID=$!
echo "    uvicorn PID=$UVICORN_PID on 127.0.0.1:8899"

# ── 2. Wait for FastAPI to be ready (up to 30 s) ─────────────────────────────
echo "    Waiting for Tradi API readiness..."
for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:8899/" > /dev/null 2>&1; then
        echo "    Tradi API ready after ${i}s"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "ERROR: Tradi API did not become ready in 30s"
        kill "$UVICORN_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# ── 3. Render nginx.conf from template ───────────────────────────────────────
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
echo "    nginx.conf rendered (PORT=$PORT)"
nginx -t 2>&1   # validate before starting

# ── 4. Start Nginx in foreground ─────────────────────────────────────────────
echo "    Starting Nginx on port $PORT"
nginx -g "daemon off;" &
NGINX_PID=$!

# ── 5. Monitor both processes ─────────────────────────────────────────────────
# Exit (triggering Railway restart) as soon as either process dies.
wait -n "$UVICORN_PID" "$NGINX_PID"
EXIT_CODE=$?
echo "A process exited (code=$EXIT_CODE); shutting down..."
kill "$UVICORN_PID" "$NGINX_PID" 2>/dev/null || true
exit "$EXIT_CODE"
