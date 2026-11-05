-- More than one prize in a giveaway.
--
-- A campaign can now have a list of prizes: first prize, second prize, third,
-- and so on, each going to as many winners as you choose. Two people can win
-- the same cake while a third wins cupcakes and a fourth wins the fryer.
--
-- A campaign with no prize rows behaves exactly as it did before — one prize,
-- taken from the campaign's own product_id and winners count — so nothing
-- that already exists has to change.
--
-- It also fixes a real fault in the referral work. The draw recorded each
-- winner as {entry_id, name} with no user_id, while open_giveaway_referrals
-- excluded winners by user_id. Nothing ever matched, so the winner of the
-- giveaway would also have been handed a referral link and a reward budget.

create table if not exists public.giveaway_prizes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  rank int not null check (rank between 1 and 50),
  product_id uuid references public.products(id),
  prize_text text,
  prize_value numeric check (prize_value is null or prize_value >= 0),
  winners int not null default 1 check (winners between 1 and 500),
  created_at timestamptz not null default now(),
  unique (campaign_id, rank),
  -- A prize is either something in the catalogue or something described.
  constraint giveaway_prizes_has_something check (product_id is not null or nullif(btrim(prize_text), '') is not null)
);
create index if not exists giveaway_prizes_campaign_idx on public.giveaway_prizes(campaign_id, rank);

-- How many people this campaign will draw, whichever way it is set up.
create or replace function public.giveaway_winner_count(p_campaign uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select sum(winners) from giveaway_prizes where campaign_id = p_campaign), 0),
    (select greatest(winners, 1) from giveaway_campaigns where id = p_campaign),
    1)::int;
$$;

-- One row per winner to be drawn, in prize order. The draw walks this list.
create or replace function public.giveaway_prize_slots(p_campaign uuid)
returns table (rn bigint, rank int, product_id uuid, prize_text text, prize_value numeric)
language sql stable security definer set search_path = public as $$
  with listed as (
    select p.rank, p.product_id, p.prize_text, p.prize_value, g.i
      from giveaway_prizes p
      cross join lateral generate_series(1, p.winners) g(i)
     where p.campaign_id = p_campaign
  ),
  fallback as (
    -- No prize list: the campaign's own single prize, repeated.
    select 1 as rank, c.product_id, c.prize_text, c.prize_value, g.i
      from giveaway_campaigns c
      cross join lateral generate_series(1, greatest(c.winners, 1)) g(i)
     where c.id = p_campaign
       and not exists (select 1 from giveaway_prizes where campaign_id = p_campaign)
  ),
  all_slots as (select * from listed union all select * from fallback)
  select row_number() over (order by rank, i) as rn, rank, product_id, prize_text, prize_value
    from all_slots;
$$;

