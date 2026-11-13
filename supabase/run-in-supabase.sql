-- ZaMarket — run this whole file once in the Supabase SQL editor.
--
-- Safe to run more than once: every statement is written so a second run
-- changes nothing. It also contains every earlier update, so if you are a
-- few behind, running this one file catches you up completely.
--
-- Run it BEFORE deploying the code. Paste it all, press Run, wait for
-- "Success".



-- ============================================================
-- SECTION 1 of 23 — 20261103_affiliate_recruitment_REVIEW.sql
-- ============================================================

-- ZA Market affiliate recruitment, REVIEW BEFORE DEPLOYMENT.
-- Requires existing public.profiles, public.resellers, public.can_market().
--
-- Training does NOT live in ZaMarket. Affiliates are trained in Al-Halaqa
-- Academy, which is a separate system. The earlier draft of this migration
-- created academy_lessons / academy_sessions / academy_questions tables for
-- lessons inside the marketplace; those have been removed deliberately. Do
-- not add them back. The only link between the two is the training_url
-- setting below, which points affiliates at the academy.

-- Where each applicant came from, so a campaign can be judged.
alter table public.resellers add column if not exists application_source text not null default 'direct';
alter table public.resellers add column if not exists application_campaign text not null default 'organic';
-- Existing roles and reviews remain unchanged. Do not expose contact details
-- through public recruitment reports; these columns use the current RLS.

-- Where affiliates go to be trained. Empty means no training link is shown
-- anywhere, rather than a dead page.
insert into settings (key, value, description) values
  ('training_url', '""', 'Link to the academy where affiliates are trained (Al-Halaqa). Training is not inside ZaMarket. Leave empty to hide the link.')
on conflict (key) do nothing;

-- Aggregate-only recruitment metrics. No applicant names, phones, or emails
-- are exposed to marketing staff (they cannot SELECT the resellers table).
create or replace function public.affiliate_recruitment_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare output jsonb;
begin
  if not public.can_market() then raise exception 'Not permitted'; end if;
  select jsonb_build_object(
    'applied', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', x.application_source, 'applications', x.applications, 'approved', x.approved) order by x.applications desc)
      from (select application_source, count(*) applications, count(*) filter (where status='approved') approved
       from public.resellers group by application_source) x), '[]'::jsonb)
  ) into output from public.resellers;
  return output;
end $$;
revoke all on function public.affiliate_recruitment_report() from public;
grant execute on function public.affiliate_recruitment_report() to authenticated;

-- If an earlier run of the academy draft created these, clear them out.
-- CASCADE takes their policies and grants with them. These tables only ever
-- held lesson text and scheduled calls, so there is nothing of value to lose;
-- no money, order or commission record is touched here.
drop table if exists public.academy_questions cascade;
drop table if exists public.academy_sessions cascade;
drop table if exists public.academy_lessons cascade;
drop function if exists public.is_approved_affiliate();


-- ============================================================
-- SECTION 2 of 23 — 20261103_blog_media_staff_upload_REVIEW.sql
-- ============================================================

-- REVIEW AND APPLY in Supabase SQL editor before using Blog > Upload.
-- No existing products, commissions, or media buckets are altered.
-- Restrict writing to marketplace staff. Public readers may fetch published media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-media', 'blog-media', true, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'])
on conflict (id) do update set
  public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "zm blog media staff insert" on storage.objects;
create policy "zm blog media staff insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'blog-media' and (public.is_staff() or public.can_market()));

drop policy if exists "zm blog media public read" on storage.objects;
create policy "zm blog media public read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'blog-media');

drop policy if exists "zm blog media staff delete" on storage.objects;
create policy "zm blog media staff delete" on storage.objects
for delete to authenticated
using (bucket_id = 'blog-media' and (public.is_staff() or public.can_market()));

-- Give the marketing team article-edit permission, without widening unrelated roles.
drop policy if exists staff_posts_all on public.posts;
create policy staff_posts_all on public.posts for all to authenticated
using (public.is_staff() or public.can_market())
with check (public.is_staff() or public.can_market());

drop policy if exists staff_post_products_all on public.post_products;
create policy staff_post_products_all on public.post_products for all to authenticated
using (public.is_staff() or public.can_market())
with check (public.is_staff() or public.can_market());

-- The report RPC originally denied the marketing role despite displaying it.
create or replace function public.blog_report() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_staff() or can_market()) then null else jsonb_build_object(
    'published', (select count(*) from posts where status = 'published'),
    'drafts', (select count(*) from posts where status = 'draft'),
    'views', (select coalesce(sum(views), 0) from posts),
    'posts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'title', p.title, 'status', p.status,
        'keyword', p.keyword, 'seo_score', p.seo_score, 'views', p.views,
        'offerings', (select count(*) from post_products l where l.post_id = p.id),
        'published_at', p.published_at, 'updated_at', p.updated_at)
      order by p.updated_at desc) from posts p), '[]'::jsonb)) end;
$$;
grant execute on function public.blog_report() to authenticated;


-- ============================================================
-- SECTION 3 of 23 — 20261103_record_payment_reconciliation_REVIEW.sql
-- ============================================================

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


-- ============================================================
-- SECTION 4 of 23 — 20261103_product_poster_support_REVIEW.sql
-- ============================================================

-- Product share posters: let the poster carry the seller's own branding.
--
-- The public product view returned the seller's name but not their mark or
-- where they are, so a product poster had nothing of the seller on it. Both
-- values are already public on the shop page, so nothing new is exposed here.
-- Cost, margin, commission and every other internal figure stay out of this
-- view, exactly as before.

drop view if exists public_products cascade;
create or replace view public_products as
select p.id, p.boost_pct, p.boost_until, p.featured_in_store, p.promo_blocked, p.name, p.slug, p.category, p.description, p.benefits, p.faqs, p.images, p.price, p.normal_price,
       p.status, p.stock_available, p.owner_type, v.business_name as vendor_name,
       (select round(avg(product_rating),1) from reviews r where r.product_id = p.id and r.approved) as rating,
       (select count(*) from reviews r where r.product_id = p.id and r.approved) as review_count,
       p.vendor_id, p.fulfilment, p.lead_time_days, p.order_days, p.daily_limit, p.options, p.note_label, p.created_at,
       p.service_location, p.duration_text, p.time_slots, p.slot_capacity, v.slug as vendor_slug,
       p.offering_type, p.sales_model, p.page, p.commission_type, p.commission_value, p.featured_for_resellers,
       p.section_id,
       v.logo_url as vendor_logo, v.location as vendor_location, v.category as vendor_category,
       (select count(*) from product_packages pk where pk.product_id = p.id and pk.active) as package_count
from products p left join vendors v on v.id = p.vendor_id
where p.status in ('published','out_of_stock') and (p.vendor_id is null or v.status = 'approved');

-- The view runs as the caller, so each row still passes the caller's own
-- row security rather than the view owner's.
alter view public_products set (security_invoker = true);
grant select on public_products to anon, authenticated;


-- ============================================================
-- SECTION 5 of 23 — 20261104_growth_analytics_REVIEW.sql
-- ============================================================

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


-- ============================================================
-- SECTION 6 of 23 — 20261104_order_alerts_REVIEW.sql
-- ============================================================

-- Being told about an order when nobody is watching the screen.
--
-- The bell already covers everything while a dashboard is open. This covers
-- the case that actually loses money: an order arrives at nine at night, no
-- tab is open, and nobody finds out until morning. By then the customer has
-- bought from someone who answered.
--
-- Three channels, in the order they are worth having:
--
--   1. A phone notification (web push). Free, no approval from anyone, no
--      third party, and it works with the browser closed. This is the one
--      that solves the problem.
--   2. Email. Free, and it leaves a record you can search later.
--   3. WhatsApp. What you asked for, and it is wired up — but Meta now bills
--      every business-initiated message and requires an approved template, so
--      it is switched off until you have that set up. Nothing else depends
--      on it, so none of the above stops working while it is off.
--
-- Nothing here stores a customer's phone, name or address. An alert says what
-- the order is worth and its number; you open the dashboard to see the rest.

