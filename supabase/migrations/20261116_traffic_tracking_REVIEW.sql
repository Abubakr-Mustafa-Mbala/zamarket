-- 26. Traffic and vehicle interest: who visits, what they look at, what they tap.
--
-- First-party and anonymous. A visitor is a random id kept in their own
-- browser; no name, no phone, no IP address is stored. Only staff can read it.
-- Anyone (signed in or not) can add an event, through one function that
-- checks every field and ignores repeats, so the table cannot be flooded
-- with junk from one browser.

create table if not exists public.traffic_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('visit', 'view', 'whatsapp', 'call', 'enquiry', 'share')),
  path        text,
  product_id  uuid references public.products(id) on delete set null,
  visitor     text not null,
  ref_code    text,
  channel     text,
  from_site   text
);
create index if not exists traffic_events_time on public.traffic_events (created_at desc);
create index if not exists traffic_events_product on public.traffic_events (product_id, created_at desc) where product_id is not null;

alter table public.traffic_events enable row level security;
revoke all on public.traffic_events from anon, authenticated;
drop policy if exists traffic_staff_read on public.traffic_events;
create policy traffic_staff_read on public.traffic_events for select using (public.is_staff());
grant select on public.traffic_events to authenticated;

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
begin
  if k not in ('visit', 'view', 'whatsapp', 'call', 'enquiry', 'share') or length(v) < 8 then return; end if;
  -- Only published products count, so nothing hidden can be probed.
  if p_product is not null then
    select id into pid from products where id = p_product and status in ('published', 'out_of_stock');
    if pid is null then return; end if;
  end if;
  -- Staff browsing their own site are not visitors.
  if auth.uid() is not null and public.is_staff() then return; end if;
  -- One visit per page and one view per vehicle per visitor every 30 minutes;
  -- taps are kept, but not more than one of a kind per minute.
  if exists (
    select 1 from traffic_events
    where visitor = v and kind = k
      and coalesce(product_id::text, '') = coalesce(pid::text, '')
      and (k not in ('visit') or path = pth)
      and created_at > now() - case when k in ('visit', 'view') then interval '30 minutes' else interval '1 minute' end
  ) then return; end if;
  insert into traffic_events (kind, path, product_id, visitor, ref_code, channel, from_site)
  values (k, nullif(pth, ''), pid, v,
    nullif(left(lower(regexp_replace(coalesce(p_ref, ''), '[^a-zA-Z0-9_-]', '', 'g')), 40), ''),
    nullif(left(lower(regexp_replace(coalesce(p_channel, ''), '[^a-z]', '', 'g')), 20), ''),
    nullif(left(lower(regexp_replace(coalesce(p_from, ''), '^www\.', '')), 80), ''));
end $$;
revoke all on function public.track_event(text, text, uuid, text, text, text, text) from public;
grant execute on function public.track_event(text, text, uuid, text, text, text, text) to anon, authenticated;

-- The numbers, for staff: visitors per day, where they came from, the most
-- visited pages, and every vehicle's views and taps.
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
    'affiliates', coalesce((select jsonb_agg(a) from (
        select jsonb_build_object('code', ref_code, 'visitors', count(distinct visitor), 'taps', count(*) filter (where kind in ('whatsapp', 'call', 'enquiry'))) a
        from traffic_events where created_at >= since and ref_code is not null group by ref_code order by count(distinct visitor) desc limit 15) x), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.traffic_summary(int) from public;
grant execute on function public.traffic_summary(int) to authenticated;
