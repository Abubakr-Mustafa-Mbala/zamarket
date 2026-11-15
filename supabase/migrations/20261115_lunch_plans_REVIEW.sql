-- Lunch plans: scheduled homemade lunches delivered to workplaces.
--
-- How it fits ZaMarket (nothing existing changes):
-- * Each dish is an ordinary made-to-order product of the seller, with its
--   cooking days (order_days), a day's notice (lead_time_days) and a daily
--   limit (daily_limit). place_order already enforces all three.
-- * A lunch deal (meal_deals) gathers the dishes, the cook's story and proof
--   photos, the delivery windows and the order cut-off.
-- * A weekly or team plan is one ordinary order per lunch day, linked by
--   meal_plans. Each day is delivered, paid and refunded on its own, so an
--   affiliate's commission for a lunch is earned the day it is delivered,
--   through the existing commission rules (capped at the room in the price).
-- * The affiliate rate for a deal's dishes is set by staff when publishing,
--   never above the commission allowance built into the price.
--
-- Safe to run more than once.

create table if not exists public.meal_deals (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title text not null check (length(title) between 3 and 90),
  tagline text check (tagline is null or length(tagline) <= 160),
  about_cook text check (about_cook is null or length(about_cook) <= 1500),
  in_the_box text check (in_the_box is null or length(in_the_box) <= 600),
  cover_url text,
  proof_images text[] not null default '{}',
  dishes jsonb not null default '[]'::jsonb,          -- [{ product_id, kind: 'box' | 'tray', serves }]
  delivery_windows text[] not null default array['11:30–12:00', '12:00–12:30', '12:30–13:00'],
  delivery_area text check (delivery_area is null or length(delivery_area) <= 300),
  cutoff_hour int not null default 18 check (cutoff_hour between 6 and 23),
  guarantee boolean not null default true,
  affiliate_pct numeric check (affiliate_pct is null or (affiliate_pct >= 0 and affiliate_pct <= 50)),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'published', 'suspended', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meal_deals_vendor_idx on public.meal_deals(vendor_id);
alter table public.meal_deals enable row level security;

drop policy if exists meal_deals_public_read on public.meal_deals;
create policy meal_deals_public_read on public.meal_deals for select using (status = 'published' or is_staff() or vendor_id = my_vendor_id());
drop policy if exists meal_deals_vendor_insert on public.meal_deals;
create policy meal_deals_vendor_insert on public.meal_deals for insert with check (is_staff() or (vendor_id = my_vendor_id() and status in ('draft', 'submitted')));
drop policy if exists meal_deals_vendor_update on public.meal_deals;
create policy meal_deals_vendor_update on public.meal_deals for update using (is_staff() or vendor_id = my_vendor_id())
  with check (is_staff() or (vendor_id = my_vendor_id() and status in ('draft', 'submitted')));
drop policy if exists meal_deals_staff_delete on public.meal_deals;
create policy meal_deals_staff_delete on public.meal_deals for delete using (is_staff());

-- Shoppers never see the affiliate rate or the review note.
revoke select on public.meal_deals from anon;
grant select (id, vendor_id, slug, title, tagline, about_cook, in_the_box, cover_url, proof_images, dishes, delivery_windows, delivery_area, cutoff_hour, guarantee, status, created_at, updated_at)
  on public.meal_deals to anon;
-- Signed-in people see the same, plus the review note on their own deal.
-- The affiliate rate is read through meal_deal_affiliate_rate() only.
revoke select on public.meal_deals from authenticated;
grant select (id, vendor_id, slug, title, tagline, about_cook, in_the_box, cover_url, proof_images, dishes, delivery_windows, delivery_area, cutoff_hour, guarantee, status, rejection_reason, created_at, updated_at)
  on public.meal_deals to authenticated;
grant insert, update, delete on public.meal_deals to authenticated;

-- A seller cannot set their own affiliate rate or publish themselves.
create or replace function public.meal_deals_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not is_staff() then
    if tg_op = 'INSERT' then
      new.affiliate_pct := null; new.rejection_reason := null;
    else
      new.affiliate_pct := old.affiliate_pct;
      if old.status in ('published', 'suspended') and new.status = 'submitted' then new.rejection_reason := null; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_meal_deals_guard on public.meal_deals;
create trigger trg_meal_deals_guard before insert or update on public.meal_deals for each row execute function public.meal_deals_guard();

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  plan_number serial,
  deal_id uuid not null references public.meal_deals(id),
  vendor_id uuid not null references public.vendors(id),
  kind text not null check (kind in ('trial', 'week', 'team')),
  customer_name text not null,
  customer_phone text not null,
  workplace text not null,
  delivery_window text not null,
  lunches int not null,
  total numeric not null,
  referral_code text,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);
