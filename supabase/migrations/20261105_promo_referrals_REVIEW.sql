-- Giveaway non-winner referral rewards.
--
-- Someone who entered a giveaway and did not win gets a limited window in
-- which they can earn a FIXED amount of kwacha for every qualifying sale they
-- bring, without having to buy anything first or be an approved affiliate.
--
-- The money is the same kind of money an affiliate earns. It is written into
-- the same `commissions` ledger, with the same statuses, the same grace
-- period, the same reversal on a refund and the same payout route. That is
-- deliberate: one ledger means one place where money can go wrong, and the
-- reversal and payout code that already works keeps working.
--
-- What is different from an affiliate:
--   * the amount is a fixed figure the admin sets, not a percentage
--   * it expires
--   * it is capped, per campaign and per person
--   * it is refused outright when the commission on the sale could not pay it

-- ---------------------------------------------------------------- who earns

create table if not exists public.promo_referrers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  code text not null unique,
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);
create index if not exists promo_referrers_code_idx on public.promo_referrers(lower(code));
create index if not exists promo_referrers_user_idx on public.promo_referrers(user_id);

-- --------------------------------------------------- what the campaign pays

alter table public.giveaway_campaigns
  add column if not exists referral_reward numeric not null default 0 check (referral_reward >= 0),
  add column if not exists referral_days int not null default 7 check (referral_days between 1 and 90),
  add column if not exists referral_budget numeric not null default 0 check (referral_budget >= 0),
  add column if not exists referral_max_per_person numeric not null default 0 check (referral_max_per_person >= 0),
  add column if not exists referral_funded_by text not null default 'zamarket'
    check (referral_funded_by in ('zamarket', 'vendor', 'shared')),
  add column if not exists referral_opens_at timestamptz,
  add column if not exists referral_closes_at timestamptz;

-- Which products a non-winner may promote, and what each one pays. A reward
-- is per product because a K15 reward is sensible on a K900 fryer and
-- ruinous on a K22 loaf of bread.
create table if not exists public.giveaway_reward_products (
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  reward numeric not null check (reward > 0),
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (campaign_id, product_id)
);

alter table public.orders add column if not exists promo_referrer_id uuid references public.promo_referrers(id);
create index if not exists orders_promo_referrer_idx on public.orders(promo_referrer_id);

-- ------------------------------------------- the ledger accepts both earners

alter table public.commissions alter column reseller_id drop not null;
alter table public.commissions add column if not exists promo_referrer_id uuid references public.promo_referrers(id);
alter table public.commissions drop constraint if exists commissions_one_earner;
alter table public.commissions add constraint commissions_one_earner check (
  (reseller_id is not null and promo_referrer_id is null)
  or (reseller_id is null and promo_referrer_id is not null)
);
-- One reward per order per referrer, so a retried status change cannot pay twice.
create unique index if not exists commissions_promo_once
  on public.commissions(order_id, promo_referrer_id)
  where promo_referrer_id is not null and order_id is not null;

-- --------------------------------------------------- the affordability rule

-- Can this product pay this reward out of the commission the sale earns?
--
-- At a 10% marketplace fee a K15 reward needs a K150 order to break even.
-- Below that every referral loses money, which is the quiet way a promotion
-- eats a business. When the vendor is funding the reward the marketplace fee
-- is not the constraint, but the vendor's own margin is, so the figure is
-- still reported rather than waved through.
create or replace function public.promo_reward_affordable(p_product uuid, p_reward numeric, p_funded_by text default 'zamarket')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p products%rowtype; v vendors%rowtype; pct numeric; earns numeric;
begin
  select * into p from products where id = p_product;
  if not found then return jsonb_build_object('ok', false, 'reason', 'No such product'); end if;
  if p.owner_type = 'vendor' then
    select * into v from vendors where id = p.vendor_id;
    pct := coalesce(v.fee_pct_override, setting_num('marketplace_fee_pct'));
  else
    -- The marketplace's own stock earns its whole margin, not a fee.
    pct := 100;
  end if;
  earns := round(p.price * pct / 100.0, 2);
  return jsonb_build_object(
    'ok', (p_funded_by <> 'zamarket') or (earns >= p_reward),
    'product', p.name,
    'price', p.price,
    'commission', earns,
    'reward', p_reward,
    'margin', round(earns - p_reward, 2),
    'break_even_price', case when pct > 0 then round(p_reward * 100.0 / pct, 2) else null end,
    'reason', case
      when (p_funded_by <> 'zamarket') or (earns >= p_reward) then null
      else 'This sale earns K' || to_char(earns, 'FM999999990.00') || ' but the reward is K'
           || to_char(p_reward, 'FM999999990.00') || '. Raise the price above K'
           || to_char(round(p_reward * 100.0 / nullif(pct, 0), 2), 'FM999999990.00')
           || ', lower the reward, or have the vendor fund it.' end
  );
end $$;

