
---

## 8. `.claude/skills/frontend-page.md`
```markdown
---
name: frontend-page
description: Next.js App Router page conventions — token handling, SWR fetching, ShadCN usage.
---

# Frontend Page (Next.js App Router)

## Token handling (lib/auth.ts + lib/api.ts)
- `access_token` in MEMORY (never localStorage).
- `refresh_token` in an httpOnly cookie set by `/auth/login`.
- `lib/api.ts` typed fetch: inject `Authorization: Bearer <access_token>`,
  catch 401 → trigger refresh → retry once.

## Data fetching
- Use SWR. Key = the endpoint path, e.g. `useSWR("/users/me/usage")`.
- Polling (backtest status): `useSWR(key, fetcher, { refreshInterval: 3000 })`
  until done/failed.

## Components
- Use ShadCN: Card, Input, Button, Label, Alert, Sheet/Dialog, Table, Badge.
- Inline field errors from the API (e.g. email taken → under the email field).
- Destructive/money actions (stop bot, cancel sub, deploy, delete) ALWAYS get a
  confirmation dialog — no silent destructive actions.

## Status badge colors
active = green · stopped = gray · errored = red.

## Admin pages
Only render when `user.role === "admin"`, else redirect to `/dashboard`.
