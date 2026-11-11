-- ZaMarket Motors — seller-funded success-fee split.
-- REVIEW AND RUN ONCE IN SUPABASE SQL EDITOR BEFORE DEPLOYING THE MATCHING CODE.
-- This is a NEW migration. Do not rerun the previously applied Journal 2.0 SQL.
-- The customer's asking price does not change; seller fee is deducted only
-- after a negotiated, verified sale, and affiliate share is from that fee.
-- Existing/closed deals are not repriced or recalculated by this migration.

alter table public.products add column if not exists vehicle_affiliate_share_pct numeric default 50;
alter table public.products add column if not exists vehicle_seller_agreement_note text;
alter table public.products drop constraint if exists vehicle_affiliate_share_pct_bounds;
alter table public.products add constraint vehicle_affiliate_share_pct_bounds
  check (vehicle_affiliate_share_pct between 0 and 100);
alter table public.products drop constraint if exists vehicle_deal_fee_pct_bounds;
alter table public.products add constraint vehicle_deal_fee_pct_bounds
  check (deal_fee_pct is null or (deal_fee_pct between 0 and 100));

-- A vendor may supply photos and descriptions but may not invent or edit the
-- financial terms of the seller/ZaMarket commission agreement.
create or replace function public.vehicle_agreement_staff_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if TG_OP = 'INSERT' then
    if not (is_staff() or current_user in ('postgres', 'service_role')) and (new.deal_fee_pct is not null or
        new.vehicle_seller_agreement_note is not null or
        new.vehicle_affiliate_share_pct is distinct from 50) then
      raise exception 'Only ZaMarket staff can set vehicle seller commission terms';
    end if;
  elsif (old.deal_fee_pct is distinct from new.deal_fee_pct or
         old.vehicle_affiliate_share_pct is distinct from new.vehicle_affiliate_share_pct or
         old.vehicle_seller_agreement_note is distinct from new.vehicle_seller_agreement_note) and not (is_staff() or current_user in ('postgres', 'service_role')) then
    raise exception 'Only ZaMarket staff can change seller commission terms';
  end if;
  return new;
end $$;
drop trigger if exists vehicle_agreement_staff_guard on public.products;
create trigger vehicle_agreement_staff_guard before insert or update on public.products
for each row execute function public.vehicle_agreement_staff_guard();

