-- 28. Weekly lunch: lunch-only dishes, paying after the first lunch, no
--     double bookings, and a clearer kitchen.
--
-- · A seller can create dishes that exist only for her lunch plan. They are
--   not shown in the shop, in search or in any product list, and they can
--   only be ordered through a lunch plan.
-- · A lunch plan can let first-time customers pay for the first lunch, then
--   decide on the rest. Only when the seller (or ZaMarket) switches it on.
-- · A booking sent twice (a retry, a double tap) is recorded once.
-- · Customers say how they will pay, where (office or home) and a landmark.

alter table public.products add column if not exists lunch_only boolean not null default false;
alter table public.meal_deals add column if not exists trial_first boolean not null default false;
-- Package discount: booking several days, e.g. 5 or more days (a full
-- week) 5% off. Set by ZaMarket, paid from ZaMarket's share like the team
-- discount. A day gets the larger of the two discounts, never both.
alter table public.meal_deals add column if not exists day_discounts jsonb not null default '[]'::jsonb;
grant select (trial_first, day_discounts) on public.meal_deals to anon, authenticated;

create or replace function public.meal_deals_discount_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t jsonb; n int;
begin
  if new.group_discounts is distinct from (case when tg_op = 'UPDATE' then old.group_discounts else '[]'::jsonb end)
     or new.day_discounts is distinct from (case when tg_op = 'UPDATE' then old.day_discounts else '[]'::jsonb end) then
    if not is_staff() then raise exception 'Only ZaMarket can set lunch discounts'; end if;
    if jsonb_typeof(new.group_discounts) <> 'array' or jsonb_typeof(new.day_discounts) <> 'array' then raise exception 'Discounts must be a list'; end if;
    n := 0;
    for t in select * from jsonb_array_elements(new.group_discounts) loop
      n := n + 1;
      if n > 4 then raise exception 'At most 4 team discount levels'; end if;
      if coalesce((t->>'min')::int, 0) < 2 or (t->>'min')::int > 100 then raise exception 'A team discount starts from 2 to 100 lunches'; end if;
      if coalesce((t->>'pct')::numeric, 0) <= 0 or (t->>'pct')::numeric > 10 then raise exception 'A discount is between 1%% and 10%%'; end if;
    end loop;
    n := 0;
    for t in select * from jsonb_array_elements(new.day_discounts) loop
      n := n + 1;
      if n > 3 then raise exception 'At most 3 package discount levels'; end if;
      if coalesce((t->>'min')::int, 0) < 2 or (t->>'min')::int > 14 then raise exception 'A package discount starts from 2 to 14 days'; end if;
      if coalesce((t->>'pct')::numeric, 0) <= 0 or (t->>'pct')::numeric > 10 then raise exception 'A discount is between 1%% and 10%%'; end if;
    end loop;
  end if;
  return new;
end $$;

alter table public.meal_plans add column if not exists client_ref text;
alter table public.meal_plans add column if not exists payment_method text check (payment_method is null or payment_method in ('mtn_money', 'airtel_money', 'zamtel_kwacha'));
alter table public.meal_plans add column if not exists pay_mode text not null default 'upfront' check (pay_mode in ('upfront', 'after_first'));
alter table public.meal_plans add column if not exists landmark text check (landmark is null or length(landmark) <= 160);
alter table public.meal_plans add column if not exists place text not null default 'office' check (place in ('office', 'home'));
create unique index if not exists meal_plans_client_ref on public.meal_plans (client_ref) where client_ref is not null;
alter table public.meal_plans drop constraint if exists meal_plans_status_check;
alter table public.meal_plans add constraint meal_plans_status_check check (status in ('awaiting_payment', 'first_paid', 'paid', 'trial_ended', 'cancelled'));