-- Staff add an eligible product through this, so the guard cannot be skipped.
create or replace function public.set_reward_product(p_slug text, p_product uuid, p_reward numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; verdict jsonb;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if coalesce(p_reward, 0) <= 0 then raise exception 'The reward must be more than zero'; end if;

  verdict := promo_reward_affordable(p_product, p_reward, c.referral_funded_by);
  if not (verdict->>'ok')::boolean then
    raise exception '%', verdict->>'reason' using errcode = 'check_violation';
  end if;

  insert into giveaway_reward_products (campaign_id, product_id, reward, added_by)
  values (c.id, p_product, p_reward, auth.uid())
  on conflict (campaign_id, product_id) do update set reward = excluded.reward, added_by = excluded.added_by;
  return verdict;
end $$;

create or replace function public.remove_reward_product(p_slug text, p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  delete from giveaway_reward_products rp using giveaway_campaigns c
   where rp.campaign_id = c.id and c.slug = p_slug and rp.product_id = p_product;
end $$;

-- ------------------------------------------------- opening the window

-- Called once, after the draw. Everyone who entered, was eligible, and did
-- not win gets a code and a deadline.
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

  -- Re-running must not extend anybody's window, so the dates are fixed the
  -- first time and reused afterwards.
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
     -- not a winner
     and not exists (
       select 1 from jsonb_array_elements(coalesce(d.winners, '[]'::jsonb)) w
        where (w->>'user_id')::uuid = e.user_id)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics made = row_count;

  perform log_audit('giveaway.referrals_opened', 'giveaway_campaigns', c.id, null,
                    jsonb_build_object('invited', made, 'closes_at', ends), null);
  return jsonb_build_object('invited', made, 'closes_at', ends);
end $$;

-- ------------------------------------------------- what the participant sees

create or replace function public.my_promo_referral(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; r promo_referrers%rowtype; earned numeric; pending numeric;
begin
  if auth.uid() is null then return null; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then return null; end if;
  select * into r from promo_referrers where campaign_id = c.id and user_id = auth.uid();
  if not found then return null; end if;

  select coalesce(sum(amount) filter (where status in ('verified','approved','paid')), 0),
         coalesce(sum(amount) filter (where status = 'pending'), 0)
    into earned, pending
    from commissions where promo_referrer_id = r.id;

  return jsonb_build_object(
    'code', r.code,
    'expires_at', r.expires_at,
    'open', now() between r.opens_at and r.expires_at,
    'reward', c.referral_reward,
    'cap', c.referral_max_per_person,
    'earned', earned,
    'pending', pending,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'slug', p.slug, 'price', p.price, 'reward', rp.reward,
        'images', p.images, 'vendor_slug', v.slug)
        order by rp.reward desc)
      from giveaway_reward_products rp
      join products p on p.id = rp.product_id
      left join vendors v on v.id = p.vendor_id
     where rp.campaign_id = c.id and p.status = 'published'), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------- the award

-- Called when an order completes. Returns the amount awarded, or zero with a
-- reason. Everything that could cost money twice is checked here, inside one
-- transaction, with the campaign row locked.
create or replace function public.award_promo_referral(p_order uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; r promo_referrers%rowtype; c giveaway_campaigns%rowtype;
  cust customers%rowtype; reward numeric := 0; spent numeric; mine numeric; note text;
begin
  select * into o from orders where id = p_order;
  if not found or o.promo_referrer_id is null then return 0; end if;
  -- An approved affiliate is already being paid for this order; never both.
  if o.reseller_id is not null then return 0; end if;
  if exists (select 1 from commissions where order_id = p_order and promo_referrer_id = o.promo_referrer_id) then
    return 0;
  end if;

  select * into r from promo_referrers where id = o.promo_referrer_id;
  select * into c from giveaway_campaigns where id = r.campaign_id for update;
  select * into cust from customers where id = o.customer_id;

  -- The sale had to happen inside the published window. Settling it later is
  -- fine; earning it later is not.
  if o.created_at > r.expires_at or o.created_at < r.opens_at then
    note := 'Order placed outside the referral window';
  -- The reward is for bringing a NEW customer. A repeat buyer is not one.
  elsif exists (
    select 1 from orders x where x.customer_id = o.customer_id and x.id <> o.id
      and x.status = 'completed' and x.created_at < o.created_at) then
    note := 'Not a new customer';
  -- Referring yourself is not referring anybody. Both numbers are normalised
  -- before comparing: an order written straight into the table, or imported,
  -- may hold "+26097..." where the profile holds "097...", and comparing the
  -- raw strings silently lets every self-referral through.
  elsif cust.id is not null and (
      exists (select 1 from profiles pf where pf.id = r.user_id
                and norm_phone(pf.phone) = norm_phone(cust.phone))
      or r.user_id = o.created_by) then
    note := 'Self-referral';
  elsif 'self_purchase' = any(coalesce(o.risk_flags, '{}')) then
    note := 'Flagged as a self purchase';
  end if;

  if note is null then
    -- Only the products the admin approved, at the rate they approved.
    select coalesce(sum(rp.reward * oi.quantity), 0) into reward
      from order_items oi
      join giveaway_reward_products rp on rp.product_id = oi.product_id and rp.campaign_id = c.id
     where oi.order_id = p_order;
    if reward <= 0 then note := 'No approved product in this order'; end if;
  end if;

  if note is null and c.referral_max_per_person > 0 then
    select coalesce(sum(amount), 0) into mine from commissions
     where promo_referrer_id = r.id and status <> 'reversed';
    if mine >= c.referral_max_per_person then
      note := 'This person has reached their cap';
    else
      reward := least(reward, c.referral_max_per_person - mine);
    end if;
  end if;

  if note is null and c.referral_budget > 0 then
    select coalesce(sum(cm.amount), 0) into spent from commissions cm
      join promo_referrers pr on pr.id = cm.promo_referrer_id
     where pr.campaign_id = c.id and cm.status <> 'reversed';
    if spent >= c.referral_budget then
      note := 'Campaign reward budget is spent';
    else
      -- Never go a ngwee over the budget the founder approved.
      reward := least(reward, c.referral_budget - spent);
    end if;
  end if;

  if note is not null or reward <= 0 then
    insert into commissions (order_id, promo_referrer_id, base_amount, rate_type, rate_value,
                             amount, status, eligible_at, notes)
    values (p_order, r.id, o.subtotal, 'fixed', 0, 0, 'rejected', now(),
            coalesce(note, 'No reward due'))
    on conflict do nothing;
    return 0;
  end if;

  insert into commissions (order_id, promo_referrer_id, base_amount, rate_type, rate_value,
                           amount, status, eligible_at, notes)
  values (p_order, r.id, o.subtotal, 'fixed', reward, reward, 'pending',
          now() + (setting_num('commission_grace_hours') || ' hours')::interval,
          'Giveaway referral · ' || c.slug);
  return reward;
end $$;

-- ------------------------------------------------------------- reporting

create or replace function public.giveaway_referral_report(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype;
begin
  if not (is_staff() or can_market()) then return null; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then return null; end if;

  return jsonb_build_object(
    'slug', c.slug,
    'reward', c.referral_reward,
    'budget', c.referral_budget,
    'funded_by', c.referral_funded_by,
    'opens_at', c.referral_opens_at,
    'closes_at', c.referral_closes_at,
    'open', c.referral_closes_at is not null and now() < c.referral_closes_at,
    'referrers', (select count(*) from promo_referrers where campaign_id = c.id),
    'referrers_earning', (select count(distinct cm.promo_referrer_id) from commissions cm
                            join promo_referrers pr on pr.id = cm.promo_referrer_id
                           where pr.campaign_id = c.id and cm.amount > 0 and cm.status <> 'reversed'),
    'orders', (select count(*) from orders o join promo_referrers pr on pr.id = o.promo_referrer_id
                where pr.campaign_id = c.id),
    'sales', coalesce((select sum(o.subtotal) from orders o
                         join promo_referrers pr on pr.id = o.promo_referrer_id
                        where pr.campaign_id = c.id and o.status = 'completed'), 0),
    -- What the marketplace actually keeps on those orders.
    'commission', coalesce((select sum(s.marketplace_fee) from settlements s
                              join orders o on o.id = s.order_id
                              join promo_referrers pr on pr.id = o.promo_referrer_id
                             where pr.campaign_id = c.id and s.status <> 'cancelled'), 0),
    'rewards_pending', coalesce((select sum(cm.amount) from commissions cm
                                   join promo_referrers pr on pr.id = cm.promo_referrer_id
                                  where pr.campaign_id = c.id and cm.status = 'pending'), 0),
    'rewards_owed', coalesce((select sum(cm.amount) from commissions cm
                                join promo_referrers pr on pr.id = cm.promo_referrer_id
                               where pr.campaign_id = c.id and cm.status in ('verified','approved')), 0),
    'rewards_paid', coalesce((select sum(cm.amount) from commissions cm
                                join promo_referrers pr on pr.id = cm.promo_referrer_id
                               where pr.campaign_id = c.id and cm.status = 'paid'), 0),
    'rewards_reversed', coalesce((select sum(cm.amount) from commissions cm
                                    join promo_referrers pr on pr.id = cm.promo_referrer_id
                                   where pr.campaign_id = c.id and cm.status = 'reversed'), 0),
    'budget_left', greatest(0, c.referral_budget - coalesce((select sum(cm.amount) from commissions cm
                                join promo_referrers pr on pr.id = cm.promo_referrer_id
                               where pr.campaign_id = c.id and cm.status <> 'reversed'), 0)),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object('order', o.order_number, 'why', cm.notes))
                            from commissions cm
                            join promo_referrers pr on pr.id = cm.promo_referrer_id
                            left join orders o on o.id = cm.order_id
                           where pr.campaign_id = c.id and cm.status = 'rejected'), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
                            'name', p.name, 'price', p.price, 'reward', rp.reward,
                            'check', promo_reward_affordable(p.id, rp.reward, c.referral_funded_by)))
                            from giveaway_reward_products rp join products p on p.id = rp.product_id
                           where rp.campaign_id = c.id), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------ permissions