-- Where to send a phone notification. One row per browser that was granted
-- permission, owned by the staff member who granted it.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 20 and 2000),
  p256dh text not null check (length(p256dh) between 10 and 400),
  auth text not null check (length(auth) between 10 and 400),
  label text not null default '' check (length(label) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A person manages only their own devices. Nobody can read anyone else's
-- endpoint: a push endpoint is a capability — whoever holds it can send that
-- phone a notification — so it is treated like a credential, not a setting.
drop policy if exists push_sub_own on public.push_subscriptions;
create policy push_sub_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- So the same order is never announced twice, however many times the alert
-- is triggered — once by the browser that placed it, once by a database
-- webhook, once by a retry.
alter table public.orders add column if not exists alerted_at timestamptz;

insert into settings (key, value, description) values
  ('alert_email', '""', 'Email address that gets a message when a new order arrives. Leave empty for none.'),
  ('alert_whatsapp', '""', 'Phone number in full international form (260...) for WhatsApp order alerts. Needs a Meta WhatsApp Business account and an approved template; Meta charges per message. Leave empty for none.'),
  ('alert_min_total', '0', 'Only alert for orders at or above this amount (K). 0 alerts for every order.')
on conflict (key) do nothing;

-- Claim an order for alerting. Returns the order the FIRST time it is called
-- for that order and nothing on every call after, so two triggers racing each
-- other cannot produce two notifications. Service role only: this is called
-- by the Netlify function, never by a browser.
create or replace function public.claim_order_alert(p_order_number int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; v_items text; v_min numeric;
begin
  select coalesce((value #>> '{}')::numeric, 0) into v_min from settings where key = 'alert_min_total';

  -- Lock the row so two callers cannot both see alerted_at as null.
  select * into o from orders where order_number = p_order_number for update;
  if not found then return null; end if;
  if o.alerted_at is not null then return null; end if;
  if coalesce(o.total, 0) < coalesce(v_min, 0) then
    update orders set alerted_at = now() where id = o.id;
    return null;
  end if;

  update orders set alerted_at = now() where id = o.id;

  -- Product names come from the products table; order_items stores no name.
  select string_agg(coalesce(i.package_name, p.name, 'item') || ' x' || i.quantity, ', ')
    into v_items
    from order_items i left join products p on p.id = i.product_id
   where i.order_id = o.id;

  -- Deliberately no customer name, phone or address: an alert travels through
  -- Google's push service, an email provider and possibly Meta, and none of
  -- them need to know who your customer is.
  return jsonb_build_object(
    'order_number', o.order_number,
    'total', o.total,
    'items', coalesce(v_items, 'items'),
    'channel', coalesce(o.channel, 'marketplace'),
    'placed_at', o.created_at
  );
end $$;

revoke all on function public.claim_order_alert(int) from public, anon, authenticated;
-- service_role keeps the implicit access it has as a superuser-equivalent;
-- no browser session can execute this.


-- ============================================================
-- SECTION 7 of 23 — 20261104_giveaways_REVIEW.sql
-- ============================================================

-- Giveaways, REVIEW BEFORE DEPLOYMENT.
--
-- Two findings shaped every decision below, and both are load-bearing.
--
-- 1. ZAMBIAN LAW. The Lotteries Act (Cap 163) defines a lottery as a scheme
--    where prizes go to holders of "tickets or chances acquired by prior
--    payment". An unauthorised lottery is an offence. A giveaway that nobody
--    pays to enter therefore falls outside that definition — but only for as
--    long as it is genuinely free.
--
--    So this schema has no price column, no paid-entry column and no paid
--    spins, and there is nowhere to add one through the admin screens. That
--    is deliberate. The moment entry costs anything the whole thing becomes
--    a different legal animal, and the safest design is one where that
--    cannot be switched on by accident.
--
-- 2. META'S RULES. Promotions on Facebook and Instagram may not require
--    people to share to their own timeline or tag friends to enter.
--    Commenting is allowed. So entry happens here, on ZaMarket, through a
--    verified account — and social actions are encouragement with a link,
--    never a requirement and never "verified" by us, because we have no
--    honest way to check them.
--
-- Neither point is legal advice. A Zambian lawyer should see the terms
-- before the first campaign goes public.

create table if not exists public.giveaway_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  title text not null check (length(trim(title)) between 3 and 140),
  description text not null default '' check (length(description) <= 4000),
  -- The prize is a real listing, so the photograph and the value shown to
  -- entrants are the ones on the actual product page.
  product_id uuid references public.products(id) on delete set null,
  prize_text text not null default '' check (length(prize_text) <= 200),
  prize_value numeric check (prize_value is null or prize_value >= 0),
  winners int not null default 1 check (winners between 1 and 20),
  -- A vendor may run their own; null means the marketplace is running it.
  vendor_id uuid references public.vendors(id) on delete cascade,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft','scheduled','live','closed','drawn','fulfilled','cancelled')),
  terms text not null default '' check (length(terms) <= 8000),
  min_age int not null default 18 check (min_age between 0 and 25),
  area text not null default 'Zambia' check (length(area) <= 120),
  -- Who pays for the prize and the delivery, recorded so it is never a
  -- disagreement after the draw.
  prize_paid_by text not null default 'marketplace' check (prize_paid_by in ('marketplace','vendor','shared')),
  -- Entry is free. Always. Kept as a constrained column rather than left
  -- implicit so that a future change has to argue with this line.
  entry_cost numeric not null default 0 check (entry_cost = 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);
create index if not exists giveaway_campaigns_status_idx on public.giveaway_campaigns(status, closes_at desc);

create table if not exists public.giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- A display name for the wheel that is not the person's full identity.
  display_name text not null default '' check (length(display_name) <= 60),
  eligible boolean not null default true,
  disqualified_reason text check (disqualified_reason is null or length(disqualified_reason) <= 300),
  created_at timestamptz not null default now(),
  -- One entry per person per campaign, enforced by the database rather than
  -- by the screen, because the screen is not where cheating happens.
  unique (campaign_id, user_id)
);
create index if not exists giveaway_entries_campaign_idx on public.giveaway_entries(campaign_id);

-- The draw. One row per campaign, created once and never rewritten.
create table if not exists public.giveaway_draws (
  campaign_id uuid primary key references public.giveaway_campaigns(id) on delete cascade,
  entry_count int not null,
  winners jsonb not null default '[]',
  drawn_at timestamptz not null default now(),
  drawn_by uuid references public.profiles(id),
  method text not null default 'gen_random_uuid order'
);

create table if not exists public.giveaway_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  entry_id uuid not null references public.giveaway_entries(id) on delete cascade,
  status text not null default 'notified'
    check (status in ('notified','contacted','confirmed','delivered','forfeited')),
  note text not null default '' check (length(note) <= 1000),
  updated_at timestamptz not null default now(),
  unique (campaign_id, entry_id)
);

alter table public.giveaway_campaigns enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_draws enable row level security;
alter table public.giveaway_claims enable row level security;

-- Anyone may read a campaign that is actually running or finished. Drafts
-- stay invisible.
drop policy if exists giveaway_public_read on public.giveaway_campaigns;
create policy giveaway_public_read on public.giveaway_campaigns for select to anon, authenticated
  using (status in ('live','closed','drawn','fulfilled'));

drop policy if exists giveaway_staff_all on public.giveaway_campaigns;
create policy giveaway_staff_all on public.giveaway_campaigns for all to authenticated
  using (is_staff() or can_market() or vendor_id = my_vendor_id())
  with check (is_staff() or can_market() or vendor_id = my_vendor_id());

-- An entrant sees their own entry and nothing about anybody else. Staff see
-- all of them. Nobody else can read the list — it is a list of real people
-- who entered a competition, not public data.
drop policy if exists giveaway_entry_own on public.giveaway_entries;
create policy giveaway_entry_own on public.giveaway_entries for select to authenticated
  using (user_id = auth.uid() or is_staff() or can_market());

drop policy if exists giveaway_entry_insert on public.giveaway_entries;
create policy giveaway_entry_insert on public.giveaway_entries for insert to authenticated
  with check (false);   -- entry goes through enter_giveaway() only

drop policy if exists giveaway_entry_staff on public.giveaway_entries;
create policy giveaway_entry_staff on public.giveaway_entries for update to authenticated
  using (is_staff() or can_market()) with check (is_staff() or can_market());

-- The result is public once it exists. That is the point of a public draw.
drop policy if exists giveaway_draw_read on public.giveaway_draws;
create policy giveaway_draw_read on public.giveaway_draws for select to anon, authenticated using (true);

drop policy if exists giveaway_claim_staff on public.giveaway_claims;
create policy giveaway_claim_staff on public.giveaway_claims for all to authenticated
  using (is_staff() or can_market()) with check (is_staff() or can_market());

revoke all on public.giveaway_entries, public.giveaway_claims from anon;
grant select on public.giveaway_campaigns, public.giveaway_draws to anon, authenticated;
grant select, update on public.giveaway_entries to authenticated;
grant insert, update, delete on public.giveaway_campaigns to authenticated;
grant select, insert, update on public.giveaway_claims to authenticated;

-- Enter. The only way an entry is ever created.
create or replace function public.enter_giveaway(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; me uuid := auth.uid(); nm text; existing uuid;
begin
  if me is null then raise exception 'Sign in to enter'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if c.status <> 'live' then raise exception 'This giveaway is not open'; end if;
  if now() < c.opens_at then raise exception 'This giveaway has not started'; end if;
  if now() > c.closes_at then raise exception 'Entries have closed'; end if;

  select id into existing from giveaway_entries where campaign_id = c.id and user_id = me;
  if existing is not null then return jsonb_build_object('entered', true, 'already', true); end if;

  -- A first name and the first letter of the surname. Never a phone number,
  -- an email address or a full name on a public wheel.
  select trim(split_part(coalesce(full_name, 'Entrant'), ' ', 1)
         || case when position(' ' in coalesce(full_name, '')) > 0
                 then ' ' || upper(left(split_part(full_name, ' ', 2), 1)) || '.'
                 else '' end)
    into nm from profiles where id = me;

  insert into giveaway_entries (campaign_id, user_id, display_name)
  values (c.id, me, coalesce(nullif(nm, ''), 'Entrant'));
  return jsonb_build_object('entered', true, 'already', false);
end $$;

-- Draw the winners.
--
-- The result is decided HERE, by the database, before any wheel spins. The
-- animation on screen is told who won and spins to that answer. An admin
-- cannot choose the winner, and running this twice cannot change it: the
-- draw row is written once and every later call returns the same result.
create or replace function public.draw_giveaway(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; existing giveaway_draws%rowtype;
        picked jsonb; total int;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;

  select * into existing from giveaway_draws where campaign_id = c.id;
  if found then
    return jsonb_build_object('winners', existing.winners, 'entry_count', existing.entry_count,
                              'drawn_at', existing.drawn_at, 'repeat', true);
  end if;

  if now() <= c.closes_at then raise exception 'Wait until entries have closed'; end if;

  select count(*) into total from giveaway_entries where campaign_id = c.id and eligible;
  if total = 0 then raise exception 'Nobody entered'; end if;

  -- gen_random_uuid() is cryptographically random, so ordering by it gives a
  -- fair shuffle that nobody — including whoever runs this — can predict or
  -- steer.
  select jsonb_agg(jsonb_build_object('entry_id', e.id, 'name', e.display_name))
    into picked
    from (select id, display_name from giveaway_entries
           where campaign_id = c.id and eligible
           order by gen_random_uuid() limit c.winners) e;

  insert into giveaway_draws (campaign_id, entry_count, winners, drawn_by)
  values (c.id, total, coalesce(picked, '[]'::jsonb), auth.uid());

  update giveaway_campaigns set status = 'drawn' where id = c.id;

  insert into giveaway_claims (campaign_id, entry_id)
  select c.id, (w->>'entry_id')::uuid from jsonb_array_elements(coalesce(picked, '[]'::jsonb)) w
  on conflict do nothing;

  return jsonb_build_object('winners', picked, 'entry_count', total, 'repeat', false);
end $$;

-- What a visitor is allowed to see about a campaign: the prize, the counts
-- and the first names on the wheel. No contact details, ever.
create or replace function public.giveaway_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype;
begin
  select * into c from giveaway_campaigns where slug = p_slug
     and status in ('live','closed','drawn','fulfilled');
  if not found then return null; end if;
  select * into d from giveaway_draws where campaign_id = c.id;

  return jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'description', c.description,
    'prize_text', c.prize_text, 'prize_value', c.prize_value,
    'winners', c.winners, 'status', c.status, 'terms', c.terms,
    'area', c.area, 'min_age', c.min_age,
    'opens_at', c.opens_at, 'closes_at', c.closes_at,
    -- Enough to decide whether the thing can actually be sold today. The
    -- prize is sometimes the only one there is, and offering to sell a
    -- second is how you take money for something nobody can deliver.
    'product', (select jsonb_build_object('name', p.name, 'slug', p.slug,
                  'images', p.images, 'price', p.price, 'vendor_slug', v.slug,
                  'vendor_name', v.business_name, 'status', p.status,
                  'fulfilment', p.fulfilment, 'lead_time_days', p.lead_time_days,
                  'stock_available', p.stock_available, 'owner_type', p.owner_type)
                from products p left join vendors v on v.id = p.vendor_id
                where p.id = c.product_id),
    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'mine', (select exists (select 1 from giveaway_entries
               where campaign_id = c.id and user_id = auth.uid())),
    'names', coalesce((select jsonb_agg(x.display_name)
                from (select display_name from giveaway_entries
                       where campaign_id = c.id and eligible
                       order by created_at limit 300) x), '[]'::jsonb),
    'result', case when d.campaign_id is null then null
                   else jsonb_build_object('winners', d.winners, 'drawn_at', d.drawn_at,
                                           'entry_count', d.entry_count) end
  );
end $$;

revoke all on function public.enter_giveaway(text) from public;
revoke all on function public.draw_giveaway(text) from public, anon;
grant execute on function public.enter_giveaway(text) to authenticated;
grant execute on function public.draw_giveaway(text) to authenticated;
grant execute on function public.giveaway_public(text) to anon, authenticated;


-- ============================================================
-- SECTION 8 of 23 — 20261104_giveaway_conversion_REVIEW.sql
-- ============================================================

-- Turning a giveaway into something that pays for itself.
--
-- Three additions, each answering a real gap in the first version:
--
--   1. Consent, recorded properly. An entrant is not a mailing list. Zambia's
--      data protection rules require a lawful basis and a working way out, so
--      the opt-in is separate from entering, starts unticked, and every
--      change is stored with its time and where it came from. Entering a
--      giveaway never subscribes anybody to anything.
--
--   2. Attribution. A campaign already has everything needed to answer "what
--      did it actually produce" — orders carry a source, and the marketplace
--      already understands `campaign:<code>`. The giveaway now uses that, so
--      its orders land in the same reporting as everything else instead of
--      in a parallel system that disagrees with it.
--
--   3. A report that uses the word cost. Entries are not a result. What a
--      campaign is judged on is what it cost against the commission it
--      actually earned, and whether those customers came back.

-- --- consent ---------------------------------------------------------------
create table if not exists public.marketing_consent (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted boolean not null default false,
  channel text not null default 'email' check (channel in ('email','whatsapp','sms','any')),
  source text not null default '' check (length(source) <= 120),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.marketing_consent enable row level security;

drop policy if exists consent_own on public.marketing_consent;
create policy consent_own on public.marketing_consent for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists consent_staff_read on public.marketing_consent;
create policy consent_staff_read on public.marketing_consent for select to authenticated
  using (is_staff() or can_market());

revoke all on public.marketing_consent from anon;
grant select, insert, update on public.marketing_consent to authenticated;

-- Set or withdraw. Withdrawal keeps the row — proof that consent was given
-- and then taken back is the point of the record, and deleting it would
-- destroy the evidence that the withdrawal was honoured.
create or replace function public.set_marketing_consent(p_granted boolean, p_source text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into marketing_consent (user_id, granted, source, granted_at, withdrawn_at)
  values (auth.uid(), p_granted, left(coalesce(p_source, ''), 120),
          case when p_granted then now() end,
          case when not p_granted then now() end)
  on conflict (user_id) do update set
    granted = excluded.granted,
    source = case when excluded.granted then excluded.source else marketing_consent.source end,
    granted_at = case when excluded.granted then now() else marketing_consent.granted_at end,
    withdrawn_at = case when excluded.granted then null else now() end,
    updated_at = now();
end $$;

revoke all on function public.set_marketing_consent(boolean, text) from public, anon;
grant execute on function public.set_marketing_consent(boolean, text) to authenticated;

-- --- what a campaign cost --------------------------------------------------
alter table public.giveaway_campaigns add column if not exists cost_prize numeric not null default 0 check (cost_prize >= 0);
alter table public.giveaway_campaigns add column if not exists cost_delivery numeric not null default 0 check (cost_delivery >= 0);
alter table public.giveaway_campaigns add column if not exists cost_promotion numeric not null default 0 check (cost_promotion >= 0);

-- Entering now records whether the person also opted in, so the opt-in rate
-- of a campaign can be judged without reading anybody's consent record.
alter table public.giveaway_entries add column if not exists opted_in boolean not null default false;

-- --- did it pay for itself -------------------------------------------------
--
-- Orders are matched by the attribution the marketplace already uses:
-- `campaign:<slug>`. Nothing here invents a second definition of a sale.
create or replace function public.giveaway_report(p_slug text, p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; tag text; spend numeric; out jsonb;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then return null; end if;

  tag := 'campaign:' || c.slug;
  spend := coalesce(c.cost_prize, 0) + coalesce(c.cost_delivery, 0) + coalesce(c.cost_promotion, 0);

  select jsonb_build_object(
    'slug', c.slug,
    'title', c.title,
    'spend', spend,
    'paid_by', c.prize_paid_by,

    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'opted_in', (select count(*) from giveaway_entries where campaign_id = c.id and opted_in),

    -- Everything the campaign's own link brought in, over the window.
    'orders', (select count(*) from orders o
                where o.source = tag
                  and o.created_at >= c.opens_at
                  and o.created_at <= c.closes_at + make_interval(days => p_days)
                  and o.status not in ('cancelled','fraud_review')),
    'completed', (select count(*) from orders o
                   where o.source = tag and o.status = 'completed'
                     and o.created_at >= c.opens_at
                     and o.created_at <= c.closes_at + make_interval(days => p_days)),
    'sales', (select coalesce(sum(o.total), 0) from orders o
               where o.source = tag and o.status = 'completed'
                 and o.created_at >= c.opens_at
                 and o.created_at <= c.closes_at + make_interval(days => p_days)),

    -- What the marketplace actually keeps. Taken from the settlement records,
    -- which are the real fee figures, rather than from a percentage assumed
    -- here — an assumed rate would quietly disagree with the finance pages.
    'commission', (select coalesce(sum(st.marketplace_fee), 0)
                    from settlements st join orders o on o.id = st.order_id
                   where o.source = tag and o.status = 'completed'
                     and o.created_at >= c.opens_at
                     and o.created_at <= c.closes_at + make_interval(days => p_days)),

    -- People who entered and later bought ANYTHING, however they arrived.
    -- This is the number that says whether a giveaway built customers or
    -- just gathered people who wanted something free.
    --
    -- An order has no account on it — it is placed against a customer record
    -- keyed by phone number — so entrants are matched to orders by the phone
    -- on their profile. Someone who orders with a different number will not
    -- be counted, which makes this a floor rather than an exact figure. A
    -- number that understates is the right way round for deciding whether to
    -- spend money again.
    'entrants_who_bought', (select count(distinct e.user_id)
      from giveaway_entries e
      join profiles pr on pr.id = e.user_id
      where e.campaign_id = c.id
        and nullif(trim(coalesce(pr.phone, '')), '') is not null
        and exists (select 1 from orders o join customers cu on cu.id = o.customer_id
                     where cu.phone = pr.phone and o.status = 'completed'
                       and o.created_at >= c.opens_at)),

    'window_days', p_days
  ) into out;

  return out;
end $$;

revoke all on function public.giveaway_report(text, int) from public, anon;
grant execute on function public.giveaway_report(text, int) to authenticated;


-- ============================================================
-- SECTION 9 of 23 — 20261104_vendor_stock_REVIEW.sql
-- ============================================================

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


-- ============================================================
-- SECTION 10 of 23 — 20261104_ai_blog_quota_REVIEW.sql
-- ============================================================

-- APPLY IN SUPABASE SQL EDITOR BEFORE ENABLING THE AI BLOG WRITER.
-- Staff-only, database-enforced hourly and daily usage caps; does not change posts.
create table if not exists public.ai_blog_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_blog_generations_user_created_idx
  on public.ai_blog_generations(user_id, created_at desc);
alter table public.ai_blog_generations enable row level security;
revoke all on public.ai_blog_generations from anon, authenticated;

create or replace function public.claim_ai_blog_generation() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not (public.is_staff() or public.can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  -- Serialize quota checking per signed-in user. No client can bypass this RPC.
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if (select count(*) from public.ai_blog_generations
      where user_id = uid and created_at >= now() - interval '1 hour') >= 6
     or (select count(*) from public.ai_blog_generations
      where user_id = uid and created_at >= now() - interval '1 day') >= 20 then
    return false;
  end if;
  insert into public.ai_blog_generations (user_id) values (uid);
  return true;
end;
$$;
revoke all on function public.claim_ai_blog_generation() from public, anon;
grant execute on function public.claim_ai_blog_generation() to authenticated;

-- Optional periodic cleanup (e.g. a monthly admin maintenance job):
-- delete from public.ai_blog_generations where created_at < now() - interval '90 days';


-- ============================================================
-- SECTION 11 of 23 — 20261105_promo_referrals_REVIEW.sql
-- ============================================================

-- Giveaway non-winner referral rewards.
--
-- Someone who entered a giveaway and did not win gets a limited window in
-- which they can earn a FIXED amount of kwacha for every qualifying sale they
-- bring, without having to buy anything first or be an approved affiliate.
--
-- The money is the same kind of money an affiliate earns. It is written into
-- the same `commissions` ledger, with the same statuses, the same grace
-- period, the same reversal on a refund and the same payout route. That is
-- deliberate: one ledger means one place where money can go wrong, and the
-- reversal and payout code that already works keeps working.
--
-- What is different from an affiliate:
--   * the amount is a fixed figure the admin sets, not a percentage
--   * it expires
--   * it is capped, per campaign and per person
--   * it is refused outright when the commission on the sale could not pay it

-- ---------------------------------------------------------------- who earns

create table if not exists public.promo_referrers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  code text not null unique,
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);
create index if not exists promo_referrers_code_idx on public.promo_referrers(lower(code));
create index if not exists promo_referrers_user_idx on public.promo_referrers(user_id);

-- --------------------------------------------------- what the campaign pays

alter table public.giveaway_campaigns
  add column if not exists referral_reward numeric not null default 0 check (referral_reward >= 0),
  add column if not exists referral_days int not null default 7 check (referral_days between 1 and 90),
  add column if not exists referral_budget numeric not null default 0 check (referral_budget >= 0),
  add column if not exists referral_max_per_person numeric not null default 0 check (referral_max_per_person >= 0),
  add column if not exists referral_funded_by text not null default 'zamarket'
    check (referral_funded_by in ('zamarket', 'vendor', 'shared')),
  add column if not exists referral_opens_at timestamptz,
  add column if not exists referral_closes_at timestamptz;

-- Which products a non-winner may promote, and what each one pays. A reward
-- is per product because a K15 reward is sensible on a K900 fryer and
-- ruinous on a K22 loaf of bread.
create table if not exists public.giveaway_reward_products (
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  reward numeric not null check (reward > 0),
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (campaign_id, product_id)
);

alter table public.orders add column if not exists promo_referrer_id uuid references public.promo_referrers(id);
create index if not exists orders_promo_referrer_idx on public.orders(promo_referrer_id);

-- ------------------------------------------- the ledger accepts both earners

alter table public.commissions alter column reseller_id drop not null;
alter table public.commissions add column if not exists promo_referrer_id uuid references public.promo_referrers(id);
alter table public.commissions drop constraint if exists commissions_one_earner;
alter table public.commissions add constraint commissions_one_earner check (
  (reseller_id is not null and promo_referrer_id is null)
  or (reseller_id is null and promo_referrer_id is not null)
);
-- One reward per order per referrer, so a retried status change cannot pay twice.
create unique index if not exists commissions_promo_once
  on public.commissions(order_id, promo_referrer_id)
  where promo_referrer_id is not null and order_id is not null;

-- --------------------------------------------------- the affordability rule

-- Can this product pay this reward out of the commission the sale earns?
--
-- At a 10% marketplace fee a K15 reward needs a K150 order to break even.
-- Below that every referral loses money, which is the quiet way a promotion
-- eats a business. When the vendor is funding the reward the marketplace fee
-- is not the constraint, but the vendor's own margin is, so the figure is
-- still reported rather than waved through.
create or replace function public.promo_reward_affordable(p_product uuid, p_reward numeric, p_funded_by text default 'zamarket')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p products%rowtype; v vendors%rowtype; pct numeric; earns numeric;
begin
  select * into p from products where id = p_product;
  if not found then return jsonb_build_object('ok', false, 'reason', 'No such product'); end if;
  if p.owner_type = 'vendor' then
    select * into v from vendors where id = p.vendor_id;
    pct := coalesce(v.fee_pct_override, setting_num('marketplace_fee_pct'));
  else
    -- The marketplace's own stock earns its whole margin, not a fee.
    pct := 100;
  end if;
  earns := round(p.price * pct / 100.0, 2);
  return jsonb_build_object(
    'ok', (p_funded_by <> 'zamarket') or (earns >= p_reward),
    'product', p.name,
    'price', p.price,
    'commission', earns,
    'reward', p_reward,
    'margin', round(earns - p_reward, 2),
    'break_even_price', case when pct > 0 then round(p_reward * 100.0 / pct, 2) else null end,
    'reason', case
      when (p_funded_by <> 'zamarket') or (earns >= p_reward) then null
      else 'This sale earns K' || to_char(earns, 'FM999999990.00') || ' but the reward is K'
           || to_char(p_reward, 'FM999999990.00') || '. Raise the price above K'
           || to_char(round(p_reward * 100.0 / nullif(pct, 0), 2), 'FM999999990.00')
           || ', lower the reward, or have the vendor fund it.' end
  );
end $$;

-- Staff add an eligible product through this, so the guard cannot be skipped.
create or replace function public.set_reward_product(p_slug text, p_product uuid, p_reward numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; verdict jsonb;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if coalesce(p_reward, 0) <= 0 then raise exception 'The reward must be more than zero'; end if;

  verdict := promo_reward_affordable(p_product, p_reward, c.referral_funded_by);
  if not (verdict->>'ok')::boolean then
    raise exception '%', verdict->>'reason' using errcode = 'check_violation';
  end if;

  insert into giveaway_reward_products (campaign_id, product_id, reward, added_by)
  values (c.id, p_product, p_reward, auth.uid())
  on conflict (campaign_id, product_id) do update set reward = excluded.reward, added_by = excluded.added_by;
  return verdict;
end $$;

create or replace function public.remove_reward_product(p_slug text, p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  delete from giveaway_reward_products rp using giveaway_campaigns c
   where rp.campaign_id = c.id and c.slug = p_slug and rp.product_id = p_product;
end $$;

-- ------------------------------------------------- opening the window

-- Called once, after the draw. Everyone who entered, was eligible, and did
-- not win gets a code and a deadline.
create or replace function public.open_giveaway_referrals(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype; made int := 0; ends timestamptz;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;
  select * into d from giveaway_draws where campaign_id = c.id;
  if not found then raise exception 'Draw the winners first'; end if;
  if c.referral_reward <= 0 then raise exception 'Set the referral reward first'; end if;
  if not exists (select 1 from giveaway_reward_products where campaign_id = c.id) then
    raise exception 'Choose at least one product people may promote';
  end if;

  -- Re-running must not extend anybody's window, so the dates are fixed the
  -- first time and reused afterwards.
  if c.referral_opens_at is null then
    ends := now() + (c.referral_days || ' days')::interval;
    update giveaway_campaigns set referral_opens_at = now(), referral_closes_at = ends where id = c.id;
  else
    ends := c.referral_closes_at;
  end if;

  insert into promo_referrers (campaign_id, user_id, code, opens_at, expires_at)
  select c.id, e.user_id,
         'G' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)),
         coalesce(c.referral_opens_at, now()), ends
    from giveaway_entries e
   where e.campaign_id = c.id
     and e.eligible
     and e.user_id is not null
     -- not a winner
     and not exists (
       select 1 from jsonb_array_elements(coalesce(d.winners, '[]'::jsonb)) w
        where (w->>'user_id')::uuid = e.user_id)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics made = row_count;

  perform log_audit('giveaway.referrals_opened', 'giveaway_campaigns', c.id, null,
                    jsonb_build_object('invited', made, 'closes_at', ends), null);
  return jsonb_build_object('invited', made, 'closes_at', ends);
end $$;

-- ------------------------------------------------- what the participant sees

create or replace function public.my_promo_referral(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; r promo_referrers%rowtype; earned numeric; pending numeric;
begin
  if auth.uid() is null then return null; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then return null; end if;
  select * into r from promo_referrers where campaign_id = c.id and user_id = auth.uid();
  if not found then return null; end if;

  select coalesce(sum(amount) filter (where status in ('verified','approved','paid')), 0),
         coalesce(sum(amount) filter (where status = 'pending'), 0)
    into earned, pending
    from commissions where promo_referrer_id = r.id;

  return jsonb_build_object(
    'code', r.code,
    'expires_at', r.expires_at,
    'open', now() between r.opens_at and r.expires_at,
    'reward', c.referral_reward,
    'cap', c.referral_max_per_person,
    'earned', earned,
    'pending', pending,
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'slug', p.slug, 'price', p.price, 'reward', rp.reward,
        'images', p.images, 'vendor_slug', v.slug)
        order by rp.reward desc)
      from giveaway_reward_products rp
      join products p on p.id = rp.product_id
      left join vendors v on v.id = p.vendor_id
     where rp.campaign_id = c.id and p.status = 'published'), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------- the award

-- Called when an order completes. Returns the amount awarded, or zero with a
-- reason. Everything that could cost money twice is checked here, inside one
-- transaction, with the campaign row locked.
create or replace function public.award_promo_referral(p_order uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype; r promo_referrers%rowtype; c giveaway_campaigns%rowtype;
  cust customers%rowtype; reward numeric := 0; spent numeric; mine numeric; note text;
begin
  select * into o from orders where id = p_order;
  if not found or o.promo_referrer_id is null then return 0; end if;
  -- An approved affiliate is already being paid for this order; never both.
  if o.reseller_id is not null then return 0; end if;
  if exists (select 1 from commissions where order_id = p_order and promo_referrer_id = o.promo_referrer_id) then
    return 0;
  end if;

  select * into r from promo_referrers where id = o.promo_referrer_id;
  select * into c from giveaway_campaigns where id = r.campaign_id for update;
  select * into cust from customers where id = o.customer_id;

  -- The sale had to happen inside the published window. Settling it later is
  -- fine; earning it later is not.
  if o.created_at > r.expires_at or o.created_at < r.opens_at then
    note := 'Order placed outside the referral window';
  -- The reward is for bringing a NEW customer. A repeat buyer is not one.
  elsif exists (
    select 1 from orders x where x.customer_id = o.customer_id and x.id <> o.id
      and x.status = 'completed' and x.created_at < o.created_at) then
    note := 'Not a new customer';
  -- Referring yourself is not referring anybody. Both numbers are normalised
  -- before comparing: an order written straight into the table, or imported,
  -- may hold "+26097..." where the profile holds "097...", and comparing the
  -- raw strings silently lets every self-referral through.
  elsif cust.id is not null and (
      exists (select 1 from profiles pf where pf.id = r.user_id
                and norm_phone(pf.phone) = norm_phone(cust.phone))
      or r.user_id = o.created_by) then
    note := 'Self-referral';
  elsif 'self_purchase' = any(coalesce(o.risk_flags, '{}')) then
    note := 'Flagged as a self purchase';
  end if;

  if note is null then
    -- Only the products the admin approved, at the rate they approved.
    select coalesce(sum(rp.reward * oi.quantity), 0) into reward
      from order_items oi
      join giveaway_reward_products rp on rp.product_id = oi.product_id and rp.campaign_id = c.id
     where oi.order_id = p_order;
    if reward <= 0 then note := 'No approved product in this order'; end if;
  end if;

  if note is null and c.referral_max_per_person > 0 then
    select coalesce(sum(amount), 0) into mine from commissions
     where promo_referrer_id = r.id and status <> 'reversed';
    if mine >= c.referral_max_per_person then
      note := 'This person has reached their cap';
    else
      reward := least(reward, c.referral_max_per_person - mine);
    end if;
  end if;

  if note is null and c.referral_budget > 0 then
    select coalesce(sum(cm.amount), 0) into spent from commissions cm
      join promo_referrers pr on pr.id = cm.promo_referrer_id
     where pr.campaign_id = c.id and cm.status <> 'reversed';
    if spent >= c.referral_budget then
      note := 'Campaign reward budget is spent';
    else
      -- Never go a ngwee over the budget the founder approved.
      reward := least(reward, c.referral_budget - spent);
    end if;
  end if;

  if note is not null or reward <= 0 then
    insert into commissions (order_id, promo_referrer_id, base_amount, rate_type, rate_value,
                             amount, status, eligible_at, notes)
    values (p_order, r.id, o.subtotal, 'fixed', 0, 0, 'rejected', now(),
            coalesce(note, 'No reward due'))
    on conflict do nothing;
    return 0;
  end if;

  insert into commissions (order_id, promo_referrer_id, base_amount, rate_type, rate_value,
                           amount, status, eligible_at, notes)
  values (p_order, r.id, o.subtotal, 'fixed', reward, reward, 'pending',
          now() + (setting_num('commission_grace_hours') || ' hours')::interval,
          'Giveaway referral · ' || c.slug);
  return reward;
end $$;

-- ------------------------------------------------------------- reporting

create or replace function public.giveaway_referral_report(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype;
begin
  if not (is_staff() or can_market()) then return null; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then return null; end if;

  return jsonb_build_object(
    'slug', c.slug,
    'reward', c.referral_reward,
    'budget', c.referral_budget,
    'funded_by', c.referral_funded_by,
    'opens_at', c.referral_opens_at,
    'closes_at', c.referral_closes_at,
    'open', c.referral_closes_at is not null and now() < c.referral_closes_at,
    'referrers', (select count(*) from promo_referrers where campaign_id = c.id),
    'referrers_earning', (select count(distinct cm.promo_referrer_id) from commissions cm
                            join promo_referrers pr on pr.id = cm.promo_referrer_id
                           where pr.campaign_id = c.id and cm.amount > 0 and cm.status <> 'reversed'),
    'orders', (select count(*) from orders o join promo_referrers pr on pr.id = o.promo_referrer_id
                where pr.campaign_id = c.id),
    'sales', coalesce((select sum(o.subtotal) from orders o
                         join promo_referrers pr on pr.id = o.promo_referrer_id
                        where pr.campaign_id = c.id and o.status = 'completed'), 0),
    -- What the marketplace actually keeps on those orders.
    'commission', coalesce((select sum(s.marketplace_fee) from settlements s
                              join orders o on o.id = s.order_id
                              join promo_referrers pr on pr.id = o.promo_referrer_id
                             where pr.campaign_id = c.id and s.status <> 'cancelled'), 0),
    'rewards_pending', coalesce((select sum(cm.amount) from commissions cm
                                   join promo_referrers pr on pr.id = cm.promo_referrer_id
                                  where pr.campaign_id = c.id and cm.status = 'pending'), 0),
    'rewards_owed', coalesce((select sum(cm.amount) from commissions cm
                                join promo_referrers pr on pr.id = cm.promo_referrer_id
                               where pr.campaign_id = c.id and cm.status in ('verified','approved')), 0),
    'rewards_paid', coalesce((select sum(cm.amount) from commissions cm
                                join promo_referrers pr on pr.id = cm.promo_referrer_id
                               where pr.campaign_id = c.id and cm.status = 'paid'), 0),
    'rewards_reversed', coalesce((select sum(cm.amount) from commissions cm
                                    join promo_referrers pr on pr.id = cm.promo_referrer_id
                                   where pr.campaign_id = c.id and cm.status = 'reversed'), 0),
    'budget_left', greatest(0, c.referral_budget - coalesce((select sum(cm.amount) from commissions cm
                                join promo_referrers pr on pr.id = cm.promo_referrer_id
                               where pr.campaign_id = c.id and cm.status <> 'reversed'), 0)),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object('order', o.order_number, 'why', cm.notes))
                            from commissions cm
                            join promo_referrers pr on pr.id = cm.promo_referrer_id
                            left join orders o on o.id = cm.order_id
                           where pr.campaign_id = c.id and cm.status = 'rejected'), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
                            'name', p.name, 'price', p.price, 'reward', rp.reward,
                            'check', promo_reward_affordable(p.id, rp.reward, c.referral_funded_by)))
                            from giveaway_reward_products rp join products p on p.id = rp.product_id
                           where rp.campaign_id = c.id), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------ permissions

alter table public.promo_referrers enable row level security;
alter table public.giveaway_reward_products enable row level security;

drop policy if exists promo_referrers_mine on public.promo_referrers;
create policy promo_referrers_mine on public.promo_referrers for select to authenticated
  using (user_id = auth.uid() or is_staff() or can_market());

drop policy if exists reward_products_read on public.giveaway_reward_products;
create policy reward_products_read on public.giveaway_reward_products for select to anon, authenticated
  using (true);

revoke all on public.promo_referrers from anon, authenticated;
grant select on public.promo_referrers to authenticated;
revoke all on public.giveaway_reward_products from anon, authenticated;
grant select on public.giveaway_reward_products to anon, authenticated;

revoke all on function public.open_giveaway_referrals(text) from public, anon;
revoke all on function public.set_reward_product(text, uuid, numeric) from public, anon;
revoke all on function public.remove_reward_product(text, uuid) from public, anon;
revoke all on function public.giveaway_referral_report(text) from public, anon;
revoke all on function public.award_promo_referral(uuid) from public, anon, authenticated;
grant execute on function public.open_giveaway_referrals(text) to authenticated;
grant execute on function public.set_reward_product(text, uuid, numeric) to authenticated;
grant execute on function public.remove_reward_product(text, uuid) to authenticated;
grant execute on function public.giveaway_referral_report(text) to authenticated;
grant execute on function public.promo_reward_affordable(uuid, numeric, text) to authenticated;
grant execute on function public.my_promo_referral(text) to authenticated;

-- ---------------------------------------- attribution at the point of sale
--
-- place_order and set_order_status are reproduced here with the giveaway
-- referral added. They were generated from the current definitions rather
-- than retyped, so nothing else in them has changed.

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
  pr promo_referrers%rowtype;
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

  -- giveaway referral attribution
  --
  -- An approved affiliate's work is never interrupted by a campaign: if an
  -- affiliate code was used they are credited and none of this runs. A
  -- giveaway code applies only when no affiliate code was supplied, and when
  -- it is used it beats the sticky-ownership rule below, because this buyer
  -- followed this person's link today. One order, one earner, always.
  if rs.id is null and coalesce(payload->>'referral_code','') <> '' then
    select * into pr from promo_referrers
     where lower(code) = lower(payload->>'referral_code')
       and now() between opens_at and expires_at;
    if found then
      if v_source = 'organic' then v_source := 'giveaway_ref:' || pr.code; end if;
      if exists (select 1 from profiles pf where pf.id = pr.user_id and norm_phone(pf.phone) = cust.phone)
         or (pr.user_id = auth.uid() and not v_manual) then
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
  if rs.id is null and pr.id is null and not v_manual and cust.owner_reseller_id is not null then
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

  insert into orders (customer_id, referrer_vendor_id, source, channel, seller_type, reseller_id, promo_referrer_id, referral_code, province_id, district_id, area, address, instructions,
                      is_local, delivery_fee, delivery_fee_status, collection, is_manual, notes, risk_flags, created_by)
  values (cust.id, v_referrer, v_source, v_channel, v_seller, rs.id, pr.id, nullif(payload->>'referral_code',''), (c->>'province_id')::int, (c->>'district_id')::int,
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

create or replace function set_order_status(p_order uuid, p_status order_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  it record;
  fee_pct numeric;
  comm numeric;
  gross numeric;
  vend_net numeric;
  allowance numeric;
  line_disc numeric;
  coupon_funder text;
  vend vendors%rowtype;
  prod products%rowtype;
  src text;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;

  -- vendors can only request cancellation; staff perform transitions
  if not is_staff() then
    if my_vendor_id() is not null and p_status = 'cancelled' then
      update orders set notes = coalesce(notes,'') || E'\n[Vendor requested cancellation] ' || coalesce(p_reason,'') where id = p_order;
      perform log_audit('order.cancel_requested', 'orders', p_order, null, jsonb_build_object('by_vendor', my_vendor_id()), p_reason);
      return;
    end if;
    raise exception 'Not allowed';
  end if;

  if not order_transition_allowed(o.status, p_status) then
    raise exception 'Cannot move an order from % to %', o.status, p_status;
  end if;

  perform set_config('zm.order_fn', 'on', true);
  update orders set status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    payment_status = (case when p_status = 'paid' then 'paid' when p_status = 'refunded' then 'refunded' else payment_status::text end)::payment_status
  where id = p_order;
  perform set_config('zm.order_fn', 'off', true);

  if p_status = 'delivered' then
    update deliveries set status = 'delivered', delivered_at = now() where order_id = p_order;
  elsif p_status = 'failed_delivery' then
    update deliveries set status = 'failed', failure_reason = p_reason where order_id = p_order;
  elsif p_status = 'out_for_delivery' then
    update deliveries set status = 'out_for_delivery' where order_id = p_order;
  end if;

  -- completion: stock becomes sold, commissions + settlements are created
  if p_status = 'completed' then
    update referrals set status = 'eligible' where order_id = p_order and status = 'purchased';
    src := setting_text('commission_source');
    for it in select oi.* from order_items oi where oi.order_id = p_order loop
      select * into prod from products where id = it.product_id;
      if prod.owner_type = 'founder' and (prod.fulfilment = 'in_stock' or it.reserved_qty > 0) then
        if it.reserved_qty > 0 then
          perform apply_movement(it.product_id, 'sale', it.reserved_qty, 'Order ' || o.order_number, 'order', p_order);
        end if;
        if it.quantity > it.reserved_qty then  -- sold beyond what was reserved: take it from available stock
          insert into inventory_movements (product_id, type, quantity, reason, reference_type, reference_id, user_id)
          values (it.product_id, 'sale', it.quantity - it.reserved_qty, 'Order ' || o.order_number || ' (not reserved)', 'order', p_order, auth.uid());
          update products set stock_available = stock_available - (it.quantity - it.reserved_qty),
                              stock_sold = stock_sold + (it.quantity - it.reserved_qty) where id = it.product_id;
        end if;
        update order_items set reserved_qty = 0 where id = it.id;
      end if;
      gross := it.line_total;
      comm := 0;
      if o.reseller_id is not null then
        comm := commission_for(prod, it.unit_price, it.quantity);
      end if;
      if it.vendor_id is not null then
        select * into vend from vendors where id = it.vendor_id;
        fee_pct := case when o.store_vendor_id = it.vendor_id then least(coalesce(vend.fee_pct_override, setting_num('marketplace_fee_pct')), setting_num('own_audience_fee_pct'))
                        else coalesce(vend.fee_pct_override, setting_num('marketplace_fee_pct')) end;

        -- The vendor is settled at what they agreed, not at a percentage of a
        -- price that may since have moved. Everything above that belongs to the
        -- marketplace, which hands part of it to whoever brought the customer —
        -- and keeps the lot when its own marketing did.
        if setting_text('pricing_mode') = 'vendor_take_home' and coalesce(it.vendor_take, 0) > 0 then
          vend_net := round(it.vendor_take * it.quantity, 2);

          -- A discount is somebody's money, and the coupon said whose. A
          -- marketplace promotion leaves the vendor whole and comes out of
          -- ZaMarket's share; a seller's own sale comes out of theirs. The
          -- discount is apportioned across the order's lines by value, so a
          -- basket from two sellers splits it fairly rather than landing all
          -- of it on whichever line settled first.
          if coalesce(o.discount, 0) > 0 and o.subtotal > 0 then
            line_disc := round(o.discount * (gross / o.subtotal), 2);
            select funded_by into coupon_funder from coupons where id = o.coupon_id;
            if coalesce(coupon_funder, 'marketplace') = 'vendor' then
              vend_net := greatest(vend_net - line_disc, 0);
            end if;
            -- either way the sale is now worth less, so the share ZaMarket
            -- keeps shrinks by the discount it funded
            gross := greatest(gross - line_disc, 0);
          end if;
          -- The commission is capped at the room that was built into the price
          -- for it. Without this cap a product with a generous commission rate
          -- would pay the affiliate out of ZaMarket's own share, which is the
          -- exact thing this whole arrangement exists to prevent.
          allowance := round(gross * coalesce(
            (select commission_allowance_override from vendors where id = it.vendor_id),
            setting_num('commission_allowance_pct')) / 100, 2);
          if comm > allowance then comm := allowance; end if;
          -- and never hand out more than the order actually earned
          if comm > greatest(gross - vend_net, 0) then comm := round(greatest(gross - vend_net, 0), 2); end if;
          insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
          values (it.vendor_id, p_order, o.order_number, gross,
                  round(greatest(gross - vend_net - comm, 0), 2), comm, vend_net, 'pending');
        else
          insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
          values (it.vendor_id, p_order, o.order_number, gross, round(gross * fee_pct / 100, 2),
                  case when src = 'on_top' then comm else 0 end,
                  round(gross - gross * fee_pct / 100 - case when src = 'on_top' then comm else 0 end, 2), 'pending');
        end if;
      end if;
    end loop;

    -- their customer came back after the full-commission window: a flat thank-you instead
    if o.reseller_id is null then
      declare owner_id uuid; bonus numeric := setting_num('affiliate_repeat_bonus');
      begin
        select c2.owner_reseller_id into owner_id from customers c2 where c2.id = o.customer_id;
        if owner_id is not null and bonus > 0 and not exists (select 1 from bonus_credits b where b.order_id = p_order and b.kind = 'repeat_customer') then
          insert into bonus_credits (payee_type, reseller_id, order_id, kind, amount, status, note)
          values ('reseller', owner_id, p_order, 'repeat_customer', bonus, 'eligible', 'Their customer ordered again');
        end if;
      end;
    end if;

    -- a vendor sent this shopper to ZaMarket: they earn on what the shopper bought from others
    if o.referrer_vendor_id is not null then
      declare pct numeric := setting_num('vendor_referral_pct'); base numeric;
      begin
        select coalesce(sum(i.line_total), 0) into base from order_items i
         where i.order_id = p_order and coalesce(i.vendor_id, '00000000-0000-0000-0000-000000000000') <> o.referrer_vendor_id;
        if pct > 0 and base > 0 and not exists (select 1 from bonus_credits b where b.order_id = p_order and b.kind = 'vendor_referral') then
          insert into bonus_credits (payee_type, vendor_id, order_id, kind, amount, status, note)
          values ('vendor', o.referrer_vendor_id, p_order, 'vendor_referral', round(base * pct / 100, 2), 'eligible', 'Someone they sent to ZaMarket bought');
        end if;
      end;
    end if;

    -- the first time anyone sells this product through an affiliate
    if o.reseller_id is not null and setting_num('first_sale_bonus') > 0 then
      declare fresh uuid;
      begin
        select oi.product_id into fresh from order_items oi
         where oi.order_id = p_order
           and not exists (
             select 1 from order_items x join orders y on y.id = x.order_id
              where x.product_id = oi.product_id and y.reseller_id is not null
                and y.status = 'completed' and y.id <> p_order)
         limit 1;
        if fresh is not null and not exists (select 1 from bonus_credits b where b.order_id = p_order and b.kind = 'first_sale') then
          insert into bonus_credits (payee_type, reseller_id, order_id, kind, amount, status, note)
          values ('reseller', o.reseller_id, p_order, 'first_sale', setting_num('first_sale_bonus'), 'eligible',
                  'First affiliate sale of ' || (select name from products where id = fresh));
        end if;
      end;
    end if;

    -- A giveaway referrer is paid on the same event as an affiliate, under
    -- the same grace period, and never on an order an affiliate is paid for.
    if o.promo_referrer_id is not null and o.reseller_id is null then
      perform award_promo_referral(p_order);
    end if;

    if o.reseller_id is not null then
      select coalesce(sum(commission_for(p, oi.unit_price, oi.quantity)), 0) into comm
      from order_items oi join products p on p.id = oi.product_id where oi.order_id = p_order;
      insert into commissions (order_id, reseller_id, base_amount, rate_type, rate_value, amount, status, eligible_at)
      values (p_order, o.reseller_id, o.subtotal, 'mixed', 0, comm,
              (case when 'self_purchase' = any(o.risk_flags) then 'rejected' else 'pending' end)::commission_status,
              now() + (setting_num('commission_grace_hours') || ' hours')::interval);
    end if;
  end if;

  -- cancellation / refund / return: release stock, void commissions and settlements
  if p_status in ('cancelled','refunded','returned') then
    for it in select * from order_items where order_id = p_order loop
      if o.status in ('pending','confirmed','payment_pending','paid','processing','ready_for_dispatch','out_for_delivery','failed_delivery','customer_unreachable','fraud_review') then
        if it.reserved_qty > 0 then
          perform apply_movement(it.product_id, 'release', it.reserved_qty, 'Order ' || o.order_number || ' ' || p_status, 'order', p_order);
          update order_items set reserved_qty = 0 where id = it.id;
        end if;
      elsif p_status = 'returned' then
        perform apply_movement(it.product_id, 'return', it.quantity, 'Order ' || o.order_number || ' returned', 'order', p_order);
      end if;
    end loop;
    update referrals set status = 'void' where order_id = p_order and status <> 'paid';
    update bonus_credits set status = 'void' where order_id = p_order and status <> 'paid';
    update offers ofr set units_used = greatest(0, ofr.units_used - x.q)
    from (select offer_id, sum(quantity) q from order_items where order_id = p_order and offer_id is not null group by offer_id) x
    where ofr.id = x.offer_id;
    update commissions set status = 'reversed', notes = coalesce(notes,'') || ' Order ' || p_status where order_id = p_order and status <> 'paid';
    update settlements set status = 'cancelled' where order_id = p_order and status <> 'paid';
  end if;

  perform log_audit('order.status', 'orders', p_order, jsonb_build_object('status', o.status), jsonb_build_object('status', p_status), p_reason);
end $$;


-- ============================================================
-- SECTION 12 of 23 — 20261105_multi_prize_REVIEW.sql
-- ============================================================

-- More than one prize in a giveaway.
--
-- A campaign can now have a list of prizes: first prize, second prize, third,
-- and so on, each going to as many winners as you choose. Two people can win
-- the same cake while a third wins cupcakes and a fourth wins the fryer.
--
-- A campaign with no prize rows behaves exactly as it did before — one prize,
-- taken from the campaign's own product_id and winners count — so nothing
-- that already exists has to change.
--
-- It also fixes a real fault in the referral work. The draw recorded each
-- winner as {entry_id, name} with no user_id, while open_giveaway_referrals
-- excluded winners by user_id. Nothing ever matched, so the winner of the
-- giveaway would also have been handed a referral link and a reward budget.

create table if not exists public.giveaway_prizes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.giveaway_campaigns(id) on delete cascade,
  rank int not null check (rank between 1 and 50),
  product_id uuid references public.products(id),
  prize_text text,
  prize_value numeric check (prize_value is null or prize_value >= 0),
  winners int not null default 1 check (winners between 1 and 500),
  created_at timestamptz not null default now(),
  unique (campaign_id, rank),
  -- A prize is either something in the catalogue or something described.
  constraint giveaway_prizes_has_something check (product_id is not null or nullif(btrim(prize_text), '') is not null)
);
create index if not exists giveaway_prizes_campaign_idx on public.giveaway_prizes(campaign_id, rank);

-- How many people this campaign will draw, whichever way it is set up.
create or replace function public.giveaway_winner_count(p_campaign uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select sum(winners) from giveaway_prizes where campaign_id = p_campaign), 0),
    (select greatest(winners, 1) from giveaway_campaigns where id = p_campaign),
    1)::int;
$$;

-- One row per winner to be drawn, in prize order. The draw walks this list.
create or replace function public.giveaway_prize_slots(p_campaign uuid)
returns table (rn bigint, rank int, product_id uuid, prize_text text, prize_value numeric)
language sql stable security definer set search_path = public as $$
  with listed as (
    select p.rank, p.product_id, p.prize_text, p.prize_value, g.i
      from giveaway_prizes p
      cross join lateral generate_series(1, p.winners) g(i)
     where p.campaign_id = p_campaign
  ),
  fallback as (
    -- No prize list: the campaign's own single prize, repeated.
    select 1 as rank, c.product_id, c.prize_text, c.prize_value, g.i
      from giveaway_campaigns c
      cross join lateral generate_series(1, greatest(c.winners, 1)) g(i)
     where c.id = p_campaign
       and not exists (select 1 from giveaway_prizes where campaign_id = p_campaign)
  ),
  all_slots as (select * from listed union all select * from fallback)
  select row_number() over (order by rank, i) as rn, rank, product_id, prize_text, prize_value
    from all_slots;
$$;

-- Staff edit the prize list through these, so the table keeps its shape.
create or replace function public.set_giveaway_prize(
  p_slug text, p_rank int, p_product uuid default null,
  p_text text default null, p_winners int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; pr products%rowtype;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;
  if exists (select 1 from giveaway_draws where campaign_id = c.id) then
    raise exception 'This giveaway has already been drawn — the prizes cannot change now';
  end if;
  if p_product is null and nullif(btrim(coalesce(p_text, '')), '') is null then
    raise exception 'Choose a product or describe the prize';
  end if;
  if coalesce(p_winners, 1) < 1 then raise exception 'A prize needs at least one winner'; end if;

  if p_product is not null then
    select * into pr from products where id = p_product;
    if not found then raise exception 'No such product'; end if;
  end if;

  insert into giveaway_prizes (campaign_id, rank, product_id, prize_text, prize_value, winners)
  values (c.id, p_rank, p_product, nullif(btrim(coalesce(p_text, '')), ''),
          coalesce(pr.price, null), coalesce(p_winners, 1))
  on conflict (campaign_id, rank) do update
    set product_id = excluded.product_id, prize_text = excluded.prize_text,
        prize_value = excluded.prize_value, winners = excluded.winners;

  -- Keep the campaign's own count in step, so anything still reading it is right.
  update giveaway_campaigns set winners = giveaway_winner_count(c.id) where id = c.id;
  return jsonb_build_object('prizes', (select count(*) from giveaway_prizes where campaign_id = c.id),
                            'winners', giveaway_winner_count(c.id));
end $$;

create or replace function public.remove_giveaway_prize(p_slug text, p_rank int)
returns void language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;
  if exists (select 1 from giveaway_draws where campaign_id = c.id) then
    raise exception 'This giveaway has already been drawn — the prizes cannot change now';
  end if;
  delete from giveaway_prizes where campaign_id = c.id and rank = p_rank;
  update giveaway_campaigns set winners = giveaway_winner_count(c.id) where id = c.id;
end $$;

-- --------------------------------------------------------------- the draw

create or replace function public.draw_giveaway(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; existing giveaway_draws%rowtype;
        picked jsonb; total int; want int;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;

  select * into existing from giveaway_draws where campaign_id = c.id;
  if found then
    return jsonb_build_object('winners', existing.winners, 'entry_count', existing.entry_count,
                              'drawn_at', existing.drawn_at, 'repeat', true);
  end if;

  if now() <= c.closes_at then raise exception 'Wait until entries have closed'; end if;

  select count(*) into total from giveaway_entries where campaign_id = c.id and eligible;
  if total = 0 then raise exception 'Nobody entered'; end if;

  want := giveaway_winner_count(c.id);

  -- gen_random_uuid() is cryptographically random, so ordering by it gives a
  -- fair shuffle nobody — including whoever presses the button — can predict
  -- or steer. Winners are then handed the prizes in rank order: the first
  -- name drawn takes first prize, and so on down the list.
  --
  -- user_id is recorded as well as entry_id. Without it nothing downstream
  -- can tell a winner from a non-winner, which is how the winner of the
  -- giveaway ended up being offered non-winner referral rewards as well.
  with chosen as (
    select s.id, s.display_name, s.user_id, row_number() over () as rn
      from (select id, display_name, user_id
              from giveaway_entries
             where campaign_id = c.id and eligible
             order by gen_random_uuid()
             limit want) s
  )
  select jsonb_agg(jsonb_build_object(
           'entry_id', ch.id,
           'user_id', ch.user_id,
           'name', ch.display_name,
           'prize_rank', sl.rank,
           'prize', coalesce(pr.name, sl.prize_text),
           'prize_value', coalesce(sl.prize_value, pr.price)
         ) order by sl.rank, ch.rn)
    into picked
    from chosen ch
    join giveaway_prize_slots(c.id) sl on sl.rn = ch.rn
    left join products pr on pr.id = sl.product_id;

  insert into giveaway_draws (campaign_id, entry_count, winners, drawn_by)
  values (c.id, total, coalesce(picked, '[]'::jsonb), auth.uid());

  update giveaway_campaigns set status = 'drawn' where id = c.id;

  insert into giveaway_claims (campaign_id, entry_id)
  select c.id, (w->>'entry_id')::uuid from jsonb_array_elements(coalesce(picked, '[]'::jsonb)) w
  on conflict do nothing;

  return jsonb_build_object('winners', picked, 'entry_count', total, 'repeat', false);
end $$;

-- ------------------------------------------------- holding every prize back

create or replace function public.reserve_giveaway_prize(p_slug text, p_hold boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; p products%rowtype;
        row_ record; want int; got int; held int := 0; shortfall int := 0;
        notes jsonb := '[]'::jsonb; moved int;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select * into c from giveaway_campaigns where slug = p_slug;
  if not found then raise exception 'No such giveaway'; end if;

  if not p_hold then
    -- Giving it all back: only what this campaign actually took, per product.
    for row_ in
      select m.product_id,
             sum(case when m.type = 'reserve' then m.quantity else -m.quantity end) as net
        from inventory_movements m
       where m.reference_type = 'giveaway' and m.reference_id = c.id
         and m.type in ('reserve', 'release')
       group by m.product_id
    loop
      if row_.net > 0 then
        perform apply_movement(row_.product_id, 'release', row_.net,
          'Giveaway ' || c.slug || ' ended', 'giveaway', c.id);
        held := held + row_.net;
      end if;
    end loop;
    return jsonb_build_object('released', held);
  end if;

  -- One pass per prize, because a campaign can now hand out several different
  -- things and each needs its own count held back.
  for row_ in
    select sl.product_id, count(*)::int as needed
      from giveaway_prize_slots(c.id) sl
     where sl.product_id is not null
     group by sl.product_id
  loop
    select * into p from products where id = row_.product_id for update;
    if not found then
      notes := notes || jsonb_build_array(jsonb_build_object('why', 'product gone'));
      continue;
    end if;
    -- Made to order and services are made on request: there is nothing on a
    -- shelf to hold, and holding would wrongly block real orders.
    if p.fulfilment <> 'in_stock' then
      notes := notes || jsonb_build_array(jsonb_build_object('product', p.name, 'why', 'made to order'));
      continue;
    end if;
    if not (p.owner_type = 'founder' or p.tracks_stock) then
      notes := notes || jsonb_build_array(jsonb_build_object('product', p.name, 'why', 'this seller does not count stock'));
      continue;
    end if;

    want := row_.needed;
    got := least(want, greatest(p.stock_available, 0));
    if got > 0 then
      perform apply_movement(p.id, 'reserve', got,
        'Held for giveaway ' || c.slug, 'giveaway', c.id);
      held := held + got;
    end if;
    if want > got then
      shortfall := shortfall + (want - got);
      notes := notes || jsonb_build_array(jsonb_build_object(
        'product', p.name, 'wanted', want, 'held', got, 'why', 'not enough in stock'));
    end if;
  end loop;

  return jsonb_build_object('held', held, 'short', shortfall, 'notes', notes);
end $$;

-- ------------------------------------------------ what the public page sees

create or replace function public.giveaway_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype;
begin
  select * into c from giveaway_campaigns where slug = p_slug
     and status in ('live','closed','drawn','fulfilled');
  if not found then return null; end if;
  select * into d from giveaway_draws where campaign_id = c.id;

  return jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'description', c.description,
    'prize_text', c.prize_text, 'prize_value', c.prize_value,
    'winners', giveaway_winner_count(c.id), 'status', c.status, 'terms', c.terms,
    'area', c.area, 'min_age', c.min_age,
    'opens_at', c.opens_at, 'closes_at', c.closes_at,
    -- The headline prize: the first one on the list, or the campaign's own.
    -- Enough to decide whether the thing can actually be sold today, because
    -- a prize is sometimes the only one there is and offering to sell a
    -- second is how you take money for something nobody can deliver.
    'product', (select jsonb_build_object('name', p.name, 'slug', p.slug,
                  'images', p.images, 'price', p.price, 'vendor_slug', v.slug,
                  'vendor_name', v.business_name, 'status', p.status,
                  'fulfilment', p.fulfilment, 'lead_time_days', p.lead_time_days,
                  'stock_available', p.stock_available, 'owner_type', p.owner_type)
                from products p left join vendors v on v.id = p.vendor_id
                where p.id = coalesce(
                  (select gp.product_id from giveaway_prizes gp
                    where gp.campaign_id = c.id and gp.product_id is not null
                    order by gp.rank limit 1),
                  c.product_id)),
    -- The whole list, so the page can show first, second and third prize.
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', gp.rank, 'winners', gp.winners,
               'name', coalesce(p.name, gp.prize_text),
               'slug', p.slug, 'images', p.images,
               'value', coalesce(gp.prize_value, p.price),
               'vendor_name', v.business_name)
             order by gp.rank)
        from giveaway_prizes gp
        left join products p on p.id = gp.product_id
        left join vendors v on v.id = p.vendor_id
       where gp.campaign_id = c.id), '[]'::jsonb),
    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'mine', (select exists (select 1 from giveaway_entries
               where campaign_id = c.id and user_id = auth.uid())),
    'names', coalesce((select jsonb_agg(x.display_name)
                from (select display_name from giveaway_entries
                       where campaign_id = c.id and eligible
                       order by created_at limit 300) x), '[]'::jsonb),
    'result', case when d.campaign_id is null then null
                   else jsonb_build_object('winners', d.winners, 'drawn_at', d.drawn_at,
                                           'entry_count', d.entry_count) end
  );
end $$;

-- ------------------------------- winners must not also be offered referrals

-- Matching on entry_id as well as user_id, so an older draw recorded without
-- user_id still excludes its winner correctly.
create or replace function public.open_giveaway_referrals(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype; made int := 0; ends timestamptz;
begin
  if not (is_staff() or can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  select * into c from giveaway_campaigns where slug = p_slug for update;
  if not found then raise exception 'No such giveaway'; end if;
  select * into d from giveaway_draws where campaign_id = c.id;
  if not found then raise exception 'Draw the winners first'; end if;
  if c.referral_reward <= 0 then raise exception 'Set the referral reward first'; end if;
  if not exists (select 1 from giveaway_reward_products where campaign_id = c.id) then
    raise exception 'Choose at least one product people may promote';
  end if;

  if c.referral_opens_at is null then
    ends := now() + (c.referral_days || ' days')::interval;
    update giveaway_campaigns set referral_opens_at = now(), referral_closes_at = ends where id = c.id;
  else
    ends := c.referral_closes_at;
  end if;

  insert into promo_referrers (campaign_id, user_id, code, opens_at, expires_at)
  select c.id, e.user_id,
         'G' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7)),
         coalesce(c.referral_opens_at, now()), ends
    from giveaway_entries e
   where e.campaign_id = c.id
     and e.eligible
     and e.user_id is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(d.winners, '[]'::jsonb)) w
        where (w->>'user_id') is not null and (w->>'user_id')::uuid = e.user_id)
     and not exists (
       select 1 from jsonb_array_elements(coalesce(d.winners, '[]'::jsonb)) w
        where (w->>'entry_id') is not null and (w->>'entry_id')::uuid = e.id)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics made = row_count;

  perform log_audit('giveaway.referrals_opened', 'giveaway_campaigns', c.id, null,
                    jsonb_build_object('invited', made, 'closes_at', ends), null);
  return jsonb_build_object('invited', made, 'closes_at', ends);
