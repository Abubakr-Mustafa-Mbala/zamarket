create or replace function record_payment(p_order uuid, p_method text, p_amount numeric, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  v_total_paid numeric;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;
  -- Serialize payments for the same order to avoid concurrent undercounting.
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('cancelled', 'fraud_review') or o.payment_status = 'refunded' then
    raise exception 'Cannot record a payment for this order state';
  end if;
  insert into payments (order_id, method, amount, reference, status, verified_by)
  values (p_order, p_method, p_amount, nullif(trim(p_reference), ''), 'paid', auth.uid());
  select coalesce(sum(amount), 0) into v_total_paid from payments
    where order_id = p_order and status = 'paid';
  if v_total_paid >= o.total then
    update orders set payment_status = 'paid' where id = p_order;
    if order_transition_allowed(o.status, 'paid') then
      perform set_order_status(p_order, 'paid', 'Payment total reconciled');
    end if;
  else
    update orders set payment_status = 'confirmed' where id = p_order;
  end if;
  perform log_audit('payment.recorded', 'orders', p_order, null,
    jsonb_build_object('method', p_method, 'amount', p_amount,
                       'reference', p_reference, 'total_paid', v_total_paid));
end $$;