-- Staff edit the prize list through these, so the table keeps its shape.
create or replace function public.set_giveaway_prize(
  p_slug text, p_rank int, p_product uuid default null,
  p_text text default null, p_winners int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; pr products%rowtype;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;
  if exists (select 1 from giveaway_draws where campaign_id = c.id) then
    raise exception 'This giveaway has already been drawn — the prizes cannot change now';
  end if;
  if p_product is null and nullif(btrim(coalesce(p_text, '')), '') is null then
    raise exception 'Choose a product or describe the prize';
  end if;
  if coalesce(p_winners, 1) < 1 then raise exception 'A prize needs at least one winner'; end if;

  if p_product is not null then
    select * into pr from products where id = p_product;
    if not found then raise exception 'No such product'; end if;
  end if;

  insert into giveaway_prizes (campaign_id, rank, product_id, prize_text, prize_value, winners)
  values (c.id, p_rank, p_product, nullif(btrim(coalesce(p_text, '')), ''),
          coalesce(pr.price, null), coalesce(p_winners, 1))
  on conflict (campaign_id, rank) do update
    set product_id = excluded.product_id, prize_text = excluded.prize_text,
        prize_value = excluded.prize_value, winners = excluded.winners;

  -- Keep the campaign's own count in step, so anything still reading it is right.
  update giveaway_campaigns set winners = giveaway_winner_count(c.id) where id = c.id;
  return jsonb_build_object('prizes', (select count(*) from giveaway_prizes where campaign_id = c.id),
                            'winners', giveaway_winner_count(c.id));
end $$;

create or replace function public.remove_giveaway_prize(p_slug text, p_rank int)
returns void language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if exists (select 1 from giveaway_draws where campaign_id = c.id) then
    raise exception 'This giveaway has already been drawn — the prizes cannot change now';
  end if;
  delete from giveaway_prizes where campaign_id = c.id and rank = p_rank;
  update giveaway_campaigns set winners = giveaway_winner_count(c.id) where id = c.id;
end $$;

-- --------------------------------------------------------------- the draw

create or replace function public.draw_giveaway(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; existing giveaway_draws%rowtype;
        picked jsonb; total int; want int;
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

  want := giveaway_winner_count(c.id);

  -- gen_random_uuid() is cryptographically random, so ordering by it gives a
  -- fair shuffle nobody — including whoever presses the button — can predict
  -- or steer. Winners are then handed the prizes in rank order: the first
  -- name drawn takes first prize, and so on down the list.
  --
  -- user_id is recorded as well as entry_id. Without it nothing downstream
  -- can tell a winner from a non-winner, which is how the winner of the
  -- giveaway ended up being offered non-winner referral rewards as well.
  with chosen as (
    select s.id, s.display_name, s.user_id, row_number() over () as rn
      from (select id, display_name, user_id
              from giveaway_entries
             where campaign_id = c.id and eligible
             order by gen_random_uuid()
             limit want) s
  )
  select jsonb_agg(jsonb_build_object(
           'entry_id', ch.id,
           'user_id', ch.user_id,
           'name', ch.display_name,
           'prize_rank', sl.rank,
           'prize', coalesce(pr.name, sl.prize_text),
           'prize_value', coalesce(sl.prize_value, pr.price)
         ) order by sl.rank, ch.rn)
    into picked
    from chosen ch
    join giveaway_prize_slots(c.id) sl on sl.rn = ch.rn
    left join products pr on pr.id = sl.product_id;

  insert into giveaway_draws (campaign_id, entry_count, winners, drawn_by)
  values (c.id, total, coalesce(picked, '[]'::jsonb), auth.uid());

  update giveaway_campaigns set status = 'drawn' where id = c.id;

  insert into giveaway_claims (campaign_id, entry_id)
  select c.id, (w->>'entry_id')::uuid from jsonb_array_elements(coalesce(picked, '[]'::jsonb)) w
  on conflict do nothing;

  return jsonb_build_object('winners', picked, 'entry_count', total, 'repeat', false);
end $$;

-- ------------------------------------------------- holding every prize back

create or replace function public.reserve_giveaway_prize(p_slug text, p_hold boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; p products%rowtype;
        row_ record; want int; got int; held int := 0; shortfall int := 0;
        notes jsonb := '[]'::jsonb; moved int;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;

  if not p_hold then
    -- Giving it all back: only what this campaign actually took, per product.
    for row_ in
      select m.product_id,
             sum(case when m.type = 'reserve' then m.quantity else -m.quantity end) as net
        from inventory_movements m
       where m.reference_type = 'giveaway' and m.reference_id = c.id
         and m.type in ('reserve', 'release')
       group by m.product_id
    loop
      if row_.net > 0 then
        perform apply_movement(row_.product_id, 'release', row_.net,
          'Giveaway ' || c.slug || ' ended', 'giveaway', c.id);
        held := held + row_.net;
      end if;
    end loop;
    return jsonb_build_object('released', held);
  end if;

  -- One pass per prize, because a campaign can now hand out several different
  -- things and each needs its own count held back.
  for row_ in
    select sl.product_id, count(*)::int as needed
      from giveaway_prize_slots(c.id) sl
     where sl.product_id is not null
     group by sl.product_id
  loop
    select * into p from products where id = row_.product_id for update;
    if not found then
      notes := notes || jsonb_build_array(jsonb_build_object('why', 'product gone'));
      continue;
    end if;
    -- Made to order and services are made on request: there is nothing on a
    -- shelf to hold, and holding would wrongly block real orders.
    if p.fulfilment <> 'in_stock' then
      notes := notes || jsonb_build_array(jsonb_build_object('product', p.name, 'why', 'made to order'));
      continue;
    end if;
    if not (p.owner_type = 'founder' or p.tracks_stock) then
      notes := notes || jsonb_build_array(jsonb_build_object('product', p.name, 'why', 'this seller does not count stock'));
      continue;
    end if;

    want := row_.needed;
    got := least(want, greatest(p.stock_available, 0));
    if got > 0 then
      perform apply_movement(p.id, 'reserve', got,
        'Held for giveaway ' || c.slug, 'giveaway', c.id);
      held := held + got;
    end if;
    if want > got then
      shortfall := shortfall + (want - got);
      notes := notes || jsonb_build_array(jsonb_build_object(
        'product', p.name, 'wanted', want, 'held', got, 'why', 'not enough in stock'));
    end if;
  end loop;

  return jsonb_build_object('held', held, 'short', shortfall, 'notes', notes);
end $$;

-- ------------------------------------------------ what the public page sees

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
    'winners', giveaway_winner_count(c.id), 'status', c.status, 'terms', c.terms,
    'area', c.area, 'min_age', c.min_age,
    'opens_at', c.opens_at, 'closes_at', c.closes_at,
    -- The headline prize: the first one on the list, or the campaign's own.
    -- Enough to decide whether the thing can actually be sold today, because
    -- a prize is sometimes the only one there is and offering to sell a
    -- second is how you take money for something nobody can deliver.
    'product', (select jsonb_build_object('name', p.name, 'slug', p.slug,
                  'images', p.images, 'price', p.price, 'vendor_slug', v.slug,
                  'vendor_name', v.business_name, 'status', p.status,
                  'fulfilment', p.fulfilment, 'lead_time_days', p.lead_time_days,
                  'stock_available', p.stock_available, 'owner_type', p.owner_type)
                from products p left join vendors v on v.id = p.vendor_id
                where p.id = coalesce(
                  (select gp.product_id from giveaway_prizes gp
                    where gp.campaign_id = c.id and gp.product_id is not null
                    order by gp.rank limit 1),
                  c.product_id)),
    -- The whole list, so the page can show first, second and third prize.
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', gp.rank, 'winners', gp.winners,
               'name', coalesce(p.name, gp.prize_text),
               'slug', p.slug, 'images', p.images,
               'value', coalesce(gp.prize_value, p.price),
               'vendor_name', v.business_name)
             order by gp.rank)
        from giveaway_prizes gp
        left join products p on p.id = gp.product_id
        left join vendors v on v.id = p.vendor_id
       where gp.campaign_id = c.id), '[]'::jsonb),
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

