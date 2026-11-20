-- 35. Real numbers: the whole road from a visit to money, for staff.
--
-- How many people visited, looked at a product, tapped to ask, became a lead,
-- were contacted, ordered and paid, and how much was sold (shop orders and
-- weekly lunch), for the last few days; where they came from; and week by
-- week for the last 8 weeks. Counts and totals only, never a customer.

create or replace function public.growth_numbers(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d int := greatest(1, least(coalesce(p_days, 30), 365));
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  bad text[] := array['cancelled', 'refunded', 'returned', 'failed_delivery', 'fraud_review'];
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  return jsonb_build_object(
    'days', d,
    'visitors', (select count(distinct visitor) from traffic_events where created_at >= since),
    'viewers', (select count(distinct visitor) from traffic_events where kind = 'view' and created_at >= since),
    'askers', (select count(distinct visitor) from traffic_events where kind in ('whatsapp', 'call', 'enquiry') and created_at >= since),
    'leads', (select count(*) from leads where created_at >= since),
    'contacted', (select count(distinct lead_id) from lead_activities where created_at >= since and kind <> 'system'),
    'conversations', (select count(*) from lead_activities where created_at >= since and kind in ('call', 'whatsapp', 'in_person', 'sms', 'dm')),
    'won', (select count(*) from leads where stage = 'won' and updated_at >= since),
    'orders', (select count(*) from orders where created_at >= since and status::text <> all (bad)),
    'paid_orders', (select count(*) from orders where created_at >= since and status::text <> all (bad)
                     and (payment_status::text = 'paid' or status::text in ('delivered', 'completed'))),
    'sales', (select coalesce(sum(total), 0) from orders where created_at >= since and status::text <> all (bad)
                     and (payment_status::text = 'paid' or status::text in ('delivered', 'completed'))),
    'lunch_bookings', (select count(*) from meal_plans where created_at >= since and status <> 'cancelled'),
    'lunch_paid', (select coalesce(sum(total), 0) from meal_plans where created_at >= since and status = 'paid'),
    'channels', (select coalesce(jsonb_agg(c order by c->>'channel'), '[]'::jsonb) from (
        select jsonb_build_object('channel', ch,
          'visitors', (select count(distinct visitor) from traffic_events where created_at >= since and coalesce(channel, 'direct') = ch),
          'leads', (select count(*) from leads where created_at >= since and coalesce(channel, 'other') = ch),
          'orders', (select count(*) from orders where created_at >= since and status::text <> all (bad) and coalesce(source, 'organic') = ch)) as c
        from (select distinct coalesce(channel, 'direct') as ch from traffic_events where created_at >= since
              union select distinct coalesce(channel, 'other') from leads where created_at >= since
              union select distinct coalesce(source, 'organic') from orders where created_at >= since) x) y),
    'weeks', (select coalesce(jsonb_agg(w order by w->>'week'), '[]'::jsonb) from (
        select jsonb_build_object('week', to_char(wk, 'YYYY-MM-DD'),
          'visitors', (select count(distinct visitor) from traffic_events where created_at >= wk and created_at < wk + interval '7 days'),
          'leads', (select count(*) from leads where created_at >= wk and created_at < wk + interval '7 days'),
          'orders', (select count(*) from orders where created_at >= wk and created_at < wk + interval '7 days' and status::text <> all (bad)),
          'sales', (select coalesce(sum(total), 0) from orders where created_at >= wk and created_at < wk + interval '7 days' and status::text <> all (bad)
                     and (payment_status::text = 'paid' or status::text in ('delivered', 'completed')))
                   + (select coalesce(sum(total), 0) from meal_plans where created_at >= wk and created_at < wk + interval '7 days' and status = 'paid')) as w
        from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '7 days') wk) z)
  );
end $$;
revoke all on function public.growth_numbers(int) from public;
grant execute on function public.growth_numbers(int) to authenticated;