end $$;

-- ------------------------------------------------------------ permissions

alter table public.giveaway_prizes enable row level security;
drop policy if exists giveaway_prizes_read on public.giveaway_prizes;
create policy giveaway_prizes_read on public.giveaway_prizes for select to anon, authenticated using (true);
revoke all on public.giveaway_prizes from anon, authenticated;
grant select on public.giveaway_prizes to anon, authenticated;

revoke all on function public.set_giveaway_prize(text, int, uuid, text, int) from public, anon;
revoke all on function public.remove_giveaway_prize(text, int) from public, anon;
grant execute on function public.set_giveaway_prize(text, int, uuid, text, int) to authenticated;
grant execute on function public.remove_giveaway_prize(text, int) to authenticated;
grant execute on function public.giveaway_winner_count(uuid) to authenticated;
grant execute on function public.giveaway_prize_slots(uuid) to authenticated;


-- ============================================================
-- SECTION 13 of 23 — 20261105_all_entries_on_wheel_REVIEW.sql
-- ============================================================

-- Everybody goes on the wheel.
--
-- giveaway_public used to send the first 300 display names. With a thousand
-- entries that meant seven hundred people looking for themselves on a
-- recorded draw and not finding themselves. It does not matter that the
-- caption said so: what people see is a wheel they are not on, and the next
-- campaign they do not bother entering.
--
-- So the whole entry list goes out. The names are already only a first name
-- and an initial, so this adds no personal information — a 2,000-entry draw
-- is roughly 30KB of text, which is less than one product photograph.
--
-- The ceiling exists only so a runaway campaign cannot send a payload big
-- enough to hang a phone. It is set far above any realistic draw, and the
-- page still says plainly when it has been reached.
create or replace function public.giveaway_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c giveaway_campaigns%rowtype; d giveaway_draws%rowtype;
begin
  select * into c from giveaway_campaigns where slug = p_slug
     and status in ('live','closed','drawn','fulfilled');
  if not found then return null; end if;
  select * into d from giveaway_draws where campaign_id = c.id;

  return jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'description', c.description,
    'prize_text', c.prize_text, 'prize_value', c.prize_value,
    'winners', giveaway_winner_count(c.id), 'status', c.status, 'terms', c.terms,
    'area', c.area, 'min_age', c.min_age,
    'opens_at', c.opens_at, 'closes_at', c.closes_at,
    'product', (select jsonb_build_object('name', p.name, 'slug', p.slug,
                  'images', p.images, 'price', p.price, 'vendor_slug', v.slug,
                  'vendor_name', v.business_name, 'status', p.status,
                  'fulfilment', p.fulfilment, 'lead_time_days', p.lead_time_days,
                  'stock_available', p.stock_available, 'owner_type', p.owner_type)
                from products p left join vendors v on v.id = p.vendor_id
                where p.id = coalesce(
                  (select gp.product_id from giveaway_prizes gp
                    where gp.campaign_id = c.id and gp.product_id is not null
                    order by gp.rank limit 1),
                  c.product_id)),
    'prizes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', gp.rank, 'winners', gp.winners,
               'name', coalesce(p.name, gp.prize_text),
               'slug', p.slug, 'images', p.images,
               'value', coalesce(gp.prize_value, p.price),
               'vendor_name', v.business_name)
             order by gp.rank)
        from giveaway_prizes gp
        left join products p on p.id = gp.product_id
        left join vendors v on v.id = p.vendor_id
       where gp.campaign_id = c.id), '[]'::jsonb),
    'entries', (select count(*) from giveaway_entries where campaign_id = c.id and eligible),
    'mine', (select exists (select 1 from giveaway_entries
               where campaign_id = c.id and user_id = auth.uid())),
    -- Every eligible entry, in the order people entered.
    'names', coalesce((select jsonb_agg(x.display_name)
                from (select display_name from giveaway_entries
                       where campaign_id = c.id and eligible
                       order by created_at limit 20000) x), '[]'::jsonb),
    'result', case when d.campaign_id is null then null
                   else jsonb_build_object('winners', d.winners, 'drawn_at', d.drawn_at,
                                           'entry_count', d.entry_count) end
  );