-- The shop's product list leaves lunch-only dishes out (same columns as before).
create or replace view public_products as
select p.id, p.boost_pct, p.boost_until, p.featured_in_store, p.promo_blocked, p.name, p.slug, p.category, p.description, p.benefits, p.faqs, p.images, p.price, p.normal_price,
       p.status, p.stock_available, p.owner_type, v.business_name as vendor_name,
       (select round(avg(product_rating),1) from reviews r where r.product_id = p.id and r.approved) as rating,
       (select count(*) from reviews r where r.product_id = p.id and r.approved) as review_count,
       p.vendor_id, p.fulfilment, p.lead_time_days, p.order_days, p.daily_limit, p.options, p.note_label, p.created_at,
       p.service_location, p.duration_text, p.time_slots, p.slot_capacity, v.slug as vendor_slug,
       p.offering_type, p.sales_model, p.page, p.commission_type, p.commission_value, p.featured_for_resellers,
       p.section_id,
       v.logo_url as vendor_logo, v.location as vendor_location, v.category as vendor_category,
       (select count(*) from product_packages pk where pk.product_id = p.id and pk.active) as package_count
from products p left join vendors v on v.id = p.vendor_id
where p.status in ('published','out_of_stock') and (p.vendor_id is null or v.status = 'approved')
  and not coalesce(p.lunch_only, false);
alter view public_products set (security_invoker = true);
-- Visitors read only granted product columns; the filter above needs this one.
grant select (lunch_only) on public.products to anon, authenticated;
grant select on public_products to anon, authenticated;

-- The lunch page reads its lunch-only dishes from here.
create or replace view public_lunch_dishes as
select p.id, p.name, p.slug, p.description, p.benefits, p.images, p.price, p.status, p.vendor_id, p.fulfilment,
       p.lead_time_days, p.order_days, p.daily_limit, p.offering_type, p.category, p.created_at
from products p join vendors v on v.id = p.vendor_id
where p.lunch_only and p.status in ('published', 'out_of_stock') and v.status = 'approved';
alter view public_lunch_dishes set (security_invoker = true);
grant select on public_lunch_dishes to anon, authenticated;

-- A lunch-only dish can't be put in an ordinary cart.
create or replace function public.lunch_only_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from products where id = new.product_id and lunch_only)
     and coalesce(current_setting('zamarket.meal_plan', true), '') <> 'on' then
    raise exception 'This dish is ordered through the weekly lunch page';
  end if;
  return new;
end $$;
drop trigger if exists lunch_only_guard on public.order_items;
create trigger lunch_only_guard before insert on public.order_items for each row execute function public.lunch_only_guard();

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
  v_day_qty int; v_pct numeric; v_sub numeric; v_disc numeric; v_fee numeric; v_saved numeric := 0;
  v_request text := nullif(left(trim(regexp_replace(coalesce(payload->>'request', ''), '\s+', ' ', 'g')), 300), '');
  v_ref text := nullif(left(regexp_replace(coalesce(payload->>'client_ref', ''), '[^a-zA-Z0-9-]', '', 'g'), 64), '');
  v_method text := nullif(payload->>'payment_method', '');
  v_mode text := case when payload->>'pay_mode' = 'after_first' then 'after_first' else 'upfront' end;
  v_landmark text := nullif(left(trim(coalesce(w->>'landmark', '')), 160), '');
  v_place text := case when w->>'place' = 'home' then 'home' else 'office' end;
  v_first numeric;
  old meal_plans%rowtype;
