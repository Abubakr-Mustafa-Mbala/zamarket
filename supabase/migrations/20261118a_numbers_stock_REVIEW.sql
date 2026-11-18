-- 29. Honest numbers and quieter stock alerts. (Section 30 adds the alerts.)
--
-- · Visits, views and blog numbers no longer count ZaMarket staff or
--   affiliates, or a seller looking at their own shop. A seller reading
--   another shop or the blog still counts.
-- · The visitors page also shows where people drop off: visited → looked at
--   a product → added to cart → opened checkout → ordered.
-- · Vehicles, and anything ZaMarket sells for somebody else, are not ZaMarket
--   stock: no "running out of stock" alerts, not in stock value.
-- · Phone alerts for everything in the bell (not only new orders), and
--   emails for the moments that matter: affiliate or seller approved, an
--   order for a seller to prepare, a payout paid.

-- ---- People who are not visitors ------------------------------------------
create or replace function public.is_insider() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('founder', 'ops', 'finance', 'delivery', 'marketing', 'reseller') from profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_insider() to anon, authenticated;

alter table public.traffic_events drop constraint if exists traffic_events_kind_check;
alter table public.traffic_events add constraint traffic_events_kind_check
  check (kind in ('visit', 'view', 'whatsapp', 'call', 'enquiry', 'share', 'product', 'cart', 'checkout', 'order'));

