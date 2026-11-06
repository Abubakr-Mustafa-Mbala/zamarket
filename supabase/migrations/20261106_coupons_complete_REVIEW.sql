-- ZaMarket coupons — finish the system. REVIEW BEFORE DEPLOYMENT.
--
-- The coupon tables, the funding split and the settlement apportionment were
-- already built and are correct: set_order_status spreads the discount across
-- the order's lines by value, and takes it from the vendor's net when the
-- vendor funded it, or from ZaMarket's share when ZaMarket did.
--
-- What was missing:
--   1. per_customer_limit was stored but never checked, so one person could
--      reuse a coupon until the overall usage_limit ran out. That is money.
--   2. No way to give a coupon to specific people. Every coupon was a public
--      code that anyone who saw it could use.
--   3. A founder could create a coupon funded by a vendor without the vendor
--      ever agreeing to it. The vendor must know and accept before it is live.
--
-- Nothing here changes product pricing, delivery fees, commission rates or
-- vendor payout percentages.

-- ---------------------------------------------------------------
-- 1. Who a coupon is for, and whether its funder has agreed
-- ---------------------------------------------------------------

alter table public.coupons
  add column if not exists audience text not null default 'public',
  add column if not exists vendor_ack_at timestamptz,
  add column if not exists vendor_ack_by uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'coupons_audience_check') then
    alter table public.coupons add constraint coupons_audience_check
      check (audience in ('public', 'targeted'));
  end if;
end $$;

-- 'awaiting_vendor' is a coupon the founder wrote that the seller has not
-- agreed to fund yet. It is not redeemable until they do.
do $$ begin
  alter table public.coupons drop constraint if exists coupons_status_check;
  alter table public.coupons add constraint coupons_status_check
    check (status in ('active', 'paused', 'expired', 'awaiting_vendor', 'declined'));
end $$;

