# Skill: Quota enforcement for this project

The single hard rule (`CLAUDE.md` rule 7): never trust a client-side check
alone. "Does this user have a use left" and "consume a use" must happen
atomically, in the same transaction as creating the `agent_runs` row —
otherwise two concurrent "Start run" clicks both read "1 use left" and both
succeed.

## The pattern: a single `SECURITY DEFINER` Postgres function

Don't implement the check-then-insert as two round trips from application
code, even inside a Supabase transaction helper — do it as one RPC call so
the row lock is held for the shortest possible time and there's exactly one
code path to audit:

```sql
create or replace function start_agent_run(
  p_user_id uuid,
  p_prompt text,
  p_max_iter integer,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
as $$
declare
  v_period record;
  v_run_id uuid;
begin
  -- Lock the current usage_periods row for this user so a concurrent
  -- call blocks here, not after both have read a stale count.
  select * into v_period
    from usage_periods
    where user_id = p_user_id
      and period_start <= now() and period_end > now()
    for update;

  if v_period is null then
    raise exception 'no active usage period for user %', p_user_id;
  end if;

  if v_period.uses_consumed >= v_period.uses_allowed then
    raise exception 'quota_exceeded';
  end if;

  update usage_periods
    set uses_consumed = uses_consumed + 1
    where id = v_period.id;

  insert into agent_runs (user_id, usage_period_id, prompt, max_iter, idempotency_key, status)
    values (p_user_id, v_period.id, p_prompt, p_max_iter, p_idempotency_key, 'queued')
    returning id into v_run_id;

  insert into usage_events (user_id, usage_period_id, agent_run_id, kind, reason)
    values (p_user_id, v_period.id, v_run_id, 'consume', 'run_started');

  return v_run_id;
exception
  when unique_violation then
    -- idempotency_key collision: a retried request, not a new run.
    -- Return the existing row's id instead of erroring the user's screen.
    select id into v_run_id from agent_runs where idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;
```

Call this from the Next.js API route via `supabase.rpc("start_agent_run",
{...})` — the client never touches `usage_periods` or `agent_runs` directly
for the write path (RLS on those tables has no client insert policy for
exactly this reason; see `.claude/skills/supabase-rls.md`).

## Refunds (system-caused failure)

Mirror pattern, called by the worker (service role) when a run fails for a
reason that isn't the user's fault:

```sql
create or replace function refund_agent_run(p_run_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_run record;
begin
  select * into v_run from agent_runs where id = p_run_id for update;
  if v_run.refunded then
    return; -- already refunded, idempotent no-op
  end if;

  update usage_periods set uses_consumed = uses_consumed - 1
    where id = v_run.usage_period_id;
  update agent_runs set refunded = true where id = p_run_id;
  insert into usage_events (user_id, usage_period_id, agent_run_id, kind, reason)
    values (v_run.user_id, v_run.usage_period_id, p_run_id, 'refund', p_reason);
end;
$$;
```

The `if v_run.refunded then return` guard is what keeps this idempotent if
the worker's failure-handling path ever runs twice for the same run — don't
drop it as "unnecessary."

## What counts as refundable

Per `CLAUDE.md`: system-caused failures (crash, timeout, infra error)
refund; user-caused invalid input may not. That distinction has to be a
real classification in the worker's error handling, not a guess after the
fact — when writing the worker's failure path, be explicit about which
`reason` string maps to "call `refund_agent_run`" and which doesn't, and
keep that mapping in one place rather than scattered through the code.