end $$;

grant execute on function public.giveaway_public(text) to anon, authenticated;


-- ============================================================
-- SECTION 14 of 23 — 20261106_public_offers_anon_fix.sql
-- ============================================================

-- Logged-out visitors could not load the marketplace: public_offers ran
-- with security_invoker = on, and its whole-row reference (o.*) into
-- offer_is_live()/offer_deal() demanded SELECT on columns anon is denied
-- (economics, floor_override, created_by). Run it as its owner instead;
-- the view still filters to live offers on published products and still
-- strips giftCost and bumpCost from config.

alter view public.public_offers set (security_invoker = off);


-- ============================================================
-- SECTION 15 of 23 — 20261106_coupons_complete_REVIEW.sql
-- ============================================================

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


-- ============================================================
-- SECTION 16 of 23 — 20261106_front_page_and_delete_REVIEW.sql
-- ============================================================

-- ZaMarket — choose what lands on the front page, and remove mistakes.
-- REVIEW BEFORE DEPLOYMENT.
--
-- Two problems, both reported from real use:
--
-- 1. The front page was entirely automatic. It took the published catalogue,
--    rotated it between sellers and grouped it into departments. That is fair
--    but it is not a shop window: adding one seller's whole range made the
--    whole page theirs, because there was no way to say "these are the things
--    worth seeing first". There is now an ordered pick that the founder
--    controls, and everything else follows underneath as before.
--
-- 2. A product could be edited but never removed. Status could be set to
--    'suspended', which hides it, but the row stayed forever and there was no
--    delete anywhere in the app. A product added by mistake was stuck.
--
-- No change to pricing, delivery fees, commission rates or payouts.