begin
  -- Lunch-only dishes can be ordered only through a lunch plan (see the
  -- order_items guard); this marks the transaction as one.
  perform set_config('zamarket.meal_plan', 'on', true);

  -- The same booking sent twice (a retry, a double tap) returns the first one.
  if v_ref is not null then
    select * into old from meal_plans where client_ref = v_ref;
    if found then
      return jsonb_build_object('plan_id', old.id, 'reference', 'LP' || old.plan_number, 'total', old.total,
        'days', (select count(*) from orders where meal_plan_id = old.id), 'lunches', old.lunches, 'saved', 0,
        'pay_mode', old.pay_mode, 'first_total', (select total from orders where meal_plan_id = old.id order by needed_by limit 1), 'repeat', true);
    end if;
  end if;
  if v_method is not null and v_method not in ('mtn_money', 'airtel_money', 'zamtel_kwacha') then raise exception 'Please choose MTN, Airtel or Zamtel mobile money'; end if;
  select * into d from meal_deals where id = (payload->>'deal_id')::uuid and status = 'published';
  if not found then raise exception 'This lunch deal is not available right now'; end if;
  if v_kind not in ('trial', 'week', 'team') then raise exception 'Please choose a trial lunch, a week or a team order'; end if;
  if coalesce(v_window, '') = '' or not (v_window = any(d.delivery_windows)) then raise exception 'Please choose a delivery time'; end if;
  if coalesce(trim(w->>'address'), '') = '' then raise exception 'Please enter where to deliver'; end if;
  if v_place = 'office' and coalesce(trim(w->>'company'), '') = '' then raise exception 'Please enter your workplace'; end if;
  if jsonb_array_length(coalesce(payload->'days', '[]'::jsonb)) = 0 then raise exception 'Please choose at least one lunch day'; end if;
  if v_kind = 'trial' and jsonb_array_length(payload->'days') > 1 then raise exception 'A trial is one lunch on one day'; end if;
  if jsonb_array_length(payload->'days') > 14 then raise exception 'Please book at most two weeks at a time'; end if;
  select array_agg((x->>'product_id')::uuid) into v_ids from jsonb_array_elements(d.dishes) x;
  select id, province_id into v_district, v_province from districts where name ilike 'Lusaka' and is_local_zone limit 1;
  v_workplace := concat_ws(', ', nullif(trim(w->>'company'), ''), nullif(trim(w->>'address'), ''));
  -- "Try first, pay for the rest after": only where the seller allows it, for
  -- more than one day, and only for someone who has not booked with this
  -- seller before.
  if v_mode = 'after_first' then
    if not d.trial_first then raise exception 'This lunch plan is paid upfront'; end if;
    if jsonb_array_length(payload->'days') < 2 then v_mode := 'upfront'; end if;
    if exists (select 1 from meal_plans where vendor_id = d.vendor_id and customer_phone = norm_phone(c->>'phone') and status <> 'cancelled') then
      raise exception 'Paying after the first lunch is for first orders. Welcome back! Please choose to pay upfront.';
    end if;
  end if;

  insert into meal_plans (deal_id, vendor_id, kind, customer_name, customer_phone, workplace, delivery_window, lunches, total, referral_code, request,
                          client_ref, payment_method, pay_mode, landmark, place)
  values (d.id, d.vendor_id, v_kind, trim(c->>'full_name'), norm_phone(c->>'phone'), v_workplace, v_window, 0, 0, nullif(lower(payload->>'referral_code'), ''), v_request,
          v_ref, v_method, v_mode, v_landmark, v_place)
  returning * into plan;

  for day in select * from jsonb_array_elements(payload->'days') loop
    v_date := (day->>'date')::date;
    if v_date <= v_today then raise exception 'Lunches are ordered at least a day ahead. % is too soon.', to_char(v_date, 'Dy DD Mon'); end if;
    if v_date = v_today + 1 and v_hour >= d.cutoff_hour then
      raise exception 'Orders for tomorrow close at %:00. Please choose % or later.', d.cutoff_hour, to_char(v_today + 2, 'Dy DD Mon');
    end if;
    if jsonb_array_length(coalesce(day->'items', '[]'::jsonb)) = 0 then raise exception 'Please choose a dish for %', to_char(v_date, 'Dy DD Mon'); end if;
    v_day_qty := 0;
    for it in select * from jsonb_array_elements(day->'items') loop
      if not ((it->>'product_id')::uuid = any(v_ids)) then raise exception 'That dish is not part of this lunch deal'; end if;
      if v_kind = 'trial' and coalesce((it->>'quantity')::int, 1) > 1 then raise exception 'A trial is one lunch'; end if;
      v_lunches := v_lunches + greatest(1, coalesce((it->>'quantity')::int, 1));
      v_day_qty := v_day_qty + greatest(1, coalesce((it->>'quantity')::int, 1));
    end loop;

    r := place_order(jsonb_build_object(
      'customer', jsonb_build_object('full_name', c->>'full_name', 'phone', c->>'phone', 'email', c->>'email',
                                     'province_id', v_province, 'district_id', v_district,
                                     'area', w->>'area', 'address', v_workplace,
                                     'instructions', concat_ws(' · ', 'Lunch delivery ' || v_window, 'Landmark: ' || v_landmark, nullif(trim(w->>'instructions'), ''))),
      'items', (select jsonb_agg(jsonb_build_object('product_id', x->>'product_id', 'quantity', greatest(1, coalesce((x->>'quantity')::int, 1)),
                                                    'choices', jsonb_build_object('Delivery', v_window))) from jsonb_array_elements(day->'items') x),
      'needed_by', v_date,
      'notes', 'Lunch plan LP' || plan.plan_number || ' · ' || v_window || coalesce(' · Request: ' || v_request, ''),
      'referral_code', payload->>'referral_code', 'campaign_code', payload->>'campaign_code',
      'invite_code', payload->>'invite_code', 'store_ref', payload->>'store_ref', 'source', payload->>'source'));
    update orders set meal_plan_id = plan.id where id = (r->>'order_id')::uuid;
    -- Team discount: the best tier this day's number of lunches reaches.
    -- It comes out of ZaMarket's share (no coupon on the order), so the
    -- seller is still paid in full for every lunch.
    v_pct := greatest(meal_group_pct(d.group_discounts, v_day_qty),
                      meal_group_pct(d.day_discounts, jsonb_array_length(payload->'days')));
    if v_pct > 0 then
      select subtotal, delivery_fee into v_sub, v_fee from orders where id = (r->>'order_id')::uuid;
      v_disc := round(coalesce(v_sub, 0) * v_pct / 100, 2);
      update orders set discount = v_disc, total = greatest(coalesce(v_sub, 0) - v_disc, 0) + coalesce(v_fee, 0) where id = (r->>'order_id')::uuid;
      v_saved := v_saved + v_disc;
      v_total := v_total + greatest(coalesce(v_sub, 0) - v_disc, 0) + coalesce(v_fee, 0);
    else
      v_total := v_total + (r->>'total')::numeric;
    end if;
    v_days := v_days + 1;
  end loop;

  update meal_plans set lunches = v_lunches, total = v_total where id = plan.id;
  perform log_audit('meal_plan.placed', 'meal_plans', plan.id, null, jsonb_build_object('total', v_total, 'days', v_days, 'lunches', v_lunches, 'kind', v_kind));
  return jsonb_build_object('plan_id', plan.id, 'reference', 'LP' || plan.plan_number, 'total', v_total, 'days', v_days, 'lunches', v_lunches, 'saved', v_saved, 'pay_mode', v_mode,
    'first_total', (select total from orders where meal_plan_id = plan.id order by needed_by limit 1));
