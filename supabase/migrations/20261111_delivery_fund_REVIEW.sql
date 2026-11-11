-- The delivery fund.
--
-- Every vendor sale puts a small amount aside for delivery, on top of the
-- marketplace fee. Bigger sales put in more, up to a ceiling, so they pay for
-- the trips of the small ones. When no affiliate brought the sale, their unused
-- share goes into the fund as well. Trips are paid out of it, and delivery is
-- free to the customer.
--
-- What does NOT change:
--   · the seller receives exactly what they asked for;
--   · the marketplace fee and the affiliate's share are worked out as before;
--   · checkout, payouts and commissions are untouched.
--
-- The fund is an account kept in the books, not a separate bank account: the
-- money arrives with the order like any other, and this tracks how much of it
-- is set aside for delivery and how much has been spent.
--
-- Safe to run more than once.

-- Delivery becomes free the first time this runs, because that is what the
-- fund is for. Running it again leaves whatever you have set since.
do $$
begin
  if not exists (select 1 from public.settings where key = 'delivery_fund_pct') then
    update public.settings set value = 'true'::jsonb where key = 'delivery_included';
  end if;
end $$;

insert into public.settings (key, value, description) values
  ('delivery_fund_pct', '3', 'Share of what the seller asked that goes into the delivery fund on every vendor sale (%)'),
  ('delivery_fund_min', '8', 'Smallest delivery-fund amount per item (K)'),
  ('delivery_fund_max', '60', 'Largest delivery-fund amount per item (K). 0 means no ceiling.'),
  ('delivery_fund_takes_unclaimed', 'true', 'When no affiliate brought the sale, their share goes into the delivery fund')
on conflict (key) do nothing;

-- What one unit puts into the fund, given what the seller asked for it.
create or replace function public.delivery_fund_for(p_take numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_take, 0) <= 0 or coalesce(setting_num('delivery_fund_pct'), 0) <= 0 then 0
    else round(
      least(
        greatest(p_take * setting_num('delivery_fund_pct') / 100, coalesce(setting_num('delivery_fund_min'), 0)),
        case when coalesce(setting_num('delivery_fund_max'), 0) > 0
             then greatest(setting_num('delivery_fund_max'), coalesce(setting_num('delivery_fund_min'), 0))
             else 1e12 end
      ), 2)
  end;
$$;
grant execute on function public.delivery_fund_for(numeric) to anon, authenticated;

-- The shelf price: the seller's amount grossed up for the marketplace fee and
-- the affiliate's room exactly as before, plus the fund amount, rounded up.
-- The fund is added after the percentages, so no percentage is charged on it.
create or replace function public.shelf_price(p_take numeric, p_fee_pct numeric default null, p_allowance_pct numeric default null)
returns numeric language sql stable set search_path = public as $$
  select case
    when coalesce(p_take, 0) <= 0 then 0
    else (
      select greatest(ceil(((p_take / nullif(1 - kept, 0)) + delivery_fund_for(p_take)) / step) * step, p_take)
      from (select
              least(greatest((coalesce(p_fee_pct, setting_num('marketplace_fee_pct'))
                            + coalesce(p_allowance_pct, setting_num('commission_allowance_pct'))) / 100.0, 0), 0.9) as kept,
              greatest(coalesce(setting_num('price_rounding'), 1), 0.01) as step) s
    )
  end;
$$;
grant execute on function public.shelf_price(numeric, numeric, numeric) to anon, authenticated;

-- Reprice every vendor product by the new rule. The trigger that keeps shelf
-- prices in step does the work; setting the seller's amount to itself wakes it.
update public.products set vendor_price = vendor_price
 where owner_type = 'vendor' and vendor_id is not null and vendor_price > 0;

