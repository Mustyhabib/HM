# Cloudflare Setup Guide

Cloudflare sits in front of all H~Mltd public endpoints:

```
Browser
  │ HTTPS
  ▼
Cloudflare (DNS + CDN + WAF + SSL termination)
  ├── hmtrade-business.com / www.hmtrade-business.com  →  Vercel (React SPA)
  └── api.hmtrade-business.com              →  Railway (Nginx + Tradi FastAPI)
```

The Railway `hm-worker` has **no public endpoint** — it only connects outbound to Supabase.

---

## Step 1 — Add your domain to Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a site**
2. Enter your domain (e.g. `hmtrade-business.com`)
3. Choose the **Free plan**
4. Cloudflare will scan your existing DNS records — review them, then continue
5. Update your domain registrar's nameservers to the two Cloudflare nameservers shown

> ⏱ Nameserver propagation takes 0–48 hours. Cloudflare usually activates within minutes.

---

## Step 2 — DNS records

In Cloudflare → DNS → Records, create these records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| `CNAME` | `hmtrade-business.com` (or `@`) | `cname.vercel-dns.com` | ✅ Proxied | Auto |
| `CNAME` | `www` | `cname.vercel-dns.com` | ✅ Proxied | Auto |
| `CNAME` | `api` | `<tradi-api>.up.railway.app` | ✅ Proxied | Auto |

Replace `<tradi-api>.up.railway.app` with your Railway tradi-api service domain from:
Railway dashboard → tradi-api service → Settings → Networking → Domains.

---

## Step 3 — SSL/TLS

Go to Cloudflare → **SSL/TLS → Overview**:

- Set mode to **Full (strict)**

> **Full (strict)** means Cloudflare validates the certificate on the origin server.
> Railway and Vercel both serve valid TLS certificates, so this works.
>
> ⚠️ Do NOT use "Flexible" — it sends unencrypted HTTP to the origin.

---

## Step 4 — SSL → Edge Certificates

Go to **SSL/TLS → Edge Certificates**:

- [ ] **Always Use HTTPS**: ON
- [ ] **HTTP Strict Transport Security (HSTS)**: Enable (max-age 6 months, subdomains: yes)
- [ ] **Minimum TLS Version**: TLS 1.2
- [ ] **Opportunistic Encryption**: ON
- [ ] **TLS 1.3**: ON

---

## Step 5 — Caching rules (for the API)

SSE endpoints (`/sessions`, `/runs`) must never be cached. Create a cache rule:

1. Go to **Caching → Cache Rules → Create Rule**
2. Name: `Bypass cache for Tradi API`
3. Expression: `(http.host eq "api.hmtrade-business.com")`
4. Cache status: **Bypass**
5. Save

---

## Step 6 — WAF / Security settings

Go to **Security → Settings**:

- **Security Level**: Medium (or High if you're getting bot traffic)
- **Bot Fight Mode**: ON (free tier)
- **Challenge Passage**: 30 minutes

Go to **Security → WAF → Managed Rules**:
- Enable **Cloudflare Managed Ruleset** (free on Pro plan)

---

## Step 7 — Add custom domain to Vercel

1. In Vercel → your project → Settings → Domains
2. Add `hmtrade-business.com` and `www.hmtrade-business.com`
3. Vercel will ask you to create CNAME records — you already did this in Step 2
4. Vercel shows "Valid Configuration" when Cloudflare is routing correctly

---

## Step 8 — Add custom domain to Railway (tradi-api)

1. Railway → tradi-api service → Settings → Networking → Custom Domain
2. Add `api.hmtrade-business.com`
3. Railway provides a TXT or CNAME verification record
4. Add that record in Cloudflare DNS (set proxy to **DNS only / grey cloud** temporarily for verification)
5. After verification, switch back to **Proxied (orange cloud)**

---

## Verify

```bash
# Frontend
curl -I https://hmtrade-business.com
# Expect: 200 OK, server: cloudflare

# API
curl https://api.hmtrade-business.com/health
# Expect: {"status": "ok"} (or similar from Tradi FastAPI)

# Check real IP forwarding works (Railway logs should show Cloudflare IP)
curl -H "CF-Connecting-IP: 1.2.3.4" https://api.hmtrade-business.com/health
```

---

## Paystack webhook — Cloudflare considerations

Paystack sends webhooks to:
```
https://wqjdumforbalfmtawwpg.supabase.co/functions/v1/paystack-webhook
```

This hits Supabase directly — **not through Cloudflare**. No changes needed here.

However, if you later route Paystack webhooks through your own domain (`api.hmtrade-business.com/webhooks/paystack`), ensure that path is **excluded from the WAF challenge** — Paystack IPs should not be challenged. Add a WAF bypass rule for the webhook path if needed.

---

## Cost

The Cloudflare Free plan covers everything in this guide:
- DNS
- CDN
- DDoS protection
- SSL
- Bot Fight Mode
- Basic WAF

The Pro plan ($25/mo) adds advanced WAF managed rules — upgrade if you see bot traffic.
