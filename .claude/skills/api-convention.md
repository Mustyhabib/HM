---
name: api-conventions
description: Standard response shape, pagination, auth header, and error handling for all FastAPI routes.
---

# API Conventions

Every route in `app/api/v1/` follows these exactly.

## Response envelope
Success: `{"data": <payload>, "error": null}`
Failure: `{"data": null, "error": "<message>"}`

## Auth
- Header: `Authorization: Bearer <access_token>`
- Get the user via the `get_current_user` dependency — never decode JWT inline.

## Pagination
Request: `?page=1&limit=20`
Response: `{"data": [...], "total": N, "page": 1, "limit": 20}`
Always `ORDER BY created_at DESC` for lists unless specified.

## Errors
- Raise `HTTPException(status_code=..., detail="...")`.
- 401 = missing/invalid token · 403 = wrong owner or non-admin ·
  409 = conflict (e.g. result not ready) · 429 = quota exceeded.
- Cross-user access MUST return 403, not 404 (so isolation tests pass).

## Soft delete
`strategy_sessions` uses a `deleted_at` column — set it, don't hard-delete.