-- What a seller sees as they type their price.
create or replace function public.price_preview(p_take numeric, p_vendor uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with v as (select coalesce(p_vendor, my_vendor_id()) as id),
       t as (select vendor_terms((select id from v)) as j),
       s as (select
          shelf_price(p_take, ((select j from t)->>'fee_pct')::numeric, ((select j from t)->>'allowance_pct')::numeric) as shelf,
          ((select j from t)->>'fee_pct')::numeric as fee_pct,
          ((select j from t)->>'allowance_pct')::numeric as allow_pct,
          ((select j from t)->>'delivery_fee')::numeric as delivery,
          delivery_fund_for(p_take) as fund)
  select jsonb_build_object(
    'take_requested', round(coalesce(p_take, 0), 2),
    'shelf', round(s.shelf, 2),
    'fee_pct', s.fee_pct,
    'allowance_pct', s.allow_pct,
    'vendor_receives', round(coalesce(p_take, 0), 2),
    'margin_total', round(s.shelf - coalesce(p_take, 0), 2),
    'delivery_fund', round(s.fund, 2),
    'marketplace_share', round(s.shelf - coalesce(p_take, 0) - s.fund, 2),
    'free_delivery', setting_text('delivery_included') = 'true',
    'affiliate_if_referred', round(s.shelf * s.allow_pct / 100, 2),
    'marketplace_if_referred', round(s.shelf - coalesce(p_take, 0) - s.fund - s.shelf * s.allow_pct / 100, 2),
    'marketplace_if_not', round(s.shelf - coalesce(p_take, 0) - s.fund
                                - case when setting_text('delivery_fund_takes_unclaimed') = 'true'
                                       then s.shelf * s.allow_pct / 100 else 0 end, 2),
    'delivery_fee', s.delivery,
    'below_minimum', (s.shelf - coalesce(p_take, 0) - s.fund - s.shelf * s.allow_pct / 100) < setting_num('min_margin_kwacha'))
  from s;
$$;
grant execute on function public.price_preview(numeric, uuid) to authenticated;

-- What each order line put into the fund, frozen when the order is placed so
-- a later change of percentage does not rewrite history.
alter table public.order_items add column if not exists delivery_fund numeric not null default 0;

create or replace function public.order_item_delivery_fund() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_id is not null and coalesce(new.vendor_take, 0) > 0 then
    -- Never more than the line actually carries above the seller's amount,
    -- so a product priced before the fund existed cannot overstate it.
    new.delivery_fund := round(
      least(delivery_fund_for(new.vendor_take), greatest(coalesce(new.unit_price, 0) - new.vendor_take, 0))
      * coalesce(new.quantity, 1), 2);
  end if;
  return new;
end $$;
drop trigger if exists trg_order_item_delivery_fund on public.order_items;
-- Named to run after any other before-insert trigger that fills vendor_take.
create trigger trg_order_item_delivery_fund before insert on public.order_items
  for each row execute function public.order_item_delivery_fund();

-- Money put into or taken out of the fund by hand: topping it up, or moving
-- a surplus out. Each needs a reason, and only a founder can do it.
create table if not exists public.delivery_fund_adjustments (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount <> 0),
  note text not null check (length(note) between 3 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.delivery_fund_adjustments enable row level security;
revoke all on public.delivery_fund_adjustments from anon, authenticated;

create or replace function public.delivery_fund_adjust(p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_founder() then raise exception 'Founders only'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Enter an amount'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Say why'; end if;
  insert into delivery_fund_adjustments (amount, note, created_by)
  values (round(p_amount, 2), left(trim(p_note), 500), auth.uid()) returning id into new_id;
  perform log_audit('delivery_fund.adjust', 'delivery_fund_adjustments', new_id, null,
    jsonb_build_object('amount', round(p_amount, 2)), left(trim(p_note), 500));
end $$;
revoke all on function public.delivery_fund_adjust(numeric, text) from public, anon;
grant execute on function public.delivery_fund_adjust(numeric, text) to authenticated;

-- The fund's account for a period, and its balance since the start.
--
-- In:  the fund amount on every line of a completed order, plus, when no
--      affiliate earned on the order, the affiliate room in its prices.
-- Out: what was recorded as paid for each delivery (rider plus fuel). A
--      delivered order with nothing recorded is counted at the "what a
--      delivery really costs you" setting and shown separately, so the
--      balance is never flattered by a missing figure.
create or replace function public.delivery_fund_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d_from date := coalesce(p_from, date_trunc('month', lusaka_date(now()))::date);
  d_to date := coalesce(p_to, lusaka_date(now()));
  take_unclaimed boolean := setting_text('delivery_fund_takes_unclaimed') = 'true';
  assumed numeric := coalesce(setting_num('assumed_delivery_cost'), 0);
  period jsonb; ever jsonb;
begin
  if not is_staff() then raise exception 'Staff only'; end if;

  with done as (
    select o.id, o.collection, lusaka_date(o.completed_at) as day
      from orders o
     where o.status = 'completed' and o.completed_at is not null
  ),
  spent as (
    -- A trip that was paid for counts even if the order later fell through.
    select o.id, lusaka_date(coalesce(d.delivered_at, o.completed_at, o.created_at)) as day,
           (d.delivery_cost + d.fuel_cost) as cost
      from deliveries d join orders o on o.id = d.order_id
     where d.delivery_cost + d.fuel_cost > 0
  ),
  unpriced as (
    select dn.id, dn.day from done dn
     where not dn.collection
       and not exists (select 1 from spent s where s.id = dn.id)
  ),
  ins as (
    select dn.day,
           coalesce(sum(oi.delivery_fund), 0) as from_sales,
           coalesce(sum(case
             when take_unclaimed and coalesce(oi.vendor_take, 0) > 0
                  and not exists (select 1 from commissions c where c.order_id = dn.id and c.status not in ('rejected', 'reversed'))
             then round(oi.unit_price * oi.quantity * coalesce((vendor_terms(oi.vendor_id)->>'allowance_pct')::numeric, 0) / 100, 2)
             else 0 end), 0) as from_unclaimed
      from done dn join order_items oi on oi.order_id = dn.id
     group by dn.day
  ),
  agg as (
    select
      (select coalesce(sum(from_sales), 0) from ins where day between d_from and d_to) as p_sales,
      (select coalesce(sum(from_unclaimed), 0) from ins where day between d_from and d_to) as p_unclaimed,
      (select coalesce(sum(cost), 0) from spent where day between d_from and d_to) as p_trips,
      (select count(*) from spent where day between d_from and d_to) as p_trip_count,
      (select count(*) from unpriced where day between d_from and d_to) as p_unpriced,
      (select coalesce(sum(amount), 0) from delivery_fund_adjustments where lusaka_date(created_at) between d_from and d_to) as p_adjust,
      (select count(*) from done where day between d_from and d_to) as p_orders,
      (select count(*) from done where day between d_from and d_to and not collection) as p_delivered,
      (select coalesce(sum(from_sales + from_unclaimed), 0) from ins) as e_in,
      (select coalesce(sum(cost), 0) from spent) as e_out,
      (select count(*) from unpriced) as e_unpriced,
      (select coalesce(sum(amount), 0) from delivery_fund_adjustments) as e_adjust
  )
  select jsonb_build_object(
      'from', d_from, 'to', d_to,
      'in_sales', round(p_sales, 2),
      'in_unclaimed', round(p_unclaimed, 2),
      'adjustments', round(p_adjust, 2),
      'out_trips', round(p_trips, 2),
      'trips_recorded', p_trip_count,
      'trips_unrecorded', p_unpriced,
      'unrecorded_estimate', round(p_unpriced * assumed, 2),
      'orders_completed', p_orders,
      'orders_delivered', p_delivered,
      'net', round(p_sales + p_unclaimed + p_adjust - p_trips - p_unpriced * assumed, 2),
      'avg_in_per_delivery', case when p_delivered > 0 then round((p_sales + p_unclaimed) / p_delivered, 2) end,
      'avg_cost_per_trip', case when p_trip_count > 0 then round(p_trips / p_trip_count, 2) end),
    jsonb_build_object(
      'balance', round(e_in + e_adjust - e_out - e_unpriced * assumed, 2),
      'unrecorded', e_unpriced)
    into period, ever
    from agg;

  return period || jsonb_build_object('all_time', ever, 'settings', jsonb_build_object(
    'pct', setting_num('delivery_fund_pct'), 'min', setting_num('delivery_fund_min'),
    'max', setting_num('delivery_fund_max'), 'takes_unclaimed', take_unclaimed,
    'free_delivery', setting_text('delivery_included') = 'true', 'assumed_cost', assumed));
end $$;
revoke all on function public.delivery_fund_summary(date, date) from public, anon;
grant execute on function public.delivery_fund_summary(date, date) to authenticated;