-- Existing enquiry/deal functions remain unchanged for non-vehicle listings.
create or replace function submit_enquiry(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  prod products%rowtype; pkg product_packages%rowtype; rs resellers%rowtype; c campaigns%rowtype;
  v_phone text := norm_phone(payload->>'phone'); v_name text := left(trim(coalesce(payload->>'name', '')), 80);
  v_lead uuid; d deals%rowtype; v_amount numeric := nullif(payload->>'offer_amount', '')::numeric; v_channel text := 'organic';
begin
  select * into prod from products where (id::text = payload->>'product_id' or slug = payload->>'product_slug') and status = 'published' limit 1;
  if not found then raise exception 'This listing is no longer available'; end if;
  if v_name = '' then raise exception 'Please enter your name'; end if;
  if length(v_phone) < 10 then raise exception 'Please enter a full phone number, e.g. 0977 123 456'; end if;
  if coalesce(payload->>'package_id', '') <> '' then
    select * into pkg from product_packages where id = (payload->>'package_id')::uuid and product_id = prod.id;
  end if;
  if coalesce(payload->>'referral_code', '') <> '' then
    select * into rs from resellers where code = lower(payload->>'referral_code') and status = 'approved';
    if found then v_channel := 'reseller'; end if;
  end if;
  if coalesce(payload->>'campaign_code', '') <> '' then
    select * into c from campaigns where code = lower(payload->>'campaign_code');
    if found and v_channel = 'organic' then v_channel := campaign_channel(c); end if;
  end if;
  if coalesce(payload->>'invite_code', '') <> '' and v_channel = 'organic' then v_channel := 'referral'; end if;

  v_lead := upsert_lead(v_name, v_phone, v_channel,
    left('Enquiry: ' || prod.name || coalesce(' — ' || pkg.name, '') || case when v_amount is not null then ' (offered K' || v_amount || ')' else '' end
         || coalesce('. ' || nullif(payload->>'message', ''), ''), 240),
    c.id, null, prod.vendor_id, prod.id, null, 'enquiry');

  if prod.sales_model = 'negotiate' or (prod.offering_type = 'vehicle' and prod.sales_model = 'enquire') then
    insert into deals (product_id, package_id, vendor_id, customer_name, customer_phone, message, advertised_price, commission_type, commission_value, fee_pct,
                       reseller_id, invite_code, campaign_id, source, status)
    values (prod.id, pkg.id, prod.vendor_id, v_name, v_phone, left(payload->>'message', 1000), coalesce(pkg.price, prod.price),
            case when prod.offering_type = 'vehicle' then 'fee_share' else coalesce(prod.commission_type, 'pct') end,
            case when prod.offering_type = 'vehicle' then coalesce(prod.vehicle_affiliate_share_pct, 50) else coalesce(prod.commission_value, setting_num('default_commission_pct')) end,
            case when prod.offering_type = 'vehicle' then coalesce(prod.deal_fee_pct, 0) else coalesce(prod.deal_fee_pct, setting_num('marketplace_fee_pct')) end,
            case when rs.phone is distinct from v_phone then rs.id end, nullif(lower(payload->>'invite_code'), ''), c.id,
            case when rs.id is not null then 'reseller:' || rs.code when c.id is not null then 'campaign:' || c.code else 'organic' end, 'enquiry')
    returning * into d;
    insert into deal_events (deal_id, kind, amount, party, note) values (d.id, 'enquiry', v_amount, 'customer', nullif(left(payload->>'message', 500), ''));
    update leads set interest = interest || ' [Deal #' || d.deal_number || ']' where id = v_lead;
    return jsonb_build_object('reference', 'D' || d.deal_number, 'type', 'deal');
  end if;
  return jsonb_build_object('reference', 'E' || right(replace(v_lead::text, '-', ''), 6), 'type', 'enquiry');
end $$;

-- Staff and the listing's vendor move a deal along. Only staff can verify the close.
create or replace function deal_action(p_deal uuid, p_action text, p_amount numeric default null, p_note text default null, p_evidence text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d deals%rowtype; v_res numeric; v_fee numeric; v_rate numeric;
begin
  select * into d from deals where id = p_deal for update;
  if not found then raise exception 'Deal not found'; end if;
  if not (is_staff() or (d.vendor_id is not null and d.vendor_id = my_vendor_id())) then raise exception 'Not allowed'; end if;
  if d.status in ('closed') and p_action not in ('note', 'fee_received') then raise exception 'This deal is closed'; end if;

  if p_action in ('offer', 'counter') then
    if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount'; end if;
    insert into deal_events (deal_id, kind, amount, party, note, user_id) values (p_deal, p_action, p_amount, case when p_action = 'offer' then 'customer' else 'seller' end, p_note, auth.uid());
    update deals set status = 'negotiating', updated_at = now() where id = p_deal;
  elsif p_action = 'agree' then
    if p_amount is null or p_amount <= 0 then raise exception 'Enter the agreed price'; end if;
    insert into deal_events (deal_id, kind, amount, party, note, user_id) values (p_deal, 'agreed', p_amount, 'marketplace', p_note, auth.uid());
    update deals set status = 'agreed', final_price = p_amount, updated_at = now() where id = p_deal;
  elsif p_action = 'close' then
    if not is_staff() then raise exception 'The ZaMarket team verifies and closes deals'; end if;
    if p_amount is null or p_amount <= 0 then raise exception 'Enter the final sale price'; end if;
    if coalesce(p_evidence, '') = '' then raise exception 'Record how the sale was verified (e.g. receipt number, handover, bank reference)'; end if;
    v_rate := coalesce(d.commission_value, 0);
    v_fee := round(p_amount * coalesce(d.fee_pct, 0) / 100, 2);
    if d.commission_type = 'fee_share' and (d.fee_pct <= 0 or v_rate < 0 or v_rate > 100) then
      raise exception 'Confirm the vehicle seller success fee and affiliate share before closing this deal';
    end if;
    v_res := case
      when d.reseller_id is null then 0
      when d.commission_type = 'fee_share' then round(v_fee * v_rate / 100, 2)
      when d.commission_type = 'flat' then v_rate
      else round(p_amount * v_rate / 100, 2)
    end;
    update deals set status = 'closed', final_price = p_amount, reseller_amount = v_res, marketplace_amount = v_fee, evidence = p_evidence,
                     verified_by = auth.uid(), closed_at = now(), updated_at = now() where id = p_deal;
    insert into deal_events (deal_id, kind, amount, party, note, user_id) values (p_deal, 'closed', p_amount, 'marketplace', coalesce(p_note, p_evidence), auth.uid());
    if d.reseller_id is not null and v_res > 0 then
      insert into commissions (deal_id, reseller_id, base_amount, rate_type, rate_value, amount, status, eligible_at, notes)
      values (p_deal, d.reseller_id, case when d.commission_type = 'fee_share' then v_fee else p_amount end,
              coalesce(d.commission_type, 'pct'), v_rate, v_res, 'pending',
              case when d.commission_type = 'fee_share' then null else now() + (setting_num('commission_grace_hours') || ' hours')::interval end,
              'Deal D' || d.deal_number || ' closed at K' || p_amount);
    end if;
    if d.invite_code is not null then
      insert into referrals (referrer_name, referrer_phone, referrer_customer_id, referred_phone, reward, status)
      select r.referrer_name, r.referrer_phone, r.referrer_customer_id, d.customer_phone, setting_num('referral_reward'), 'eligible'
      from referrals r where r.code = d.invite_code and r.order_id is null limit 1;
    end if;
    update leads set stage = 'won', next_follow_up = null, updated_at = now() where phone = d.customer_phone and stage in ('new','contacted','engaged');
    perform log_audit('deal.closed', 'deals', p_deal, jsonb_build_object('advertised', d.advertised_price), jsonb_build_object('final', p_amount, 'reseller', v_res, 'fee', v_fee), p_evidence);
  elsif p_action = 'lost' then
    insert into deal_events (deal_id, kind, note, user_id) values (p_deal, 'lost', p_note, auth.uid());
    update deals set status = 'lost', lost_reason = p_note, updated_at = now() where id = p_deal;
  elsif p_action = 'reopen' then
    if not is_staff() then raise exception 'Not allowed'; end if;
    insert into deal_events (deal_id, kind, note, user_id) values (p_deal, 'reopened', p_note, auth.uid());
    update deals set status = 'negotiating', lost_reason = null, updated_at = now() where id = p_deal;
  elsif p_action = 'note' then
    insert into deal_events (deal_id, kind, note, user_id) values (p_deal, 'note', p_note, auth.uid());
    update deals set updated_at = now() where id = p_deal;
  elsif p_action = 'fee_received' then
    if not is_staff() then raise exception 'Not allowed'; end if;
    if d.status <> 'closed' then raise exception 'Record and verify the vehicle sale before collecting its fee'; end if;
    if d.fee_status = 'received' then raise exception 'Fee already marked received'; end if;
    update deals set fee_status = 'received', updated_at = now() where id = p_deal;
    -- Unlock only this vehicle deal's earned affiliate reward once the seller
    -- has actually paid the commission to ZaMarket (with normal grace period).
    if d.commission_type = 'fee_share' then
      update commissions set eligible_at = now() + (setting_num('commission_grace_hours') || ' hours')::interval
      where deal_id = p_deal and status = 'pending' and eligible_at is null;
    end if;
    perform log_audit('deal.fee_received', 'deals', p_deal, null, jsonb_build_object('amount', d.marketplace_amount), p_note);
  else
    raise exception 'Unknown action';
  end if;
end $$;


-- Block premature affiliate approval/payments on seller-funded vehicle deals.
create or replace function set_commission_status(p_id uuid, p_status commission_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c commissions%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into c from commissions where id = p_id for update;
  if c.status = 'paid' then raise exception 'Paid commissions cannot change'; end if;
  if p_status in ('verified', 'approved', 'paid') and c.deal_id is not null and exists (
     select 1 from deals d where d.id = c.deal_id and d.commission_type = 'fee_share' and d.fee_status <> 'received'
  ) then raise exception 'Collect the vehicle seller success fee before paying an affiliate'; end if;
  if p_status in ('verified', 'approved', 'paid') and c.deal_id is not null and exists (
     select 1 from deals d where d.id = c.deal_id and d.commission_type = 'fee_share' and c.eligible_at is null
  ) then raise exception 'Vehicle affiliate commission is not yet eligible'; end if;
  if p_status in ('verified', 'approved', 'paid') and c.eligible_at > now() then raise exception 'Grace period has not passed yet'; end if;
  update commissions set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end, notes = coalesce(p_reason, notes) where id = p_id;
  perform log_audit('commission.status', 'commissions', p_id, jsonb_build_object('status', c.status), jsonb_build_object('status', p_status), p_reason);
end $$;

