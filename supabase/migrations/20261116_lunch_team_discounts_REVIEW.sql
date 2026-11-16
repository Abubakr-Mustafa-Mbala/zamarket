-- 27. Lunch plans: team discounts and customer requests.
--
-- A lunch plan can offer a discount when one delivery has several lunches
-- (a manager ordering for the team): for example 5 or more lunches in one
-- day, 5% off that day. ZaMarket sets the tiers and funds them from its own
-- share, so the seller is still paid in full. At most 10% and 4 tiers.
-- Customers can also write a request with their booking; the kitchen and
-- ZaMarket see it and confirm with the customer.

alter table public.meal_deals add column if not exists group_discounts jsonb not null default '[]'::jsonb;
alter table public.meal_plans add column if not exists request text check (request is null or length(request) <= 300);

grant select (group_discounts) on public.meal_deals to anon, authenticated;

-- Only staff may set or change the discount tiers, and they must be sane.
create or replace function public.meal_deals_discount_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t jsonb; n int := 0;
begin
  if new.group_discounts is distinct from (case when tg_op = 'UPDATE' then old.group_discounts else '[]'::jsonb end) then
    if not is_staff() then raise exception 'Only ZaMarket can set team discounts'; end if;
    if jsonb_typeof(new.group_discounts) <> 'array' then raise exception 'Team discounts must be a list'; end if;
    for t in select * from jsonb_array_elements(new.group_discounts) loop
      n := n + 1;
      if n > 4 then raise exception 'At most 4 team discount levels'; end if;
      if coalesce((t->>'min')::int, 0) < 2 or (t->>'min')::int > 100 then raise exception 'A team discount starts from 2 to 100 lunches'; end if;
      if coalesce((t->>'pct')::numeric, 0) <= 0 or (t->>'pct')::numeric > 10 then raise exception 'A team discount is between 1%% and 10%%'; end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists meal_deals_discount_guard on public.meal_deals;
create trigger meal_deals_discount_guard before insert or update on public.meal_deals
  for each row execute function public.meal_deals_discount_guard();

-- The percentage for a number of lunches in one delivery: the best tier reached.
create or replace function public.meal_group_pct(tiers jsonb, qty int) returns numeric
language sql immutable set search_path = public as $$
  select coalesce(max(least((t->>'pct')::numeric, 10)), 0)
  from jsonb_array_elements(case when jsonb_typeof(tiers) = 'array' then tiers else '[]'::jsonb end) t
  where qty >= (t->>'min')::int;
$$;

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

  insert into meal_plans (deal_id, vendor_id, kind, customer_name, customer_phone, workplace, delivery_window, lunches, total, referral_code, request)
  values (d.id, d.vendor_id, v_kind, trim(c->>'full_name'), norm_phone(c->>'phone'), v_workplace, v_window, 0, 0, nullif(lower(payload->>'referral_code'), ''), v_request)
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
                                     'instructions', concat_ws(' · ', 'Lunch delivery ' || v_window, nullif(trim(w->>'instructions'), ''))),
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
    v_pct := meal_group_pct(d.group_discounts, v_day_qty);
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
  return jsonb_build_object('plan_id', plan.id, 'reference', 'LP' || plan.plan_number, 'total', v_total, 'days', v_days, 'lunches', v_lunches, 'saved', v_saved);
end $$;
revoke all on function public.place_meal_plan(jsonb) from public;
grant execute on function public.place_meal_plan(jsonb) to anon, authenticated;

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
        'workplace', mp.workplace, 'window', mp.delivery_window, 'request', mp.request, 'paid', o.payment_status = 'paid', 'status', o.status,
        'items', (select string_agg(i2.quantity || ' × ' || p2.name, ', ') from order_items i2 join products p2 on p2.id = i2.product_id where i2.order_id = o.id))
        order by mp.delivery_window, mp.workplace)
      from orders o join meal_plans mp on mp.id = o.meal_plan_id
      where o.needed_by = p_date and mp.vendor_id = v and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')), '[]'::jsonb));
end $$;
revoke all on function public.meal_kitchen(date, uuid) from public, anon;
grant execute on function public.meal_kitchen(date, uuid) to authenticated;
