-- Giveaways, REVIEW BEFORE DEPLOYMENT.
--
-- Two findings shaped every decision below, and both are load-bearing.
--
-- 1. ZAMBIAN LAW. The Lotteries Act (Cap 163) defines a lottery as a scheme
--    where prizes go to holders of "tickets or chances acquired by prior
--    payment". An unauthorised lottery is an offence. A giveaway that nobody
--    pays to enter therefore falls outside that definition — but only for as
--    long as it is genuinely free.
--
--    So this schema has no price column, no paid-entry column and no paid
--    spins, and there is nowhere to add one through the admin screens. That
--    is deliberate. The moment entry costs anything the whole thing becomes
--    a different legal animal, and the safest design is one where that
--    cannot be switched on by accident.
--
-- 2. META'S RULES. Promotions on Facebook and Instagram may not require
--    people to share to their own timeline or tag friends to enter.
--    Commenting is allowed. So entry happens here, on ZaMarket, through a
--    verified account — and social actions are encouragement with a link,
--    never a requirement and never "verified" by us, because we have no
--    honest way to check them.
--
-- Neither point is legal advice. A Zambian lawyer should see the terms
-- before the first campaign goes public.

create table if not exists public.giveaway_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title text not null check (length(trim(title)) between 3 and 140),
  description text not null default '' check (length(description) <= 4000),
  -- The prize is a real listing, so the photograph and the value shown to
  -- entrants are the ones on the actual product page.
  product_id uuid references public.products(id) on delete set null,
  prize_text text not null default '' check (length(prize_text) <= 200),
  prize_value numeric check (prize_value is null or prize_value >= 0),
  winners int not null default 1 check (winners between 1 and 20),
  -- A vendor may run their own; null means the marketplace is running it.
  vendor_id uuid references public.vendors(id) on delete cascade,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft','scheduled','live','closed','drawn','fulfilled','cancelled')),
  terms text not null default '' check (length(terms) <= 8000),
  min_age int not null default 18 check (min_age between 0 and 25),
  area text not null default 'Zambia' check (length(area) <= 120),
  -- Who pays for the prize and the delivery, recorded so it is never a
  -- disagreement after the draw.
  prize_paid_by text not null default 'marketplace' check (prize_paid_by in ('marketplace','vendor','shared')),
  -- Entry is free. Always. Kept as a constrained column rather than left
  -- implicit so that a future change has to argue with this line.
  entry_cost numeric not null default 0 check (entry_cost = 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);
create index if not exists giveaway_campaigns_status_idx on public.giveaway_campaigns(status, closes_at desc);

create table if not exists public.giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- A display name for the wheel that is not the person's full identity.
  display_name text not null default '' check (length(display_name) <= 60),
  eligible boolean not null default true,
  disqualified_reason text check (disqualified_reason is null or length(disqualified_reason) <= 300),
  created_at timestamptz not null default now(),
  -- One entry per person per campaign, enforced by the database rather than
  -- by the screen, because the screen is not where cheating happens.
  unique (campaign_id, user_id)
);
create index if not exists giveaway_entries_campaign_idx on public.giveaway_entries(campaign_id);

-- The draw. One row per campaign, created once and never rewritten.
create table if not exists public.giveaway_draws (
  campaign_id uuid primary key references public.giveaway_campaigns(id) on delete cascade,
  entry_count int not null,
  winners jsonb not null default '[]',
  drawn_at timestamptz not null default now(),
  drawn_by uuid references public.profiles(id),
  method text not null default 'gen_random_uuid order'
);

create table if not exists public.giveaway_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  entry_id uuid not null references public.giveaway_entries(id) on delete cascade,
  status text not null default 'notified'
    check (status in ('notified','contacted','confirmed','delivered','forfeited')),
  note text not null default '' check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  unique (campaign_id, entry_id)
);

alter table public.giveaway_campaigns enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_draws enable row level security;
alter table public.giveaway_claims enable row level security;

-- Anyone may read a campaign that is actually running or finished. Drafts
-- stay invisible.
drop policy if exists giveaway_public_read on public.giveaway_campaigns;
create policy giveaway_public_read on public.giveaway_campaigns for select to anon, authenticated
  using (status in ('live','closed','drawn','fulfilled'));

drop policy if exists giveaway_staff_all on public.giveaway_campaigns;
create policy giveaway_staff_all on public.giveaway_campaigns for all to authenticated
  using (is_staff() or can_market() or vendor_id = my_vendor_id())
  with check (is_staff() or can_market() or vendor_id = my_vendor_id());

-- An entrant sees their own entry and nothing about anybody else. Staff see
-- all of them. Nobody else can read the list — it is a list of real people
-- who entered a competition, not public data.
drop policy if exists giveaway_entry_own on public.giveaway_entries;
create policy giveaway_entry_own on public.giveaway_entries for select to authenticated
  using (user_id = auth.uid() or is_staff() or can_market());

drop policy if exists giveaway_entry_insert on public.giveaway_entries;
create policy giveaway_entry_insert on public.giveaway_entries for insert to authenticated
  with check (false);   -- entry goes through enter_giveaway() only

drop policy if exists giveaway_entry_staff on public.giveaway_entries;
create policy giveaway_entry_staff on public.giveaway_entries for update to authenticated
  using (is_staff() or can_market()) with check (is_staff() or can_market());

-- The result is public once it exists. That is the point of a public draw.
drop policy if exists giveaway_draw_read on public.giveaway_draws;
create policy giveaway_draw_read on public.giveaway_draws for select to anon, authenticated using (true);

drop policy if exists giveaway_claim_staff on public.giveaway_claims;
create policy giveaway_claim_staff on public.giveaway_claims for all to authenticated
  using (is_staff() or can_market()) with check (is_staff() or can_market());