-- ---------------------------------------------------------------
-- 1. The front-page pick
-- ---------------------------------------------------------------
-- NULL means "not picked". A number is its place in the queue, lowest first.

alter table public.products add column if not exists front_rank int;

create index if not exists products_front_rank_idx
  on public.products (front_rank) where front_rank is not null;

-- The public view runs with the privileges of whoever queries it, and anon
-- holds COLUMN-level grants on products, not a whole-table one. A new column
-- in the view's select list that anon has not been granted makes the whole
-- view fail with "permission denied for table products" -- which is the
-- marketplace down for everyone not signed in. The place in the queue is not
-- sensitive; it decides display order and nothing else.
grant select (front_rank) on public.products to anon, authenticated;

-- The pick is published through a view of its own rather than by rewriting
-- public_products.
--
-- Appending a column to that view meant reading its definition back as text
-- and splicing into it, which depends on the exact formatting Postgres
-- happens to print -- formatting that differs between databases and between
-- server versions. It also loses the view's own settings: create-or-replace
-- does not carry reloptions across, so recreating a security_invoker view
-- silently turns it into a security definer one.
--
-- A small view beside it has neither problem. It touches nothing that
-- already works, needs no knowledge of how public_products is written, and
-- exposes one number that decides display order and nothing else.

create or replace view public.front_page_picks as
  select p.id, p.front_rank
    from public.products p
    left join public.vendors v on v.id = p.vendor_id
   where p.front_rank is not null
     and p.status in ('published', 'out_of_stock')
     and (p.vendor_id is null or v.status = 'approved');

