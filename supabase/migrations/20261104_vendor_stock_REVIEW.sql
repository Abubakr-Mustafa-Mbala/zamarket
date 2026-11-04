-- Stock that vendors can actually count, and a prize that cannot be sold.
--
-- Two problems, one cause.
--
-- A vendor could never enter HOW MANY of something they had — only flip a
-- switch marked "sold out" by hand. So the marketplace had no idea whether a
-- seller had one blender or thirty, and nothing stopped the same last item
-- being sold twice while the first order was still being confirmed.
--
-- That is also why a giveaway prize was at risk: checking that a second unit
-- exists is not the same as holding one back. Between the check and the draw,
-- ordinary checkout could sell both.
--
-- So: counting becomes optional per product (a baker working to order has no
-- shelf to count, and should not be made to pretend otherwise), and a live
-- giveaway holds its prize out of sale until it is over.

alter table public.products add column if not exists tracks_stock boolean not null default false;

-- Existing vendor products keep behaving exactly as they do today: counting
-- stays off until a vendor turns it on for a product.

create or replace function apply_movement(p_product uuid, p_type movement_type, p_qty int, p_reason text, p_ref_type text, p_ref_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into inventory_movements (product_id, type, quantity, reason, reference_type, reference_id, user_id)
  values (p_product, p_type, p_qty, p_reason, p_ref_type, p_ref_id, auth.uid());

  case p_type
    when 'purchase_received' then update products set stock_available = stock_available + p_qty where id = p_product;
    when 'reserve' then update products set stock_available = stock_available - p_qty, stock_reserved = stock_reserved + p_qty where id = p_product;
    when 'release' then update products set stock_available = stock_available + p_qty, stock_reserved = stock_reserved - p_qty where id = p_product;
    when 'sale' then update products set stock_reserved = stock_reserved - p_qty, stock_sold = stock_sold + p_qty where id = p_product;
    when 'return' then update products set stock_available = stock_available + p_qty, stock_returned = stock_returned + p_qty where id = p_product;
    when 'damage' then update products set stock_available = stock_available - p_qty, stock_damaged = stock_damaged + p_qty where id = p_product;
    when 'loss' then update products set stock_available = stock_available - p_qty, stock_lost = stock_lost + p_qty where id = p_product;
    when 'adjustment' then update products set stock_available = stock_available + p_qty where id = p_product;
  end case;

  -- Sold out flips the listing by itself, for a founder product or for a
  -- vendor product that counts its stock. A vendor who does not count keeps
  -- the manual switch they had.
  update products set status = 'out_of_stock'
   where id = p_product and stock_available <= 0 and status = 'published'
     and fulfilment = 'in_stock' and (owner_type = 'founder' or tracks_stock);
  update products set status = 'published' where id = p_product and stock_available > 0 and status = 'out_of_stock' and fulfilment = 'in_stock';
end $$;

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

  -- the affiliate who first brought this customer keeps them on the books
  if rs.id is not null and cust.owner_reseller_id is null then
    update customers set owner_reseller_id = rs.id, owned_since = now() where id = cust.id;
    cust.owner_reseller_id := rs.id;
  end if;

  -- a customer an affiliate brought stays theirs for the full-commission window
  if rs.id is null and not v_manual and cust.owner_reseller_id is not null then
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

  insert into orders (customer_id, referrer_vendor_id, source, channel, seller_type, reseller_id, referral_code, province_id, district_id, area, address, instructions,
                      is_local, delivery_fee, delivery_fee_status, collection, is_manual, notes, risk_flags, created_by)
  values (cust.id, v_referrer, v_source, v_channel, v_seller, rs.id, nullif(payload->>'referral_code',''), (c->>'province_id')::int, (c->>'district_id')::int,
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

-- --- holding the prize -----------------------------------------------------
--
-- A giveaway going live takes its prize out of sale. Cancelling or finishing
-- gives it back. Both go through the same movement ledger as every other
-- stock change, so the reservation is visible in the inventory history rather
-- than being a number that silently moved.
create or replace function public.reserve_giveaway_prize(p_slug text, p_hold boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; p products%rowtype; want int; got int;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if c.product_id is null then return jsonb_build_object('held', 0, 'why', 'no product'); end if;

  select * into p from products where id = c.product_id for update;
  if not found then return jsonb_build_object('held', 0, 'why', 'product gone'); end if;

  -- Made to order and services are made on request: there is nothing on a
  -- shelf to hold, and holding would wrongly block real orders.
  if p.fulfilment <> 'in_stock' then return jsonb_build_object('held', 0, 'why', 'made to order'); end if;
  if not (p.owner_type = 'founder' or p.tracks_stock) then
    return jsonb_build_object('held', 0, 'why', 'this seller does not count stock');
  end if;

  want := greatest(c.winners, 1);

  if p_hold then
    got := least(want, greatest(p.stock_available, 0));
    if got > 0 then
      perform apply_movement(p.id, 'reserve', got,
        'Held for giveaway ' || c.slug, 'giveaway', c.id);
    end if;
    return jsonb_build_object('held', got, 'wanted', want,
      'short', want - got);
  end if;

  -- Giving it back: only what this campaign actually took.
  select coalesce(sum(m.quantity), 0) into got
    from inventory_movements m
   where m.reference_type = 'giveaway' and m.reference_id = c.id and m.type = 'reserve';
  select got - coalesce(sum(m.quantity), 0) into got
    from inventory_movements m
   where m.reference_type = 'giveaway' and m.reference_id = c.id and m.type = 'release';
  if got > 0 then
    perform apply_movement(p.id, 'release', got,
      'Giveaway ' || c.slug || ' ended', 'giveaway', c.id);
  end if;
  return jsonb_build_object('released', greatest(got, 0));
end $$;

revoke all on function public.reserve_giveaway_prize(text, boolean) from public, anon;
grant execute on function public.reserve_giveaway_prize(text, boolean) to authenticated;

-- --- a vendor counting their own stock -------------------------------------
--
-- Turning counting on, and setting or adding to the number. A vendor may only
-- touch their own products, and the change goes through the movement ledger
-- like every other stock change so the history is honest.
create or replace function public.vendor_set_stock(p_product uuid, p_count int, p_track boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p products%rowtype; diff int;
begin
  select * into p from products where id = p_product for update;
  if not found then raise exception 'No such product'; end if;
  if not (p.vendor_id = my_vendor_id() or is_staff()) then raise exception 'Not your product'; end if;
  if p_count < 0 then raise exception 'Stock cannot be negative'; end if;

  update products set tracks_stock = p_track where id = p.id;

  if not p_track then
    return jsonb_build_object('tracking', false);
  end if;

  -- Recorded as an adjustment, with a reason, rather than by writing the
  -- number straight over the old one. A count that changes with no trace is
  -- how stock quietly stops matching the shelf.
  diff := p_count - greatest(p.stock_available, 0);
  if diff <> 0 then
    perform apply_movement(p.id, 'adjustment', diff,
      case when diff > 0 then 'Seller added stock' else 'Seller corrected the count' end,
      'vendor', p.vendor_id);
  end if;

  select * into p from products where id = p.id;
  return jsonb_build_object('tracking', true, 'available', p.stock_available, 'status', p.status);
end $$;

revoke all on function public.vendor_set_stock(uuid, int, boolean) from public, anon;
grant execute on function public.vendor_set_stock(uuid, int, boolean) to authenticated;