-- The people a targeted coupon was given to. Phone is the identity, because
-- a customer may order before they ever create an account.
create table if not exists public.coupon_recipients (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  phone       text not null,
  name        text,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create unique index if not exists coupon_recipient_once
  on public.coupon_recipients (coupon_id, public.norm_phone(phone));
create index if not exists coupon_recipient_phone_idx
  on public.coupon_recipients (public.norm_phone(phone));

alter table public.coupon_recipients enable row level security;

do $$ begin
  if not exists (select 1 from pg_policy where polname = 'staff_coupon_recipients') then
    create policy staff_coupon_recipients on public.coupon_recipients
      for all using (public.is_staff());
  end if;
  -- A seller may see who their own coupon was given to, because they are
  -- paying for it. They may not see anyone else's list.
  if not exists (select 1 from pg_policy where polname = 'vendor_coupon_recipients') then
    create policy vendor_coupon_recipients on public.coupon_recipients
      for select using (exists (
        select 1 from public.coupons c
         where c.id = coupon_recipients.coupon_id
           and c.vendor_id is not null
           and c.vendor_id = public.my_vendor_id()));
  end if;
end $$;

-- ---------------------------------------------------------------
-- 2. coupon_check — now aware of who is asking
-- ---------------------------------------------------------------

create or replace function public.coupon_check(
  p_code text, p_subtotal numeric, p_vendor uuid default null, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c coupons%rowtype;
  disc numeric;
  used_by_them int;
  is_recipient boolean;
begin
  select * into c from coupons where lower(code) = lower(trim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reason', 'We do not recognise that code.'); end if;

  if c.status = 'awaiting_vendor' then
    return jsonb_build_object('ok', false, 'reason', 'That code is not active.');
  end if;
  if c.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'That code is not active.'); end if;

  -- A discount the seller is paying for cannot go live until the seller has
  -- agreed to it. Their own coupons are acknowledged when they create them.
  if c.funded_by = 'vendor' and c.vendor_ack_at is null then
    return jsonb_build_object('ok', false, 'reason', 'That code is not active.');
  end if;

  if c.starts_at > now() then return jsonb_build_object('ok', false, 'reason', 'That code is not live yet.'); end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'That code has expired.');
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return jsonb_build_object('ok', false, 'reason', 'That code has been fully used.');
  end if;

  -- Given to named people only. Anyone else holding the code cannot use it.
  if c.audience = 'targeted' then
    if coalesce(trim(p_phone), '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'That code was sent to a specific customer.');
    end if;
    select true into is_recipient from coupon_recipients r
      where r.coupon_id = c.id and norm_phone(r.phone) = norm_phone(p_phone) limit 1;
    if not coalesce(is_recipient, false) then
      return jsonb_build_object('ok', false, 'reason', 'That code was sent to a specific customer.');
    end if;
  end if;

  -- How many times this person has already used it. Stored but never checked
  -- before, so one customer could use a coupon over and over.
  if coalesce(trim(p_phone), '') <> '' and c.per_customer_limit is not null then
    select count(*) into used_by_them
      from coupon_uses u
      join customers cu on cu.id = u.customer_id
     where u.coupon_id = c.id and norm_phone(cu.phone) = norm_phone(p_phone);
    if used_by_them >= c.per_customer_limit then
      return jsonb_build_object('ok', false, 'reason', 'You have already used that code.');
    end if;
  end if;

  if coalesce(p_subtotal, 0) < c.min_order then
    return jsonb_build_object('ok', false, 'reason',
      'That code needs an order of at least K' || trim(to_char(c.min_order, 'FM999999990.00')) || '.');
  end if;
  if c.vendor_id is not null and p_vendor is distinct from c.vendor_id then
    return jsonb_build_object('ok', false, 'reason', 'That code only works on one seller''s items.');
  end if;

  disc := case when c.kind = 'pct' then round(p_subtotal * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then disc := least(disc, c.max_discount); end if;
  disc := greatest(least(disc, coalesce(p_subtotal, 0)), 0);

  return jsonb_build_object(
    'ok', true, 'id', c.id, 'code', c.code, 'discount', disc,
    'funded_by', c.funded_by, 'description', c.description,
    'label', case when c.kind = 'pct' then c.value || '% off' else 'K' || trim(to_char(c.value, 'FM999999990.00')) || ' off' end);
end $$;

grant execute on function public.coupon_check(text, numeric, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 3. The seller agrees to fund a coupon the founder wrote for them
-- ---------------------------------------------------------------

create or replace function public.answer_coupon(p_coupon uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c coupons%rowtype; v uuid := my_vendor_id();
begin
  select * into c from coupons where id = p_coupon for update;
  if not found then raise exception 'Coupon not found'; end if;
  if c.funded_by <> 'vendor' then raise exception 'That coupon is not funded by a seller'; end if;
  if v is null or c.vendor_id is distinct from v then raise exception 'Not allowed'; end if;
  if c.vendor_ack_at is not null then
    return jsonb_build_object('ok', true, 'status', c.status, 'note', 'Already answered');
  end if;

  if p_accept then
    update coupons set status = 'active', vendor_ack_at = now(), vendor_ack_by = auth.uid()
     where id = p_coupon;
  else
    update coupons set status = 'declined', vendor_ack_at = now(), vendor_ack_by = auth.uid()
     where id = p_coupon;
  end if;

  perform log_audit(case when p_accept then 'coupon.accepted' else 'coupon.declined' end,
                    'coupons', p_coupon, null, jsonb_build_object('code', c.code, 'vendor', v));
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'active' else 'declined' end);
end $$;

grant execute on function public.answer_coupon(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------
-- 4. Give a coupon to named people
-- ---------------------------------------------------------------

create or replace function public.set_coupon_recipients(p_coupon uuid, p_people jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c coupons%rowtype; v uuid := my_vendor_id(); person jsonb; added int := 0;
begin
  select * into c from coupons where id = p_coupon;
  if not found then raise exception 'Coupon not found'; end if;
  if not (is_staff() or (v is not null and c.vendor_id = v)) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_people) <> 'array' then raise exception 'Give a list of people'; end if;

  for person in select * from jsonb_array_elements(p_people) loop
    if coalesce(trim(person->>'phone'), '') = '' then continue; end if;
    insert into coupon_recipients (coupon_id, phone, name)
    values (p_coupon, trim(person->>'phone'), nullif(trim(person->>'name'), ''))
    on conflict (coupon_id, norm_phone(phone)) do update set name = coalesce(excluded.name, coupon_recipients.name);
    added := added + 1;
  end loop;

  -- A coupon with a named list is only for those people.
  if added > 0 then update coupons set audience = 'targeted' where id = p_coupon; end if;

  return jsonb_build_object('ok', true, 'recipients', added);
end $$;

grant execute on function public.set_coupon_recipients(uuid, jsonb) to authenticated;

create or replace function public.remove_coupon_recipient(p_coupon uuid, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c coupons%rowtype; v uuid := my_vendor_id(); left_over int;
begin
  select * into c from coupons where id = p_coupon;
  if not found then raise exception 'Coupon not found'; end if;
  if not (is_staff() or (v is not null and c.vendor_id = v)) then raise exception 'Not allowed'; end if;

  delete from coupon_recipients
   where coupon_id = p_coupon and norm_phone(phone) = norm_phone(p_phone) and used_at is null;

  select count(*) into left_over from coupon_recipients where coupon_id = p_coupon;
  if left_over = 0 then update coupons set audience = 'public' where id = p_coupon; end if;
  return jsonb_build_object('ok', true, 'remaining', left_over);
end $$;

grant execute on function public.remove_coupon_recipient(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- 5. What a seller sees about their own coupons
-- ---------------------------------------------------------------

create or replace function public.my_coupons()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := my_vendor_id();
begin
  if v is null then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'code', c.code, 'description', c.description,
      'kind', c.kind, 'value', c.value, 'min_order', c.min_order,
      'max_discount', c.max_discount, 'status', c.status, 'audience', c.audience,
      'starts_at', c.starts_at, 'expires_at', c.expires_at,
      'usage_limit', c.usage_limit, 'used_count', c.used_count,
      'per_customer_limit', c.per_customer_limit,
      'needs_my_answer', (c.status = 'awaiting_vendor'),
      'mine_to_fund', true,
      'created_by_founder', (c.created_by is distinct from auth.uid()),
      'recipients', (select count(*) from coupon_recipients r where r.coupon_id = c.id),
      -- what this discount has actually cost them so far
      'spent', coalesce((select sum(u.discount) from coupon_uses u where u.coupon_id = c.id), 0))
      order by c.created_at desc)
    from coupons c
   where c.funded_by = 'vendor' and c.vendor_id = v), '[]'::jsonb);
end $$;

grant execute on function public.my_coupons() to authenticated;

-- ---------------------------------------------------------------
-- 6. A founder-written, seller-funded coupon starts unconfirmed
-- ---------------------------------------------------------------

create or replace function public.save_coupon(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v uuid := my_vendor_id();
  c coupons%rowtype;
  id uuid := nullif(payload->>'id', '')::uuid;
  funder text := coalesce(payload->>'funded_by',
                          case when my_vendor_id() is not null then 'vendor' else 'marketplace' end);
  vend uuid := nullif(payload->>'vendor_id', '')::uuid;
  new_status text;
  acked timestamptz;
begin
  if not (is_staff() or v is not null) then raise exception 'Not allowed'; end if;
  if not is_staff() then
    -- a vendor cannot spend the marketplace's money, nor another vendor's
    funder := 'vendor';
    vend := v;
  end if;
  if funder = 'vendor' and vend is null then raise exception 'Say which seller is funding this discount'; end if;
  if coalesce((payload->>'value')::numeric, 0) <= 0 then raise exception 'The discount must be more than zero'; end if;
  if coalesce(payload->>'kind', 'pct') = 'pct' and (payload->>'value')::numeric > 90 then
    raise exception 'A percentage discount cannot be more than 90%%';
  end if;

  -- A seller funding their own coupon has agreed to it by making it. A coupon
  -- the founder writes against a seller's money has not been agreed yet, so it
  -- waits for that seller to accept before any customer can use it.
  if funder = 'vendor' and v is distinct from vend then
    new_status := 'awaiting_vendor';
    acked := null;
  else
    new_status := coalesce(payload->>'status', 'active');
    acked := case when funder = 'vendor' then now() else null end;
  end if;

  if id is null then
    insert into coupons (code, description, kind, value, funded_by, vendor_id, product_id,
                         min_order, max_discount, starts_at, expires_at, usage_limit,
                         per_customer_limit, status, created_by, vendor_ack_at)
    values (upper(trim(payload->>'code')), nullif(trim(payload->>'description'), ''),
            coalesce(payload->>'kind', 'pct'), (payload->>'value')::numeric, funder, vend,
            nullif(payload->>'product_id', '')::uuid,
            coalesce((payload->>'min_order')::numeric, 0),
            nullif(payload->>'max_discount', '')::numeric,
            coalesce((payload->>'starts_at')::timestamptz, now()),
            nullif(payload->>'expires_at', '')::timestamptz,
            nullif(payload->>'usage_limit', '')::int,
            coalesce((payload->>'per_customer_limit')::int, 1),
            new_status, auth.uid(), acked)
    returning id into id;
  else
    select * into c from coupons where coupons.id = save_coupon.id;
    if not found then raise exception 'Coupon not found'; end if;
    if not is_staff() and c.vendor_id is distinct from v then raise exception 'Not allowed'; end if;
    update coupons set
      description = nullif(trim(payload->>'description'), ''),
      kind = coalesce(payload->>'kind', coupons.kind),
      value = coalesce((payload->>'value')::numeric, coupons.value),
      min_order = coalesce((payload->>'min_order')::numeric, coupons.min_order),
      max_discount = nullif(payload->>'max_discount', '')::numeric,
      expires_at = nullif(payload->>'expires_at', '')::timestamptz,
      usage_limit = nullif(payload->>'usage_limit', '')::int,
      per_customer_limit = coalesce((payload->>'per_customer_limit')::int, coupons.per_customer_limit),
      -- a coupon still waiting on its funder cannot be switched on from here
      status = case when coupons.status = 'awaiting_vendor' then coupons.status
                    else coalesce(payload->>'status', coupons.status) end
     where coupons.id = save_coupon.id;
  end if;

  select * into c from coupons where coupons.id = save_coupon.id;
  perform log_audit('coupon.save', 'coupons', c.id, null, to_jsonb(c));
  return to_jsonb(c);
end $$;

grant execute on function public.save_coupon(jsonb) to authenticated;

-- ---------------------------------------------------------------
-- 7. place_order: tell coupon_check who is ordering
-- ---------------------------------------------------------------
-- Without the phone, targeting and the per-customer limit cannot be applied.

do $$
declare src text; patched text;
begin
  select pg_get_functiondef('public.place_order(jsonb)'::regprocedure) into src;

  -- Already patched by an earlier run of this file: nothing to do.
  patched := src;

  -- (a) tell coupon_check who is ordering, so targeting and the per-customer
  --     limit can be applied at all.
  if position('coalesce(v_basket_vendor, v_store.id), cust.phone)' in patched) = 0 then
    if position('coupon_check(payload->>''coupon'', sub, coalesce(v_basket_vendor, v_store.id))' in patched) = 0 then
      raise exception 'place_order does not contain the expected coupon_check call; review before deploying';
    end if;
    patched := replace(patched,
      'coupon_check(payload->>''coupon'', sub, coalesce(v_basket_vendor, v_store.id))',
      'coupon_check(payload->>''coupon'', sub, coalesce(v_basket_vendor, v_store.id), cust.phone)');
  end if;

  -- (b) mark the named recipient as having used it.
  if position('update coupon_recipients set used_at = now()' in patched) = 0 then
    if position('values ((v_coupon->>''id'')::uuid, o.id, cust.id, v_disc);' in patched) = 0 then
      raise exception 'place_order does not contain the expected coupon_uses insert; review before deploying';
    end if;
    patched := replace(patched,
      'values ((v_coupon->>''id'')::uuid, o.id, cust.id, v_disc);',
      'values ((v_coupon->>''id'')::uuid, o.id, cust.id, v_disc);
      update coupon_recipients set used_at = now()
       where coupon_id = (v_coupon->>''id'')::uuid
         and norm_phone(phone) = norm_phone(cust.phone) and used_at is null;');
  end if;

  -- (c) the returned total ignored the discount. The orders row was right,
  --     but this is the number the checkout page shows on the confirmation
  --     screen and reports as the purchase value, so a customer who used a
  --     coupon was told they had paid the full price.
  if position('''total'', sub + fee' in patched) > 0 then
    patched := replace(patched,
      '''total'', sub + fee',
      '''total'', greatest(sub - v_disc, 0) + fee, ''discount'', v_disc');
  elsif position('''total'', greatest(sub - v_disc, 0) + fee' in patched) = 0 then
    raise exception 'place_order does not contain a recognised total in its return; review before deploying';
  end if;

  if patched <> src then execute patched; end if;
end $$;

-- ---------------------------------------------------------------
-- 8. set_order_status: the percentage-fee branch ignored discounts
-- ---------------------------------------------------------------
-- Settlement has two paths. The vendor_take_home path already apportioned a
-- coupon discount to whoever funded it. The percentage-fee path -- taken
-- whenever a vendor product has no vendor_price recorded -- ignored
-- o.discount completely. The customer paid the discounted total, but the
-- vendor was settled on the full amount, so ZaMarket silently absorbed every
-- discount on those lines, including ones the vendor had agreed to fund.
--
-- After this, both paths behave the same way:
--   vendor-funded      -> comes off the vendor's net, ZaMarket keeps its fee
--   marketplace-funded -> vendor is left whole, ZaMarket's share carries it
-- and gross = net + fee + commission still holds on every row.

do $$
declare src text; patched text; old_block text; new_block text;
begin
  select pg_get_functiondef('public.set_order_status(uuid,order_status,text)'::regprocedure) into src;

  if position('percentage-fee settlement' in lower(src)) > 0 then
    return;  -- already patched
  end if;

  old_block :=
'        else
          insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
          values (it.vendor_id, p_order, o.order_number, gross, round(gross * fee_pct / 100, 2),
                  case when src = ''on_top'' then comm else 0 end,
                  round(gross - gross * fee_pct / 100 - case when src = ''on_top'' then comm else 0 end, 2), ''pending'');
        end if;';

  if position(old_block in src) = 0 then
    raise exception 'set_order_status percentage-fee branch is not in the expected shape; review before deploying';
  end if;

  new_block :=
'        else
          -- Percentage-fee settlement. A coupon discount lands on whoever
          -- funded it here too.
          vend_net := round(gross - gross * fee_pct / 100
                            - case when src = ''on_top'' then comm else 0 end, 2);
          if coalesce(o.discount, 0) > 0 and o.subtotal > 0 then
            line_disc := round(o.discount * (gross / o.subtotal), 2);
            select funded_by into coupon_funder from coupons where id = o.coupon_id;
            if coalesce(coupon_funder, ''marketplace'') = ''vendor'' then
              vend_net := greatest(vend_net - line_disc, 0);
            end if;
            gross := greatest(gross - line_disc, 0);
          end if;
          insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
          values (it.vendor_id, p_order, o.order_number, gross,
                  round(gross - vend_net - case when src = ''on_top'' then comm else 0 end, 2),
                  case when src = ''on_top'' then comm else 0 end,
                  vend_net, ''pending'');
        end if;';

  patched := replace(src, old_block, new_block);
  execute patched;
end $$;

-- ---------------------------------------------------------------
-- 9. A loss ZaMarket chose to take must appear in the books
-- ---------------------------------------------------------------
-- The vendor_take_home path floored marketplace_fee at zero. When ZaMarket
-- funds a discount larger than its own margin on a line, the real figure is
-- negative: it is paying the seller more than the customer paid. Flooring it
-- made the row fail to add up (gross 73, seller 90, ZaMarket 0) and hid the
-- subsidy. The seller is still paid their agreed take in full either way --
-- this only changes what the record SAYS ZaMarket earned.

do $$
declare src text; patched text;
begin
  select pg_get_functiondef('public.set_order_status(uuid,order_status,text)'::regprocedure) into src;

  if position('round(greatest(gross - vend_net - comm, 0), 2)' in src) = 0 then
    return;  -- already honest, or shape changed; section 8's guard covers that
  end if;

  patched := replace(src,
    'round(greatest(gross - vend_net - comm, 0), 2)',
    'round(gross - vend_net - comm, 2)');

  execute patched;
end $$;