alter view public.front_page_picks set (security_invoker = off);
grant select on public.front_page_picks to anon, authenticated;

-- If an earlier version of this file already spliced front_rank into
-- public_products, that view is now a security definer one by accident.
-- Put it back, and make sure anon may read the column it now selects.
do $$
begin
  if exists (
    select 1 from pg_attribute
     where attrelid = 'public.public_products'::regclass
       and attname = 'front_rank' and attnum > 0 and not attisdropped
  ) then
    execute 'grant select (front_rank) on public.products to anon, authenticated';
    execute 'alter view public.public_products set (security_invoker = on)';
  end if;
end $$;

-- ---------------------------------------------------------------
-- 2. Setting the pick
-- ---------------------------------------------------------------
-- One call replaces the whole front page, in the order given. Passing an
-- empty list clears it and the page goes back to arranging itself.

create or replace function public.set_front_page(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; bad int;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;

  -- Only something a shopper can actually open belongs on the front page.
  select count(*) into bad
    from unnest(coalesce(p_ids, '{}'::uuid[])) as want(id)
   where not exists (
     select 1 from products p
      left join vendors v on v.id = p.vendor_id
      where p.id = want.id
        and p.status in ('published', 'out_of_stock')
        and (p.vendor_id is null or v.status = 'approved'));
  if bad > 0 then
    raise exception 'Only published products from approved sellers can go on the front page';
  end if;

  update products set front_rank = null where front_rank is not null;

  if p_ids is not null and array_length(p_ids, 1) is not null then
    update products p set front_rank = x.ord
      from (select id, ordinality::int as ord
              from unnest(p_ids) with ordinality as t(id, ordinality)) x
     where p.id = x.id;
    n := array_length(p_ids, 1);
  end if;

  perform log_audit('front_page.set', 'products', null, null, jsonb_build_object('count', n));
  return jsonb_build_object('ok', true, 'picked', n);
end $$;

grant execute on function public.set_front_page(uuid[]) to authenticated;

-- ---------------------------------------------------------------
-- 3. Removing a product
-- ---------------------------------------------------------------
-- A product that has never been part of an order, a stock movement or a
-- purchase carries no history, so it is removed outright. One that does is
-- archived instead: deleting it would tear a hole in orders, settlements and
-- stock records that have already been counted. The function says which of
-- the two it did, so the screen can tell the truth rather than claim a
-- delete that did not happen.

create or replace function public.delete_product(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p products%rowtype;
  v uuid := my_vendor_id();
  held text[] := '{}';
begin
  select * into p from products where id = p_id;
  if not found then raise exception 'Product not found'; end if;
  if not (is_staff() or (v is not null and p.vendor_id = v)) then raise exception 'Not allowed'; end if;

  if exists (select 1 from order_items where product_id = p_id) then held := held || 'orders'::text; end if;
  if exists (select 1 from inventory_movements where product_id = p_id) then held := held || 'stock movements'::text; end if;
  if exists (select 1 from purchase_items where product_id = p_id) then held := held || 'purchases'::text; end if;
  if exists (select 1 from reviews where product_id = p_id) then held := held || 'reviews'::text; end if;
  if exists (select 1 from giveaway_prizes where product_id = p_id) then held := held || 'giveaway prizes'::text; end if;

  if array_length(held, 1) is not null then
    update products
       set status = 'suspended', front_rank = null, featured_in_store = false
     where id = p_id;
    perform log_audit('product.archived', 'products', p_id, to_jsonb(p), null);
    return jsonb_build_object(
      'ok', true, 'removed', false, 'archived', true, 'because', held,
      'message', 'This product is part of records that have already been counted, so it has been taken off the site and kept in the books rather than deleted.');
  end if;

  -- Nothing depends on it. Clear the rows that are purely descriptive and
  -- would otherwise block the delete, then remove it.
  delete from offers where product_id = p_id;
  delete from lead_magnets where product_id = p_id;
  delete from deals where product_id = p_id;
  delete from stock_requests where product_id = p_id;
  update content_posts set product_id = null where product_id = p_id;
  update funnels set product_id = null where product_id = p_id;
  update ad_requests set product_id = null where product_id = p_id;

  delete from products where id = p_id;
  perform log_audit('product.deleted', 'products', p_id, to_jsonb(p), null);
  return jsonb_build_object('ok', true, 'removed', true, 'archived', false,
                            'message', 'Product deleted.');
end $$;

grant execute on function public.delete_product(uuid) to authenticated;


-- ============================================================
-- SECTION 17 of 23 — 20261109_vehicle_success_fee_REVIEW.sql
-- ============================================================

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



-- ============================================================
-- SECTION 18 of 23 — 20261109_affiliate_monthly_earnings_goals_REVIEW.sql
-- ============================================================

-- ZaMarket Affiliate Hub: personal monthly commission goals and private metrics.
-- Review in Supabase SQL editor and apply ONCE after the current migrations.
-- It does not modify vendor pricing, commissions, payout amounts or existing goals.

create table if not exists public.affiliate_monthly_goals (
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  month date not null,
  target_amount numeric(14,2) not null check (target_amount >= 1 and target_amount <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reseller_id, month),
  constraint affiliate_goals_month_first_day check (extract(day from month) = 1)
);

alter table public.affiliate_monthly_goals enable row level security;
revoke all on public.affiliate_monthly_goals from anon;
grant select, insert, update on public.affiliate_monthly_goals to authenticated;

drop policy if exists affiliate_goals_read on public.affiliate_monthly_goals;
create policy affiliate_goals_read on public.affiliate_monthly_goals
for select to authenticated using (reseller_id = public.my_reseller_id() or public.is_staff());

drop policy if exists affiliate_goals_insert on public.affiliate_monthly_goals;
create policy affiliate_goals_insert on public.affiliate_monthly_goals
for insert to authenticated with check (reseller_id = public.my_reseller_id());

drop policy if exists affiliate_goals_update on public.affiliate_monthly_goals;
create policy affiliate_goals_update on public.affiliate_monthly_goals
for update to authenticated
using (reseller_id = public.my_reseller_id())
with check (reseller_id = public.my_reseller_id());

-- Work in Zambia's local calendar month. The 90-day verified average is
-- only an estimate, and pending/reversed commissions never count as earned.
create or replace function public.affiliate_goal_metrics(p_reseller uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with permitted as (
    select coalesce(p_reseller = public.my_reseller_id() or public.is_staff(), false) as allowed
  ), bounds as (
    select date_trunc('month', now() at time zone 'Africa/Lusaka') at time zone 'Africa/Lusaka' as starts,
           (date_trunc('month', now() at time zone 'Africa/Lusaka') + interval '1 month') at time zone 'Africa/Lusaka' as ends
  )
  select case when (select allowed from permitted) then jsonb_build_object(
    'earned_month', coalesce((select sum(c.amount) from public.commissions c cross join bounds b
      where c.reseller_id = p_reseller and c.created_at >= b.starts and c.created_at < b.ends
        and c.status in ('approved','paid')), 0),
    'pending_month', coalesce((select sum(c.amount) from public.commissions c cross join bounds b
      where c.reseller_id = p_reseller and c.created_at >= b.starts and c.created_at < b.ends
        and c.status in ('pending','verified')), 0),
    'average_commission', coalesce((select avg(c.amount) from public.commissions c
      where c.reseller_id = p_reseller and c.created_at >= now() - interval '90 days'
        and c.status in ('approved','paid') and c.amount > 0), 0)
  ) else null end;
$$;
revoke all on function public.affiliate_goal_metrics(uuid) from public, anon;
grant execute on function public.affiliate_goal_metrics(uuid) to authenticated;


-- ============================================================
-- SECTION 19 of 23 — 20261109_affiliate_vehicle_rewards_REVIEW.sql
-- ============================================================

-- ZaMarket Motors: approved affiliates may see their estimated reward in Kwacha
-- without exposing the private seller success-fee agreement to customers.
-- Run AFTER 20261109_vehicle_success_fee_REVIEW.sql.
-- Safe to review/reapply: creates/replaces one narrowly scoped read-only RPC.

create or replace function public.affiliate_vehicle_reward_estimates()
returns table(product_id uuid, estimated_reward numeric)
language sql stable security definer
set search_path=public
as $$
  select p.id,
    round(p.price * p.deal_fee_pct / 100
      * coalesce(p.vehicle_affiliate_share_pct, 50) / 100, 2)
  from public.products p
  where p.offering_type = 'vehicle'
    and p.status = 'published'
    and p.deal_fee_pct is not null and p.deal_fee_pct > 0
    and exists (
      select 1 from public.resellers r
      where r.user_id = auth.uid() and r.status = 'approved'
    );
$$;
revoke all on function public.affiliate_vehicle_reward_estimates() from public, anon;
grant execute on function public.affiliate_vehicle_reward_estimates() to authenticated;

comment on function public.affiliate_vehicle_reward_estimates() is
  'Only approved affiliates receive estimated referral rewards for published vehicles. Estimates use advertised price and can change with final close. No seller terms are exposed.';

-- ============================================================
-- SECTION 20 of 23 — 20261111_winners_recovery_proposals_REVIEW.sql
-- ============================================================

-- Winner contact details, account recovery, seller-proposed giveaways and
-- the AI helper allowance.
--
-- Safe to run more than once. Changes no existing function: everything here
-- is a new column, a new table, a new function, or a tighter policy.

-- A phone number as its last nine digits, so 0977 123 456, +260 977 123 456
-- and 260977123456 are recognised as the same line.
create or replace function public.phone_key(p text) returns text
language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '');
$$;

-- =====================================================================
-- 1. Reaching a giveaway winner
-- =====================================================================
-- People sign in with Google, which gives an email address and no phone
-- number. Without one there is no way to ring a winner.

alter table public.giveaway_entries add column if not exists contact_phone text
  check (contact_phone is null or length(contact_phone) between 9 and 20);

-- The entrant gives, or corrects, the number to ring them on. It is stored on
-- their own entry and is never shown on the wheel or to another entrant.
create or replace function public.set_giveaway_contact(p_slug text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); digits text; cid uuid;
begin
  if me is null then raise exception 'Sign in first'; end if;
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) < 9 or length(digits) > 15 then
    raise exception 'Enter a phone number we can reach you on, like 0977 123 456';
  end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then raise exception 'No such giveaway'; end if;
  update giveaway_entries set contact_phone = digits where campaign_id = cid and user_id = me;
  if not found then raise exception 'Enter the giveaway first'; end if;
  -- Kept on the profile too when it has none, so the next entry is one tap.
  update profiles set phone = digits where id = me and coalesce(trim(phone), '') = '';
  return jsonb_build_object('saved', true);
end $$;
revoke all on function public.set_giveaway_contact(text, text) from public, anon;
grant execute on function public.set_giveaway_contact(text, text) to authenticated;

-- What a signed-in entrant may know about their own entry: whether we can
-- reach them, and, after the draw, whether they won. Told only to them.
create or replace function public.my_giveaway_entry(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); e giveaway_entries%rowtype; cid uuid; w jsonb; st text; prof_phone text;
begin
  if me is null then return null; end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then return null; end if;
  select * into e from giveaway_entries where campaign_id = cid and user_id = me;
  if not found then return jsonb_build_object('entered', false); end if;
  select phone into prof_phone from profiles where id = me;
  select x into w
    from giveaway_draws d, jsonb_array_elements(d.winners) x
   where d.campaign_id = cid and (x->>'entry_id')::uuid = e.id
   limit 1;
  if w is not null then
    select status into st from giveaway_claims where campaign_id = cid and entry_id = e.id;
  end if;
  return jsonb_build_object(
    'entered', true,
    'phone', coalesce(e.contact_phone, nullif(trim(prof_phone), '')),
    'won', w is not null,
    'prize', w->>'prize',
    'claim_status', st);
end $$;
revoke all on function public.my_giveaway_entry(text) from public, anon;
grant execute on function public.my_giveaway_entry(text) to authenticated;

-- The list staff work from after a draw: who won, what, and how to reach
-- them. Staff and marketing only. A seller running a giveaway does not get
-- entrants' phone numbers; ZaMarket contacts the winner.
create or replace function public.giveaway_winner_contacts(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cid uuid; out jsonb;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'entry_id', e.id,
           'name', coalesce(nullif(trim(pr.full_name), ''), e.display_name),
           'prize', w->>'prize',
           'prize_rank', (w->>'prize_rank')::int,
           'phone', coalesce(e.contact_phone, nullif(trim(pr.phone), '')),
           'email', pr.email,
           'status', coalesce(cl.status, 'notified'),
           'note', coalesce(cl.note, ''),
           'updated_at', cl.updated_at
         ) order by (w->>'prize_rank')::int nulls last, e.created_at), '[]'::jsonb)
    into out
    from giveaway_draws d
    cross join lateral jsonb_array_elements(d.winners) w
    join giveaway_entries e on e.id = (w->>'entry_id')::uuid
    left join profiles pr on pr.id = e.user_id
    left join giveaway_claims cl on cl.campaign_id = d.campaign_id and cl.entry_id = e.id
   where d.campaign_id = cid;
  return out;
