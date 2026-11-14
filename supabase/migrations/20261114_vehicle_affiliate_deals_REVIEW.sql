-- Vehicle buyers and the affiliate who brought them.
--
-- 1. my_vehicle_deals(): an approved affiliate sees the vehicle buyers credited
--    to them: which vehicle, the buyer's first name, where the deal stands, and
--    once it is sold, what they earned and whether it has been paid. The
--    buyer's phone is never shown here (only its last three digits), and no
--    seller terms (fee percentages) are returned.
-- 2. set_deal_affiliate(): staff credit an affiliate to a buyer who reached us
--    another way (a WhatsApp message, a phone call), or correct the credit.
--    Only before the sale is recorded; every change is written to the deal's
--    history and the audit log.
--
-- Safe to run more than once.

create or replace function public.my_vehicle_deals()
returns table(deal_number int, vehicle text, vehicle_slug text, buyer text, phone_end text, status text,
              created_at timestamptz, closed_at timestamptz, final_price numeric, reward numeric, reward_status text)
language sql stable security definer set search_path = public as $$
  select d.deal_number, p.name, p.slug,
         split_part(trim(d.customer_name), ' ', 1),
         right(regexp_replace(d.customer_phone, '\D', '', 'g'), 3),
         d.status, d.created_at, d.closed_at,
         case when d.status = 'closed' then d.final_price end,
         case when d.status = 'closed' then d.reseller_amount end,
         (select c.status::text from commissions c where c.deal_id = d.id and c.reseller_id = d.reseller_id order by c.created_at desc limit 1)
  from deals d
  join products p on p.id = d.product_id
  join resellers r on r.id = d.reseller_id
  where r.user_id = auth.uid() and r.status = 'approved'
  order by d.created_at desc
  limit 200;
$$;
revoke all on function public.my_vehicle_deals() from public, anon;
grant execute on function public.my_vehicle_deals() to authenticated;

create or replace function public.set_deal_affiliate(p_deal uuid, p_code text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d deals%rowtype; rs resellers%rowtype; v_old text;
begin
  if not is_staff() then raise exception 'Only the ZaMarket team can change who brought a buyer'; end if;
  select * into d from deals where id = p_deal for update;
  if not found then raise exception 'Deal not found'; end if;
  if d.status = 'closed' then raise exception 'This sale is already recorded. The affiliate can no longer be changed.'; end if;
  select code into v_old from resellers where id = d.reseller_id;

  if coalesce(trim(p_code), '') = '' then
    update deals set reseller_id = null, source = 'organic', updated_at = now() where id = p_deal;
    insert into deal_events (deal_id, kind, party, note, user_id)
      values (p_deal, 'note', 'marketplace', 'Affiliate removed' || coalesce(' (was ' || v_old || ')', '') || coalesce('. ' || nullif(trim(p_note), ''), ''), auth.uid());
  else
    select * into rs from resellers where code = lower(trim(p_code)) and status = 'approved';
    if not found then raise exception 'No approved affiliate has the code %', p_code; end if;
    if norm_phone(rs.phone) = norm_phone(d.customer_phone) then raise exception 'An affiliate cannot be credited for buying themselves'; end if;
    update deals set reseller_id = rs.id, source = 'reseller:' || rs.code, updated_at = now() where id = p_deal;
    insert into deal_events (deal_id, kind, party, note, user_id)
      values (p_deal, 'note', 'marketplace', 'Buyer credited to ' || rs.full_name || ' (' || rs.code || ')' || coalesce(', was ' || v_old, '') || coalesce('. ' || nullif(trim(p_note), ''), ''), auth.uid());
  end if;
  perform log_audit('deal.affiliate', 'deals', p_deal, jsonb_build_object('code', v_old), jsonb_build_object('code', nullif(lower(trim(p_code)), '')), p_note);
end $$;
revoke all on function public.set_deal_affiliate(uuid, text, text) from public, anon;
grant execute on function public.set_deal_affiliate(uuid, text, text) to authenticated;
