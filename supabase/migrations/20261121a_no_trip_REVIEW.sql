-- 37. Deliveries that cost nothing.
--
-- When a customer comes to you and nothing was spent on a trip, the order can
-- now say so ("collected, no trip"). Profit and the delivery fund then stop
-- assuming a trip cost for it. Orders with a delivery and no cost recorded
-- still assume the cost in Setup, as before. Nothing is deleted.

-- What a delivery cost us: the real cost when recorded; nothing when the
-- customer collected; otherwise the assumed cost from Setup.
create or replace function order_delivery_cost(p_order uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(sum(d.delivery_cost + d.fuel_cost), 0) > 0 then coalesce(sum(d.delivery_cost + d.fuel_cost), 0)
    when (select collection from orders where id = p_order) then 0
    when count(d.*) = 0 then 0
    else count(d.*) * coalesce(setting_num('assumed_delivery_cost'), 0) end
  from deliveries d where d.order_id = p_order;
$$;

create or replace function order_profit(p_order uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and not is_staff() then null else o.subtotal + o.delivery_fee
    - coalesce((select sum(oi.unit_cost_snapshot * oi.quantity) from order_items oi join products p on p.id = oi.product_id
                where oi.order_id = o.id and p.owner_type = 'founder'), 0)
    - coalesce((select sum(net_payable) from settlements st where st.order_id = o.id and st.status <> 'cancelled'), 0)
    - coalesce((select sum(amount) from commissions c where c.order_id = o.id and c.status not in ('rejected','reversed')), 0)
    - order_delivery_cost(o.id) end
  from orders o where o.id = p_order;
$$;

-- Mark an order as collected by the customer: no trip, no trip cost. Works on
-- completed orders too, because that is usually when you notice. The amount
-- the customer paid is not changed; for an order still open, use the normal
-- delivery/collection switch so the delivery fee comes off as well.
create or replace function set_no_trip(p_order uuid, p_no_trip boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('completed', 'delivered') then
    perform set_collection(p_order, p_no_trip, p_reason);
    return;
  end if;
  perform set_config('zm.order_fn', 'on', true);
  update orders set collection = p_no_trip where id = p_order;
  perform set_config('zm.order_fn', 'off', true);
  perform log_audit(case when p_no_trip then 'order.no_trip' else 'order.trip' end, 'orders', p_order,
    jsonb_build_object('collection', o.collection), jsonb_build_object('collection', p_no_trip), p_reason);
end $$;
grant execute on function set_no_trip(uuid, boolean, text) to authenticated;

create or replace function dashboard_summary(p_from date default (current_date - 30), p_to date default current_date) returns jsonb
language sql stable security definer set search_path = public as $$
  with guard as (select is_staff() as ok),
  o as (
    select * from orders where lusaka_date(created_at) between p_from and p_to and status not in ('cancelled','fraud_review')
  ), items as (
    select oi.*, p.owner_type from order_items oi join o on o.id = oi.order_id join products p on p.id = oi.product_id
  )
  select case when not (select ok from guard) then null else jsonb_build_object(
    'orders', (select count(*) from o),
    'completed', (select count(*) from o where status = 'completed'),
    'revenue', (select coalesce(sum(subtotal),0) from o),
    'revenue_completed', (select coalesce(sum(subtotal),0) from o where status = 'completed'),
    'cogs', (select coalesce(sum(unit_cost_snapshot * quantity),0) from items where owner_type = 'founder'),
    'marketplace_fees', (select coalesce(sum(marketplace_fee),0) from settlements s join o on o.id = s.order_id where s.status <> 'cancelled'),
    'commissions', (select coalesce(sum(amount),0) from commissions c join o on o.id = c.order_id where c.status not in ('rejected','reversed')),
    'delivery_costs', (select coalesce(sum(order_delivery_cost(o.id)), 0) from o where exists (select 1 from deliveries d where d.order_id = o.id)),
    'delivery_income', (select coalesce(sum(delivery_fee),0) from o),
    -- Completed orders only, so these lines add up to the profit shown.
    'done_delivery_income', (select coalesce(sum(delivery_fee),0) from o where status = 'completed'),
    'done_cogs', (select coalesce(sum(unit_cost_snapshot * quantity),0) from items i join o on o.id = i.order_id where o.status = 'completed' and i.owner_type = 'founder'),
    'done_vendor_payouts', (select coalesce(sum(net_payable),0) from settlements s join o on o.id = s.order_id where s.status <> 'cancelled' and o.status = 'completed'),
    'done_commissions', (select coalesce(sum(amount),0) from commissions c join o on o.id = c.order_id where c.status not in ('rejected','reversed') and o.status = 'completed'),
    'done_delivery_costs', (select coalesce(sum(order_delivery_cost(o.id)),0) from o where status = 'completed'),
    'orders_profit', (select coalesce(sum(order_profit(o.id)),0) from o where status = 'completed'),
    'ad_spend', (select coalesce(sum(amount),0) from marketing_spend where spent_on between p_from and p_to),
    'expenses', (select coalesce(sum(amount),0) from expenses where spent_on between p_from and p_to),
    'pending_orders', (select count(*) from orders where status = 'pending'),
    'pending_deliveries', (select count(*) from orders where status in ('processing','ready_for_dispatch','out_for_delivery')),
    'pending_payments', (select coalesce(sum(total),0) from orders where payment_status = 'pending' and status not in ('cancelled','fraud_review')),
    'commissions_owed', (select coalesce(sum(amount),0) from commissions where status in ('verified','approved')),
    'vendor_payables', (select coalesce(sum(net_payable),0) from settlements where status in ('eligible','approved')),
    'inventory_value', (select coalesce(sum(stock_available * product_effective_cost(p)),0) from products p where owner_type = 'founder' and p.offering_type is distinct from 'vehicle' and p.third_party_owner is null),
    'low_stock', (select count(*) from products where owner_type = 'founder' and status in ('published','out_of_stock') and stock_available <= 3 and offering_type is distinct from 'vehicle' and third_party_owner is null and not lunch_only),
    'waiting_demand', (select count(*) from stock_requests where not fulfilled),
    'contributions', (select coalesce(sum(amount),0) from founder_contributions),
    'withdrawals', (select coalesce(sum(amount),0) from founder_withdrawals),
    'refund_count', (select count(*) from orders where lusaka_date(created_at) between p_from and p_to and status in ('refunded','returned')),
    'cod_failed', (select count(*) from orders where lusaka_date(created_at) between p_from and p_to and status in ('failed_delivery','customer_unreachable'))
  ) end;
$$;

create or replace function losing_orders(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'profit')::numeric) from (
    select jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'date', lusaka_date(o.completed_at),
      'customer', c.full_name, 'total', o.total, 'profit', round(order_profit(o.id), 2),
      'delivery_charged', o.delivery_fee,
      'delivery_cost', order_delivery_cost(o.id),
      'commission', coalesce((select sum(amount) from commissions cm where cm.order_id = o.id and cm.status <> 'rejected'), 0),
      'discount', greatest(0, coalesce((select sum(i.quantity * coalesce(nullif(p.normal_price, 0), i.unit_price)) - sum(i.line_total)
                       from order_items i join products p on p.id = i.product_id where i.order_id = o.id), 0))
    ) as x
    from orders o left join customers c on c.id = o.customer_id
    where o.status = 'completed' and lusaka_date(o.completed_at) between p_from and p_to
      and order_profit(o.id) < 0) t), '[]');
end $$;