-- ------------------------------- winners must not also be offered referrals

-- Matching on entry_id as well as user_id, so an older draw recorded without
-- user_id still excludes its winner correctly.
create or replace function public.open_giveaway_referrals(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype; made int := 0; ends timestamptz;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;
  select * into d from giveaway_draws where campaign_id = c.id;
  if not found then raise exception 'Draw the winners first'; end if;
  if c.referral_reward <= 0 then raise exception 'Set the referral reward first'; end if;
  if not exists (select 1 from giveaway_reward_products where campaign_id = c.id) then
    raise exception 'Choose at least one product people may promote';
  end if;

  if c.referral_opens_at is null then
    ends := now() + (c.referral_days || ' days')::interval;
    update giveaway_campaigns set referral_opens_at = now(), referral_closes_at = ends where id = c.id;
  else
    ends := c.referral_closes_at;
  end if;

  insert into promo_referrers (campaign_id, user_id, code, opens_at, expires_at)
  select c.id, e.user_id,
         'G' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)),
         coalesce(c.referral_opens_at, now()), ends
    from giveaway_entries e
   where e.campaign_id = c.id
     and e.eligible
     and e.user_id is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(d.winners, '[]'::jsonb)) w
        where (w->>'user_id') is not null and (w->>'user_id')::uuid = e.user_id)
     and not exists (
       select 1 from jsonb_array_elements(coalesce(d.winners, '[]'::jsonb)) w
        where (w->>'entry_id') is not null and (w->>'entry_id')::uuid = e.id)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics made = row_count;

  perform log_audit('giveaway.referrals_opened', 'giveaway_campaigns', c.id, null,
                    jsonb_build_object('invited', made, 'closes_at', ends), null);
  return jsonb_build_object('invited', made, 'closes_at', ends);
end $$;

-- ------------------------------------------------------------ permissions

alter table public.giveaway_prizes enable row level security;
drop policy if exists giveaway_prizes_read on public.giveaway_prizes;
create policy giveaway_prizes_read on public.giveaway_prizes for select to anon, authenticated using (true);
revoke all on public.giveaway_prizes from anon, authenticated;
grant select on public.giveaway_prizes to anon, authenticated;

revoke all on function public.set_giveaway_prize(text, int, uuid, text, int) from public, anon;
revoke all on function public.remove_giveaway_prize(text, int) from public, anon;
grant execute on function public.set_giveaway_prize(text, int, uuid, text, int) to authenticated;
grant execute on function public.remove_giveaway_prize(text, int) to authenticated;
grant execute on function public.giveaway_winner_count(uuid) to authenticated;
grant execute on function public.giveaway_prize_slots(uuid) to authenticated;
