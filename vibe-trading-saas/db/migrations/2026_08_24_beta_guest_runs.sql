-- 2026_08_24_beta_guest_runs.sql (part 2 of the beta guest pipeline)
--
-- Beta guests have a real auth.uid() (anonymous sign-in) but no subscription
-- and no BYOK key. The run RPCs gate on both, so guests get
-- 'no_active_subscription' / 'no_api_key'. During open beta we relax BOTH
-- gates for anonymous users only — real (non-anonymous) accounts keep every
-- existing gate. Quota + 30-runs/hour rate limit still apply to guests.
--
-- Guest provider resolution: resolve_run_prefs returns NULL for guests (no
-- user_api_keys row). We add an anonymous fallback to the platform default
-- provider (deepseek) so runs route through the normal worker path.
-- NOTE: this means beta guest runs consume the PLATFORM's DeepSeek key —
-- bounded by the 30/hour rate limit. Revisit before scaling beta.

-- ── start_agent_run: anon bypass for subscription + key gates ───────────────
create or replace function public.start_agent_run(
  p_prompt          text,
  p_max_iter        integer,
  p_idempotency_key text,
  p_attachments     jsonb default '[]'::jsonb
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_user_id   uuid := auth.uid();
  v_is_anon   boolean;
  v_run_id    uuid;
  v_run_count integer;
  v_provider  text;
  v_model     text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select coalesce(u.is_anonymous, false) into v_is_anon
    from auth.users u where u.id = v_user_id;

  -- Subscription gate: anonymous (beta guest) users bypass; everyone else
  -- needs an active/trialing subscription exactly as before.
  if not v_is_anon then
    if not exists (
      select 1 from public.subscriptions
      where user_id = v_user_id and status in ('active', 'trialing')
    ) then
      raise exception 'no_active_subscription' using errcode = 'P0001';
    end if;
  end if;

  -- BYOK gate: resolve configured provider (+ model pin). Guests fall back
  -- to the first enabled key-type provider in catalog order, and the run is
  -- ATTRIBUTED TO THE PLATFORM SERVICE ACCOUNT so the worker's key lookup
  -- (on the run owner) finds the platform Vault credential. Rate limiting
  -- still keys on the real caller; RLS keeps guest runs invisible to others.
  select r.provider, r.model into v_provider, v_model
    from public.resolve_run_prefs(v_user_id) r;
  v_run_owner := v_user_id;
  if v_is_anon then
    v_run_owner := '00000000-0000-4000-8000-000000000001'; -- platform-runner
    if v_provider is null then
      select c.name into v_provider
        from public.llm_provider_catalog c
        where c.enabled and c.provider_type = 'key'
        order by c.sort_order, c.name
        limit 1;
      v_model := null; -- provider's catalog default_model applies
    end if;
  end if;
  if v_provider is null then
    raise exception 'no_api_key' using errcode = 'P0001';
  end if;

  -- Rate limit unchanged: applies to guests AND paying users alike.
  select count(*) into v_run_count
    from public.agent_runs
    where user_id = v_user_id
      and created_at > now() - interval '1 hour'
      and idempotency_key is distinct from p_idempotency_key;
  if v_run_count >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'attachments must be a JSON array' using errcode = '22023';
  end if;

  insert into public.agent_runs
    (user_id, usage_period_id, prompt, max_iter, idempotency_key, status,
     kind, attachments, provider, model)
    values
    (v_run_owner, null, p_prompt, p_max_iter, p_idempotency_key, 'queued',
     'single', p_attachments, v_provider, v_model)
    returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    select id into v_run_id from public.agent_runs
      where user_id = v_run_owner and idempotency_key = p_idempotency_key;
    return v_run_id;
end;
$$;

revoke execute on function public.start_agent_run(text,integer,text,jsonb) from public;
grant execute on function public.start_agent_run(text,integer,text,jsonb)
  to authenticated, anon;

comment on function public.start_agent_run(text,integer,text,jsonb) is
  'Queue an agent run. OPEN BETA: anonymous (guest) users bypass the
   subscription + BYOK gates and fall back to the platform default provider;
   the 30-runs/hour rate limit still applies to everyone. Non-anonymous
   accounts keep the full gates.';
