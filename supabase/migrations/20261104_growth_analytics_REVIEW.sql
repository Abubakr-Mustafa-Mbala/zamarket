-- Growth measurement, REVIEW BEFORE DEPLOYMENT.
--
-- Two things are added here:
--
--   1. A growth_report() for the founder: orders and money grouped by the
--      platform the customer arrived from and by who got the credit, plus the
--      view-to-order step, all from records this system already holds. These
--      are completed-order figures from the orders table, not estimates and
--      not anything an outside analytics service reports.
--
--   2. An analytics_id setting, so Google Analytics can be switched on by
--      pasting a measurement ID rather than by changing code. Empty means no
--      Google tag is loaded at all, which is also the default.
--
-- Nothing here records anything about a person. The channel is a tag we put
-- in our own links; no IP address, device fingerprint or identifier is kept.

insert into settings (key, value, description) values
  ('analytics_id', '""', 'Google Analytics 4 measurement ID (G-XXXXXXXXXX). Leave empty and no Google tag is loaded at all.'),
  ('search_console_verified', 'false', 'Tick once zamarket.shop is verified in Google Search Console, so the dashboard stops asking.')
on conflict (key) do nothing;

-- Orders already carry `channel`; make sure older rows have the default
-- rather than a null, so the grouping below never loses an order.
update orders set channel = 'marketplace' where channel is null;

-- Where the business actually came from.
--
-- `by_channel` answers "WhatsApp or Facebook?" and `by_source` answers "which
-- affiliate or seller?". They are deliberately separate: an affiliate link
-- shared on a WhatsApp status is both, and collapsing them hides one of them.
create or replace function public.growth_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  -- Revenue figures, so this is staff and marketing only. A vendor or an
  -- affiliate seeing marketplace-wide money would be a leak; each of those
  -- already has their own earnings page scoped to themselves.
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;

  select jsonb_build_object(
    'from', p_from,
    'to', p_to,

    -- Headline counts. "Completed" is the only one that means money.
    'orders', (select count(*) from orders o
                where lusaka_date(o.created_at) between p_from and p_to
                  and o.status not in ('cancelled','fraud_review')),
    'completed', (select count(*) from orders o
                   where lusaka_date(o.created_at) between p_from and p_to
                     and o.status = 'completed'),
    'revenue', (select coalesce(sum(o.total), 0) from orders o
                 where lusaka_date(o.created_at) between p_from and p_to
                   and o.status = 'completed'),

    -- The funnel we can see from our own records: a product page opened, then
    -- an order placed. Views come from link_hits, which counts page opens per
    -- day and holds nothing about who opened them.
    'product_views', (select coalesce(sum(h.hits), 0) from link_hits h
                       where h.kind = 'product_view' and h.day between p_from and p_to),
    'store_views', (select coalesce(sum(h.hits), 0) from link_hits h
                     where h.kind = 'store_view' and h.day between p_from and p_to),
    'affiliate_clicks', (select coalesce(sum(h.hits), 0) from link_hits h
                          where h.kind = 'affiliate_click' and h.day between p_from and p_to),

    -- By platform.
    'by_channel', coalesce((
      select jsonb_agg(jsonb_build_object(
               'channel', x.channel, 'orders', x.orders,
               'completed', x.completed, 'revenue', x.revenue)
             order by x.completed desc, x.orders desc)
      from (select coalesce(o.channel, 'marketplace') as channel,
                   count(*) as orders,
                   count(*) filter (where o.status = 'completed') as completed,
                   coalesce(sum(o.total) filter (where o.status = 'completed'), 0) as revenue
            from orders o
            where lusaka_date(o.created_at) between p_from and p_to
              and o.status not in ('cancelled','fraud_review')
            group by 1) x), '[]'::jsonb),

    -- By who gets the credit.
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object(
               'source', x.source, 'orders', x.orders,
               'completed', x.completed, 'revenue', x.revenue)
             order by x.completed desc, x.orders desc)
      from (select split_part(coalesce(o.source, 'organic'), ':', 1) as source,
                   count(*) as orders,
                   count(*) filter (where o.status = 'completed') as completed,
                   coalesce(sum(o.total) filter (where o.status = 'completed'), 0) as revenue
            from orders o
            where lusaka_date(o.created_at) between p_from and p_to
              and o.status not in ('cancelled','fraud_review')
            group by 1) x), '[]'::jsonb),

    -- Day by day, so a spike can be matched against what was posted that day.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'orders', d.orders, 'revenue', d.revenue)
             order by d.day)
      from (select lusaka_date(o.created_at) as day,
                   count(*) as orders,
                   coalesce(sum(o.total) filter (where o.status = 'completed'), 0) as revenue
            from orders o
            where lusaka_date(o.created_at) between p_from and p_to
              and o.status not in ('cancelled','fraud_review')
            group by 1) d), '[]'::jsonb),

    -- The products people open but never buy. This is the most useful list on
    -- the page in the first weeks: it is where the photographs, the price or
    -- the description are losing the sale.
    'looked_not_bought', coalesce((
      select jsonb_agg(jsonb_build_object('name', y.name, 'id', y.id, 'views', y.views, 'orders', y.orders)
             order by y.views desc)
      from (select p.id, p.name,
                   coalesce(sum(h.hits), 0) as views,
                   (select count(*) from order_items oi join orders o2 on o2.id = oi.order_id
                     where oi.product_id = p.id
                       and lusaka_date(o2.created_at) between p_from and p_to
                       and o2.status not in ('cancelled','fraud_review')) as orders
            from products p
            join link_hits h on h.product_id = p.id and h.kind = 'product_view'
                            and h.day between p_from and p_to
            where p.status = 'published'
            group by p.id, p.name
            having coalesce(sum(h.hits), 0) >= 5
            limit 200) y
      where y.orders = 0), '[]'::jsonb)
  ) into out;

  return out;
end $$;

revoke all on function public.growth_report(date, date) from public;
grant execute on function public.growth_report(date, date) to authenticated;
