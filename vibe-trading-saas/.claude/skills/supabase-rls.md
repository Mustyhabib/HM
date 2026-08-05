# Skill: Supabase RLS for this project

Every table in `docs/DATABASE_SCHEMA.md` needs RLS enabled and a policy
matching what's documented there. This skill is the concrete SQL pattern to
apply — read the schema doc first for *which* table gets *which* rule; this
is *how* to write it.

## Baseline pattern

```sql
alter table public.agent_runs enable row level security;

create policy "users select own agent_runs"
  on public.agent_runs for select
  using (user_id = auth.uid());

create policy "users insert own agent_runs"
  on public.agent_runs for insert
  with check (user_id = auth.uid());

-- No client update policy: status transitions are worker-only, via the
-- service role, which bypasses RLS entirely. Do not add a client "update"
-- policy to agent_runs just because it seems convenient for a status
-- field — that's exactly the surface that must stay service-role-only.
```

## Service-role-only tables

`subscriptions`, `webhook_events`, `audit_logs`, and the write side of
`usage_periods`/`usage_events` are never client-writable (see
`docs/DATABASE_SCHEMA.md` for the reasoning per table). Pattern: enable RLS,
add a `select` policy scoped to the owner where a `user_id` column exists,
and add **no** `insert`/`update`/`delete` policy for the `authenticated`
role at all. The service role bypasses RLS by design, so the server-side
code (webhook handler, worker) still works without a policy — the absence
of a client policy is the control, not a bug to route around.

## Reference/static tables

`plans` is readable by any authenticated user (needed for the pricing page)
and never client-writable:

```sql
alter table public.plans enable row level security;

create policy "anyone authenticated can read plans"
  on public.plans for select
  to authenticated
  using (true);
```

## Verifying a policy actually works

Don't trust that a policy compiles — prove it blocks cross-user access:

1. Create two test accounts (A and B) in the Supabase dashboard or via
   signup.
2. As A, create an `agent_runs` row (or any owned row).
3. Switch to B's session (or use the Supabase SQL editor's "Run as" /
   `set local role authenticated; set local request.jwt.claims = ...` to
   simulate B) and confirm the `select` returns zero rows, not an error and
   not A's row.
4. Record this check in `docs/SECURITY_CHECKLIST.md`'s "Multi-tenant
   isolation" section as done, with the date, once verified — not before.

## Common mistake to avoid here specifically

`agent_artifacts` denormalizes `user_id` onto the row (see
`docs/DATABASE_SCHEMA.md`) specifically so its RLS policy doesn't need a
join through `agent_runs`. If a future migration changes that shape, update
the policy in the same migration — a stale policy that still checks the old
column silently fails open or closed depending on the exact rewrite, so
don't assume it "still works."
