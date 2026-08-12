# Railway Deployment Guide

H~Mltd runs **two Railway services** in one Railway project:

| Service | Dockerfile | Role |
|---------|-----------|------|
| `hm-worker` | `Dockerfile` (repo root) | Background job poller — claims `agent_runs`, executes Tradi, stores artifacts |
| `tradi-api` | `infra/tradi-api/Dockerfile` | Nginx + Tradi FastAPI — enables D12 real-time SSE streaming from `/agent` |

---

## Prerequisites

- [ ] Railway account at [railway.com](https://railway.com)
- [ ] GitHub repo `Mustyhabib/HM` connected to Railway
- [ ] Supabase project `wqjdumforbalfmtawwpg` running (already live)

---

## Step 1 — Create a Railway Project

1. Go to [railway.com/new](https://railway.com/new)
2. Choose **"Deploy from GitHub repo"**
3. Select `Mustyhabib/HM`
4. Railway auto-detects the root `Dockerfile` and creates **Service 1 (hm-worker)**

---

## Step 2 — Configure Service 1: hm-worker

In the Railway dashboard for the first service:

### Build settings
- **Build Command**: *(leave empty — Dockerfile handles it)*
- **Dockerfile Path**: `Dockerfile`

### Environment variables (Variables tab)
Set all of these:

```
SUPABASE_URL=https://wqjdumforbalfmtawwpg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your service role key from Supabase → Settings → API>
WORKER_EXECUTE_TRADI=true
WORKER_RUNS_ROOT=/var/vibe-runs
WORKER_ID=railway-worker-1
WORKER_RUN_TIMEOUT_SECONDS=900
WORKER_POLL_INTERVAL_SECONDS=2
WORKER_IDLE_BACKOFF_SECONDS=30
```

### Deploy settings
- **Start Command**: `hm-worker`
- **Restart Policy**: ON_FAILURE, max 10 retries
- **Graceful Shutdown Timeout**: 60s (Railway dashboard → Deploy tab)

---

## Step 3 — Create Service 2: tradi-api

1. In your Railway project, click **"+ New Service"**
2. Choose **"GitHub repo"** → same repo `Mustyhabib/HM`
3. In the service's **Settings → Build**:
   - Set **Dockerfile Path** to `infra/tradi-api/Dockerfile`
4. Rename the service to `tradi-api`

### Environment variables for tradi-api

```
# No Supabase key needed — auth is handled by the frontend + Supabase directly
# Tradi FastAPI config
VIBE_TRADING_HOME=/var/vibe-runs
API_AUTH_KEY=<generate with: openssl rand -hex 32>
```

### Domain for tradi-api

In the service's **Settings → Networking**:
1. Click **"Generate Domain"**
2. Note the URL, e.g. `tradi-api-production.up.railway.app`
3. (Later) Add your custom domain `api.hmltd.com` here

---

## Step 4 — Update Vercel environment variables

In Vercel dashboard → your project → Settings → Environment Variables, add:

```
VITE_API_URL=https://api.hmltd.com   # or the Railway auto-domain temporarily
```

This is what `Agent.tsx` uses for direct SSE streaming (D12).

---

## Step 5 — Apply the Paystack billing migration

In the Supabase dashboard → SQL Editor, run the contents of:
```
vibe-trading-saas/db/migrations/2026_08_12_paystack_billing.sql
```

---

## Step 6 — Deploy Supabase Edge Functions

Install the Supabase CLI:
```bash
npm install -g supabase
```

Link to your project:
```bash
supabase link --project-ref wqjdumforbalfmtawwpg
```

Set secrets:
```bash
supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_live_XXXXXXX \
  APP_URL=https://hmltd.com
```

Deploy functions:
```bash
supabase functions deploy paystack-webhook
supabase functions deploy paystack-init
```

Get the webhook URL (you'll need this in Paystack):
```
https://wqjdumforbalfmtawwpg.supabase.co/functions/v1/paystack-webhook
```

---

## Step 7 — Configure Paystack

1. Log in to [dashboard.paystack.com](https://dashboard.paystack.com)
2. **Create Plans** (Products → Plans):
   - Starter: ₦70,000/month
   - Pro: ₦120,000/month
   - Premium: ₦200,000/month
3. Copy each **Plan Code** (e.g. `PLN_abc123`)
4. In Supabase SQL Editor, seed the plan codes:
   ```sql
   update public.plans set provider_price_id = 'PLN_starter_code' where id = 'starter';
   update public.plans set provider_price_id = 'PLN_pro_code'     where id = 'pro';
   update public.plans set provider_price_id = 'PLN_premium_code' where id = 'premium';
   ```
5. **Set Webhook URL** (Settings → API Keys & Webhooks):
   ```
   https://wqjdumforbalfmtawwpg.supabase.co/functions/v1/paystack-webhook
   ```
   Enable events: `charge.success`, `subscription.create`, `subscription.disable`, `invoice.update`

---

## Verify deployment

### Worker health check
In Railway logs for `hm-worker`, you should see:
```
[INFO] Worker started. Polling for agent_runs...
```

### Tradi API health check
```bash
curl https://api.hmltd.com/health
# or
curl https://tradi-api-production.up.railway.app/health
```

### End-to-end billing test
1. Go to `/pricing`
2. Click "Subscribe — Starter"
3. Complete payment with Paystack test card: `4084 0840 8408 4081`, expiry any future date, CVV `408`
4. You should land on `/billing/callback` with a success message
5. Check Supabase → Table Editor → `subscriptions` for the new row

---

## Environment summary

| Secret | Where set | Value |
|--------|-----------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Railway (hm-worker vars) | Supabase → Settings → API |
| `PAYSTACK_SECRET_KEY` | Supabase secrets | Paystack → Settings → API Keys |
| `APP_URL` | Supabase secrets | `https://hmltd.com` |
| `VITE_API_URL` | Vercel env vars | Railway tradi-api domain |
| `API_AUTH_KEY` | Railway (tradi-api vars) | `openssl rand -hex 32` |
