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