revoke all on public.giveaway_entries, public.giveaway_claims from anon;
grant select on public.giveaway_campaigns, public.giveaway_draws to anon, authenticated;
grant select, update on public.giveaway_entries to authenticated;
grant insert, update, delete on public.giveaway_campaigns to authenticated;
grant select, insert, update on public.giveaway_claims to authenticated;

-- Enter. The only way an entry is ever created.
create or replace function public.enter_giveaway(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; me uuid := auth.uid(); nm text; existing uuid;
begin
  if me is null then raise exception 'Sign in to enter'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if c.status <> 'live' then raise exception 'This giveaway is not open'; end if;
  if now() < c.opens_at then raise exception 'This giveaway has not started'; end if;
  if now() > c.closes_at then raise exception 'Entries have closed'; end if;

  select id into existing from giveaway_entries where campaign_id = c.id and user_id = me;
  if existing is not null then return jsonb_build_object('entered', true, 'already', true); end if;

  -- A first name and the first letter of the surname. Never a phone number,
  -- an email address or a full name on a public wheel.
  select trim(split_part(coalesce(full_name, 'Entrant'), ' ', 1)
         || case when position(' ' in coalesce(full_name, '')) > 0
                 then ' ' || upper(left(split_part(full_name, ' ', 2), 1)) || '.'
                 else '' end)
    into nm from profiles where id = me;

  insert into giveaway_entries (campaign_id, user_id, display_name)
  values (c.id, me, coalesce(nullif(nm, ''), 'Entrant'));
  return jsonb_build_object('entered', true, 'already', false);
end $$;

-- Draw the winners.
--
-- The result is decided HERE, by the database, before any wheel spins. The
-- animation on screen is told who won and spins to that answer. An admin
-- cannot choose the winner, and running this twice cannot change it: the
-- draw row is written once and every later call returns the same result.
create or replace function public.draw_giveaway(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; existing giveaway_draws%rowtype;
        picked jsonb; total int;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;

  select * into existing from giveaway_draws where campaign_id = c.id;
  if found then
    return jsonb_build_object('winners', existing.winners, 'entry_count', existing.entry_count,
                              'drawn_at', existing.drawn_at, 'repeat', true);
  end if;

  if now() <= c.closes_at then raise exception 'Wait until entries have closed'; end if;

  select count(*) into total from giveaway_entries where campaign_id = c.id and eligible;
  if total = 0 then raise exception 'Nobody entered'; end if;

  -- gen_random_uuid() is cryptographically random, so ordering by it gives a
  -- fair shuffle that nobody — including whoever runs this — can predict or
  -- steer.
  select jsonb_agg(jsonb_build_object('entry_id', e.id, 'name', e.display_name))
    into picked
    from (select id, display_name from giveaway_entries
           where campaign_id = c.id and eligible
           order by gen_random_uuid() limit c.winners) e;

  insert into giveaway_draws (campaign_id, entry_count, winners, drawn_by)
  values (c.id, total, coalesce(picked, '[]'::jsonb), auth.uid());

  update giveaway_campaigns set status = 'drawn' where id = c.id;

  insert into giveaway_claims (campaign_id, entry_id)
  select c.id, (w->>'entry_id')::uuid from jsonb_array_elements(coalesce(picked, '[]'::jsonb)) w
  on conflict do nothing;

  return jsonb_build_object('winners', picked, 'entry_count', total, 'repeat', false);
end $$;

-- What a visitor is allowed to see about a campaign: the prize, the counts
-- and the first names on the wheel. No contact details, ever.
create or replace function public.giveaway_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype;
begin
  select * into c from giveaway_campaigns where slug = p_slug
     and status in ('live','closed','drawn','fulfilled');
  if not found then return null; end if;
  select * into d from giveaway_draws where campaign_id = c.id;

  return jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'description', c.description,
    'prize_text', c.prize_text, 'prize_value', c.prize_value,
    'winners', c.winners, 'status', c.status, 'terms', c.terms,
    'area', c.area, 'min_age', c.min_age,
    'opens_at', c.opens_at, 'closes_at', c.closes_at,
    -- Enough to decide whether the thing can actually be sold today. The
    -- prize is sometimes the only one there is, and offering to sell a
    -- second is how you take money for something nobody can deliver.
    'product', (select jsonb_build_object('name', p.name, 'slug', p.slug,
                  'images', p.images, 'price', p.price, 'vendor_slug', v.slug,
                  'vendor_name', v.business_name, 'status', p.status,
                  'fulfilment', p.fulfilment, 'lead_time_days', p.lead_time_days,
                  'stock_available', p.stock_available, 'owner_type', p.owner_type)
                from products p left join vendors v on v.id = p.vendor_id
                where p.id = c.product_id),
    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'mine', (select exists (select 1 from giveaway_entries
               where campaign_id = c.id and user_id = auth.uid())),
    'names', coalesce((select jsonb_agg(x.display_name)
                from (select display_name from giveaway_entries
                       where campaign_id = c.id and eligible
                       order by created_at limit 300) x), '[]'::jsonb),
    'result', case when d.campaign_id is null then null
                   else jsonb_build_object('winners', d.winners, 'drawn_at', d.drawn_at,
                                           'entry_count', d.entry_count) end
  );
end $$;

revoke all on function public.enter_giveaway(text) from public;
revoke all on function public.draw_giveaway(text) from public, anon;
grant execute on function public.enter_giveaway(text) to authenticated;
grant execute on function public.draw_giveaway(text) to authenticated;
grant execute on function public.giveaway_public(text) to anon, authenticated;