end $$;
revoke all on function public.giveaway_winner_contacts(text) from public, anon;
grant execute on function public.giveaway_winner_contacts(text) to authenticated;

-- Recording where things stand with a winner. It cannot change who won.
create or replace function public.set_giveaway_claim(p_slug text, p_entry uuid, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not (is_staff() or can_market()) then raise exception 'Not permitted'; end if;
  if p_status not in ('notified','contacted','confirmed','delivered','forfeited') then
    raise exception 'Unknown status';
  end if;
  select id into cid from giveaway_campaigns where slug = p_slug;
  if cid is null then raise exception 'No such giveaway'; end if;
  if not exists (
    select 1 from giveaway_draws d, jsonb_array_elements(d.winners) w
     where d.campaign_id = cid and (w->>'entry_id')::uuid = p_entry
  ) then raise exception 'That entry did not win this giveaway'; end if;
  insert into giveaway_claims (campaign_id, entry_id, status, note, updated_at)
  values (cid, p_entry, p_status, left(coalesce(p_note, ''), 1000), now())
  on conflict (campaign_id, entry_id) do update
    set status = excluded.status, note = excluded.note, updated_at = now();
  perform log_audit('giveaway.claim', 'giveaway_claims', p_entry, null,
    jsonb_build_object('campaign', p_slug, 'status', p_status));
end $$;
revoke all on function public.set_giveaway_claim(text, uuid, text, text) from public, anon;
grant execute on function public.set_giveaway_claim(text, uuid, text, text) to authenticated;

-- =====================================================================
-- 2. A seller proposes a giveaway; ZaMarket decides whether it runs
-- =====================================================================
-- The original policy let a seller write any campaign carrying their own
-- vendor id, including one already marked live. Nothing on screen used that,
-- but the database allowed it. Sellers now go through propose_giveaway, which
-- can only ever make a draft.

drop policy if exists giveaway_staff_all on public.giveaway_campaigns;
create policy giveaway_staff_all on public.giveaway_campaigns for all to authenticated
  using (is_staff() or can_market())
  with check (is_staff() or can_market());

drop policy if exists giveaway_vendor_read on public.giveaway_campaigns;
create policy giveaway_vendor_read on public.giveaway_campaigns for select to authenticated
  using (vendor_id is not null and vendor_id = my_vendor_id());

alter table public.giveaway_campaigns add column if not exists proposal_note text not null default ''
  check (length(proposal_note) <= 600);

create or replace function public.propose_giveaway(p_title text, p_product uuid, p_days int default 10, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := my_vendor_id(); p products%rowtype; base text; s text; n int := 0; new_id uuid; days int;
begin
  if v is null then raise exception 'Only an approved seller can propose a giveaway'; end if;
  if not exists (select 1 from vendors where id = v and status = 'approved') then
    raise exception 'Your shop must be approved first';
  end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Give the giveaway a title'; end if;
  select * into p from products where id = p_product and vendor_id = v;
  if not found then raise exception 'Choose one of your own products as the prize'; end if;
  if p.status <> 'published' then raise exception 'The prize must be a product that is live in your shop'; end if;
  -- Three waiting at once is plenty, and stops the list being flooded.
  if (select count(*) from giveaway_campaigns where vendor_id = v and status = 'draft') >= 3 then
    raise exception 'You already have three proposals waiting. We will answer those first.';
  end if;
  days := least(greatest(coalesce(p_days, 10), 3), 30);

  base := trim(both '-' from regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g'));
  base := left(coalesce(nullif(base, ''), 'giveaway'), 48);
  if length(base) < 3 then base := base || '-giveaway'; end if;
  s := base;
  while exists (select 1 from giveaway_campaigns where slug = s) loop
    n := n + 1; s := left(base, 48) || '-' || n;
  end loop;

  insert into giveaway_campaigns (slug, title, product_id, prize_text, prize_value, winners,
                                  vendor_id, closes_at, status, prize_paid_by, proposal_note, created_by)
  values (s, left(trim(p_title), 140), p.id, left(p.name, 200), p.price, 1,
          v, now() + make_interval(days => days), 'draft', 'vendor',
          left(coalesce(p_note, ''), 600), auth.uid())
  returning id into new_id;
  perform log_audit('giveaway.proposed', 'giveaway_campaigns', new_id, null,
    jsonb_build_object('vendor', v, 'product', p.id, 'days', days));
  return jsonb_build_object('id', new_id, 'slug', s, 'status', 'draft');
end $$;
revoke all on function public.propose_giveaway(text, uuid, int, text) from public, anon;
grant execute on function public.propose_giveaway(text, uuid, int, text) to authenticated;

-- A seller may take back a proposal that has not been opened yet.
create or replace function public.withdraw_giveaway_proposal(p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update giveaway_campaigns set status = 'cancelled'
   where slug = p_slug and vendor_id = my_vendor_id() and status = 'draft';
  if not found then raise exception 'Only a proposal that is still waiting can be withdrawn'; end if;
end $$;
revoke all on function public.withdraw_giveaway_proposal(text) from public, anon;
grant execute on function public.withdraw_giveaway_proposal(text) to authenticated;

-- =====================================================================
-- 3. Getting a seller or affiliate back into an account they are locked out of
-- =====================================================================
-- Somebody who has lost both their password and their Google account cannot
-- sign in, and their earnings sit behind that login. They sign in with a new
-- Google account and ask. A founder rings the phone number ALREADY ON RECORD
-- for the shop or affiliate, and only then moves the account across.
--
-- What stops this being a way to steal earnings:
--   · the request never says whether the phone number matched anything;
--   · only a founder can approve, and must record that they rang the number
--     on record and what was said;
--   · the number on the request must be the number on the account;
--   · payouts from that account are paused for a waiting period afterwards,
--     so the real owner has time to object before any money moves;
--   · every decision is written to the audit log.

alter table public.vendors add column if not exists payout_hold_until timestamptz;
alter table public.resellers add column if not exists payout_hold_until timestamptz;

create table if not exists public.account_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('vendor','reseller')),
  claimed_phone text not null check (length(claimed_phone) between 9 and 20),
  claimed_name text not null default '' check (length(claimed_name) <= 140),
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  matched_id uuid,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);
create unique index if not exists account_recovery_one_pending
  on public.account_recovery_requests(requester) where status = 'pending';
alter table public.account_recovery_requests enable row level security;
revoke all on public.account_recovery_requests from anon, authenticated;
grant select on public.account_recovery_requests to authenticated;

drop policy if exists recovery_own_read on public.account_recovery_requests;
create policy recovery_own_read on public.account_recovery_requests for select to authenticated
  using (requester = auth.uid() or is_founder());

create or replace function public.request_account_recovery(p_kind text, p_phone text, p_name text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); digits text;
begin
  if me is null then raise exception 'Sign in with the Google account you want to use from now on'; end if;
  if p_kind not in ('vendor','reseller') then raise exception 'Say whether it is a shop or an affiliate account'; end if;
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(digits) < 9 or length(digits) > 15 then
    raise exception 'Enter the phone number that is on the account';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the name on the account'; end if;
  if exists (select 1 from vendors where user_id = me) or exists (select 1 from resellers where user_id = me) then
    raise exception 'This login already has a shop or affiliate account';
  end if;
  if (select role::text from profiles where id = me) is distinct from 'customer' then
    raise exception 'Use a new, ordinary login for this request';
  end if;
  if exists (select 1 from account_recovery_requests where requester = me and status = 'pending') then
    raise exception 'You already have a request waiting. We will ring the number on the account.';
  end if;
  -- Three in thirty days is the most one login may ask.
  if (select count(*) from account_recovery_requests
       where requester = me and created_at > now() - interval '30 days') >= 3 then
    raise exception 'Too many requests. Please contact ZaMarket directly.';
  end if;
  insert into account_recovery_requests (requester, kind, claimed_phone, claimed_name, note)
  values (me, p_kind, digits, left(trim(p_name), 140), left(coalesce(p_note, ''), 1000));
  -- The same answer whether or not the number belongs to an account.
  return jsonb_build_object('received', true);
end $$;
revoke all on function public.request_account_recovery(text, text, text, text) from public, anon;
grant execute on function public.request_account_recovery(text, text, text, text) to authenticated;

-- What a founder sees: each waiting request beside the accounts whose phone
-- number on record matches it.
create or replace function public.account_recovery_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not is_founder() then raise exception 'Founders only'; end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb) into out from (
    select r.id, r.kind, r.claimed_phone, r.claimed_name, r.note, r.status, r.created_at,
           r.decided_at, r.decision_note,
           rp.email as requester_email, rp.full_name as requester_name,
           case when r.kind = 'vendor' then (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', v.id, 'name', v.business_name, 'owner', v.owner_name,
                      'phone', v.phone, 'email', v.email, 'status', v.status,
                      'since', v.created_at)), '[]'::jsonb)
               from vendors v where phone_key(v.phone) = phone_key(r.claimed_phone))
           else (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', a.id, 'name', a.full_name, 'owner', a.full_name,
                      'phone', a.phone, 'email', a.email, 'status', a.status,
                      'since', a.created_at)), '[]'::jsonb)
               from resellers a where phone_key(a.phone) = phone_key(r.claimed_phone))
           end as matches
      from account_recovery_requests r
      left join profiles rp on rp.id = r.requester
     where r.status = 'pending' or r.created_at > now() - interval '60 days'
  ) t;
  return out;
end $$;
revoke all on function public.account_recovery_queue() from public, anon;
grant execute on function public.account_recovery_queue() to authenticated;

