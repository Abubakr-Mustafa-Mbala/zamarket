-- Turning a giveaway into something that pays for itself.
--
-- Three additions, each answering a real gap in the first version:
--
--   1. Consent, recorded properly. An entrant is not a mailing list. Zambia's
--      data protection rules require a lawful basis and a working way out, so
--      the opt-in is separate from entering, starts unticked, and every
--      change is stored with its time and where it came from. Entering a
--      giveaway never subscribes anybody to anything.
--
--   2. Attribution. A campaign already has everything needed to answer "what
--      did it actually produce" — orders carry a source, and the marketplace
--      already understands `campaign:<code>`. The giveaway now uses that, so
--      its orders land in the same reporting as everything else instead of
--      in a parallel system that disagrees with it.
--
--   3. A report that uses the word cost. Entries are not a result. What a
--      campaign is judged on is what it cost against the commission it
--      actually earned, and whether those customers came back.

-- --- consent ---------------------------------------------------------------
create table if not exists public.marketing_consent (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted boolean not null default false,
  channel text not null default 'email' check (channel in ('email','whatsapp','sms','any')),
  source text not null default '' check (length(source) <= 120),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.marketing_consent enable row level security;

drop policy if exists consent_own on public.marketing_consent;
create policy consent_own on public.marketing_consent for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists consent_staff_read on public.marketing_consent;
create policy consent_staff_read on public.marketing_consent for select to authenticated
  using (is_staff() or can_market());

revoke all on public.marketing_consent from anon;
grant select, insert, update on public.marketing_consent to authenticated;

-- Set or withdraw. Withdrawal keeps the row — proof that consent was given
-- and then taken back is the point of the record, and deleting it would
-- destroy the evidence that the withdrawal was honoured.
create or replace function public.set_marketing_consent(p_granted boolean, p_source text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into marketing_consent (user_id, granted, source, granted_at, withdrawn_at)
  values (auth.uid(), p_granted, left(coalesce(p_source, ''), 120),
          case when p_granted then now() end,
          case when not p_granted then now() end)
  on conflict (user_id) do update set
    granted = excluded.granted,
    source = case when excluded.granted then excluded.source else marketing_consent.source end,
    granted_at = case when excluded.granted then now() else marketing_consent.granted_at end,
    withdrawn_at = case when excluded.granted then null else now() end,
    updated_at = now();
end $$;

revoke all on function public.set_marketing_consent(boolean, text) from public, anon;
grant execute on function public.set_marketing_consent(boolean, text) to authenticated;

-- --- what a campaign cost --------------------------------------------------
alter table public.giveaway_campaigns add column if not exists cost_prize numeric not null default 0 check (cost_prize >= 0);
alter table public.giveaway_campaigns add column if not exists cost_delivery numeric not null default 0 check (cost_delivery >= 0);
alter table public.giveaway_campaigns add column if not exists cost_promotion numeric not null default 0 check (cost_promotion >= 0);

-- Entering now records whether the person also opted in, so the opt-in rate
-- of a campaign can be judged without reading anybody's consent record.
alter table public.giveaway_entries add column if not exists opted_in boolean not null default false;

-- --- did it pay for itself -------------------------------------------------
--
-- Orders are matched by the attribution the marketplace already uses:
-- `campaign:<slug>`. Nothing here invents a second definition of a sale.
create or replace function public.giveaway_report(p_slug text, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; tag text; spend numeric; out jsonb;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then return null; end if;

  tag := 'campaign:' || c.slug;
  spend := coalesce(c.cost_prize, 0) + coalesce(c.cost_delivery, 0) + coalesce(c.cost_promotion, 0);

  select jsonb_build_object(
    'slug', c.slug,
    'title', c.title,
    'spend', spend,
    'paid_by', c.prize_paid_by,

    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'opted_in', (select count(*) from giveaway_entries where campaign_id = c.id and opted_in),

    -- Everything the campaign's own link brought in, over the window.
    'orders', (select count(*) from orders o
                where o.source = tag
                  and o.created_at >= c.opens_at
                  and o.created_at <= c.closes_at + make_interval(days => p_days)
                  and o.status not in ('cancelled','fraud_review')),
    'completed', (select count(*) from orders o
                   where o.source = tag and o.status = 'completed'
                     and o.created_at >= c.opens_at
                     and o.created_at <= c.closes_at + make_interval(days => p_days)),
    'sales', (select coalesce(sum(o.total), 0) from orders o
               where o.source = tag and o.status = 'completed'
                 and o.created_at >= c.opens_at
                 and o.created_at <= c.closes_at + make_interval(days => p_days)),

    -- What the marketplace actually keeps. Taken from the settlement records,
    -- which are the real fee figures, rather than from a percentage assumed
    -- here — an assumed rate would quietly disagree with the finance pages.
    'commission', (select coalesce(sum(st.marketplace_fee), 0)
                    from settlements st join orders o on o.id = st.order_id
                   where o.source = tag and o.status = 'completed'
                     and o.created_at >= c.opens_at
                     and o.created_at <= c.closes_at + make_interval(days => p_days)),

    -- People who entered and later bought ANYTHING, however they arrived.
    -- This is the number that says whether a giveaway built customers or
    -- just gathered people who wanted something free.
    --
    -- An order has no account on it — it is placed against a customer record
    -- keyed by phone number — so entrants are matched to orders by the phone
    -- on their profile. Someone who orders with a different number will not
    -- be counted, which makes this a floor rather than an exact figure. A
    -- number that understates is the right way round for deciding whether to
    -- spend money again.
    'entrants_who_bought', (select count(distinct e.user_id)
      from giveaway_entries e
      join profiles pr on pr.id = e.user_id
      where e.campaign_id = c.id
        and nullif(trim(coalesce(pr.phone, '')), '') is not null
        and exists (select 1 from orders o join customers cu on cu.id = o.customer_id
                     where cu.phone = pr.phone and o.status = 'completed'
                       and o.created_at >= c.opens_at)),

    'window_days', p_days
  ) into out;

  return out;
end $$;

revoke all on function public.giveaway_report(text, int) from public, anon;
grant execute on function public.giveaway_report(text, int) to authenticated;