alter table public.promo_referrers enable row level security;
alter table public.giveaway_reward_products enable row level security;

drop policy if exists promo_referrers_mine on public.promo_referrers;
create policy promo_referrers_mine on public.promo_referrers for select to authenticated
  using (user_id = auth.uid() or is_staff() or can_market());

drop policy if exists reward_products_read on public.giveaway_reward_products;
create policy reward_products_read on public.giveaway_reward_products for select to anon, authenticated
  using (true);

revoke all on public.promo_referrers from anon, authenticated;
grant select on public.promo_referrers to authenticated;
revoke all on public.giveaway_reward_products from anon, authenticated;
grant select on public.giveaway_reward_products to anon, authenticated;

revoke all on function public.open_giveaway_referrals(text) from public, anon;
revoke all on function public.set_reward_product(text, uuid, numeric) from public, anon;
revoke all on function public.remove_reward_product(text, uuid) from public, anon;
revoke all on function public.giveaway_referral_report(text) from public, anon;
revoke all on function public.award_promo_referral(uuid) from public, anon, authenticated;
grant execute on function public.open_giveaway_referrals(text) to authenticated;
grant execute on function public.set_reward_product(text, uuid, numeric) to authenticated;
grant execute on function public.remove_reward_product(text, uuid) to authenticated;
grant execute on function public.giveaway_referral_report(text) to authenticated;
grant execute on function public.promo_reward_affordable(uuid, numeric, text) to authenticated;
grant execute on function public.my_promo_referral(text) to authenticated;

-- ---------------------------------------- attribution at the point of sale
--
-- place_order and set_order_status are reproduced here with the giveaway
-- referral added. They were generated from the current definitions rather
-- than retyped, so nothing else in them has changed.

create or replace function place_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c jsonb := payload->'customer';
  cust customers%rowtype;
  o orders%rowtype;
  item jsonb;
  prod products%rowtype;
  qty int;
  unit numeric;
  sub numeric := 0;
  rs resellers%rowtype;
  pr promo_referrers%rowtype;
  local_zone boolean := false;
  fee numeric := 0;
  flags text[] := '{}';
  v_source text := coalesce(payload->>'source', 'organic');
  v_channel text := coalesce(payload->>'channel', 'marketplace');
  v_seller text := 'founder';
  v_manual boolean := coalesce((payload->>'is_manual')::boolean, false);
  off offers%rowtype;
  pkg product_packages%rowtype;
  v_needed date := nullif(payload->>'needed_by', '')::date;
  v_referrer uuid;
  v_today date := lusaka_date(now());
  booked int;
  v_choices jsonb;
  v_store vendors%rowtype;
  v_campaign campaigns%rowtype;
  deal record;
  deals int;
  v_line numeric;
  v_disc numeric;
  v_coupon jsonb;
  v_basket_vendor uuid;
