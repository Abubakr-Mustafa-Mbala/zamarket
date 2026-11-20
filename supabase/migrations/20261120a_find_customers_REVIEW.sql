-- 34. Find customers: offices for the weekly lunch, people you know,
-- referrals, and a weekly report for each seller.
--
-- Uses the existing leads table (and its activity log, owners and follow-up
-- dates). A lead now says which list it belongs to (office, warm, referral),
-- the company or office name, the person to ask for, who referred them, and
-- when a referral reward was given. Nothing is deleted.

alter table public.leads add column if not exists list text;
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists contact_name text;
alter table public.leads add column if not exists referred_by text;
alter table public.leads add column if not exists reward_given_at timestamptz;
alter table public.leads drop constraint if exists leads_list_check;
alter table public.leads add constraint leads_list_check check (list is null or list in ('office', 'warm', 'referral'));
create index if not exists leads_list on public.leads (list, stage, next_follow_up);

-- A seller's numbers for the last few days, for staff to send them: how many
-- people saw their products, tapped to ask, shared, asked, ordered, and (for a
-- lunch seller) booked. Staff only; it returns counts, never customers.
create or replace function public.seller_report(p_vendor uuid, p_days int default 7)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 7), 90)),
    'views', (select count(*) from traffic_events t join products p on p.id = t.product_id
              where p.vendor_id = p_vendor and t.kind = 'view' and t.created_at >= since),
    'people', (select count(distinct t.visitor) from traffic_events t join products p on p.id = t.product_id
              where p.vendor_id = p_vendor and t.created_at >= since),
    'taps', (select count(*) from traffic_events t join products p on p.id = t.product_id
              where p.vendor_id = p_vendor and t.kind in ('whatsapp', 'call', 'enquiry') and t.created_at >= since),
    'shares', (select count(*) from traffic_events t join products p on p.id = t.product_id
              where p.vendor_id = p_vendor and t.kind = 'share' and t.created_at >= since),
    'lunch_views', (select count(*) from traffic_events t join meal_deals d on t.path = '/lunch/' || d.slug
              where d.vendor_id = p_vendor and t.created_at >= since),
    'enquiries', (select count(*) from leads where vendor_id = p_vendor and created_at >= since),
    'orders', (select count(distinct oi.order_id) from order_items oi join orders o on o.id = oi.order_id
              where oi.vendor_id = p_vendor and o.created_at >= since
                and o.status not in ('cancelled', 'refunded', 'returned', 'failed_delivery', 'fraud_review')),
    'lunch_bookings', (select count(*) from meal_plans where vendor_id = p_vendor and created_at >= since and status <> 'cancelled'),
    'lunches', (select coalesce(sum(lunches), 0) from meal_plans where vendor_id = p_vendor and created_at >= since and status <> 'cancelled'),
    'top', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
              select p.name, count(*) as views from traffic_events t join products p on p.id = t.product_id
              where p.vendor_id = p_vendor and t.kind = 'view' and t.created_at >= since
              group by p.name order by count(*) desc limit 3) x)
  );
end $$;
revoke all on function public.seller_report(uuid, int) from public;
grant execute on function public.seller_report(uuid, int) to authenticated;