end $$;
revoke all on function public.place_meal_plan(jsonb) from public;
grant execute on function public.place_meal_plan(jsonb) to anon, authenticated;

-- Payment. Upfront: one confirmation pays every day. Pay after the first
-- lunch: the first confirmation pays the first day only; the second pays
-- the rest. Nothing is marked paid until ZaMarket has the money.
create or replace function public.confirm_meal_plan_payment(p_plan uuid, p_method text, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record; mp meal_plans%rowtype; v_first boolean;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into mp from meal_plans where id = p_plan for update;
  if not found or mp.status not in ('awaiting_payment', 'first_paid') then raise exception 'This plan is not waiting for payment'; end if;
  v_first := mp.pay_mode = 'after_first' and mp.status = 'awaiting_payment';
  for o in select id, total, status from orders where meal_plan_id = p_plan and payment_status not in ('paid', 'refunded') and status not in ('cancelled', 'fraud_review')
           order by needed_by limit case when v_first then 1 else null end loop
    if o.status = 'pending' and order_transition_allowed('pending', 'confirmed') then
      perform set_order_status(o.id, 'confirmed', 'Lunch plan confirmed with the customer');
    end if;
    perform record_payment(o.id, p_method, o.total, p_reference);
  end loop;
  update meal_plans set status = case when v_first then 'first_paid' else 'paid' end where id = p_plan;
  perform log_audit(case when v_first then 'meal_plan.first_paid' else 'meal_plan.paid' end, 'meal_plans', p_plan, null, jsonb_build_object('method', p_method, 'reference', p_reference));
end $$;
revoke all on function public.confirm_meal_plan_payment(uuid, text, text) from public, anon;
grant execute on function public.confirm_meal_plan_payment(uuid, text, text) to authenticated;

-- The customer tried the first lunch and did not continue: the unpaid days
-- are cancelled, nothing else changes.
create or replace function public.end_meal_plan_after_first(p_plan uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if not exists (select 1 from meal_plans where id = p_plan and status = 'first_paid') then raise exception 'Only a plan whose first lunch is paid can end here'; end if;
  for o in select id from orders where meal_plan_id = p_plan and payment_status not in ('paid', 'refunded') and status not in ('cancelled', 'fraud_review') loop
    perform set_order_status(o.id, 'cancelled', coalesce(nullif(trim(p_reason), ''), 'Customer did not continue after the first lunch'));
  end loop;
  update meal_plans set status = 'trial_ended' where id = p_plan;
  perform log_audit('meal_plan.trial_ended', 'meal_plans', p_plan, null, null, p_reason);
end $$;
revoke all on function public.end_meal_plan_after_first(uuid, text) from public, anon;
grant execute on function public.end_meal_plan_after_first(uuid, text) to authenticated;

-- Publishing a lunch plan also puts its lunch-only dishes live (still hidden
-- from the shop); holding it takes them back to review.
create or replace function public.meal_deal_dishes_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update products set status = (case when new.status = 'published' then 'published' else 'submitted' end)::product_status
     where lunch_only and vendor_id = new.vendor_id
       and id in (select (x->>'product_id')::uuid from jsonb_array_elements(new.dishes) x)
       and (new.status = 'published' or status = 'published');
  end if;
  return new;
end $$;
drop trigger if exists meal_deal_dishes_follow on public.meal_deals;
create trigger meal_deal_dishes_follow after update of status on public.meal_deals for each row execute function public.meal_deal_dishes_follow();

-- How many lunches each day for the next two weeks, for the kitchen.
create or replace function public.meal_kitchen_days(p_vendor uuid default null, p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := coalesce(p_vendor, my_vendor_id());
begin
  if v is null or not (is_staff() or v = my_vendor_id()) then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('date', d, 'lunches', coalesce(t.q, 0), 'paid', coalesce(t.paid, 0)) order by d)
    from generate_series(lusaka_date(now()), lusaka_date(now()) + least(greatest(p_days, 1), 31) - 1, interval '1 day') g(d)
    left join (
      select o.needed_by, sum(i.quantity)::int as q, sum(i.quantity) filter (where o.payment_status = 'paid')::int as paid
      from orders o join order_items i on i.order_id = o.id and i.vendor_id = v
      where o.meal_plan_id is not null and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')
      group by o.needed_by) t on t.needed_by = g.d::date), '[]'::jsonb);
end $$;
revoke all on function public.meal_kitchen_days(uuid, int) from public, anon;
grant execute on function public.meal_kitchen_days(uuid, int) to authenticated;

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
        'workplace', mp.workplace, 'window', mp.delivery_window, 'request', mp.request,
        'landmark', mp.landmark, 'order_id', o.id,
        'item_ids', (select jsonb_agg(i3.id) from order_items i3 where i3.order_id = o.id and i3.vendor_id = v),
        'kitchen', (select min(i4.vendor_status) from order_items i4 where i4.order_id = o.id and i4.vendor_id = v), 'paid', o.payment_status = 'paid', 'status', o.status,
        'items', (select string_agg(i2.quantity || ' × ' || p2.name, ', ') from order_items i2 join products p2 on p2.id = i2.product_id where i2.order_id = o.id))
        order by mp.delivery_window, mp.workplace)
      from orders o join meal_plans mp on mp.id = o.meal_plan_id
      where o.needed_by = p_date and mp.vendor_id = v and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')), '[]'::jsonb));
end $$;
revoke all on function public.meal_kitchen(date, uuid) from public, anon;
grant execute on function public.meal_kitchen(date, uuid) to authenticated;