create or replace function public.decide_account_recovery(
  p_request uuid, p_approve boolean, p_target uuid default null,
  p_called boolean default false, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r account_recovery_requests%rowtype; old_uid uuid; on_record text; mail text;
        hold_days int; hold_until timestamptz;
begin
  if not is_founder() then raise exception 'Founders only'; end if;
  select * into r from account_recovery_requests where id = p_request for update;
  if not found then raise exception 'No such request'; end if;
  if r.status <> 'pending' then raise exception 'That request has already been decided'; end if;

  if not p_approve then
    update account_recovery_requests
       set status = 'declined', decided_by = auth.uid(), decided_at = now(),
           decision_note = left(coalesce(p_note, ''), 1000)
     where id = r.id;
    perform log_audit('account.recovery_declined', 'account_recovery_requests', r.id, null,
      jsonb_build_object('kind', r.kind), left(coalesce(p_note, ''), 500));
    return jsonb_build_object('status', 'declined');
  end if;

  if not coalesce(p_called, false) then
    raise exception 'Ring the phone number on record first, and confirm that you did';
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Write down who you spoke to and what they said';
  end if;
  if p_target is null then raise exception 'Choose the account to recover'; end if;
  if exists (select 1 from vendors where user_id = r.requester)
     or exists (select 1 from resellers where user_id = r.requester) then
    raise exception 'The new login already has a shop or affiliate account';
  end if;
  if (select role::text from profiles where id = r.requester) is distinct from 'customer' then
    raise exception 'The new login is not an ordinary customer login';
  end if;

  if r.kind = 'vendor' then
    select user_id, phone into old_uid, on_record from vendors where id = p_target for update;
  else
    select user_id, phone into old_uid, on_record from resellers where id = p_target for update;
  end if;
  if not found then raise exception 'No such account'; end if;
  if phone_key(on_record) is distinct from phone_key(r.claimed_phone) then
    raise exception 'The number on the request is not the number on that account';
  end if;
  if old_uid = r.requester then raise exception 'That login already owns this account'; end if;

  hold_days := greatest(coalesce((select (value #>> '{}')::int from settings where key = 'recovery_hold_days'), 7), 1);
  hold_until := now() + make_interval(days => hold_days);
  select email into mail from profiles where id = r.requester;

  if r.kind = 'vendor' then
    update vendors set user_id = r.requester, email = coalesce(mail, email), payout_hold_until = hold_until
     where id = p_target;
    update profiles set role = 'vendor' where id = r.requester and role = 'customer';
  else
    update resellers set user_id = r.requester, email = coalesce(mail, email), payout_hold_until = hold_until
     where id = p_target;
    update profiles set role = 'reseller' where id = r.requester and role = 'customer';
  end if;

  -- The old login keeps existing as an ordinary customer and no longer opens
  -- the shop. Staff roles are never touched from here.
  if old_uid is not null
     and not exists (select 1 from vendors where user_id = old_uid)
     and not exists (select 1 from resellers where user_id = old_uid) then
    update profiles set role = 'customer' where id = old_uid and role in ('vendor', 'reseller');
  end if;

  update account_recovery_requests
     set status = 'approved', matched_id = p_target, decided_by = auth.uid(), decided_at = now(),
         decision_note = left(trim(p_note), 1000)
   where id = r.id;
  perform log_audit('account.recovered', case when r.kind = 'vendor' then 'vendors' else 'resellers' end,
    p_target, jsonb_build_object('user_id', old_uid),
    jsonb_build_object('user_id', r.requester, 'payout_hold_until', hold_until),
    left(trim(p_note), 500));
  return jsonb_build_object('status', 'approved', 'payout_hold_until', hold_until);
end $$;
revoke all on function public.decide_account_recovery(uuid, boolean, uuid, boolean, text) from public, anon;
grant execute on function public.decide_account_recovery(uuid, boolean, uuid, boolean, text) to authenticated;

insert into public.settings (key, value, description)
values ('recovery_hold_days', '7', 'Days payouts stay paused on an account after it is moved to a new login')
on conflict (key) do nothing;

-- The pause itself. A trigger rather than a change to request_payout, so
-- whichever version of that function is live, the pause holds.
create or replace function public.payout_hold_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if new.vendor_id is not null then
    select payout_hold_until into until from vendors where id = new.vendor_id;
  elsif new.reseller_id is not null then
    select payout_hold_until into until from resellers where id = new.reseller_id;
  end if;
  if until is not null and until > now() then
    raise exception 'Payouts on this account are paused until % because its login was changed. Your earnings are safe and nothing is lost.',
      to_char(until at time zone 'Africa/Lusaka', 'DD Mon YYYY');
  end if;
  return new;
end $$;
drop trigger if exists trg_payout_hold on public.payouts;
create trigger trg_payout_hold before insert on public.payouts
  for each row execute function public.payout_hold_guard();

-- =====================================================================
-- 4. Allowance for the small AI helpers (plain product names, lead messages)
-- =====================================================================
-- Each use costs a little money, so each signed-in person gets a fixed number
-- an hour and a day. Sellers may use the listing helper; only staff and
-- marketing may use the lead helper.

create table if not exists public.ai_assist_uses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task text not null check (task in ('listing','lead')),
  created_at timestamptz not null default now()
);
create index if not exists ai_assist_uses_user_idx on public.ai_assist_uses(user_id, created_at desc);
alter table public.ai_assist_uses enable row level security;
revoke all on public.ai_assist_uses from anon, authenticated;

create or replace function public.claim_ai_assist(p_task text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); staff boolean; per_hour int := 12; per_day int := 30;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  staff := is_staff() or can_market();
  if p_task = 'lead' then
    if not staff then raise exception 'Marketing permission required' using errcode = '42501'; end if;
  elsif p_task = 'listing' then
    if not (staff or exists (select 1 from vendors where user_id = uid and status = 'approved')) then
      raise exception 'Only sellers and staff can use this' using errcode = '42501';
    end if;
  else
    raise exception 'Unknown task';
  end if;
  perform pg_advisory_xact_lock(hashtext('assist:' || uid::text));
  if staff then per_hour := 40; per_day := 150; end if;
  if (select count(*) from ai_assist_uses where user_id = uid and created_at >= now() - interval '1 hour') >= per_hour
     or (select count(*) from ai_assist_uses where user_id = uid and created_at >= now() - interval '1 day') >= per_day then
    return false;
  end if;
  insert into ai_assist_uses (user_id, task) values (uid, p_task);
  return true;
end $$;
revoke all on function public.claim_ai_assist(text) from public, anon;
grant execute on function public.claim_ai_assist(text) to authenticated;

-- ============================================================
-- SECTION 21 of 23 — 20261111_delivery_fund_REVIEW.sql
-- ============================================================

-- The delivery fund.
--
-- Every vendor sale puts a small amount aside for delivery, on top of the
-- marketplace fee. Bigger sales put in more, up to a ceiling, so they pay for
-- the trips of the small ones. When no affiliate brought the sale, their unused
-- share goes into the fund as well. Trips are paid out of it, and delivery is
-- free to the customer.
--
-- What does NOT change:
--   · the seller receives exactly what they asked for;
--   · the marketplace fee and the affiliate's share are worked out as before;
--   · checkout, payouts and commissions are untouched.
--
-- The fund is an account kept in the books, not a separate bank account: the
-- money arrives with the order like any other, and this tracks how much of it
-- is set aside for delivery and how much has been spent.
--
-- Safe to run more than once.

-- Delivery becomes free the first time this runs, because that is what the
-- fund is for. Running it again leaves whatever you have set since.
do $$
begin
  if not exists (select 1 from public.settings where key = 'delivery_fund_pct') then
    update public.settings set value = 'true'::jsonb where key = 'delivery_included';
  end if;
end $$;

insert into public.settings (key, value, description) values
  ('delivery_fund_pct', '3', 'Share of what the seller asked that goes into the delivery fund on every vendor sale (%)'),
  ('delivery_fund_min', '8', 'Smallest delivery-fund amount per item (K)'),
  ('delivery_fund_max', '60', 'Largest delivery-fund amount per item (K). 0 means no ceiling.'),
  ('delivery_fund_takes_unclaimed', 'true', 'When no affiliate brought the sale, their share goes into the delivery fund')
on conflict (key) do nothing;

-- What one unit puts into the fund, given what the seller asked for it.
create or replace function public.delivery_fund_for(p_take numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_take, 0) <= 0 or coalesce(setting_num('delivery_fund_pct'), 0) <= 0 then 0
    else round(
      least(
        greatest(p_take * setting_num('delivery_fund_pct') / 100, coalesce(setting_num('delivery_fund_min'), 0)),
        case when coalesce(setting_num('delivery_fund_max'), 0) > 0
             then greatest(setting_num('delivery_fund_max'), coalesce(setting_num('delivery_fund_min'), 0))
             else 1e12 end
      ), 2)
  end;
$$;
grant execute on function public.delivery_fund_for(numeric) to anon, authenticated;

-- The shelf price: the seller's amount grossed up for the marketplace fee and
-- the affiliate's room exactly as before, plus the fund amount, rounded up.
-- The fund is added after the percentages, so no percentage is charged on it.
create or replace function public.shelf_price(p_take numeric, p_fee_pct numeric default null, p_allowance_pct numeric default null)
returns numeric language sql stable set search_path = public as $$
  select case
    when coalesce(p_take, 0) <= 0 then 0
    else (
      select greatest(ceil(((p_take / nullif(1 - kept, 0)) + delivery_fund_for(p_take)) / step) * step, p_take)
      from (select
              least(greatest((coalesce(p_fee_pct, setting_num('marketplace_fee_pct'))
                            + coalesce(p_allowance_pct, setting_num('commission_allowance_pct'))) / 100.0, 0), 0.9) as kept,
              greatest(coalesce(setting_num('price_rounding'), 1), 0.01) as step) s
    )
  end;
$$;
grant execute on function public.shelf_price(numeric, numeric, numeric) to anon, authenticated;

-- Reprice every vendor product by the new rule. The trigger that keeps shelf
-- prices in step does the work; setting the seller's amount to itself wakes it.
update public.products set vendor_price = vendor_price
 where owner_type = 'vendor' and vendor_id is not null and vendor_price > 0;

-- What a seller sees as they type their price.
create or replace function public.price_preview(p_take numeric, p_vendor uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with v as (select coalesce(p_vendor, my_vendor_id()) as id),
       t as (select vendor_terms((select id from v)) as j),
       s as (select
          shelf_price(p_take, ((select j from t)->>'fee_pct')::numeric, ((select j from t)->>'allowance_pct')::numeric) as shelf,
          ((select j from t)->>'fee_pct')::numeric as fee_pct,
          ((select j from t)->>'allowance_pct')::numeric as allow_pct,
          ((select j from t)->>'delivery_fee')::numeric as delivery,
          delivery_fund_for(p_take) as fund)
  select jsonb_build_object(
    'take_requested', round(coalesce(p_take, 0), 2),
    'shelf', round(s.shelf, 2),
    'fee_pct', s.fee_pct,
    'allowance_pct', s.allow_pct,
    'vendor_receives', round(coalesce(p_take, 0), 2),
    'margin_total', round(s.shelf - coalesce(p_take, 0), 2),
    'delivery_fund', round(s.fund, 2),
    'marketplace_share', round(s.shelf - coalesce(p_take, 0) - s.fund, 2),
    'free_delivery', setting_text('delivery_included') = 'true',
    'affiliate_if_referred', round(s.shelf * s.allow_pct / 100, 2),
    'marketplace_if_referred', round(s.shelf - coalesce(p_take, 0) - s.fund - s.shelf * s.allow_pct / 100, 2),
    'marketplace_if_not', round(s.shelf - coalesce(p_take, 0) - s.fund
                                - case when setting_text('delivery_fund_takes_unclaimed') = 'true'
                                       then s.shelf * s.allow_pct / 100 else 0 end, 2),
    'delivery_fee', s.delivery,
    'below_minimum', (s.shelf - coalesce(p_take, 0) - s.fund - s.shelf * s.allow_pct / 100) < setting_num('min_margin_kwacha'))
  from s;
$$;
grant execute on function public.price_preview(numeric, uuid) to authenticated;

-- What each order line put into the fund, frozen when the order is placed so
-- a later change of percentage does not rewrite history.
alter table public.order_items add column if not exists delivery_fund numeric not null default 0;

create or replace function public.order_item_delivery_fund() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_id is not null and coalesce(new.vendor_take, 0) > 0 then
    -- Never more than the line actually carries above the seller's amount,
    -- so a product priced before the fund existed cannot overstate it.
    new.delivery_fund := round(
      least(delivery_fund_for(new.vendor_take), greatest(coalesce(new.unit_price, 0) - new.vendor_take, 0))
      * coalesce(new.quantity, 1), 2);
  end if;
  return new;
end $$;
drop trigger if exists trg_order_item_delivery_fund on public.order_items;
-- Named to run after any other before-insert trigger that fills vendor_take.
create trigger trg_order_item_delivery_fund before insert on public.order_items
  for each row execute function public.order_item_delivery_fund();

-- Money put into or taken out of the fund by hand: topping it up, or moving
-- a surplus out. Each needs a reason, and only a founder can do it.
create table if not exists public.delivery_fund_adjustments (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount <> 0),
  note text not null check (length(note) between 3 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.delivery_fund_adjustments enable row level security;
revoke all on public.delivery_fund_adjustments from anon, authenticated;

create or replace function public.delivery_fund_adjust(p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_founder() then raise exception 'Founders only'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Enter an amount'; end if;
  if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Say why'; end if;
  insert into delivery_fund_adjustments (amount, note, created_by)
  values (round(p_amount, 2), left(trim(p_note), 500), auth.uid()) returning id into new_id;
  perform log_audit('delivery_fund.adjust', 'delivery_fund_adjustments', new_id, null,
    jsonb_build_object('amount', round(p_amount, 2)), left(trim(p_note), 500));
end $$;
revoke all on function public.delivery_fund_adjust(numeric, text) from public, anon;
grant execute on function public.delivery_fund_adjust(numeric, text) to authenticated;

-- The fund's account for a period, and its balance since the start.
--
-- In:  the fund amount on every line of a completed order, plus, when no
--      affiliate earned on the order, the affiliate room in its prices.
-- Out: what was recorded as paid for each delivery (rider plus fuel). A
--      delivered order with nothing recorded is counted at the "what a
--      delivery really costs you" setting and shown separately, so the
--      balance is never flattered by a missing figure.
create or replace function public.delivery_fund_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d_from date := coalesce(p_from, date_trunc('month', lusaka_date(now()))::date);
  d_to date := coalesce(p_to, lusaka_date(now()));
  take_unclaimed boolean := setting_text('delivery_fund_takes_unclaimed') = 'true';
  assumed numeric := coalesce(setting_num('assumed_delivery_cost'), 0);
  period jsonb; ever jsonb;
begin
  if not is_staff() then raise exception 'Staff only'; end if;

  with done as (
    select o.id, o.collection, lusaka_date(o.completed_at) as day
      from orders o
     where o.status = 'completed' and o.completed_at is not null
  ),
  spent as (
    -- A trip that was paid for counts even if the order later fell through.
    select o.id, lusaka_date(coalesce(d.delivered_at, o.completed_at, o.created_at)) as day,
           (d.delivery_cost + d.fuel_cost) as cost
      from deliveries d join orders o on o.id = d.order_id
     where d.delivery_cost + d.fuel_cost > 0
  ),
  unpriced as (
    select dn.id, dn.day from done dn
     where not dn.collection
       and not exists (select 1 from spent s where s.id = dn.id)
  ),
  ins as (
    select dn.day,
           coalesce(sum(oi.delivery_fund), 0) as from_sales,
           coalesce(sum(case
             when take_unclaimed and coalesce(oi.vendor_take, 0) > 0
                  and not exists (select 1 from commissions c where c.order_id = dn.id and c.status not in ('rejected', 'reversed'))
             then round(oi.unit_price * oi.quantity * coalesce((vendor_terms(oi.vendor_id)->>'allowance_pct')::numeric, 0) / 100, 2)
             else 0 end), 0) as from_unclaimed
      from done dn join order_items oi on oi.order_id = dn.id
     group by dn.day
  ),
  agg as (
    select
      (select coalesce(sum(from_sales), 0) from ins where day between d_from and d_to) as p_sales,
      (select coalesce(sum(from_unclaimed), 0) from ins where day between d_from and d_to) as p_unclaimed,
      (select coalesce(sum(cost), 0) from spent where day between d_from and d_to) as p_trips,
      (select count(*) from spent where day between d_from and d_to) as p_trip_count,
      (select count(*) from unpriced where day between d_from and d_to) as p_unpriced,
      (select coalesce(sum(amount), 0) from delivery_fund_adjustments where lusaka_date(created_at) between d_from and d_to) as p_adjust,
      (select count(*) from done where day between d_from and d_to) as p_orders,
      (select count(*) from done where day between d_from and d_to and not collection) as p_delivered,
      (select coalesce(sum(from_sales + from_unclaimed), 0) from ins) as e_in,
      (select coalesce(sum(cost), 0) from spent) as e_out,
      (select count(*) from unpriced) as e_unpriced,
      (select coalesce(sum(amount), 0) from delivery_fund_adjustments) as e_adjust
  )
  select jsonb_build_object(
      'from', d_from, 'to', d_to,
      'in_sales', round(p_sales, 2),
      'in_unclaimed', round(p_unclaimed, 2),
      'adjustments', round(p_adjust, 2),
      'out_trips', round(p_trips, 2),
      'trips_recorded', p_trip_count,
      'trips_unrecorded', p_unpriced,
      'unrecorded_estimate', round(p_unpriced * assumed, 2),
      'orders_completed', p_orders,
      'orders_delivered', p_delivered,
      'net', round(p_sales + p_unclaimed + p_adjust - p_trips - p_unpriced * assumed, 2),
      'avg_in_per_delivery', case when p_delivered > 0 then round((p_sales + p_unclaimed) / p_delivered, 2) end,
      'avg_cost_per_trip', case when p_trip_count > 0 then round(p_trips / p_trip_count, 2) end),
    jsonb_build_object(
      'balance', round(e_in + e_adjust - e_out - e_unpriced * assumed, 2),
      'unrecorded', e_unpriced)
    into period, ever
    from agg;

  return period || jsonb_build_object('all_time', ever, 'settings', jsonb_build_object(
    'pct', setting_num('delivery_fund_pct'), 'min', setting_num('delivery_fund_min'),
    'max', setting_num('delivery_fund_max'), 'takes_unclaimed', take_unclaimed,
    'free_delivery', setting_text('delivery_included') = 'true', 'assumed_cost', assumed));
end $$;
revoke all on function public.delivery_fund_summary(date, date) from public, anon;
grant execute on function public.delivery_fund_summary(date, date) to authenticated;

-- ============================================================
-- SECTION 22 of 23 — 20261112_storefront_delivery_message_REVIEW.sql
-- ============================================================

-- ZaMarket storefront: an optional, editable delivery sentence.
-- Run ONCE (idempotent) on existing Supabase projects before deploying the frontend.
-- No changes to prices, delivery charges, payment handling or order workflow.
-- If blank, the banner displays no delivery claim.

alter table public.vendors
  add column if not exists store_delivery_message text;

-- Do not force a default: the seller must opt in to an accurate message.
-- Constrain the displayed length for new and edited records.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_store_delivery_message_length'
      and conrelid = 'public.vendors'::regclass
  ) then
    alter table public.vendors add constraint vendors_store_delivery_message_length
      check (char_length(store_delivery_message) <= 140) not valid;
  end if;
end $$;

-- Append the new column at the END of the view to preserve existing column order.
-- PostgreSQL CREATE OR REPLACE VIEW retains dependencies and grants.
create or replace view public.public_vendors as
select v.id, v.business_name, v.category, v.description,
       split_part(coalesce(v.location, ''), ',', 1) as town,
       v.slug, v.logo_url, v.cover_url, v.tagline, v.about,
       v.opening_hours, v.highlights, v.trust_level, v.theme,
       (select round(avg(r.vendor_rating), 1) from public.reviews r
        where r.vendor_id = v.id and r.approved) as rating,
       (select count(*) from public.reviews r
        where r.vendor_id = v.id and r.approved) as review_count,
       (select count(*) from public.products p
        where p.vendor_id = v.id and p.status = 'published') as product_count,
       v.store_delivery_message
from public.vendors v where v.status = 'approved';

-- The public view runs with the caller's permissions, not owner privileges.
alter view public.public_vendors set (security_invoker = on);
grant select (store_delivery_message) on public.vendors to anon, authenticated;
grant select on public.public_vendors to anon, authenticated;

-- ============================================================
-- SECTION 23 of 23 — 20261112_academy_code_REVIEW.sql
-- ============================================================

-- Each affiliate's access code for Al-Halaqa, the academy where affiliates
-- are trained. Staff create the affiliate's academy account in Al-Halaqa,
-- then save the code here; the affiliate sees it on their Academy page
-- beside the link.
--
-- Who can see it: the affiliate themselves and staff (the existing
-- read_reseller policy). Who can change it: staff only (staff_reseller).
-- Safe to run more than once.

alter table public.resellers add column if not exists academy_code text
  check (academy_code is null or length(academy_code) between 1 and 60);

-- An applicant writes their own row once, when applying. They must not be
-- able to fill in an academy code then: only staff hand those out.
create or replace function public.resellers_academy_code_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    if tg_op = 'INSERT' then
      new.academy_code := null;
    elsif new.academy_code is distinct from old.academy_code then
      new.academy_code := old.academy_code;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_resellers_academy_code on public.resellers;
create trigger trg_resellers_academy_code before insert or update on public.resellers
  for each row execute function public.resellers_academy_code_guard();