create or replace function public.track_event(
  p_kind text, p_path text default null, p_product uuid default null, p_visitor text default null,
  p_ref text default null, p_channel text default null, p_from text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := left(regexp_replace(coalesce(p_visitor, ''), '[^a-zA-Z0-9-]', '', 'g'), 40);
  k text := lower(coalesce(p_kind, ''));
  pth text := left(regexp_replace(coalesce(p_path, ''), '[?#].*$', ''), 200);
  pid uuid := null;
  my_vendor uuid;
  my_slug text;
begin
  if k not in ('visit', 'view', 'whatsapp', 'call', 'enquiry', 'share', 'product', 'cart', 'checkout', 'order') or length(v) < 8 then return; end if;
  if p_product is not null then
    select id into pid from products where id = p_product and status in ('published', 'out_of_stock');
    if pid is null then return; end if;
  end if;
  if auth.uid() is not null then
    -- ZaMarket's team and affiliates are never counted.
    if public.is_insider() then return; end if;
    -- A seller is not a visitor of their own shop or products.
    my_vendor := my_vendor_id();
    if my_vendor is not null then
      select slug into my_slug from vendors where id = my_vendor;
      if (pid is not null and exists (select 1 from products where id = pid and vendor_id = my_vendor))
         or (my_slug is not null and (pth = '/' || my_slug or pth like '/' || my_slug || '/%')) then return; end if;
    end if;
  end if;
  if exists (
    select 1 from traffic_events
    where visitor = v and kind = k
      and coalesce(product_id::text, '') = coalesce(pid::text, '')
      and (k <> 'visit' or path = pth)
      and created_at > now() - case when k in ('visit', 'view', 'product') then interval '30 minutes' else interval '1 minute' end
  ) then return; end if;
  insert into traffic_events (kind, path, product_id, visitor, ref_code, channel, from_site)
  values (k, nullif(pth, ''), pid, v,
    nullif(left(lower(regexp_replace(coalesce(p_ref, ''), '[^a-zA-Z0-9_-]', '', 'g')), 40), ''),
    nullif(left(lower(regexp_replace(coalesce(p_channel, ''), '[^a-z]', '', 'g')), 20), ''),
    nullif(left(lower(regexp_replace(coalesce(p_from, ''), '^www\.', '')), 80), ''));
end $$;
revoke all on function public.track_event(text, text, uuid, text, text, text, text) from public;
grant execute on function public.track_event(text, text, uuid, text, text, text, text) to anon, authenticated;

create or replace function public.traffic_summary(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  out jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  select jsonb_build_object(
    'visitors', (select count(distinct visitor) from traffic_events where created_at >= since),
    'visitors_today', (select count(distinct visitor) from traffic_events where created_at >= date_trunc('day', now() at time zone 'Africa/Lusaka') at time zone 'Africa/Lusaka'),
    'page_views', (select count(*) from traffic_events where created_at >= since and kind in ('visit', 'view')),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'visitors', n) order by day) from (
        select (created_at at time zone 'Africa/Lusaka')::date as day, count(distinct visitor) as n
        from traffic_events where created_at >= since group by (created_at at time zone 'Africa/Lusaka')::date) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(s) from (
        select jsonb_build_object('source', coalesce(channel, from_site, 'direct'), 'visitors', count(distinct visitor)) s
        from traffic_events where created_at >= since and kind = 'visit' group by coalesce(channel, from_site, 'direct') order by count(distinct visitor) desc limit 12) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(p) from (
        select jsonb_build_object('path', path, 'visits', count(*), 'visitors', count(distinct visitor)) p
        from traffic_events where created_at >= since and kind = 'visit' and path is not null group by path order by count(*) desc limit 15) x), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(v) from (
        select jsonb_build_object(
          'product_id', pr.id, 'name', pr.name, 'slug', pr.slug, 'price', pr.price, 'status', pr.status,
          'views', count(*) filter (where e.kind = 'view'),
          'visitors', count(distinct e.visitor) filter (where e.kind = 'view'),
          'whatsapp', count(*) filter (where e.kind = 'whatsapp'),
          'calls', count(*) filter (where e.kind = 'call'),
          'enquiries', count(*) filter (where e.kind = 'enquiry'),
          'shares', count(*) filter (where e.kind = 'share'),
          'from_affiliates', count(distinct e.visitor) filter (where e.ref_code is not null)) v
        from products pr left join traffic_events e on e.product_id = pr.id and e.created_at >= since
        where pr.offering_type = 'vehicle' and pr.status in ('published', 'out_of_stock')
        group by pr.id order by count(*) filter (where e.kind = 'view') desc, pr.created_at desc) x), '[]'::jsonb),
    -- Where people drop off: of the visitors in the period, how many looked at
    -- a product or vehicle, added to a cart, opened checkout, ordered.
    'funnel', jsonb_build_object(
      'visited', (select count(distinct visitor) from traffic_events where created_at >= since),
      'viewed', (select count(distinct visitor) from traffic_events where created_at >= since and kind in ('product', 'view')),
      'carted', (select count(distinct visitor) from traffic_events where created_at >= since and kind = 'cart'),
      'checkout', (select count(distinct visitor) from traffic_events where created_at >= since and kind = 'checkout'),
      'ordered', (select count(distinct visitor) from traffic_events where created_at >= since and kind in ('order', 'enquiry'))),
    'products', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('product_id', pr.id, 'name', pr.name, 'slug', pr.slug, 'price', pr.price,
          'views', count(*) filter (where e.kind = 'product'), 'visitors', count(distinct e.visitor) filter (where e.kind = 'product'),
          'carts', count(distinct e.visitor) filter (where e.kind = 'cart')) x
        from traffic_events e join products pr on pr.id = e.product_id
        where e.created_at >= since and e.kind in ('product', 'cart') and pr.offering_type is distinct from 'vehicle'
        group by pr.id order by count(*) filter (where e.kind = 'product') desc limit 15) z), '[]'::jsonb),
    'affiliates', coalesce((select jsonb_agg(a) from (
        select jsonb_build_object('code', ref_code, 'visitors', count(distinct visitor), 'taps', count(*) filter (where kind in ('whatsapp', 'call', 'enquiry'))) a
        from traffic_events where created_at >= since and ref_code is not null group by ref_code order by count(distinct visitor) desc limit 15) x), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.traffic_summary(int) from public;
grant execute on function public.traffic_summary(int) to authenticated;

-- Shop and product counters: same rule.
create or replace function track_hit(p_kind text, p_vendor uuid default null, p_product uuid default null, p_code text default null)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if p_kind not in ('store_view', 'product_view', 'affiliate_click') then return; end if;
  -- The team, affiliates, and a seller looking at their own shop are not visitors.
  if auth.uid() is not null and (public.is_insider() or (p_vendor is not null and p_vendor = my_vendor_id())) then return; end if;
  if coalesce(p_code, '') <> '' then select id into rid from resellers where code = lower(p_code); end if;
  insert into link_hits (kind, day, vendor_id, product_id, reseller_id, hits)
  values (p_kind, lusaka_date(now()), p_vendor, p_product, rid, 1)
  on conflict (kind, day, coalesce(vendor_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(reseller_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set hits = link_hits.hits + 1;
end $$;

-- Blog reads: the team and affiliates reading or sharing a post are not readers.
create or replace function post_read(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_insider() then return; end if;
  update posts set views = views + 1 where slug = p_slug and status = 'published';
end $$;
grant execute on function post_read(text) to anon, authenticated;

create or replace function public.journal_track_event(p_slug text, p_event text, p_visitor uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if p_visitor is null or p_event not in ('engaged_read', 'product_click', 'share_click') then return false; end if;
  if auth.uid() is not null and public.is_insider() then return false; end if;
  select id into pid from public.posts where slug = p_slug and status = 'published';
  if pid is null then return false; end if;
  insert into public.journal_events(post_id, event_type, visitor_token)
  values (pid, p_event, p_visitor) on conflict do nothing;
  return true;
end $$;
revoke all on function public.journal_track_event(text, text, uuid) from public;
grant execute on function public.journal_track_event(text, text, uuid) to anon, authenticated;

-- The share taps recorded so far were the founder testing the button.
do $$ begin
  if to_regclass('public.journal_events') is not null then delete from public.journal_events where event_type = 'share_click'; end if;
end $$;

-- ---- Stock that is not ours ------------------------------------------------
-- Whose goods these are when ZaMarket sells them for somebody else (for
-- example a dealer's vehicles). Private; buyers never see it.
alter table public.products add column if not exists third_party_owner text check (third_party_owner is null or length(third_party_owner) <= 120);
alter table public.products add column if not exists lunch_only boolean not null default false;

create or replace function action_center() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid := my_vendor_id(); r uuid := my_reseller_id(); out jsonb := '[]'; today date := lusaka_date(now());
  add_group jsonb;
begin
  if is_staff() or can_market() then
    -- the till: orders and money first
    add_group := jsonb_build_object('key', 'new_orders', 'label', 'New orders to confirm', 'tone', 'urgent', 'link', '/admin/orders?status=pending',
      'count', (select count(*) from orders where status = 'pending'),
      'oldest', (select min(created_at) from orders where status = 'pending'));
    out := out || jsonb_build_array(add_group);

    out := out || jsonb_build_array(jsonb_build_object('key', 'unpaid', 'label', 'Delivered but not paid', 'tone', 'urgent', 'link', '/admin/orders?status=delivered',
      'count', (select count(*) from orders where status in ('delivered', 'completed') and payment_status <> 'paid'),
      'oldest', (select min(created_at) from orders where status in ('delivered', 'completed') and payment_status <> 'paid')));

    out := out || jsonb_build_array(jsonb_build_object('key', 'to_deliver', 'label', 'Waiting to go out', 'tone', 'normal', 'link', '/admin/deliveries',
      'count', (select count(*) from orders where status in ('paid', 'processing', 'ready_for_dispatch')),
      'oldest', (select min(created_at) from orders where status in ('paid', 'processing', 'ready_for_dispatch'))));

    out := out || jsonb_build_array(jsonb_build_object('key', 'needed_today', 'label', 'Needed today or overdue', 'tone', 'urgent', 'link', '/admin/orders',
      'count', (select count(*) from orders where needed_by is not null and needed_by <= today and status not in ('completed','cancelled','refunded','returned')),
      'oldest', (select min(created_at) from orders where needed_by is not null and needed_by <= today and status not in ('completed','cancelled','refunded','returned'))));

    out := out || jsonb_build_array(jsonb_build_object('key', 'payouts', 'label', 'Payout requests', 'tone', 'money', 'link', '/admin/finance?tab=requests',
      'count', (select count(*) from payouts where status in ('requested', 'approved')),
      'amount', (select coalesce(sum(amount), 0) from payouts where status in ('requested', 'approved')),
      'oldest', (select min(requested_at) from payouts where status in ('requested', 'approved'))));

    out := out || jsonb_build_array(jsonb_build_object('key', 'commissions', 'label', 'Commissions to check', 'tone', 'money', 'link', '/admin/finance?tab=commissions',
      'count', (select count(*) from commissions where status = 'pending' and eligible_at < now()),
      'amount', (select coalesce(sum(amount), 0) from commissions where status = 'pending' and eligible_at < now())));

    out := out || jsonb_build_array(jsonb_build_object('key', 'settlements', 'label', 'Vendor payouts to approve', 'tone', 'money', 'link', '/admin/finance?tab=settlements',
      'count', (select count(*) from settlements where status = 'pending'),
      'amount', (select coalesce(sum(net_payable), 0) from settlements where status = 'pending')));

    out := out || jsonb_build_array(jsonb_build_object('key', 'vendor_apps', 'label', 'Vendors waiting for a decision', 'tone', 'normal', 'link', '/admin/vendors',
      'count', (select count(*) from vendors where status = 'pending'),
      'oldest', (select min(created_at) from vendors where status = 'pending')));

    out := out || jsonb_build_array(jsonb_build_object('key', 'affiliate_apps', 'label', 'Affiliates waiting for a decision', 'tone', 'normal', 'link', '/admin/resellers',
      'count', (select count(*) from resellers where status = 'pending'),
      'oldest', (select min(created_at) from resellers where status = 'pending')));

    out := out || jsonb_build_array(jsonb_build_object('key', 'products', 'label', 'Products sent for review', 'tone', 'normal', 'link', '/admin/products',
      'count', (select count(*) from products where status = 'submitted')));

    out := out || jsonb_build_array(jsonb_build_object('key', 'enquiries', 'label', 'Enquiries waiting', 'tone', 'normal', 'link', '/admin/deals',
      'count', (select count(*) from deals where status in ('enquiry', 'negotiating')),
      'oldest', (select min(created_at) from deals where status in ('enquiry', 'negotiating'))));

    out := out || jsonb_build_array(jsonb_build_object('key', 'ad_requests', 'label', 'Vendors asking for advertising', 'tone', 'normal', 'link', '/admin/marketing/requests',
      'count', (select count(*) from ad_requests where status = 'new')));

    out := out || jsonb_build_array(jsonb_build_object('key', 'reviews', 'label', 'Reviews to approve', 'tone', 'normal', 'link', '/admin/reviews',
      'count', (select count(*) from reviews where not approved)));

    out := out || jsonb_build_array(jsonb_build_object('key', 'leads', 'label', 'Leads to follow up', 'tone', 'normal', 'link', '/admin/marketing/leads',
      'count', (select count(*) from leads where stage in ('new','contacted','engaged') and (next_follow_up <= today or (stage = 'new' and last_contact_at is null)))));

    out := out || jsonb_build_array(jsonb_build_object('key', 'stock', 'label', 'Running out of stock', 'tone', 'normal', 'link', '/admin/inventory',
      'count', (select count(*) from products where owner_type = 'founder' and fulfilment = 'in_stock' and status = 'published' and stock_available <= 3
        and offering_type is distinct from 'vehicle' and third_party_owner is null and not lunch_only)));

    out := out || jsonb_build_array(jsonb_build_object('key', 'stock_requests', 'label', 'People waiting for stock', 'tone', 'normal', 'link', '/admin/marketing/leads',
      'count', (select count(*) from stock_requests where not fulfilled)));

  elsif v is not null then
    out := out || jsonb_build_array(jsonb_build_object('key', 'to_make', 'label', 'Orders to prepare', 'tone', 'urgent', 'link', '/vendor/orders',
      'count', (select count(*) from order_items i join orders o on o.id = i.order_id
                 where i.vendor_id = v and i.vendor_status in ('new', 'preparing')
                   and o.status in ('confirmed','payment_pending','paid','processing','ready_for_dispatch'))));
    out := out || jsonb_build_array(jsonb_build_object('key', 'due_today', 'label', 'Needed today or overdue', 'tone', 'urgent', 'link', '/vendor/orders',
      'count', (select count(*) from order_items i join orders o on o.id = i.order_id
                 where i.vendor_id = v and i.vendor_status in ('new', 'preparing') and o.needed_by is not null and o.needed_by <= today)));
    out := out || jsonb_build_array(jsonb_build_object('key', 'money_ready', 'label', 'Money you can ask for', 'tone', 'money', 'link', '/vendor/payouts',
      'count', (select count(*) from settlements where vendor_id = v and status in ('eligible', 'approved')),
      'amount', (select coalesce(sum(net_payable), 0) from settlements where vendor_id = v and status in ('eligible', 'approved'))));
    out := out || jsonb_build_array(jsonb_build_object('key', 'rejected', 'label', 'Products needing changes', 'tone', 'normal', 'link', '/vendor/products',
      'count', (select count(*) from products where vendor_id = v and status = 'rejected')));

  elsif r is not null then
    out := out || jsonb_build_array(jsonb_build_object('key', 'money_ready', 'label', 'Money you can ask for', 'tone', 'money', 'link', '/sell/commissions',
      'count', (select count(*) from commissions where reseller_id = r and status in ('verified', 'approved')),
      'amount', (select coalesce(sum(amount), 0) from commissions where reseller_id = r and status in ('verified', 'approved'))));
    out := out || jsonb_build_array(jsonb_build_object('key', 'payout_status', 'label', 'Payouts being processed', 'tone', 'normal', 'link', '/sell/commissions',
      'count', (select count(*) from payouts where reseller_id = r and status in ('requested', 'approved')),
      'amount', (select coalesce(sum(amount), 0) from payouts where reseller_id = r and status in ('requested', 'approved'))));
  end if;

  return (select coalesce(jsonb_agg(g), '[]') from jsonb_array_elements(out) g where (g->>'count')::int > 0);
end $$;

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
    'delivery_costs', (select coalesce(sum(greatest(d.delivery_cost + d.fuel_cost,
                          case when d.delivery_cost + d.fuel_cost > 0 then 0 else setting_num('assumed_delivery_cost') end)), 0)
                        from deliveries d join o on o.id = d.order_id),
    'delivery_income', (select coalesce(sum(delivery_fee),0) from o),
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

