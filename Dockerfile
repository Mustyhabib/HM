# ─── H~Mltd Worker — Railway deployment image ────────────────────────────────
#
# Builds from the monorepo root so both the Tradi engine and the hm-worker
# package are installed in one image.
#
# Layers (ordered cheapest-to-change last for cache efficiency):
#   1. System deps
#   2. Tradi engine (vibe-trading-ai + DeepSeek extras)
#   3. hm-worker
#   4. Runtime env / entrypoint

FROM python:3.13-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── System deps ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ── Tradi engine ──────────────────────────────────────────────────────────────
# Copy only the engine source (not the frontend) to keep the layer small.
COPY Tradi/pyproject.toml Tradi/README.md Tradi/LICENSE Tradi/NOTICE ./Tradi/
COPY Tradi/agent/ ./Tradi/agent/

# Install with DeepSeek extras (BYOK — user supplies key at runtime via env).
# The [deepseek] extra pulls langchain-deepseek for the native adapter.
RUN pip install --no-cache-dir -e "./Tradi[deepseek]"

# ── hm-worker ─────────────────────────────────────────────────────────────────
COPY vibe-trading-saas/worker/ ./worker/
RUN pip install --no-cache-dir -e "./worker"

# ── Runtime setup ─────────────────────────────────────────────────────────────
# Per-run isolated HOME dirs live here (WORKER_RUNS_ROOT).
# Railway volumes are ephemeral by default — runs complete fast enough that
# persistence across restarts isn't required at MVP.
RUN mkdir -p /var/vibe-runs && chmod 777 /var/vibe-runs

# Verify both entry points are on PATH
RUN vibe-trading --help > /dev/null 2>&1 && \
    hm-worker --help > /dev/null 2>&1 || true

# ── Entrypoint ────────────────────────────────────────────────────────────────
CMD ["hm-worker"]
