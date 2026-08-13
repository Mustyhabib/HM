# ── H~Mltd Tradi API image ───────────────────────────────────────────────────
# Railway service: Nginx (public) → uvicorn (loopback :8899, Tradi FastAPI).
# Enables D12: direct sessions streaming for real-time run output.
#
# Build context: repo root (monorepo).
# Layers ordered cheapest-to-change last for cache efficiency.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── System deps: nginx + build tools ─────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        gettext-base \
        build-essential \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ── Tradi engine ──────────────────────────────────────────────────────────────
# Only engine source — not the frontend or docs.
COPY Tradi/pyproject.toml Tradi/README.md Tradi/LICENSE Tradi/NOTICE ./Tradi/
COPY Tradi/agent/   ./Tradi/agent/

# Install with deepseek extra (BYOK — user key injected per-session via header).
RUN pip install --no-cache-dir -e "./Tradi[deepseek]"

# ── Nginx config ──────────────────────────────────────────────────────────────
COPY infra/nginx/nginx.conf.template /etc/nginx/nginx.conf.template

# Remove the default site shipped with nginx (we replace it completely)
RUN rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

# ── Per-run isolated workspaces ───────────────────────────────────────────────
RUN mkdir -p /var/vibe-runs && chmod 777 /var/vibe-runs

# ── Start script ──────────────────────────────────────────────────────────────
COPY infra/tradi-api/start.sh /start.sh
RUN chmod +x /start.sh

# Smoke-test the CLI entry point
RUN vibe-trading --help > /dev/null 2>&1 || true

# Railway assigns PORT at runtime; Nginx listens on it.
# uvicorn always binds to 127.0.0.1:8899 (internal only).
EXPOSE 8080

CMD ["/start.sh"]
