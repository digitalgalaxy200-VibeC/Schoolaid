-- ============================================================================
-- 051 — AI credit operations as database functions (Phase 22)
-- ============================================================================
-- Additive. Grants, spending and expiry become single Postgres functions.
--
-- WHY THIS IS NOT DONE IN TYPESCRIPT
-- ----------------------------------
-- Spending credits is a read-then-write: find lots with credit, then decrement
-- them. Two AI calls for the same school arriving together would both read the
-- same balance and both succeed — the school gets two answers and pays once. A
-- balance is money; it cannot be settled with a check the application performs a
-- moment before the write.
--
-- Each function below is a single statement to the database, so the row locks it
-- takes hold for its whole duration. Two concurrent charges serialise instead of
-- racing.
--
-- WHY THEY ARE SECURITY DEFINER, AND LOCKED DOWN
-- ----------------------------------------------
-- They must write to tables that a tenant token has no write policy for. Running
-- as the caller would simply fail. So they are SECURITY DEFINER — which means if
-- they were callable, a tenant could spend credits directly through the RPC
-- endpoint.
--
-- So EXECUTE IS REVOKED FROM EVERYTHING AND GRANTED ONLY TO service_role:
--
--     revoke ... from public, anon, authenticated
--     grant  ... to service_role
--
-- A student token attempting to call charge_ai_credits gets a permission error,
-- not a balance change. The application is the only caller, and the application
-- is the server.
--
-- `set search_path = public, pg_temp` is not decoration either: a SECURITY
-- DEFINER function without it can be hijacked by an object placed earlier in an
-- attacker-controlled search_path.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Grant credits — creates a lot AND its ledger entry together
-- ----------------------------------------------------------------------------
create or replace function public.grant_ai_credits(
  p_school_id  uuid,
  p_amount     numeric,
  p_source     text default 'grant',       -- 'grant' | 'purchase' | 'adjustment' | 'refund'
  p_expires_at timestamptz default null,
  p_reference  text default null,
  p_note       text default null,
  p_actor_id   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lot_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'A credit grant must be a positive amount';
  end if;

  if p_source not in ('grant','purchase','adjustment','refund') then
    raise exception 'Unsupported credit source: %', p_source;
  end if;

  insert into public.ai_credit_lots
    (school_id, source, amount, remaining, expires_at, reference, note, created_by)
  values
    (p_school_id, p_source, p_amount, p_amount, p_expires_at, p_reference, p_note, p_actor_id)
  returning id into v_lot_id;

  insert into public.ai_credit_ledger (school_id, lot_id, kind, delta, reason, actor_id)
  values (p_school_id, v_lot_id, p_source, p_amount, coalesce(p_note, p_reference), p_actor_id);

  return v_lot_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. Sweep lapsed credit — turns past-dated lots into expiry entries
-- ----------------------------------------------------------------------------
-- Separate from charging so it can also run on its own, e.g. before showing a
-- balance. Returns the total lapsed.
-- ----------------------------------------------------------------------------
create or replace function public.sweep_expired_ai_credits(p_school_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_total numeric := 0;
begin
  for r in
    select id, remaining
      from public.ai_credit_lots
     where school_id = p_school_id
       and expires_at is not null
       and expires_at <= now()
       and remaining > 0
     for update
  loop
    update public.ai_credit_lots set remaining = 0 where id = r.id;

    insert into public.ai_credit_ledger (school_id, lot_id, kind, delta, reason)
    values (p_school_id, r.id, 'expiry', -r.remaining, 'Promotional credit reached its expiry date');

    v_total := v_total + r.remaining;
  end loop;

  return v_total;
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. Charge credits — the allocator
-- ----------------------------------------------------------------------------
-- Draws from the lot that expires SOONEST first, and only then from lots that
-- never expire. That ordering is the whole reason lots exist: credit a school
-- was given as a promotion should be used before credit it paid for, and a
-- promotion should be able to lapse without touching a purchase.
--
-- Raises if the balance is short, so the caller cannot half-charge. Callers
-- should check the balance first; this is the backstop.
-- ----------------------------------------------------------------------------
create or replace function public.charge_ai_credits(
  p_school_id uuid,
  p_amount    numeric
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining_to_charge numeric;
  v_available numeric;
  r record;
  v_take numeric;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'A charge must be zero or positive';
  end if;

  if p_amount = 0 then
    return 0;
  end if;

  -- Lapsed credit is not spendable, so settle it before deciding affordability.
  perform public.sweep_expired_ai_credits(p_school_id);

  select coalesce(sum(remaining), 0) into v_available
    from public.ai_credit_lots
   where school_id = p_school_id
     and (expires_at is null or expires_at > now());

  if v_available < p_amount then
    raise exception 'Insufficient AI credits: % available, % required',
      v_available, p_amount;
  end if;

  v_remaining_to_charge := p_amount;

  for r in
    select id, remaining
      from public.ai_credit_lots
     where school_id = p_school_id
       and remaining > 0
       and (expires_at is null or expires_at > now())
     -- soonest expiry first; a lot with no expiry is drawn LAST
     order by expires_at asc nulls last, created_at asc
     for update
  loop
    exit when v_remaining_to_charge <= 0;

    v_take := least(r.remaining, v_remaining_to_charge);

    update public.ai_credit_lots
       set remaining = remaining - v_take
     where id = r.id;

    insert into public.ai_credit_ledger (school_id, lot_id, kind, delta, reason)
    values (p_school_id, r.id, 'usage', -v_take, 'AI usage');

    v_remaining_to_charge := v_remaining_to_charge - v_take;
  end loop;

  return p_amount - v_remaining_to_charge;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Balance — one call, expiry already settled
-- ----------------------------------------------------------------------------
create or replace function public.ai_credit_balance(p_school_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sweep_expired_ai_credits(p_school_id);

  return (
    select coalesce(sum(remaining), 0)
      from public.ai_credit_lots
     where school_id = p_school_id
       and (expires_at is null or expires_at > now())
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- 5. Lock the doors
-- ----------------------------------------------------------------------------
-- Without these, any authenticated caller could POST to the RPC endpoint and
-- spend another school's credits — these functions are SECURITY DEFINER, so they
-- bypass RLS by design and their only remaining guard is EXECUTE privilege.
-- ----------------------------------------------------------------------------
revoke all on function public.grant_ai_credits(uuid, numeric, text, timestamptz, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.sweep_expired_ai_credits(uuid) from public, anon, authenticated;
revoke all on function public.charge_ai_credits(uuid, numeric)   from public, anon, authenticated;
revoke all on function public.ai_credit_balance(uuid)            from public, anon, authenticated;

grant execute on function public.grant_ai_credits(uuid, numeric, text, timestamptz, text, text, uuid)
  to service_role;
grant execute on function public.sweep_expired_ai_credits(uuid) to service_role;
grant execute on function public.charge_ai_credits(uuid, numeric) to service_role;
grant execute on function public.ai_credit_balance(uuid)          to service_role;