alter table public.meal_plans enable row level security;
drop policy if exists meal_plans_read on public.meal_plans;
-- Staff only: it holds the customer's phone. The kitchen sees first names through meal_kitchen().
create policy meal_plans_read on public.meal_plans for select using (is_staff());
grant select on public.meal_plans to authenticated;

alter table public.orders add column if not exists meal_plan_id uuid references public.meal_plans(id);
create index if not exists orders_meal_plan_idx on public.orders(meal_plan_id) where meal_plan_id is not null;

-- Real places left per dish per day, for the deal page. Counts only, no names.
create or replace function public.meal_availability(p_deal uuid, p_from date default null, p_days int default 14)
returns table(product_id uuid, day date, day_limit int, booked int)
language sql stable security definer set search_path = public as $$
  with d as (select * from meal_deals where id = p_deal and (status = 'published' or is_staff() or vendor_id = my_vendor_id())),
  ids as (select (x->>'product_id')::uuid as pid from d, jsonb_array_elements(d.dishes) x),
  days as (select generate_series(coalesce(p_from, lusaka_date(now())), coalesce(p_from, lusaka_date(now())) + greatest(1, least(p_days, 31)), interval '1 day')::date as day)
  select p.id, days.day, p.daily_limit,
         coalesce((select sum(i.quantity) from order_items i join orders o on o.id = i.order_id
                   where i.product_id = p.id and o.needed_by = days.day
                     and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')), 0)::int
  from products p join ids on ids.pid = p.id cross join days
  where p.status = 'published'
    and (p.order_days is null or array_length(p.order_days, 1) is null or extract(dow from days.day)::int = any(p.order_days));
$$;
grant execute on function public.meal_availability(uuid, date, int) to anon, authenticated;

-- Book a trial lunch, a week or a team order. One order per day, all or
-- nothing: if any day is full or past its cut-off, nothing is booked.
-- payload: { deal_id, kind, window, workplace: { company, area, address, instructions },
--            customer: { full_name, phone }, days: [{ date, items: [{ product_id, quantity }] }],
--            referral_code, campaign_code, invite_code, store_ref }
create or replace function public.place_meal_plan(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d meal_deals%rowtype;
  plan meal_plans%rowtype;
  day jsonb; it jsonb;
  v_date date; v_today date := lusaka_date(now());
  v_hour int := extract(hour from (now() at time zone 'Africa/Lusaka'))::int;
  v_kind text := coalesce(payload->>'kind', 'week');
  v_window text := payload->>'window';
  w jsonb := coalesce(payload->'workplace', '{}'::jsonb);
  c jsonb := coalesce(payload->'customer', '{}'::jsonb);
  v_workplace text;
  r jsonb; v_total numeric := 0; v_lunches int := 0; v_days int := 0;
  v_district int; v_province int;
  v_ids uuid[];
begin
  select * into d from meal_deals where id = (payload->>'deal_id')::uuid and status = 'published';
  if not found then raise exception 'This lunch deal is not available right now'; end if;
  if v_kind not in ('trial', 'week', 'team') then raise exception 'Please choose a trial lunch, a week or a team order'; end if;
  if coalesce(v_window, '') = '' or not (v_window = any(d.delivery_windows)) then raise exception 'Please choose a delivery time'; end if;
  if coalesce(trim(w->>'company'), '') = '' or coalesce(trim(w->>'address'), '') = '' then raise exception 'Please enter your workplace and where to deliver'; end if;
  if jsonb_array_length(coalesce(payload->'days', '[]'::jsonb)) = 0 then raise exception 'Please choose at least one lunch day'; end if;
  if v_kind = 'trial' and jsonb_array_length(payload->'days') > 1 then raise exception 'A trial is one lunch on one day'; end if;
  if jsonb_array_length(payload->'days') > 14 then raise exception 'Please book at most two weeks at a time'; end if;
  select array_agg((x->>'product_id')::uuid) into v_ids from jsonb_array_elements(d.dishes) x;
  select id, province_id into v_district, v_province from districts where name ilike 'Lusaka' and is_local_zone limit 1;
  v_workplace := trim(w->>'company') || coalesce(', ' || nullif(trim(w->>'address'), ''), '');

  insert into meal_plans (deal_id, vendor_id, kind, customer_name, customer_phone, workplace, delivery_window, lunches, total, referral_code)
  values (d.id, d.vendor_id, v_kind, trim(c->>'full_name'), norm_phone(c->>'phone'), v_workplace, v_window, 0, 0, nullif(lower(payload->>'referral_code'), ''))
  returning * into plan;

  for day in select * from jsonb_array_elements(payload->'days') loop
    v_date := (day->>'date')::date;
    if v_date <= v_today then raise exception 'Lunches are ordered at least a day ahead. % is too soon.', to_char(v_date, 'Dy DD Mon'); end if;
    if v_date = v_today + 1 and v_hour >= d.cutoff_hour then
      raise exception 'Orders for tomorrow close at %:00. Please choose % or later.', d.cutoff_hour, to_char(v_today + 2, 'Dy DD Mon');
    end if;
    if jsonb_array_length(coalesce(day->'items', '[]'::jsonb)) = 0 then raise exception 'Please choose a dish for %', to_char(v_date, 'Dy DD Mon'); end if;
    for it in select * from jsonb_array_elements(day->'items') loop
      if not ((it->>'product_id')::uuid = any(v_ids)) then raise exception 'That dish is not part of this lunch deal'; end if;
      if v_kind = 'trial' and coalesce((it->>'quantity')::int, 1) > 1 then raise exception 'A trial is one lunch'; end if;
      v_lunches := v_lunches + greatest(1, coalesce((it->>'quantity')::int, 1));
    end loop;

    r := place_order(jsonb_build_object(
      'customer', jsonb_build_object('full_name', c->>'full_name', 'phone', c->>'phone', 'email', c->>'email',
                                     'province_id', v_province, 'district_id', v_district,
                                     'area', w->>'area', 'address', v_workplace,
                                     'instructions', concat_ws(' · ', 'Lunch delivery ' || v_window, nullif(trim(w->>'instructions'), ''))),
      'items', (select jsonb_agg(jsonb_build_object('product_id', x->>'product_id', 'quantity', greatest(1, coalesce((x->>'quantity')::int, 1)),
                                                    'choices', jsonb_build_object('Delivery', v_window))) from jsonb_array_elements(day->'items') x),
      'needed_by', v_date,
      'notes', 'Lunch plan LP' || plan.plan_number || ' · ' || v_window,
      'referral_code', payload->>'referral_code', 'campaign_code', payload->>'campaign_code',
      'invite_code', payload->>'invite_code', 'store_ref', payload->>'store_ref', 'source', payload->>'source'));
    update orders set meal_plan_id = plan.id where id = (r->>'order_id')::uuid;
    v_total := v_total + (r->>'total')::numeric;
    v_days := v_days + 1;
  end loop;

  update meal_plans set lunches = v_lunches, total = v_total where id = plan.id;
  perform log_audit('meal_plan.placed', 'meal_plans', plan.id, null, jsonb_build_object('total', v_total, 'days', v_days, 'lunches', v_lunches, 'kind', v_kind));
  return jsonb_build_object('plan_id', plan.id, 'reference', 'LP' || plan.plan_number, 'total', v_total, 'days', v_days, 'lunches', v_lunches);
end $$;
revoke all on function public.place_meal_plan(jsonb) from public;
grant execute on function public.place_meal_plan(jsonb) to anon, authenticated;

-- The whole plan is paid upfront: staff record one mobile-money payment and
-- every day's order is marked paid.
create or replace function public.confirm_meal_plan_payment(p_plan uuid, p_method text, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from meal_plans where id = p_plan and status = 'awaiting_payment') then raise exception 'This plan is not waiting for payment'; end if;
  for o in select id, total, status from orders where meal_plan_id = p_plan and payment_status not in ('paid', 'refunded') and status not in ('cancelled', 'fraud_review') loop
    -- The customer was called and paid: the order is confirmed, then paid.
    if o.status = 'pending' and order_transition_allowed('pending', 'confirmed') then
      perform set_order_status(o.id, 'confirmed', 'Lunch plan confirmed with the customer');
    end if;
    perform record_payment(o.id, p_method, o.total, p_reference);
  end loop;
  update meal_plans set status = 'paid' where id = p_plan;
  perform log_audit('meal_plan.paid', 'meal_plans', p_plan, null, jsonb_build_object('method', p_method, 'reference', p_reference));
end $$;
revoke all on function public.confirm_meal_plan_payment(uuid, text, text) from public, anon;
grant execute on function public.confirm_meal_plan_payment(uuid, text, text) to authenticated;

-- Publish, hold or send back a lunch deal. Publishing sets the affiliate
-- rate on the deal's dishes, never above the commission room in the price.
create or replace function public.set_meal_deal_status(p_deal uuid, p_status text, p_affiliate_pct numeric default null, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d meal_deals%rowtype; v_cap numeric; v_pct numeric;
begin
  if not is_staff() then raise exception 'Only the ZaMarket team can do this'; end if;
  select * into d from meal_deals where id = p_deal for update;
  if not found then raise exception 'Lunch deal not found'; end if;
  if p_status not in ('published', 'suspended', 'rejected', 'draft') then raise exception 'Unknown status'; end if;
  if p_status in ('suspended', 'rejected') and coalesce(trim(p_reason), '') = '' then raise exception 'Please give a reason. The seller sees it.'; end if;
  v_cap := coalesce((select commission_allowance_override from vendors where id = d.vendor_id), setting_num('commission_allowance_pct'));
  v_pct := coalesce(p_affiliate_pct, d.affiliate_pct, setting_num('default_commission_pct'));
  if v_pct > v_cap then raise exception 'The affiliate rate can be at most % percent, the room built into the price', v_cap; end if;
  if p_status = 'published' then
    if jsonb_array_length(d.dishes) = 0 then raise exception 'Add at least one dish first'; end if;
    update products set commission_type = 'pct', commission_value = v_pct
     where id in (select (x->>'product_id')::uuid from jsonb_array_elements(d.dishes) x) and vendor_id = d.vendor_id;
  end if;
  update meal_deals set status = p_status, affiliate_pct = v_pct,
         rejection_reason = case when p_status in ('suspended', 'rejected') then trim(p_reason) else null end
   where id = p_deal;
  perform log_audit('meal_deal.' || p_status, 'meal_deals', p_deal, jsonb_build_object('status', d.status), jsonb_build_object('status', p_status, 'affiliate_pct', v_pct), p_reason);
end $$;
revoke all on function public.set_meal_deal_status(uuid, text, numeric, text) from public, anon;
grant execute on function public.set_meal_deal_status(uuid, text, numeric, text) to authenticated;

-- What an affiliate earns per lunch on a deal (approved affiliates and staff only).
create or replace function public.meal_deal_affiliate_rate(p_deal uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when is_staff() or exists (select 1 from resellers where user_id = auth.uid() and status = 'approved')
              then (select affiliate_pct from meal_deals where id = p_deal and status = 'published') end;
$$;
revoke all on function public.meal_deal_affiliate_rate(uuid) from public, anon;
grant execute on function public.meal_deal_affiliate_rate(uuid) to authenticated;

-- The kitchen's day: how many of each dish, and the drop-offs by delivery time.
create or replace function public.meal_kitchen(p_date date, p_vendor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := coalesce(p_vendor, my_vendor_id());
begin
  if v is null or not (is_staff() or v = my_vendor_id()) then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'date', p_date,
    'dishes', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'quantity', qty) order by qty desc) from (
        select p.name, sum(i.quantity)::int as qty
        from order_items i join orders o on o.id = i.order_id join products p on p.id = i.product_id
        where o.meal_plan_id is not null and o.needed_by = p_date and i.vendor_id = v
          and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')
        group by p.name) t), '[]'::jsonb),
    'drops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number, 'plan', 'LP' || mp.plan_number, 'name', split_part(mp.customer_name, ' ', 1),
        'workplace', mp.workplace, 'window', mp.delivery_window, 'paid', o.payment_status = 'paid', 'status', o.status,
        'items', (select string_agg(i2.quantity || ' × ' || p2.name, ', ') from order_items i2 join products p2 on p2.id = i2.product_id where i2.order_id = o.id))
        order by mp.delivery_window, mp.workplace)
      from orders o join meal_plans mp on mp.id = o.meal_plan_id
      where o.needed_by = p_date and mp.vendor_id = v and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')), '[]'::jsonb));
end $$;
revoke all on function public.meal_kitchen(date, uuid) from public, anon;
grant execute on function public.meal_kitchen(date, uuid) to authenticated;
