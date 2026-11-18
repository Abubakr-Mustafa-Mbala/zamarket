-- 30. Alerts that reach you: phone alerts for everything in the bell, and emails.
--     Run after section 29.

-- ---- Alerts ------------------------------------------------------------------
-- What the bell shows a given person, for the alert sender (service key only).
create or replace function public.action_center_for(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  return action_center();
end $$;
revoke all on function public.action_center_for(uuid) from public, anon, authenticated;

-- What each person was last alerted about, so only new things alert.
create table if not exists public.alert_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.alert_state enable row level security;
revoke all on public.alert_state from anon, authenticated;

-- Each person's email choice. Phone alerts are per device (push_subscriptions).
create table if not exists public.alert_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.alert_prefs enable row level security;
drop policy if exists alert_prefs_own on public.alert_prefs;
create policy alert_prefs_own on public.alert_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.alert_prefs to authenticated;

-- Emails waiting to be sent. Filled by the database when something happens;
-- sent by the site every couple of minutes.
create table if not exists public.email_outbox (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  to_email text not null,
  kind text not null,
  subject text not null,
  body text not null,
  link text,
  sent_at timestamptz,
  attempts int not null default 0,
  error text
);
create index if not exists email_outbox_pending on public.email_outbox (created_at) where sent_at is null;
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

create or replace function public.queue_email(p_to text, p_kind text, p_subject text, p_body text, p_link text default null, p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_to), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if p_user is not null and exists (select 1 from alert_prefs where user_id = p_user and not email) then return; end if;
  insert into email_outbox (to_email, kind, subject, body, link) values (lower(trim(p_to)), p_kind, p_subject, p_body, p_link);
end $$;
revoke all on function public.queue_email(text, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.email_on_reseller() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform queue_email(coalesce(nullif(new.email, ''), (select email from profiles where id = new.user_id)), 'affiliate_approved',
      'You are now a ZaMarket affiliate',
      'Hello ' || coalesce(nullif(split_part(coalesce(new.full_name, ''), ' ', 1), ''), 'there') || E',\n\nYour application has been approved. Your affiliate code is ' || coalesce(new.code, '') ||
      E'.\n\nSign in to see products to promote, make posters with your own link, and start the Academy. You earn when a buyer you bring completes an order.',
      '/sell', new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists email_on_reseller on public.resellers;
create trigger email_on_reseller after update of status on public.resellers for each row execute function public.email_on_reseller();

create or replace function public.email_on_vendor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform queue_email(coalesce(nullif(new.email, ''), (select email from profiles where id = new.user_id)), 'vendor_approved',
      'Your shop on ZaMarket is approved',
      'Hello ' || coalesce(nullif(split_part(coalesce(new.owner_name, ''), ' ', 1), ''), new.business_name) ||
      E',\n\n' || new.business_name || E' is approved on ZaMarket. Sign in to add your products; we check each one before it goes live.',
      '/vendor', new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists email_on_vendor on public.vendors;
create trigger email_on_vendor after update of status on public.vendors for each row execute function public.email_on_vendor();

-- A seller is told when an order is confirmed and theirs to prepare.
create or replace function public.email_on_order_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    for r in
      select v.id, v.user_id, coalesce(nullif(v.email, ''), p.email) as email,
             string_agg(i.quantity || ' × ' || coalesce(pr.name, 'item'), ', ') as items
      from order_items i join vendors v on v.id = i.vendor_id
      left join profiles p on p.id = v.user_id left join products pr on pr.id = i.product_id
      where i.order_id = new.id group by v.id, v.user_id, v.email, p.email
    loop
      perform queue_email(r.email, 'vendor_order',
        'New order to prepare · #' || new.order_number,
        E'Hello,\n\nOrder #' || new.order_number || ' is confirmed and ready for you to prepare: ' || r.items || '.' ||
        case when new.needed_by is not null then E'\nNeeded on ' || to_char(new.needed_by, 'Dy DD Mon') || '.' else '' end ||
        E'\n\nOpen your orders to mark it as being prepared and ready.',
        '/vendor/orders', r.user_id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists email_on_order_confirmed on public.orders;
create trigger email_on_order_confirmed after update of status on public.orders for each row execute function public.email_on_order_confirmed();

create or replace function public.email_on_payout() returns trigger
language plpgsql security definer set search_path = public as $$
declare who_email text; who uuid; who_name text;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if new.payee_type = 'reseller' then
      select coalesce(nullif(r.email, ''), p.email), r.user_id, r.full_name into who_email, who, who_name
        from resellers r left join profiles p on p.id = r.user_id where r.id = new.reseller_id;
    else
      select coalesce(nullif(v.email, ''), p.email), v.user_id, v.business_name into who_email, who, who_name
        from vendors v left join profiles p on p.id = v.user_id where v.id = new.vendor_id;
    end if;
    perform queue_email(who_email, 'payout_paid', 'Your payout has been sent',
      'Hello ' || coalesce(nullif(split_part(coalesce(who_name, ''), ' ', 1), ''), 'there') || E',\n\nWe have sent your payout of K' || to_char(new.amount, 'FM999,999,990.00') ||
      coalesce(' by ' || replace(new.method, '_', ' '), '') || E'. Thank you for working with ZaMarket.',
      case when new.payee_type = 'reseller' then '/sell/commissions' else '/vendor/payouts' end, who);
  end if;
  return new;
end $$;
drop trigger if exists email_on_payout on public.payouts;
create trigger email_on_payout after update of status on public.payouts for each row execute function public.email_on_payout();

-- The alert sender reads these with the service key.
grant select, insert, update on public.alert_state, public.email_outbox to service_role;
grant usage, select on sequence public.email_outbox_id_seq to service_role;
grant execute on function public.action_center_for(uuid) to service_role;