begin
  if v_manual and not (is_staff() or my_reseller_id() is not null) then raise exception 'Not allowed'; end if;
  if coalesce(c->>'full_name','') = '' then raise exception 'Please enter the customer''s name'; end if;
  if coalesce(c->>'phone','') = '' and not (v_manual and is_staff()) then raise exception 'Please enter a phone number'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Cart is empty'; end if;

  -- customer (matched on phone)
  perform set_config('zm.order_fn', 'on', true);
  if coalesce(c->>'phone', '') = '' and v_manual and is_staff() then
    -- walk-in: sold in person, no phone given
    insert into customers (full_name, area, address, notes)
    values (coalesce(nullif(c->>'full_name', ''), 'Walk-in customer'), c->>'area', c->>'address', 'Walk-in sale')
    returning * into cust;
  else
  if length(norm_phone(c->>'phone')) < 10 then raise exception 'Please enter a full phone number, e.g. 0977 123 456'; end if;
  -- An existing customer's saved details only change when staff record the sale; the order keeps its own address either way.
  insert into customers (full_name, phone, email, province_id, district_id, area, address)
  values (c->>'full_name', norm_phone(c->>'phone'), nullif(c->>'email',''), (c->>'province_id')::int, (c->>'district_id')::int, c->>'area', c->>'address')
  on conflict (phone) do update set
    full_name = case when is_staff() then excluded.full_name else customers.full_name end,
    email = case when is_staff() then coalesce(excluded.email, customers.email) else coalesce(customers.email, excluded.email) end,
    province_id = case when is_staff() then coalesce(excluded.province_id, customers.province_id) else coalesce(customers.province_id, excluded.province_id) end,
    district_id = case when is_staff() then coalesce(excluded.district_id, customers.district_id) else coalesce(customers.district_id, excluded.district_id) end,
    area = case when is_staff() then coalesce(excluded.area, customers.area) else coalesce(customers.area, excluded.area) end,
    address = case when is_staff() then coalesce(excluded.address, customers.address) else coalesce(customers.address, excluded.address) end
  returning * into cust;
  end if;

  -- campaign link (/go/code) or a vendor's own store link (/store-name): last link the customer used wins
  if coalesce(payload->>'campaign_code', '') <> '' then
    select * into v_campaign from campaigns where code = lower(payload->>'campaign_code');
    if found and v_source = 'organic' then v_source := 'campaign:' || v_campaign.code; end if;
  end if;
  if coalesce(payload->>'invite_code', '') <> '' and v_source = 'organic' then
    v_source := 'referral:' || lower(payload->>'invite_code');
  end if;
  if coalesce(payload->>'store_ref', '') <> '' then
    select * into v_store from vendors where slug = lower(payload->>'store_ref') and status = 'approved';
    if found and v_source = 'organic' then v_source := 'vendor:' || v_store.slug; end if;
  end if;

  -- reseller attribution
  if coalesce(payload->>'referral_code','') <> '' then
    select * into rs from resellers where code = lower(payload->>'referral_code') and status = 'approved';
    if found then
      v_seller := 'reseller';
      if v_source = 'organic' then v_source := 'reseller:' || rs.code; end if;
      if norm_phone(rs.phone) = cust.phone
         or exists (select 1 from profiles pf where pf.id = rs.user_id and norm_phone(pf.phone) = cust.phone)
         or (rs.user_id is not null and rs.user_id = auth.uid() and coalesce((payload->>'is_manual')::boolean, false) = false) then
        flags := array_append(flags, 'self_purchase');
      end if;
    end if;
  end if;

  -- giveaway referral attribution
  --
  -- An approved affiliate's work is never interrupted by a campaign: if an
  -- affiliate code was used they are credited and none of this runs. A
  -- giveaway code applies only when no affiliate code was supplied, and when
  -- it is used it beats the sticky-ownership rule below, because this buyer
  -- followed this person's link today. One order, one earner, always.
  if rs.id is null and coalesce(payload->>'referral_code','') <> '' then
    select * into pr from promo_referrers
     where lower(code) = lower(payload->>'referral_code')
       and now() between opens_at and expires_at;
    if found then
      if v_source = 'organic' then v_source := 'giveaway_ref:' || pr.code; end if;
      if exists (select 1 from profiles pf where pf.id = pr.user_id and norm_phone(pf.phone) = cust.phone)
         or (pr.user_id = auth.uid() and not v_manual) then
        flags := array_append(flags, 'self_purchase');
      end if;
    end if;
  end if;

  -- the affiliate who first brought this customer keeps them on the books
  if rs.id is not null and cust.owner_reseller_id is null then
    update customers set owner_reseller_id = rs.id, owned_since = now() where id = cust.id;
    cust.owner_reseller_id := rs.id;
  end if;

  -- a customer an affiliate brought stays theirs for the full-commission window
  if rs.id is null and pr.id is null and not v_manual and cust.owner_reseller_id is not null then
    declare keep_days int := greatest(0, setting_num('reseller_credit_days')::int);
    begin
      select r2.* into rs from resellers r2
       where r2.id = cust.owner_reseller_id and r2.status = 'approved'
         and coalesce(cust.owned_since, now()) > now() - (keep_days || ' days')::interval;
      if found then
        v_seller := 'reseller';
        if v_source = 'organic' then v_source := 'reseller:' || rs.code || ':repeat'; end if;
      end if;
    end;
  end if;

  -- a vendor who sent this shopper to ZaMarket
  if coalesce(payload->>'vendor_ref', '') <> '' then
    select v2.id into v_referrer from vendors v2 where v2.ref_code = lower(payload->>'vendor_ref') and v2.status = 'approved';
  end if;

  -- delivery zone
  if (c->>'district_id') is not null then
    select is_local_zone into local_zone from districts where id = (c->>'district_id')::int;
  end if;
  if local_zone then fee := delivery_charge(); end if;
  if setting_text('delivery_included') = 'true' then fee := 0; end if;
  -- "I will collect it myself": no trip, no fee.
  if coalesce((payload->>'collect')::boolean, false) then fee := 0; end if;

  insert into orders (customer_id, referrer_vendor_id, source, channel, seller_type, reseller_id, promo_referrer_id, referral_code, province_id, district_id, area, address, instructions,
                      is_local, delivery_fee, delivery_fee_status, collection, is_manual, notes, risk_flags, created_by)
  values (cust.id, v_referrer, v_source, v_channel, v_seller, rs.id, pr.id, nullif(payload->>'referral_code',''), (c->>'province_id')::int, (c->>'district_id')::int,
          c->>'area', c->>'address', c->>'instructions', local_zone, fee,
          case when coalesce((payload->>'collect')::boolean, false) then 'not_available'
               when local_zone then 'confirmed' else 'pending' end,
          coalesce((payload->>'collect')::boolean, false),
          v_manual, payload->>'notes', flags, auth.uid())
  returning * into o;

  for item in select * from jsonb_array_elements(payload->'items') loop
    select * into prod from products where id = (item->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;
    if prod.status not in ('published','out_of_stock') and not v_manual then raise exception 'Product % is not available', prod.name; end if;
    if prod.status = 'out_of_stock' and prod.fulfilment = 'in_stock' and prod.owner_type = 'vendor' and not v_manual then raise exception '% is out of stock', prod.name; end if;
    off := null;
    -- made-to-order: needs a date far enough ahead, on a day the seller bakes/makes, within their daily limit
    if prod.fulfilment in ('made_to_order', 'service') then
      if v_needed is null then
        raise exception '%', case when prod.fulfilment = 'service' then prod.name || ' needs a booking date. Please choose one.' else prod.name || ' is made to order. Please choose the date you need it.' end;
      end if;
      if v_needed < v_today + prod.lead_time_days then
        raise exception '% needs to be ordered % day(s) ahead. The earliest date is %.', prod.name, prod.lead_time_days, to_char(v_today + prod.lead_time_days, 'Dy DD Mon');
      end if;
      if prod.order_days is not null and array_length(prod.order_days, 1) > 0 and not (extract(dow from v_needed)::int = any(prod.order_days)) then
        raise exception '% is not available on %s. Please pick another date.', prod.name, to_char(v_needed, 'FMDay');
      end if;
    end if;
    if prod.sales_model in ('enquire', 'negotiate') and not v_manual then
      raise exception '% is sold by enquiry. Please use the Enquire button.', prod.name;
    end if;
    v_choices := coalesce(item->'choices', '{}'::jsonb);
    if prod.fulfilment = 'service' and prod.time_slots is not null and array_length(prod.time_slots, 1) > 0 then
      if coalesce(v_choices->>'Time', '') = '' or not ((v_choices->>'Time') = any(prod.time_slots)) then
        raise exception 'Please choose a time for %', prod.name;
      end if;
    end if;
    if coalesce(item->>'offer_id', '') <> '' then
      select * into off from offers where id = (item->>'offer_id')::uuid for update;
      if not found or off.product_id <> prod.id then raise exception 'That offer does not apply to %', prod.name; end if;
      if not offer_is_live(off) then raise exception 'The offer "%" has ended or sold out', off.name; end if;
      deals := greatest(1, coalesce((item->>'deals')::int, (item->>'quantity')::int, 1));
      select * into deal from offer_deal(off, prod.price, prod.normal_price);
      qty := deal.units * deals;
      v_line := deal.price * deals;
      if off.inventory_limit is not null and off.units_used + qty > off.inventory_limit then
        raise exception 'Only % left on the offer "%"', off.inventory_limit - off.units_used, off.name;
      end if;
      update offers set units_used = units_used + qty where id = off.id;
      -- a free item from another product (e.g. buy 2 shoes, get a T-shirt)
      if off.type = 'buy_x_get_y' and coalesce(off.config->>'giftProductId', '') <> '' then
        declare gift products%rowtype; gqty int := greatest(1, coalesce((off.config->>'freeQty')::int, 1)) * deals;
        begin
          select * into gift from products where id = (off.config->>'giftProductId')::uuid for update;
          if found then
            insert into order_items (order_id, product_id, offer_id, vendor_id, quantity, unit_price, unit_cost_snapshot, line_total, reserved_qty, note)
            values (o.id, gift.id, off.id, gift.vendor_id, gqty, 0, product_effective_cost(gift), 0,
                    case when gift.owner_type = 'founder' and gift.fulfilment = 'in_stock' then least(gqty, greatest(gift.stock_available, 0)) else 0 end,
                    'Free with ' || off.name);
            if gift.owner_type = 'founder' and gift.fulfilment = 'in_stock' and gift.stock_available > 0 then
              perform apply_movement(gift.id, 'reserve', least(gqty, gift.stock_available), 'Free gift on order ' || o.order_number, 'order', o.id);
            end if;
          end if;
        end;
      end if;
    elsif coalesce(item->>'package_id', '') <> '' then
      select * into pkg from product_packages where id = (item->>'package_id')::uuid and product_id = prod.id and active;
      if not found then raise exception 'That package is no longer available for %', prod.name; end if;
      qty := greatest(1, coalesce((item->>'quantity')::int, 1));
      v_line := pkg.price * qty;
    else
      qty := greatest(1, coalesce((item->>'quantity')::int, 1));
      unit := coalesce((item->>'unit_price')::numeric, prod.price);
      if unit <> prod.price and not is_staff() then unit := prod.price; end if;
      v_line := unit * qty;
    end if;
    if prod.fulfilment = 'service' and prod.time_slots is not null and array_length(prod.time_slots, 1) > 0 then
      select coalesce(sum(i.quantity), 0) into booked from order_items i join orders x on x.id = i.order_id
       where i.product_id = prod.id and x.needed_by = v_needed and i.choices->>'Time' = v_choices->>'Time'
         and x.status not in ('cancelled', 'refunded', 'returned', 'fraud_review') and x.id <> o.id;
      if booked + qty > prod.slot_capacity then
        raise exception '% at % on % is already booked. Please pick another time.', prod.name, v_choices->>'Time', to_char(v_needed, 'Dy DD Mon');
      end if;
    end if;
    if prod.fulfilment in ('made_to_order', 'service') and prod.daily_limit is not null then
      select coalesce(sum(i.quantity), 0) into booked from order_items i join orders x on x.id = i.order_id
       where i.product_id = prod.id and x.needed_by = v_needed and x.status not in ('cancelled', 'refunded', 'returned', 'fraud_review') and x.id <> o.id;
      if booked + qty > prod.daily_limit then
        raise exception '% is fully booked for %. Only % left that day.', prod.name, to_char(v_needed, 'Dy DD Mon'), greatest(prod.daily_limit - booked, 0);
      end if;
    end if;
    if coalesce(item->>'package_id', '') = '' then pkg := null; end if;
    insert into order_items (order_id, product_id, offer_id, vendor_id, quantity, unit_price, unit_cost_snapshot, line_total, reserved_qty, choices, note, package_id, package_name, vendor_take)
    values (o.id, prod.id, off.id, prod.vendor_id, qty, v_line / qty, product_effective_cost(prod), v_line,
            case when (prod.owner_type = 'founder' or prod.tracks_stock) and prod.fulfilment = 'in_stock' then least(qty, greatest(prod.stock_available, 0)) else 0 end,
            v_choices, nullif(left(coalesce(item->>'note', ''), 300), ''), pkg.id, pkg.name,
            -- what this vendor was promised per unit, frozen now
            case when prod.owner_type = 'vendor' then prod.vendor_price else null end);
    sub := sub + v_line;
    -- Counted stock is held the moment the order is placed, whoever owns the
    -- product. Without this a giveaway prize, or the last one on a shelf, can
    -- be sold twice over while the first order is still being confirmed.
    if (prod.owner_type = 'founder' or prod.tracks_stock) and prod.fulfilment = 'in_stock' then
      if prod.stock_available > 0 then
        perform apply_movement(prod.id, 'reserve', least(qty, prod.stock_available), 'Order ' || o.order_number, 'order', o.id);
      end if;
      if prod.stock_available < qty then
        flags := array_append(flags, 'not_enough_stock');
        update orders set risk_flags = flags where id = o.id;
      end if;
    end if;
  end loop;

  -- Delivery is quoted from the sellers actually in this order, not from the
  -- global figure alone. A seller further out carries a higher delivery fee in
  -- their terms, and somebody has to collect from them, so an order containing
  -- a Kitwe shop costs what the Kitwe trip costs. The highest applies, because
  -- one trip has to reach the furthest of them.
  --
  -- This has to run after the items exist: when the fee was first worked out
  -- above, the order had no lines yet and there was no seller to ask.
  if local_zone
     and not coalesce((payload->>'collect')::boolean, false)
     and setting_text('delivery_included') <> 'true' then
    select coalesce(max(delivery_charge(d.vendor_id)), delivery_charge())
      into fee
      from (select distinct vendor_id from order_items
             where order_id = o.id and vendor_id is not null) d;
    fee := coalesce(fee, delivery_charge());
  end if;

  -- free delivery: any live free-delivery offer on a product in this order whose minimum spend is met
  -- (local zone only; elsewhere the fee is still confirmed by phone)
  if local_zone and exists (
    select 1 from offers ofr join order_items oi on oi.product_id = ofr.product_id
    where oi.order_id = o.id and ofr.type = 'free_delivery' and offer_is_live(ofr)
      and sub >= coalesce((ofr.config->>'minSpend')::numeric, 0)
  ) then fee := 0; end if;

  if not exists (select 1 from order_items i join products p on p.id = i.product_id where i.order_id = o.id and p.fulfilment <> 'service') then
    fee := 0;
    update orders set delivery_fee_status = 'confirmed' where id = o.id;
  end if;
  if v_store.id is not null and exists (select 1 from order_items where order_id = o.id and vendor_id = v_store.id) then
    update orders set store_vendor_id = v_store.id, seller_type = case when seller_type = 'founder' then 'vendor' else seller_type end where id = o.id;
  end if;
  if v_campaign.id is not null then update orders set campaign_id = v_campaign.id where id = o.id; end if;
  -- A coupon, if one was given and it stands up. Checked here rather than
  -- trusted from the browser: the discount is money, so the number that counts
  -- is the one the database works out, not the one the page sent.
  v_disc := 0;
  if coalesce(payload->>'coupon','') <> '' then
    -- Which seller this basket belongs to, if it is all from one. A seller's
    -- own coupon applies to their goods however the shopper arrived; it is
    -- only refused when the basket also holds somebody else's items, because
    -- then the discount could not be charged to them alone.
    select case when count(*) = 1 then (array_agg(vendor_id))[1] else null end
      into v_basket_vendor
      from (select distinct vendor_id from order_items
             where order_id = o.id and vendor_id is not null) one_seller;
    v_coupon := coupon_check(payload->>'coupon', sub, coalesce(v_basket_vendor, v_store.id));
    if coalesce((v_coupon->>'ok')::boolean, false) then
      v_disc := coalesce((v_coupon->>'discount')::numeric, 0);
      update orders set coupon_id = (v_coupon->>'id')::uuid, discount = v_disc where id = o.id;
      update coupons set used_count = used_count + 1 where id = (v_coupon->>'id')::uuid;
      insert into coupon_uses (coupon_id, order_id, customer_id, discount)
      values ((v_coupon->>'id')::uuid, o.id, cust.id, v_disc);
    end if;
  end if;

  update orders set subtotal = sub, delivery_fee = fee, total = greatest(sub - v_disc, 0) + fee,
    needed_by = case when exists (select 1 from order_items i join products p on p.id = i.product_id where i.order_id = o.id and p.fulfilment in ('made_to_order', 'service')) then v_needed else null end
  where id = o.id;
  if exists (select 1 from order_items i join products p on p.id = i.product_id where i.order_id = o.id and p.fulfilment <> 'service') then
    insert into deliveries (order_id, status) values (o.id, (case when local_zone then 'fee_confirmed' else 'fee_pending' end)::delivery_status);
  end if;
  -- referral: a friend invited by an existing customer (not themselves), on their first order
  if coalesce(payload->>'invite_code', '') <> '' then
    declare r referrals%rowtype;
    begin
      select * into r from referrals where code = lower(payload->>'invite_code') and order_id is null limit 1;
      if found and r.referrer_phone <> cust.phone
         and not exists (select 1 from orders x where x.customer_id = cust.id and x.id <> o.id and x.status not in ('cancelled','fraud_review')) then
        update orders set invite_code = r.code where id = o.id;
        insert into referrals (referrer_name, referrer_phone, referrer_customer_id, referred_phone, order_id, reward, status)
        values (r.referrer_name, r.referrer_phone, r.referrer_customer_id, cust.phone, o.id, setting_num('referral_reward'), 'purchased');
      end if;
    end;
  end if;
  -- any open lead for this phone is won
  update leads set stage = 'won', order_id = o.id, next_follow_up = null, updated_at = now()
   where cust.phone is not null and phone = cust.phone and stage in ('new','contacted','engaged');
  insert into lead_activities (lead_id, kind, outcome, note)
  select id, 'system', 'ordered', 'Placed order #' || o.order_number from leads where order_id = o.id;
  perform log_audit(case when v_manual then 'order.manual' else 'order.placed' end, 'orders', o.id, null,
    jsonb_build_object('total', sub + fee, 'source', v_source, 'channel', v_channel, 'seller', v_seller));

  perform set_config('zm.order_fn', 'off', true);
  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', sub + fee, 'is_local', local_zone);
end $$;

create or replace function set_order_status(p_order uuid, p_status order_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  it record;
  fee_pct numeric;
  comm numeric;
  gross numeric;
  vend_net numeric;
  allowance numeric;
  line_disc numeric;
  coupon_funder text;
  vend vendors%rowtype;
  prod products%rowtype;
  src text;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;

  -- vendors can only request cancellation; staff perform transitions
  if not is_staff() then
    if my_vendor_id() is not null and p_status = 'cancelled' then
      update orders set notes = coalesce(notes,'') || E'\n[Vendor requested cancellation] ' || coalesce(p_reason,'') where id = p_order;
      perform log_audit('order.cancel_requested', 'orders', p_order, null, jsonb_build_object('by_vendor', my_vendor_id()), p_reason);
      return;
    end if;
    raise exception 'Not allowed';
  end if;

  if not order_transition_allowed(o.status, p_status) then
    raise exception 'Cannot move an order from % to %', o.status, p_status;
  end if;

  perform set_config('zm.order_fn', 'on', true);
  update orders set status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    payment_status = (case when p_status = 'paid' then 'paid' when p_status = 'refunded' then 'refunded' else payment_status::text end)::payment_status
  where id = p_order;
  perform set_config('zm.order_fn', 'off', true);

  if p_status = 'delivered' then
    update deliveries set status = 'delivered', delivered_at = now() where order_id = p_order;
  elsif p_status = 'failed_delivery' then
    update deliveries set status = 'failed', failure_reason = p_reason where order_id = p_order;
  elsif p_status = 'out_for_delivery' then
    update deliveries set status = 'out_for_delivery' where order_id = p_order;
  end if;

  -- completion: stock becomes sold, commissions + settlements are created
  if p_status = 'completed' then
    update referrals set status = 'eligible' where order_id = p_order and status = 'purchased';
    src := setting_text('commission_source');
    for it in select oi.* from order_items oi where oi.order_id = p_order loop
      select * into prod from products where id = it.product_id;
      if prod.owner_type = 'founder' and (prod.fulfilment = 'in_stock' or it.reserved_qty > 0) then
        if it.reserved_qty > 0 then
          perform apply_movement(it.product_id, 'sale', it.reserved_qty, 'Order ' || o.order_number, 'order', p_order);
        end if;
        if it.quantity > it.reserved_qty then  -- sold beyond what was reserved: take it from available stock
          insert into inventory_movements (product_id, type, quantity, reason, reference_type, reference_id, user_id)
          values (it.product_id, 'sale', it.quantity - it.reserved_qty, 'Order ' || o.order_number || ' (not reserved)', 'order', p_order, auth.uid());
          update products set stock_available = stock_available - (it.quantity - it.reserved_qty),
                              stock_sold = stock_sold + (it.quantity - it.reserved_qty) where id = it.product_id;
        end if;
        update order_items set reserved_qty = 0 where id = it.id;
      end if;
      gross := it.line_total;
      comm := 0;
      if o.reseller_id is not null then
        comm := commission_for(prod, it.unit_price, it.quantity);
      end if;
      if it.vendor_id is not null then
        select * into vend from vendors where id = it.vendor_id;
        fee_pct := case when o.store_vendor_id = it.vendor_id then least(coalesce(vend.fee_pct_override, setting_num('marketplace_fee_pct')), setting_num('own_audience_fee_pct'))
                        else coalesce(vend.fee_pct_override, setting_num('marketplace_fee_pct')) end;

        -- The vendor is settled at what they agreed, not at a percentage of a
        -- price that may since have moved. Everything above that belongs to the
        -- marketplace, which hands part of it to whoever brought the customer —
        -- and keeps the lot when its own marketing did.
        if setting_text('pricing_mode') = 'vendor_take_home' and coalesce(it.vendor_take, 0) > 0 then
          vend_net := round(it.vendor_take * it.quantity, 2);

          -- A discount is somebody's money, and the coupon said whose. A
          -- marketplace promotion leaves the vendor whole and comes out of
          -- ZaMarket's share; a seller's own sale comes out of theirs. The
          -- discount is apportioned across the order's lines by value, so a
          -- basket from two sellers splits it fairly rather than landing all
          -- of it on whichever line settled first.
          if coalesce(o.discount, 0) > 0 and o.subtotal > 0 then
            line_disc := round(o.discount * (gross / o.subtotal), 2);
            select funded_by into coupon_funder from coupons where id = o.coupon_id;
            if coalesce(coupon_funder, 'marketplace') = 'vendor' then
              vend_net := greatest(vend_net - line_disc, 0);
            end if;
            -- either way the sale is now worth less, so the share ZaMarket
            -- keeps shrinks by the discount it funded
            gross := greatest(gross - line_disc, 0);
          end if;
          -- The commission is capped at the room that was built into the price
          -- for it. Without this cap a product with a generous commission rate
          -- would pay the affiliate out of ZaMarket's own share, which is the
          -- exact thing this whole arrangement exists to prevent.
          allowance := round(gross * coalesce(
            (select commission_allowance_override from vendors where id = it.vendor_id),
            setting_num('commission_allowance_pct')) / 100, 2);
          if comm > allowance then comm := allowance; end if;
          -- and never hand out more than the order actually earned
          if comm > greatest(gross - vend_net, 0) then comm := round(greatest(gross - vend_net, 0), 2); end if;
          insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
          values (it.vendor_id, p_order, o.order_number, gross,
                  round(greatest(gross - vend_net - comm, 0), 2), comm, vend_net, 'pending');
        else
          insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
          values (it.vendor_id, p_order, o.order_number, gross, round(gross * fee_pct / 100, 2),
                  case when src = 'on_top' then comm else 0 end,
                  round(gross - gross * fee_pct / 100 - case when src = 'on_top' then comm else 0 end, 2), 'pending');
        end if;
      end if;
    end loop;

    -- their customer came back after the full-commission window: a flat thank-you instead
    if o.reseller_id is null then
      declare owner_id uuid; bonus numeric := setting_num('affiliate_repeat_bonus');
      begin
        select c2.owner_reseller_id into owner_id from customers c2 where c2.id = o.customer_id;
        if owner_id is not null and bonus > 0 and not exists (select 1 from bonus_credits b where b.order_id = p_order and b.kind = 'repeat_customer') then
          insert into bonus_credits (payee_type, reseller_id, order_id, kind, amount, status, note)
          values ('reseller', owner_id, p_order, 'repeat_customer', bonus, 'eligible', 'Their customer ordered again');
        end if;
      end;
    end if;

    -- a vendor sent this shopper to ZaMarket: they earn on what the shopper bought from others
    if o.referrer_vendor_id is not null then
      declare pct numeric := setting_num('vendor_referral_pct'); base numeric;
      begin
        select coalesce(sum(i.line_total), 0) into base from order_items i
         where i.order_id = p_order and coalesce(i.vendor_id, '00000000-0000-0000-0000-000000000000') <> o.referrer_vendor_id;
        if pct > 0 and base > 0 and not exists (select 1 from bonus_credits b where b.order_id = p_order and b.kind = 'vendor_referral') then
          insert into bonus_credits (payee_type, vendor_id, order_id, kind, amount, status, note)
          values ('vendor', o.referrer_vendor_id, p_order, 'vendor_referral', round(base * pct / 100, 2), 'eligible', 'Someone they sent to ZaMarket bought');
        end if;
      end;
    end if;

    -- the first time anyone sells this product through an affiliate
    if o.reseller_id is not null and setting_num('first_sale_bonus') > 0 then
      declare fresh uuid;
      begin
        select oi.product_id into fresh from order_items oi
         where oi.order_id = p_order
           and not exists (
             select 1 from order_items x join orders y on y.id = x.order_id
              where x.product_id = oi.product_id and y.reseller_id is not null
                and y.status = 'completed' and y.id <> p_order)
         limit 1;
        if fresh is not null and not exists (select 1 from bonus_credits b where b.order_id = p_order and b.kind = 'first_sale') then
          insert into bonus_credits (payee_type, reseller_id, order_id, kind, amount, status, note)
          values ('reseller', o.reseller_id, p_order, 'first_sale', setting_num('first_sale_bonus'), 'eligible',
                  'First affiliate sale of ' || (select name from products where id = fresh));
        end if;
      end;
    end if;

    -- A giveaway referrer is paid on the same event as an affiliate, under
    -- the same grace period, and never on an order an affiliate is paid for.
    if o.promo_referrer_id is not null and o.reseller_id is null then
      perform award_promo_referral(p_order);
    end if;

    if o.reseller_id is not null then
      select coalesce(sum(commission_for(p, oi.unit_price, oi.quantity)), 0) into comm
      from order_items oi join products p on p.id = oi.product_id where oi.order_id = p_order;
      insert into commissions (order_id, reseller_id, base_amount, rate_type, rate_value, amount, status, eligible_at)
      values (p_order, o.reseller_id, o.subtotal, 'mixed', 0, comm,
              (case when 'self_purchase' = any(o.risk_flags) then 'rejected' else 'pending' end)::commission_status,
              now() + (setting_num('commission_grace_hours') || ' hours')::interval);
    end if;
  end if;

  -- cancellation / refund / return: release stock, void commissions and settlements
  if p_status in ('cancelled','refunded','returned') then
    for it in select * from order_items where order_id = p_order loop
      if o.status in ('pending','confirmed','payment_pending','paid','processing','ready_for_dispatch','out_for_delivery','failed_delivery','customer_unreachable','fraud_review') then
        if it.reserved_qty > 0 then
          perform apply_movement(it.product_id, 'release', it.reserved_qty, 'Order ' || o.order_number || ' ' || p_status, 'order', p_order);
          update order_items set reserved_qty = 0 where id = it.id;
        end if;
      elsif p_status = 'returned' then
        perform apply_movement(it.product_id, 'return', it.quantity, 'Order ' || o.order_number || ' returned', 'order', p_order);
      end if;
    end loop;
    update referrals set status = 'void' where order_id = p_order and status <> 'paid';
    update bonus_credits set status = 'void' where order_id = p_order and status <> 'paid';
    update offers ofr set units_used = greatest(0, ofr.units_used - x.q)
    from (select offer_id, sum(quantity) q from order_items where order_id = p_order and offer_id is not null group by offer_id) x
    where ofr.id = x.offer_id;
    update commissions set status = 'reversed', notes = coalesce(notes,'') || ' Order ' || p_status where order_id = p_order and status <> 'paid';
    update settlements set status = 'cancelled' where order_id = p_order and status <> 'paid';
  end if;

  perform log_audit('order.status', 'orders', p_order, jsonb_build_object('status', o.status), jsonb_build_object('status', p_status), p_reason);
end $$;
