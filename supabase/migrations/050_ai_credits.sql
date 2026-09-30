-- ============================================================================
-- 050 — AI credits: lots, an append-only ledger, and usage events (Phase 22)
-- ============================================================================
-- Additive. School-owned AI credits, with three properties that matter more than
-- the schema itself.
--
-- 1. THE LEDGER IS APPEND-ONLY
--    A credit balance that can be edited is a balance nobody can defend. The
--    ledger records every movement and a trigger refuses UPDATE, so the history
--    of who spent what cannot be rewritten. DELETE is left alone deliberately:
--    cascading from a deleted school must still work, and RLS already limits who
--    can delete at all — the same reasoning as the attempt-snapshot trigger in
--    migration 046.
--
-- 2. CREDITS EXPIRE BY LOT, NOT BY BALANCE
--    "500 credits, 100 of them expire in March" cannot be answered from a single
--    balance. Each grant or purchase is a LOT with its own remaining amount and
--    its own expiry, and spending draws from the lot that expires soonest. That
--    is what makes promotional credits expire correctly WITHOUT clawing back
--    credits a school bought.
--
-- 3. EXPIRY IS LAZY, NOT SCHEDULED
--    Expiry runs when a school's credits are next touched, not on a cron. Supabase
--    Free tier is the target, and a background worker is exactly the kind of
--    infrastructure we are trying not to add. The cost is that an expired lot can
--    sit marked as remaining until someone looks; the balance function expires it
--    before reporting, so no caller can ever spend it.
--
-- ACCESS: credits are school data, so these tables DO carry school_id and DO get
-- policies (the isolation ratchet would fail otherwise). Staff may READ their
-- school's credits and usage. Nothing a tenant token can write: granting,
-- spending and refunding are service-role operations that pass through
-- `src/lib/ai/credits.ts`, which is the only place that may move a balance.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Lots — where credits come from
-- ----------------------------------------------------------------------------
create table if not exists public.ai_credit_lots (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  source      text not null check (source in ('grant','purchase','refund','adjustment')),
  amount      numeric(14,4) not null check (amount > 0),
  remaining   numeric(14,4) not null check (remaining >= 0),
  -- NULL means the lot never expires (a purchase, typically).
  expires_at  timestamptz,
  reference   text,                       -- payment id, promotion code, ...
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint ai_lot_remaining_within_amount check (remaining <= amount)
);

-- Spending looks for lots that still have credit, soonest expiry first.
create index if not exists idx_ai_credit_lots_spendable
  on public.ai_credit_lots (school_id, expires_at nulls last)
  where remaining > 0;


-- ----------------------------------------------------------------------------
-- 2. Ledger — every movement, append-only
-- ----------------------------------------------------------------------------
create table if not exists public.ai_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  lot_id     uuid references public.ai_credit_lots(id) on delete set null,
  kind       text not null
             check (kind in ('grant','purchase','usage','expiry','refund','adjustment')),
  -- Signed: positive adds credit, negative removes it.
  delta      numeric(14,4) not null,
  reason     text,
  actor_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_credit_ledger_school_time
  on public.ai_credit_ledger (school_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 3. Usage events — one row per AI call, also append-only
-- ----------------------------------------------------------------------------
-- Separate from the ledger on purpose: the ledger is about MONEY (credits in and
-- out), this is about WORK (what was asked of which provider, and what happened).
-- Mixing them would make both harder to read and impossible to aggregate cleanly.
create table if not exists public.ai_usage_events (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  feature          text,                       -- 'question_generation', ...
  capability       text not null,
  provider_name    text,
  model            text,
  status           text not null
                   check (status in ('success','failed','refused_no_credits','refused_disabled')),
  input_units      integer,
  output_units     integer,
  credits_charged  numeric(14,4) not null default 0,
  latency_ms       integer,
  error            text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_school_time
  on public.ai_usage_events (school_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 4. Append-only guard (UPDATE only — see the header for why DELETE is left)
-- ----------------------------------------------------------------------------
create or replace function public.ai_block_ledger_update()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'The AI credit ledger is append-only. A balance that can be edited cannot be '
    'reconciled, so corrections are recorded as new entries (kind = ''adjustment'') '
    'rather than by rewriting history.';
end;
$$;

drop trigger if exists ai_no_update_ledger on public.ai_credit_ledger;
create trigger ai_no_update_ledger
  before update on public.ai_credit_ledger
  for each row execute function public.ai_block_ledger_update();

create or replace function public.ai_block_usage_update()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'AI usage records are append-only. What a provider was asked and what it '
    'returned must stay as it happened.';
end;
$$;

drop trigger if exists ai_no_update_usage on public.ai_usage_events;
create trigger ai_no_update_usage
  before update on public.ai_usage_events
  for each row execute function public.ai_block_usage_update();


-- ----------------------------------------------------------------------------
-- 5. Balance — derived, never stored
-- ----------------------------------------------------------------------------
-- A STORED balance is a number that can drift from the ledger that explains it.
-- This view is computed, so it cannot disagree with the lots it summarises.
--
-- security_invoker IS LOAD-BEARING. A PostgreSQL view runs with the privileges of
-- its OWNER by default, which would bypass RLS on ai_credit_lots entirely and
-- let any tenant read every school's balance through it. Setting
-- security_invoker = true makes the view run as the CALLER, so the underlying
-- policies apply. This is one of the classic ways a careful schema is undone by
-- a convenience view.
create or replace view public.ai_credit_balances
with (security_invoker = true)
as
select
  school_id,
  coalesce(sum(remaining) filter (where expires_at is null or expires_at > now()), 0) as balance,
  coalesce(sum(remaining) filter (where expires_at is not null and expires_at > now()), 0)
    as promotional_balance,
  -- The next lot to lapse, so a school can be warned before credit disappears.
  min(expires_at) filter (where remaining > 0 and expires_at is not null and expires_at > now())
    as next_expiry,
  -- Credit already past its date but not yet swept: reporting-only.
  coalesce(sum(remaining) filter (where expires_at is not null and expires_at <= now()), 0)
    as lapsed_unswept
from public.ai_credit_lots
group by school_id;


-- ----------------------------------------------------------------------------
-- 6. RLS — tenants read their own credits; only the server moves them
-- ----------------------------------------------------------------------------
alter table public.ai_credit_lots   enable row level security;
alter table public.ai_credit_ledger enable row level security;
alter table public.ai_usage_events  enable row level security;

do $$
declare
  t text;
  staff text := '((school_id = ((auth.jwt() ->> ''school_id''::text))::uuid) '
             || 'AND ((auth.jwt() ->> ''app_role''::text) = ANY (ARRAY[''teacher'',''school_admin''])))';
begin
  foreach t in array array['ai_credit_lots','ai_credit_ledger','ai_usage_events']
  loop
    execute format('drop policy if exists ai_staff_select_%1$s on public.%1$I', t);
    -- SELECT only. No INSERT/UPDATE/DELETE policy exists for a tenant, so a
    -- tenant-scoped token cannot move a balance even if a route were written
    -- carelessly. The append-only triggers then stop anyone else rewriting it.
    execute format(
      'create policy ai_staff_select_%1$s on public.%1$I for select using (%2$s or is_super_admin())',
      t, staff);
  end loop;
end $$;
