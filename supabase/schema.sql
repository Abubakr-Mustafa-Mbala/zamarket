-- ============================================================
-- ZaMarket — Zambian multi-vendor marketplace + commerce OS
-- Run this whole file once in the Supabase SQL editor.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Enums (the state machines) ----------
do $$ begin
  create type user_role as enum ('founder','ops','finance','delivery','vendor','reseller','customer');
exception when duplicate_object then null; end $$;

alter type user_role add value if not exists 'marketing';

do $$ begin
  create type application_status as enum ('pending','approved','rejected','suspended','terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_status as enum ('draft','submitted','approved','published','rejected','out_of_stock','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'pending','confirmed','payment_pending','paid','processing','ready_for_dispatch',
    'out_for_delivery','delivered','completed','cancelled','refunded','returned',
    'failed_delivery','fraud_review','customer_unreachable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending','confirmed','paid','refunded','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type commission_status as enum ('pending','verified','approved','paid','rejected','reversed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type settlement_status as enum ('pending','eligible','approved','paid','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type purchase_status as enum ('draft','ordered','paid','in_transit','received','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type offer_status as enum ('draft','pending_approval','active','paused','expired','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_status as enum ('unassigned','fee_pending','fee_confirmed','assigned','out_for_delivery','delivered','failed','returned','not_available');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum ('purchase_received','sale','return','damage','loss','adjustment','reserve','release');
exception when duplicate_object then null; end $$;

-- ---------- Locations ----------
create table if not exists provinces (
  id serial primary key,
  name text not null unique
);

create table if not exists districts (
  id serial primary key,
  province_id int not null references provinces(id),
  name text not null,
  is_local_zone boolean not null default false,
  unique (province_id, name)
);

-- ---------- Settings (everything configurable lives here) ----------
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  description text
);

insert into settings (key, value, description) values
  ('currency', '"K"', 'Currency symbol'),
  ('marketplace_fee_pct', '10', 'Fee charged to vendors on each sale (%)'),
  ('default_commission_pct', '5', 'Default reseller commission when a product has no override (%)'),
  ('commission_source', '"from_fee"', 'from_fee = reseller commission is paid out of the marketplace fee; on_top = charged in addition to the fee'),
  ('delivery_included', 'false', 'Delivery is built into your prices, so customers are never charged for it'),
  ('local_delivery_fee', '30', 'Standard delivery fee inside the local zone'),
  ('target_margin_pct', '30', 'Target net margin used for economics traffic lights (%)'),
  ('target_markup_pct', '50', 'Profit target on top of cost, used to suggest selling prices (%)'),
  ('price_floor_margin_pct', '10', 'Offers below this margin cannot publish without an override (%)'),
  ('min_profit_per_unit', '5', 'Minimum acceptable profit per unit'),
  ('commission_grace_hours', '24', 'Hours after completion before a commission is eligible'),
  ('payment_fee_pct', '0', 'Payment processing fee (%) — 0 while payments are manual'),
  ('default_packaging_cost', '5', 'Default packaging cost per unit'),
  ('capital_allocation', '{"inventory":200,"packaging":50,"delivery":50,"advertising":100,"reserve":100}', 'Starting capital plan (USD)'),
  ('simple_mode_default', 'true', 'New staff start in Simple mode'),
  ('departments', '[{"name":"Phones & electronics","icon":"phone"},{"name":"Home & kitchen","icon":"home"},{"name":"Fashion","icon":"fashion"},{"name":"Food & cakes","icon":"food"},{"name":"Services","icon":"services"},{"name":"Other","icon":"other"}]', 'Shop departments customers browse'),
  ('reseller_terms', '"Commission is earned on completed orders that are not cancelled, refunded or returned, after a 24-hour check. Self-purchases and fake orders are not paid. Earnings depend on what you sell — nothing is guaranteed. Share honestly: never promise what a product cannot do. ZaMarket may suspend accounts that break these rules."', 'Rules resellers agree to'),
  ('vendor_terms', '"A marketplace fee is taken from each sale. Customers pay ZaMarket for ZaMarket orders, and you are paid your share once the order is complete. You will see a customer''s phone and address after we confirm their order; do not ask them to pay you directly or move ZaMarket orders off the platform. Keep products and service to a good standard. We can suspend accounts that break these rules."', 'Rules vendors agree to'),
  ('founder_emails', '[]', 'Only these email addresses can hold the founder role'),
  ('referral_reward', '20', 'Reward paid to a customer when a friend they invited completes a first order (K)'),
  ('own_audience_fee_pct', '5', 'Marketplace fee when a vendor brings the customer through their own store link (%)'),
  ('business_name', '"ZaMarket"', 'Name printed on receipts'),
  ('business_phone', '""', 'Phone printed on receipts'),
  ('receipt_footer', '"Thank you for shopping with us!"', 'Message at the bottom of receipts')
on conflict (key) do nothing;

-- ---------- People ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now()
);

-- First account ever created becomes the founder. Every later account is a customer until promoted.
create table if not exists staff_invites (
  email text primary key,
  role user_role not null,
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  founder_exists boolean;
  allowed jsonb;
  mail text := lower(coalesce(new.email, ''));
  invite staff_invites%rowtype;
  new_role user_role := 'customer';
begin
  select exists(select 1 from profiles where role = 'founder') into founder_exists;
  select value into allowed from settings where key = 'founder_emails';
  select * into invite from staff_invites where lower(email) = mail and used_at is null;

  if allowed ? mail then
    new_role := 'founder';                       -- on the founders list
  elsif not founder_exists and coalesce(jsonb_array_length(allowed), 0) = 0 then
    new_role := 'founder';                       -- very first account sets the business up
    update settings set value = jsonb_build_array(mail) where key = 'founder_emails';
  elsif invite.email is not null then
    new_role := invite.role;                     -- invited by the team
    update staff_invites set used_at = now() where email = invite.email;
  end if;

  insert into profiles (id, email, full_name, phone, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'phone', ''), new_role);
  if new_role <> 'customer' then
    perform log_audit('team.joined', 'profiles', new.id, null, jsonb_build_object('email', mail, 'role', new_role));
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  email text,
  province_id int references provinces(id),
  district_id int references districts(id),
  area text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  location text,
  moq int,
  lead_time_days int,
  reliability int check (reliability between 1 and 5),
  quality int check (quality between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  business_name text not null,
  owner_name text,
  phone text not null,
  email text,
  location text,
  category text,
  description text,
  delivery_capability text,
  return_policy text,
  links text,
  licenses text,
  payout_info text,
  fee_pct_override numeric,
  status application_status not null default 'pending',
  health text not null default 'healthy' check (health in ('healthy','watch','at_risk','suspended')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  agreed_terms boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists resellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  full_name text not null,
  phone text not null,
  email text,
  location text,
  experience text,
  categories text,
  code text unique,
  status application_status not null default 'pending',
  monthly_target numeric not null default 0,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  agreed_terms boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Catalog ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id),
  owner_type text not null default 'founder' check (owner_type in ('founder','vendor')),
  name text not null,
  slug text unique,
  category text,
  description text,
  benefits text[] default '{}',
  faqs jsonb default '[]',
  objections jsonb default '[]',
  images text[] default '{}',
  price numeric not null default 0,
  normal_price numeric,
  cost_override numeric,
  commission_type text check (commission_type in ('pct','flat')),
  commission_value numeric,
  packaging_cost numeric,
  status product_status not null default 'draft',
  rejection_reason text,
  stock_available int not null default 0,
  stock_reserved int not null default 0,
  stock_sold int not null default 0,
  stock_returned int not null default 0,
  stock_damaged int not null default 0,
  stock_lost int not null default 0,
  landed_cost_total numeric not null default 0,
  landed_units int not null default 0,
  evaluation jsonb default '{}',
  fulfilment text not null default 'in_stock',
  lead_time_days int not null default 0,
  order_days int[],
  daily_limit int,
  options jsonb not null default '[]',
  note_label text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products add column if not exists fulfilment text not null default 'in_stock';
alter table products add column if not exists lead_time_days int not null default 0;
alter table products add column if not exists order_days int[];
alter table products add column if not exists daily_limit int;
alter table products add column if not exists options jsonb not null default '[]';
alter table products add column if not exists note_label text;
alter table products add column if not exists service_location text;
alter table products add column if not exists offering_type text not null default 'product';
alter table products add column if not exists sales_model text not null default 'buy';
alter table products add column if not exists page jsonb not null default '{}';
alter table products add column if not exists deal_fee_pct numeric;
alter table products add column if not exists featured_for_resellers boolean not null default false;
alter table products drop constraint if exists products_offering_type_check;
alter table products add constraint products_offering_type_check check (offering_type in ('product','service','course','class','vehicle','event','deal','other'));
alter table products drop constraint if exists products_sales_model_check;
alter table products add constraint products_sales_model_check check (sales_model in ('buy','book','enquire','negotiate'));
alter table products add column if not exists duration_text text;
alter table products add column if not exists time_slots text[];
alter table products add column if not exists slot_capacity int not null default 1;
alter table products drop constraint if exists products_fulfilment_check;
alter table products add constraint products_fulfilment_check check (fulfilment in ('in_stock', 'made_to_order', 'service'));
alter table products drop constraint if exists products_service_location_check;
alter table products add constraint products_service_location_check check (service_location is null or service_location in ('at_customer', 'at_seller', 'online'));

create table if not exists product_packages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  subtitle text,
  price numeric not null default 0,
  normal_price numeric,
  items text[] not null default '{}',
  featured boolean not null default false,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Procurement ----------
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id),
  order_date date not null default current_date,
  status purchase_status not null default 'draft',
  supplier_shipping numeric not null default 0,
  inbound_transport numeric not null default 0,
  other_costs numeric not null default 0,
  storage_cost numeric not null default 0,
  amount_paid numeric not null default 0,
  notes text,
  received_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table purchases add column if not exists storage_cost numeric not null default 0;

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric not null default 0,
  quantity_received int not null default 0,
  quantity_damaged int not null default 0
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  type movement_type not null,
  quantity int not null,
  reason text,
  reference_type text,
  reference_id uuid,
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists stock_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  customer_name text not null,
  phone text not null,
  quantity int not null default 1,
  location text,
  fulfilled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Offers ----------
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('attraction','upsell','downsell','continuity')),
  type text not null,
  product_id uuid references products(id),
  config jsonb not null default '{}',
  customer_price numeric not null default 0,
  normal_value numeric not null default 0,
  start_at timestamptz,
  end_at timestamptz,
  inventory_limit int,
  terms text,
  status offer_status not null default 'draft',
  economics jsonb default '{}',
  floor_override boolean not null default false,
  override_reason text,
  units_used int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table offers add column if not exists units_used int not null default 0;

-- ---------- Orders ----------
create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number int not null default nextval('order_number_seq') unique,
  customer_id uuid references customers(id),
  status order_status not null default 'pending',
  payment_status payment_status not null default 'pending',
  source text not null default 'organic',
  channel text not null default 'marketplace',
  seller_type text not null default 'founder' check (seller_type in ('founder','reseller','vendor')),
  reseller_id uuid references resellers(id),
  referral_code text,
  subtotal numeric not null default 0,
  delivery_fee numeric not null default 0,
  delivery_fee_status text not null default 'pending' check (delivery_fee_status in ('pending','confirmed','override','not_available')),
  total numeric not null default 0,
  province_id int references provinces(id),
  district_id int references districts(id),
  area text,
  address text,
  instructions text,
  is_local boolean not null default false,
  is_manual boolean not null default false,
  notes text,
  risk_flags text[] default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz
);

alter table customers alter column phone drop not null;
alter table orders add column if not exists review_code text;

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  offer_id uuid references offers(id),
  vendor_id uuid references vendors(id),
  quantity int not null check (quantity > 0),
  unit_price numeric not null,
  unit_cost_snapshot numeric not null default 0,
  line_total numeric not null,
  reserved_qty int not null default 0
);
alter table order_items add column if not exists reserved_qty int not null default 0;
alter table order_items add column if not exists choices jsonb not null default '{}';
alter table order_items add column if not exists package_id uuid references product_packages(id);
alter table order_items add column if not exists package_name text;
alter table order_items add column if not exists note text;
alter table order_items add column if not exists vendor_status text not null default 'new';
alter table orders add column if not exists needed_by date;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  method text not null default 'manual' check (method in ('manual','cash','airtel_money','mtn_money','bank','paypal','other')),
  amount numeric not null,
  reference text,
  status payment_status not null default 'pending',
  verified_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) unique,
  status delivery_status not null default 'unassigned',
  assigned_to uuid references profiles(id),
  courier text,
  delivery_cost numeric not null default 0,
  fuel_cost numeric not null default 0,
  scheduled_date date,
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  reseller_id uuid not null references resellers(id),
  base_amount numeric not null,
  rate_type text not null,
  rate_value numeric not null,
  amount numeric not null,
  status commission_status not null default 'pending',
  eligible_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  order_id uuid not null references orders(id),
  gross numeric not null,
  marketplace_fee numeric not null,
  reseller_commission numeric not null default 0,
  net_payable numeric not null,
  status settlement_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table settlements add column if not exists order_number int;
update settlements st set order_number = o.order_number from orders o where o.id = st.order_id and st.order_number is null;

-- Negotiated deals (vehicles and other high-value offerings): enquiry → negotiation → agreed → verified close
create sequence if not exists deal_number_seq start 5001;
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  deal_number int not null default nextval('deal_number_seq') unique,
  product_id uuid not null references products(id),
  package_id uuid references product_packages(id),
  vendor_id uuid references vendors(id),
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text not null,
  message text,
  advertised_price numeric not null default 0,
  status text not null default 'enquiry' check (status in ('enquiry','negotiating','agreed','closed','lost')),
  final_price numeric,
  commission_type text,
  commission_value numeric,
  fee_pct numeric not null default 0,
  reseller_id uuid references resellers(id),
  invite_code text,
  campaign_id uuid,
  source text,
  reseller_amount numeric,
  marketplace_amount numeric,
  fee_status text not null default 'pending' check (fee_status in ('pending','received','waived')),
  evidence text,
  lost_reason text,
  verified_by uuid references profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  kind text not null check (kind in ('enquiry','note','offer','counter','agreed','closed','lost','reopened')),
  amount numeric,
  party text check (party in ('customer','seller','marketplace')),
  note text,
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table commissions alter column order_id drop not null;
alter table commissions add column if not exists deal_id uuid references deals(id);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  product_id uuid references products(id),
  vendor_id uuid references vendors(id),
  customer_name text,
  product_rating int check (product_rating between 1 and 5),
  vendor_rating int check (vendor_rating between 1 and 5),
  delivery_rating int check (delivery_rating between 1 and 5),
  marketplace_rating int check (marketplace_rating between 1 and 5),
  comment text,
  verified boolean not null default false,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_name text not null,
  referrer_phone text not null,
  referred_phone text,
  order_id uuid references orders(id),
  reward numeric not null default 0,
  status text not null default 'created' check (status in ('created','visited','purchased','paid_for','delivered','eligible','paid','void')),
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  product_id uuid references products(id),
  source text,
  stage text not null default 'interest' check (stage in ('view','interest','cart','checkout','abandoned','purchased')),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Marketing department ----------
alter table leads add column if not exists email text;
alter table leads add column if not exists owner_id uuid references profiles(id);
alter table leads add column if not exists channel text not null default 'other';
alter table leads add column if not exists campaign_id uuid;
alter table leads add column if not exists magnet_id uuid;
alter table leads add column if not exists vendor_id uuid references vendors(id);
alter table leads add column if not exists interest text;
alter table leads add column if not exists next_follow_up date;
alter table leads add column if not exists last_contact_at timestamptz;
alter table leads add column if not exists order_id uuid references orders(id);
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists area text;
alter table leads add column if not exists updated_at timestamptz not null default now();
alter table leads drop constraint if exists leads_stage_check;
update leads set stage = case stage when 'purchased' then 'won' when 'view' then 'new' when 'interest' then 'new' when 'cart' then 'new' when 'checkout' then 'new' when 'abandoned' then 'new' else stage end
  where stage in ('view','interest','cart','checkout','abandoned','purchased');
alter table leads alter column stage set default 'new';
alter table leads add constraint leads_stage_check check (stage in ('new','contacted','engaged','won','lost'));
alter table leads drop constraint if exists leads_channel_check;
alter table leads add constraint leads_channel_check check (channel in ('warm','content','cold','paid','referral','reseller','organic','other'));
create unique index if not exists leads_open_phone on leads (phone) where stage in ('new','contacted','engaged');

create table if not exists lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  user_id uuid references profiles(id),
  kind text not null check (kind in ('call','whatsapp','sms','in_person','email','dm','note','system')),
  outcome text check (outcome in ('no_answer','not_interested','interested','follow_up','ordered','wrong_number')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null default 'instagram',
  format text not null default 'post' check (format in ('post','reel','video','story','article','live','status','other')),
  url text,
  posted_on date not null default current_date,
  campaign_id uuid,
  product_id uuid references products(id),
  vendor_id uuid references vendors(id),
  owner_id uuid references profiles(id),
  views int not null default 0,
  engagement int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists lead_magnets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  audience text,
  problem text,
  format text not null default 'guide' check (format in ('guide','checklist','voucher','quiz','sample','calculator','video','other')),
  headline text not null,
  description text,
  bullets text[] default '{}',
  cta_text text not null default 'Send it to me',
  delivery_type text not null default 'link' check (delivery_type in ('link','voucher','message')),
  delivery_value text,
  product_id uuid references products(id),
  vendor_id uuid references vendors(id),
  campaign_id uuid,
  status text not null default 'draft' check (status in ('draft','live','paused')),
  views int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- A funnel is one named path a customer takes: saw it → gave their number → bought → added more → came back.
create table if not exists funnels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_id uuid,
  magnet_id uuid,
  product_id uuid references products(id),
  bump_offer_id uuid references offers(id),
  repeat_offer_id uuid references offers(id),
  notes text,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Short lessons resellers work through; ticked off one at a time.
create table if not exists training_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  lesson text not null,
  done_at timestamptz not null default now(),
  primary key (user_id, lesson)
);

create table if not exists marketing_goals (
  user_id uuid primary key references profiles(id) on delete cascade,
  outreach_daily int not null default 20,
  content_weekly int not null default 5,
  engaged_weekly int not null default 10,
  updated_at timestamptz not null default now()
);

alter table referrals add column if not exists code text;
alter table referrals add column if not exists referrer_customer_id uuid references customers(id);
create unique index if not exists referrals_code_key on referrals (code) where order_id is null;
alter table orders add column if not exists invite_code text;

-- ---------- Finance ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric not null,
  description text,
  spent_on date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner_type text not null default 'marketplace' check (owner_type in ('marketplace', 'vendor')),
  vendor_id uuid references vendors(id),
  goal text not null default 'customers' check (goal in ('customers', 'resellers', 'vendors')),
  platform text not null default 'meta',
  destination text not null default '/',
  budget numeric not null default 0,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_on date,
  ends_on date,
  notes text,
  visits int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists ad_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  goal text not null,
  promote text not null default 'store',
  product_id uuid references products(id),
  budget numeric,
  audience text,
  notes text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'live', 'done', 'declined')),
  reply text,
  campaign_id uuid references campaigns(id),
  created_at timestamptz not null default now()
);

create table if not exists marketing_spend (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  spent_on date not null default current_date,
  amount numeric not null,
  clicks int default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table marketing_spend add column if not exists campaign_id uuid references campaigns(id);
alter table campaigns add column if not exists channel text;
alter table leads drop constraint if exists leads_campaign_fk;
alter table leads add constraint leads_campaign_fk foreign key (campaign_id) references campaigns(id);
alter table content_posts drop constraint if exists content_campaign_fk;
alter table content_posts add constraint content_campaign_fk foreign key (campaign_id) references campaigns(id);
alter table funnels drop constraint if exists funnels_campaign_fk;
alter table funnels add constraint funnels_campaign_fk foreign key (campaign_id) references campaigns(id);
alter table funnels drop constraint if exists funnels_magnet_fk;
alter table funnels add constraint funnels_magnet_fk foreign key (magnet_id) references lead_magnets(id);
alter table lead_magnets drop constraint if exists magnets_campaign_fk;
alter table lead_magnets add constraint magnets_campaign_fk foreign key (campaign_id) references campaigns(id);
alter table leads drop constraint if exists leads_magnet_fk;
alter table leads add constraint leads_magnet_fk foreign key (magnet_id) references lead_magnets(id);
alter table vendors add column if not exists slug text;
create unique index if not exists vendors_slug_key on vendors (slug);
alter table orders add column if not exists store_vendor_id uuid references vendors(id);
alter table orders add column if not exists campaign_id uuid references campaigns(id);

create table if not exists founder_contributions (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid references profiles(id),
  amount numeric not null,
  purpose text,
  contributed_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists founder_withdrawals (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid references profiles(id),
  amount numeric not null,
  purpose text,
  withdrawn_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id serial primary key,
  text text not null,
  author text
);

-- ---------- Helpers ----------
-- Zambian phone numbers in one format: 0977123456 (accepts +260 977 123 456, 260977123456, 977123456).
create or replace function norm_phone(p text) returns text
language sql immutable as $$
  select case
    when d ~ '^260[0-9]{9}$' then '0' || substr(d, 4)
    when d ~ '^[0-9]{9}$' then '0' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function lusaka_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Africa/Lusaka')::date $$;

create or replace function order_has_vendor(p_order uuid, p_vendor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_vendor is not null and exists (select 1 from order_items where order_id = p_order and vendor_id = p_vendor);
$$;

create or replace function order_reseller(p_order uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select reseller_id from orders where id = p_order;
$$;
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('founder','ops','finance','delivery') from profiles where id = auth.uid()), false);
$$;

-- Marketing work: founders, operations and the marketing team.
create or replace function can_market() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('founder','ops','marketing') from profiles where id = auth.uid()), false);
$$;

-- Founders and ops see every lead; marketers see their own and the unassigned pool.
create or replace function sees_all_leads() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('founder','ops') from profiles where id = auth.uid()), false);
$$;

create or replace function is_founder() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'founder' from profiles where id = auth.uid()), false);
$$;

create or replace function my_vendor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from vendors where user_id = auth.uid() limit 1;
$$;

create or replace function my_reseller_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from resellers where user_id = auth.uid() limit 1;
$$;

create or replace function setting_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((value #>> '{}')::numeric, 0) from settings where key = p_key;
$$;

create or replace function setting_text(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value #>> '{}' from settings where key = p_key;
$$;

create or replace function log_audit(p_action text, p_entity text, p_entity_id uuid, p_old jsonb, p_new jsonb, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (user_id, action, entity, entity_id, old_value, new_value, reason)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_old, p_new, p_reason);
end $$;

-- Effective (landed) cost per sellable unit
create or replace function product_effective_cost(p products) returns numeric
language sql stable as $$
  select coalesce(p.cost_override,
    case when p.landed_units > 0 then round(p.landed_cost_total / p.landed_units, 2) else 0 end);
$$;

-- Commission rule: product override → global default
create or replace function commission_for(p_product products, p_unit_price numeric, p_qty int) returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  if p_product.commission_type = 'flat' then
    return coalesce(p_product.commission_value, 0) * p_qty;
  elsif p_product.commission_type = 'pct' then
    return round(p_unit_price * p_qty * coalesce(p_product.commission_value, 0) / 100, 2);
  else
    return round(p_unit_price * p_qty * setting_num('default_commission_pct') / 100, 2);
  end if;
end $$;

-- ---------- Audit triggers (prices, fees, statuses never change silently) ----------
create or replace function audit_products() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.price is distinct from old.price or new.commission_value is distinct from old.commission_value
       or new.commission_type is distinct from old.commission_type or new.status is distinct from old.status then
      perform log_audit('product.update', 'products', new.id,
        jsonb_build_object('price', old.price, 'commission_type', old.commission_type, 'commission_value', old.commission_value, 'status', old.status),
        jsonb_build_object('price', new.price, 'commission_type', new.commission_type, 'commission_value', new.commission_value, 'status', new.status));
    end if;
    new.updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_products on products;
create trigger trg_audit_products before update on products for each row execute function audit_products();

create or replace function audit_vendor_reseller() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status or new.fee_pct_override is distinct from old.fee_pct_override then
    perform log_audit(tg_table_name || '.status', tg_table_name, new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_vendors on vendors;
create trigger trg_audit_vendors before update on vendors for each row execute function audit_vendor_reseller();

create or replace function audit_resellers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform log_audit('resellers.status', 'resellers', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_resellers on resellers;
create trigger trg_audit_resellers before update on resellers for each row execute function audit_resellers();

create or replace function audit_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_audit('settings.update', 'settings', null, jsonb_build_object(old.key, old.value), jsonb_build_object(new.key, new.value));
  return new;
end $$;
drop trigger if exists trg_audit_settings on settings;
create trigger trg_audit_settings before update on settings for each row execute function audit_settings();

-- Financial rows are never deleted, only reversed.
create or replace function block_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Financial records cannot be deleted. Cancel, refund or reverse instead.';
end $$;
drop trigger if exists trg_no_delete_orders on orders;
create trigger trg_no_delete_orders before delete on orders for each row execute function block_delete();
drop trigger if exists trg_no_delete_payments on payments;
create trigger trg_no_delete_payments before delete on payments for each row execute function block_delete();
drop trigger if exists trg_no_delete_commissions on commissions;
create trigger trg_no_delete_commissions before delete on commissions for each row execute function block_delete();
drop trigger if exists trg_no_delete_settlements on settlements;
create trigger trg_no_delete_settlements before delete on settlements for each row execute function block_delete();

-- ---------- Clean links ----------
-- Words the website already uses, so no store can take them.
create or replace function reserved_slug(p text) returns boolean
language sql immutable as $$
  select p = any (array['admin','sell','vendor','vendors','login','logout','account','apply','cart','checkout','order','orders','review','reviews',
    'search','sellers','store','stores','p','r','go','free','invite','rate','api','help','about','terms','privacy','contact','zamarket','deals','marketing','settings','assets','static']);
$$;

create or replace function make_slug(p text) returns text
language sql immutable as $$
  select nullif(trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(p, '')), '''', '', 'g'), '[^a-z0-9]+', '-', 'g')), '');
$$;

create or replace function slug_products() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; k int := 1;
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug and new.slug is not null then return new; end if;
  base := coalesce(make_slug(new.slug), make_slug(new.name), 'product');
  base := left(base, 60);
  candidate := base;
  while exists (select 1 from products where slug = candidate and id <> new.id) loop
    k := k + 1; candidate := base || '-' || k;
  end loop;
  new.slug := candidate;
  return new;
end $$;
drop trigger if exists trg_slug_products on products;
create trigger trg_slug_products before insert or update of slug, name on products for each row execute function slug_products();

create or replace function slug_vendors() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; k int := 1;
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug and new.slug is not null then return new; end if;
  if tg_op = 'UPDATE' and new.slug is distinct from old.slug and old.slug is not null and auth.uid() is not null and not is_founder() then
    raise exception 'Only a founder can change a store link';
  end if;
  base := left(coalesce(make_slug(new.slug), make_slug(new.business_name), 'store'), 40);
  if reserved_slug(base) then base := base || '-store'; end if;
  candidate := base;
  while exists (select 1 from vendors where slug = candidate and id <> new.id) loop
    k := k + 1; candidate := base || '-' || k;
  end loop;
  new.slug := candidate;
  return new;
end $$;
drop trigger if exists trg_slug_vendors on vendors;
create trigger trg_slug_vendors before insert or update of slug, business_name on vendors for each row execute function slug_vendors();

update products set slug = null where slug is null or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
update vendors set slug = null where slug is null;

-- ---------- Guards: fields only staff (or the system) may change ----------
create or replace function guard_partner_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'profiles' then
    if new.role is distinct from old.role then
      if not is_founder() then raise exception 'Only a founder can change roles'; end if;
      if new.role::text = 'founder' and not ((select value from settings where key = 'founder_emails') ? lower(coalesce(new.email, ''))) then
        raise exception 'Add % to the founders list in Settings before making them a founder', coalesce(new.email, 'that address');
      end if;
      perform log_audit('team.role', 'profiles', new.id, jsonb_build_object('role', old.role), jsonb_build_object('role', new.role, 'email', new.email));
    end if;
    return new;
  end if;
  if is_staff() then return new; end if;
  if tg_table_name = 'vendors' then
    if new.status is distinct from old.status or new.fee_pct_override is distinct from old.fee_pct_override
       or new.health is distinct from old.health or new.user_id is distinct from old.user_id
       or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Only the marketplace team can change approval, fees or account health';
    end if;
  elsif tg_table_name = 'products' then
    -- only applies to a vendor editing their own product (orders placed by logged-in users also update stock)
    if old.vendor_id is null or old.vendor_id is distinct from my_vendor_id() then return new; end if;
    if new.vendor_id is distinct from old.vendor_id or new.owner_type is distinct from old.owner_type
       or new.commission_type is distinct from old.commission_type or new.commission_value is distinct from old.commission_value
       or new.cost_override is distinct from old.cost_override
       or new.deal_fee_pct is distinct from old.deal_fee_pct or new.featured_for_resellers is distinct from old.featured_for_resellers
       or new.landed_cost_total is distinct from old.landed_cost_total or new.landed_units is distinct from old.landed_units
       or new.stock_available is distinct from old.stock_available or new.stock_reserved is distinct from old.stock_reserved
       or new.stock_sold is distinct from old.stock_sold then
      raise exception 'Only the marketplace team can change commission, cost or stock';
    end if;
    if new.status not in ('draft', 'submitted') then raise exception 'Vendors can save drafts or send products for review'; end if;
    if old.status not in ('draft', 'submitted', 'rejected') and (new.price is distinct from old.price or new.name is distinct from old.name) then
      raise exception 'Published products can only be changed by the marketplace team';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_vendors on vendors;
create trigger trg_guard_vendors before update on vendors for each row execute function guard_partner_fields();
drop trigger if exists trg_guard_profiles on profiles;
create trigger trg_guard_profiles before update on profiles for each row execute function guard_partner_fields();
drop trigger if exists trg_guard_products on products;
create trigger trg_guard_products before update on products for each row execute function guard_partner_fields();

-- Order status may only change through set_order_status (the state machine). Delivery-fee changes are audited.
create or replace function guard_order_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and coalesce(current_setting('zm.order_fn', true), '') <> 'on' then
    raise exception 'Change order status with the status buttons, not by editing the order';
  end if;
  if coalesce(current_setting('zm.order_fn', true), '') <> 'on'
     and (new.delivery_fee is distinct from old.delivery_fee or new.total is distinct from old.total) then
    perform log_audit('order.delivery_fee', 'orders', new.id,
      jsonb_build_object('delivery_fee', old.delivery_fee, 'total', old.total),
      jsonb_build_object('delivery_fee', new.delivery_fee, 'total', new.total, 'fee_status', new.delivery_fee_status));
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_orders on orders;
create trigger trg_guard_orders before update on orders for each row execute function guard_order_update();

-- ---------- Inventory ----------
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

  update products set status = 'out_of_stock' where id = p_product and stock_available <= 0 and status = 'published' and owner_type = 'founder' and fulfilment = 'in_stock';
  update products set status = 'published' where id = p_product and stock_available > 0 and status = 'out_of_stock' and fulfilment = 'in_stock';
end $$;

-- Manual adjustment (needs a reason; audited)
create or replace function adjust_inventory(p_product uuid, p_type movement_type, p_qty int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if coalesce(p_reason, '') = '' then raise exception 'A reason is required for inventory adjustments'; end if;
  if p_type not in ('adjustment','damage','loss','return') then raise exception 'Use receive_purchase or order status changes for that movement'; end if;
  perform apply_movement(p_product, p_type, p_qty, p_reason, 'manual', null);
  perform log_audit('inventory.adjust', 'products', p_product, null, jsonb_build_object('type', p_type, 'qty', p_qty), p_reason);
end $$;

-- Receiving a purchase: allocates shipping/transport/other across items by value and updates landed cost
create or replace function receive_purchase(p_purchase uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pu purchases%rowtype;
  it record;
  total_value numeric;
  extra numeric;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into pu from purchases where id = p_purchase for update;
  if pu.status = 'received' then raise exception 'Purchase already received'; end if;

  select coalesce(sum(quantity_received * unit_price), 0) into total_value from purchase_items where purchase_id = p_purchase;
  if total_value <= 0 then raise exception 'Enter the received quantity on each item first'; end if;
  extra := pu.supplier_shipping + pu.inbound_transport + pu.storage_cost + pu.other_costs;

  for it in select * from purchase_items where purchase_id = p_purchase loop
    if it.quantity_received > 0 then
      declare
        item_value numeric := it.quantity_received * it.unit_price;
        allocated numeric := item_value + extra * (item_value / total_value);
        sellable int := it.quantity_received - it.quantity_damaged;
      begin
        update products set
          landed_cost_total = landed_cost_total + allocated,
          landed_units = landed_units + sellable
        where id = it.product_id;
        perform apply_movement(it.product_id, 'purchase_received', sellable, 'Purchase received', 'purchase', p_purchase);
        if it.quantity_damaged > 0 then
          insert into inventory_movements (product_id, type, quantity, reason, reference_type, reference_id, user_id)
          values (it.product_id, 'damage', it.quantity_damaged, 'Damaged on arrival', 'purchase', p_purchase, auth.uid());
          update products set stock_damaged = stock_damaged + it.quantity_damaged where id = it.product_id;
        end if;
      end;
    end if;
  end loop;

  update purchases set status = 'received', received_at = now() where id = p_purchase;
  perform log_audit('purchase.received', 'purchases', p_purchase, null, jsonb_build_object('extra_costs', extra, 'value', total_value));
end $$;

-- ---------- Orders ----------


-- "I bought goods": product + supplier + purchase + receive + price, all in one safe step.
-- payload: { product_id?, name, category, description, images[], supplier_name,
--            quantity, unit_price | total_paid, damaged, shipping, transport, storage, other,
--            per_sale_cost, price, commission_type ('pct'|'flat'|null), commission_value, publish }
create or replace function add_stock(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_product uuid := nullif(payload->>'product_id', '')::uuid;
  v_supplier uuid;
  v_purchase uuid;
  qty int := coalesce((payload->>'quantity')::int, 0);
  damaged int := coalesce((payload->>'damaged')::int, 0);
  unit numeric;
  p products%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if qty <= 0 then raise exception 'Enter how many you bought'; end if;
  if damaged < 0 or damaged >= qty then raise exception 'Damaged items must be fewer than the number bought'; end if;
  unit := coalesce(nullif(payload->>'unit_price', '')::numeric, nullif(payload->>'total_paid', '')::numeric / qty);
  if unit is null or unit < 0 then raise exception 'Enter what you paid'; end if;

  if v_product is null then
    if coalesce(trim(payload->>'name'), '') = '' then raise exception 'Enter the product name'; end if;
    insert into products (name, category, description, images, price, status, owner_type, created_by)
    values (trim(payload->>'name'), nullif(payload->>'category', ''), nullif(payload->>'description', ''),
            coalesce(array(select jsonb_array_elements_text(payload->'images')), '{}'), 0, 'draft', 'founder', auth.uid())
    returning id into v_product;
  elsif not exists (select 1 from products where id = v_product and owner_type = 'founder') then
    raise exception 'Product not found';
  end if;

  if coalesce(trim(payload->>'supplier_name'), '') <> '' then
    select id into v_supplier from suppliers where lower(name) = lower(trim(payload->>'supplier_name')) limit 1;
    if v_supplier is null then
      insert into suppliers (name) values (trim(payload->>'supplier_name')) returning id into v_supplier;
    end if;
  end if;

  insert into purchases (supplier_id, status, supplier_shipping, inbound_transport, storage_cost, other_costs, amount_paid, notes, created_by)
  values (v_supplier, 'ordered', coalesce((payload->>'shipping')::numeric, 0), coalesce((payload->>'transport')::numeric, 0),
          coalesce((payload->>'storage')::numeric, 0), coalesce((payload->>'other')::numeric, 0),
          coalesce(nullif(payload->>'amount_paid', '')::numeric, unit * qty), 'Added with "I bought goods"', auth.uid())
  returning id into v_purchase;
  insert into purchase_items (purchase_id, product_id, quantity, unit_price, quantity_received, quantity_damaged)
  values (v_purchase, v_product, qty, unit, qty, damaged);
  perform receive_purchase(v_purchase);

  update products set
    price = coalesce(nullif(payload->>'price', '')::numeric, price),
    packaging_cost = coalesce(nullif(payload->>'per_sale_cost', '')::numeric, packaging_cost),
    commission_type = case when payload ? 'commission_type' then nullif(payload->>'commission_type', '') else commission_type end,
    commission_value = case when not (payload ? 'commission_type') then commission_value
                            when nullif(payload->>'commission_type', '') is null then null
                            else (payload->>'commission_value')::numeric end,
    images = case when jsonb_array_length(coalesce(payload->'images', '[]')) > 0 and payload->>'product_id' is not null
                  then array(select jsonb_array_elements_text(payload->'images')) else images end,
    status = case when coalesce((payload->>'publish')::boolean, false) and coalesce(nullif(payload->>'price', '')::numeric, price) > 0 then 'published'
                  when status = 'out_of_stock' then 'published' else status end
  where id = v_product
  returning * into p;

  return jsonb_build_object('product_id', v_product, 'purchase_id', v_purchase, 'unit_cost', product_effective_cost(p),
                            'stock', p.stock_available, 'status', p.status);
end $$;

-- ---------- Offer pricing (the server decides what an offer costs) ----------
-- One "deal" = what a customer gets when they take the offer once.
create or replace function offer_deal(o offers, base numeric, normal numeric)
returns table (units int, price numeric, normal_value numeric)
language plpgsql stable as $$
declare cfg jsonb := coalesce(o.config, '{}'); gift_value numeric := 0;
begin
  case o.type
    when 'buy_x_get_y' then
      -- when the free item is a different product it is added as its own line, so only the paid units count here
      units := coalesce((cfg->>'buyQty')::int, 1) + case when coalesce(cfg->>'giftProductId', '') = '' then coalesce((cfg->>'freeQty')::int, 0) else 0 end;
      price := coalesce((cfg->>'buyQty')::int, 1) * base;
    when 'bundle' then
      units := greatest(1, coalesce((cfg->>'buyQty')::int, 1));
      price := coalesce((cfg->>'bundlePrice')::numeric, base * units);
    when 'fixed_off' then
      units := 1; price := greatest(0, base - coalesce((cfg->>'discountAmount')::numeric, 0));
    when 'order_bump', 'upsell' then
      units := 1; price := coalesce((cfg->>'bumpPrice')::numeric, base);
    when 'percent_off', 'flash', 'downsell', 'continuity' then
      units := 1; price := round(base * (1 - coalesce((cfg->>'discountPct')::numeric, 0) / 100), 2);
    else -- free_gift, free_delivery, payment_plan: normal price, benefit is elsewhere
      units := 1; price := base;
  end case;
  -- a free item from another product adds its normal price to what the deal is worth
  if o.type = 'buy_x_get_y' and coalesce(cfg->>'giftProductId', '') <> '' then
    select coalesce(nullif(g.normal_price, 0), g.price) * greatest(1, coalesce((cfg->>'freeQty')::int, 1))
      into gift_value from products g where g.id = (cfg->>'giftProductId')::uuid;
  end if;
  normal_value := units * coalesce(nullif(normal, 0), base) + coalesce(gift_value, 0);
  return next;
end $$;

create or replace function offer_is_live(o offers) returns boolean
language sql stable as $$
  select o.status = 'active'
     and (o.start_at is null or o.start_at <= now())
     and (o.end_at is null or o.end_at >= now())
     and (o.inventory_limit is null or o.units_used < o.inventory_limit);
$$;

-- Offers below the price floor cannot go live without a founder override and a reason.
create or replace function enforce_offer_floor() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p products%rowtype; d record; cost numeric; comm numeric; fee numeric; margin numeric;
begin
  if new.status <> 'active' or new.product_id is null then return new; end if;
  select * into p from products where id = new.product_id;
  select * into d from offer_deal(new, p.price, p.normal_price);
  cost := d.units * (product_effective_cost(p) + coalesce(p.packaging_cost, setting_num('default_packaging_cost')))
          + coalesce((new.config->>'giftCost')::numeric, 0)
          + coalesce((select (product_effective_cost(g) + coalesce(g.packaging_cost, setting_num('default_packaging_cost'))) * greatest(1, coalesce((new.config->>'freeQty')::int, 1))
                      from products g where new.type = 'buy_x_get_y' and coalesce(new.config->>'giftProductId','') <> '' and g.id = (new.config->>'giftProductId')::uuid), 0)
          + case when new.type = 'free_delivery' then setting_num('local_delivery_fee') else 0 end;
  comm := commission_for(p, d.price / greatest(d.units, 1), d.units);
  fee := case when p.owner_type = 'vendor' then d.price * setting_num('marketplace_fee_pct') / 100 else 0 end;
  margin := case when d.price > 0 then (d.price - cost - comm - fee) / d.price * 100 else -100 end;
  new.customer_price := d.price;
  new.normal_value := d.normal_value;
  if margin < setting_num('price_floor_margin_pct') then
    if auth.uid() is not null and not (is_founder() and new.floor_override and coalesce(new.override_reason, '') <> '') then
      raise exception 'This offer is below the price floor (margin %). A founder must override it with a reason.', round(margin, 1) || '%';
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'active' then
      perform log_audit('offer.floor_override', 'offers', new.id, null,
        jsonb_build_object('margin', round(margin, 1), 'price', d.price), new.override_reason);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_offer_floor on offers;
create trigger trg_offer_floor before insert or update on offers for each row execute function enforce_offer_floor();

-- What customers and resellers may see about offers: no costs, no economics.
create or replace view public_offers as
select o.id, o.name, o.category, o.type, o.product_id,
       (select g.name from products g where g.id = nullif(o.config->>'giftProductId','')::uuid) as gift_name,
       (o.config - 'giftCost' - 'bumpCost') as config,
       d.units, d.price as deal_price, d.normal_value,
       o.start_at, o.end_at, o.terms,
       case when o.inventory_limit is null then null else greatest(0, o.inventory_limit - o.units_used) end as remaining
from offers o
join products p on p.id = o.product_id
cross join lateral offer_deal(o, p.price, p.normal_price) d
where offer_is_live(o) and p.status = 'published';

-- One entry point for every sale: marketplace checkout, WhatsApp, phone, in person.
-- payload: { customer:{full_name,phone,email,province_id,district_id,area,address,instructions},
--            items:[{product_id, quantity, offer_id}], referral_code, source, channel, is_manual, notes }
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
  v_today date := lusaka_date(now());
  booked int;
  v_choices jsonb;
  v_store vendors%rowtype;
  v_campaign campaigns%rowtype;
  deal record;
  deals int;
  v_line numeric;
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

  -- delivery zone
  if (c->>'district_id') is not null then
    select is_local_zone into local_zone from districts where id = (c->>'district_id')::int;
  end if;
  if local_zone then fee := setting_num('local_delivery_fee'); end if;
  if setting_text('delivery_included') = 'true' then fee := 0; end if;

  insert into orders (customer_id, source, channel, seller_type, reseller_id, referral_code, province_id, district_id, area, address, instructions,
                      is_local, delivery_fee, delivery_fee_status, is_manual, notes, risk_flags, created_by)
  values (cust.id, v_source, v_channel, v_seller, rs.id, nullif(payload->>'referral_code',''), (c->>'province_id')::int, (c->>'district_id')::int,
          c->>'area', c->>'address', c->>'instructions', local_zone, fee, case when local_zone then 'confirmed' else 'pending' end,
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
    insert into order_items (order_id, product_id, offer_id, vendor_id, quantity, unit_price, unit_cost_snapshot, line_total, reserved_qty, choices, note, package_id, package_name)
    values (o.id, prod.id, off.id, prod.vendor_id, qty, v_line / qty, product_effective_cost(prod), v_line,
            case when prod.owner_type = 'founder' and prod.fulfilment = 'in_stock' then least(qty, greatest(prod.stock_available, 0)) else 0 end,
            v_choices, nullif(left(coalesce(item->>'note', ''), 300), ''), pkg.id, pkg.name);
    sub := sub + v_line;
    if prod.owner_type = 'founder' and prod.fulfilment = 'in_stock' then
      if prod.stock_available > 0 then
        perform apply_movement(prod.id, 'reserve', least(qty, prod.stock_available), 'Order ' || o.order_number, 'order', o.id);
      end if;
      if prod.stock_available < qty then
        flags := array_append(flags, 'not_enough_stock');
        update orders set risk_flags = flags where id = o.id;
      end if;
    end if;
  end loop;

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
  update orders set subtotal = sub, delivery_fee = fee, total = sub + fee,
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

-- Allowed order transitions (the state machine)
create or replace function order_transition_allowed(f order_status, t order_status) returns boolean
language sql immutable as $$
  select case
    when f = t then false
    when t = 'cancelled' then f not in ('completed','refunded','returned','cancelled')
    when t = 'fraud_review' then f not in ('completed','refunded')
    when f = 'pending' then t in ('confirmed','payment_pending','customer_unreachable','fraud_review')
    when f = 'customer_unreachable' then t in ('confirmed','pending')
    when f = 'confirmed' then t in ('payment_pending','paid','processing')
    when f = 'payment_pending' then t in ('paid','processing')
    when f = 'paid' then t in ('processing','ready_for_dispatch','refunded')
    when f = 'processing' then t in ('ready_for_dispatch','out_for_delivery')
    when f = 'ready_for_dispatch' then t in ('out_for_delivery')
    when f = 'out_for_delivery' then t in ('delivered','failed_delivery')
    when f = 'failed_delivery' then t in ('out_for_delivery','returned')
    when f = 'delivered' then t in ('completed','returned','refunded')
    when f = 'completed' then t in ('returned','refunded')
    when f = 'fraud_review' then t in ('confirmed','pending')
    else false end;
$$;

create or replace function set_order_status(p_order uuid, p_status order_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
  it record;
  fee_pct numeric;
  comm numeric;
  gross numeric;
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
        insert into settlements (vendor_id, order_id, order_number, gross, marketplace_fee, reseller_commission, net_payable, status)
        values (it.vendor_id, p_order, o.order_number, gross, round(gross * fee_pct / 100, 2),
                case when src = 'on_top' then comm else 0 end,
                round(gross - gross * fee_pct / 100 - case when src = 'on_top' then comm else 0 end, 2), 'pending');
      end if;
    end loop;

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
    update offers ofr set units_used = greatest(0, ofr.units_used - x.q)
    from (select offer_id, sum(quantity) q from order_items where order_id = p_order and offer_id is not null group by offer_id) x
    where ofr.id = x.offer_id;
    update commissions set status = 'reversed', notes = coalesce(notes,'') || ' Order ' || p_status where order_id = p_order and status <> 'paid';
    update settlements set status = 'cancelled' where order_id = p_order and status <> 'paid';
  end if;

  perform log_audit('order.status', 'orders', p_order, jsonb_build_object('status', o.status), jsonb_build_object('status', p_status), p_reason);
end $$;

-- Record a payment against an order (manual for V1; merchant integrations later use the same table)
create or replace function record_payment(p_order uuid, p_method text, p_amount numeric, p_reference text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into o from orders where id = p_order;
  insert into payments (order_id, method, amount, reference, status, verified_by) values (p_order, p_method, p_amount, p_reference, 'paid', auth.uid());
  if p_amount >= o.total then
    update orders set payment_status = 'paid' where id = p_order;
    if order_transition_allowed(o.status, 'paid') then perform set_order_status(p_order, 'paid', 'Payment recorded'); end if;
  else
    update orders set payment_status = 'confirmed' where id = p_order;
  end if;
  perform log_audit('payment.recorded', 'orders', p_order, null, jsonb_build_object('method', p_method, 'amount', p_amount, 'reference', p_reference));
end $$;

-- Commission lifecycle: pending → verified → approved → paid
create or replace function set_commission_status(p_id uuid, p_status commission_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c commissions%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into c from commissions where id = p_id for update;
  if c.status = 'paid' then raise exception 'Paid commissions cannot change'; end if;
  if p_status = 'verified' and c.eligible_at > now() then raise exception 'Grace period has not passed yet'; end if;
  update commissions set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end, notes = coalesce(p_reason, notes) where id = p_id;
  perform log_audit('commission.status', 'commissions', p_id, jsonb_build_object('status', c.status), jsonb_build_object('status', p_status), p_reason);
end $$;

create or replace function set_settlement_status(p_id uuid, p_status settlement_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s settlements%rowtype;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into s from settlements where id = p_id for update;
  if s.status = 'paid' then raise exception 'Paid settlements cannot change'; end if;
  update settlements set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end where id = p_id;
  perform log_audit('settlement.status', 'settlements', p_id, jsonb_build_object('status', s.status), jsonb_build_object('status', p_status), p_reason);
end $$;

-- Approve / reject partner applications
create or replace function review_application(p_table text, p_id uuid, p_status application_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_founder() then raise exception 'Only founders review applications'; end if;
  if p_table = 'vendors' then
    update vendors set status = p_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id returning user_id into uid;
    if p_status = 'approved' and uid is not null then update profiles set role = 'vendor' where id = uid and role = 'customer'; end if;
  elsif p_table = 'resellers' then
    update resellers set status = p_status, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id returning user_id into uid;
    if p_status = 'approved' then
      -- clean, readable link names: john → john-banda → john2, john3 …
      if (select code from resellers where id = p_id) is null then
        declare fname text; v_full text; cand text; k int := 2;
        begin
          select replace(make_slug(split_part(full_name, ' ', 1)), '-', ''), make_slug(full_name) into fname, v_full from resellers where id = p_id;
          fname := coalesce(fname, 'reseller'); v_full := coalesce(v_full, fname);
          cand := fname;
          if exists (select 1 from resellers where code = cand) then cand := v_full; end if;
          while exists (select 1 from resellers where code = cand) loop cand := fname || k; k := k + 1; end loop;
          update resellers set code = cand where id = p_id;
        end;
      end if;
      if uid is not null then update profiles set role = 'reseller' where id = uid and role = 'customer'; end if;
    end if;
  else
    raise exception 'Unknown application type';
  end if;
end $$;

-- Customer review (verified against the order's phone)
-- A short code so a customer can rate an order from a link without typing anything.
create or replace function review_link(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; code text;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  select * into o from orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  code := o.review_code;
  if code is null then
    code := lower(substr(translate(encode(gen_random_bytes(6), 'base64'), '0123456789+/=IOl', 'abcdefghjkmnpqrs'), 1, 4));
    update orders set review_code = code where id = p_order;
  end if;
  return o.order_number || '-' || code;
end $$;

-- Open a rating page from that link: shows what to rate, never the customer's details.
create or replace function review_open(p_link text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'first_name', split_part(coalesce(c.full_name, ''), ' ', 1),
    'delivered', o.status in ('delivered','completed'),
    'already', exists (select 1 from reviews r where r.order_id = o.id),
    'items', (select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', p.name, 'vendor', v.business_name))
              from order_items i join products p on p.id = i.product_id left join vendors v on v.id = i.vendor_id where i.order_id = o.id))
  from orders o left join customers c on c.id = o.customer_id
  where o.order_number = split_part(p_link, '-', 1)::int and o.review_code = split_part(p_link, '-', 2) and o.review_code is not null;
$$;

create or replace function review_submit(p_link text, p_ratings jsonb, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; cust customers%rowtype; it record;
begin
  select * into o from orders where order_number = split_part(p_link, '-', 1)::int and review_code = split_part(p_link, '-', 2) and review_code is not null;
  if not found then raise exception 'That rating link is not valid'; end if;
  if exists (select 1 from reviews where order_id = o.id) then raise exception 'This order has already been rated. Thank you!'; end if;
  select * into cust from customers where id = o.customer_id;
  for it in select * from order_items where order_id = o.id loop
    insert into reviews (order_id, product_id, vendor_id, customer_name, product_rating, vendor_rating, delivery_rating, marketplace_rating, comment, verified)
    values (o.id, it.product_id, it.vendor_id, coalesce(cust.full_name, 'Customer'), (p_ratings->>'product')::int, (p_ratings->>'vendor')::int,
            (p_ratings->>'delivery')::int, (p_ratings->>'marketplace')::int, nullif(p_comment, ''), o.status in ('delivered','completed'));
  end loop;
end $$;

create or replace function submit_review(p_order_number int, p_phone text, p_ratings jsonb, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; cust customers%rowtype; it record;
begin
  select * into o from orders where order_number = p_order_number;
  if not found then raise exception 'Order not found'; end if;
  select * into cust from customers where id = o.customer_id;
  if cust.phone <> norm_phone(p_phone) then raise exception 'Phone number does not match this order'; end if;
  for it in select * from order_items where order_id = o.id loop
    insert into reviews (order_id, product_id, vendor_id, customer_name, product_rating, vendor_rating, delivery_rating, marketplace_rating, comment, verified)
    values (o.id, it.product_id, it.vendor_id, cust.full_name, (p_ratings->>'product')::int, (p_ratings->>'vendor')::int,
            (p_ratings->>'delivery')::int, (p_ratings->>'marketplace')::int, p_comment, o.status in ('delivered','completed'));
  end loop;
end $$;

-- Public product view (never exposes cost)
create or replace view public_products as
select p.id, p.name, p.slug, p.category, p.description, p.benefits, p.faqs, p.images, p.price, p.normal_price,
       p.status, p.stock_available, p.owner_type, v.business_name as vendor_name,
       (select round(avg(product_rating),1) from reviews r where r.product_id = p.id and r.approved) as rating,
       (select count(*) from reviews r where r.product_id = p.id and r.approved) as review_count,
       p.vendor_id, p.fulfilment, p.lead_time_days, p.order_days, p.daily_limit, p.options, p.note_label, p.created_at,
       p.service_location, p.duration_text, p.time_slots, p.slot_capacity, v.slug as vendor_slug,
       p.offering_type, p.sales_model, p.page, p.commission_type, p.commission_value, p.featured_for_resellers,
       (select count(*) from product_packages pk where pk.product_id = p.id and pk.active) as package_count
from products p left join vendors v on v.id = p.vendor_id
where p.status in ('published','out_of_stock') and (p.vendor_id is null or v.status = 'approved');

-- Reseller earnings summary
create or replace function reseller_summary(p_reseller uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not coalesce(is_staff() or p_reseller = my_reseller_id(), false) then null else jsonb_build_object(
    'sales_today', (select count(*) from orders where reseller_id = p_reseller and lusaka_date(created_at) = lusaka_date(now()) and status not in ('cancelled','fraud_review')),
    'sales_month', (select count(*) from orders where reseller_id = p_reseller and date_trunc('month', created_at) = date_trunc('month', now()) and status not in ('cancelled','fraud_review')),
    'revenue_month', (select coalesce(sum(subtotal),0) from orders where reseller_id = p_reseller and date_trunc('month', created_at) = date_trunc('month', now()) and status not in ('cancelled','fraud_review')),
    'pending', (select coalesce(sum(amount),0) from commissions where reseller_id = p_reseller and status in ('pending','verified')),
    'approved', (select coalesce(sum(amount),0) from commissions where reseller_id = p_reseller and status = 'approved'),
    'paid', (select coalesce(sum(amount),0) from commissions where reseller_id = p_reseller and status = 'paid')
  ) end;
$$;

-- Founder dashboard numbers
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
    'delivery_costs', (select coalesce(sum(delivery_cost + fuel_cost),0) from deliveries d join o on o.id = d.order_id),
    'delivery_income', (select coalesce(sum(delivery_fee),0) from o),
    'ad_spend', (select coalesce(sum(amount),0) from marketing_spend where spent_on between p_from and p_to),
    'expenses', (select coalesce(sum(amount),0) from expenses where spent_on between p_from and p_to),
    'pending_orders', (select count(*) from orders where status = 'pending'),
    'pending_deliveries', (select count(*) from orders where status in ('processing','ready_for_dispatch','out_for_delivery')),
    'pending_payments', (select coalesce(sum(total),0) from orders where payment_status = 'pending' and status not in ('cancelled','fraud_review')),
    'commissions_owed', (select coalesce(sum(amount),0) from commissions where status in ('verified','approved')),
    'vendor_payables', (select coalesce(sum(net_payable),0) from settlements where status in ('eligible','approved')),
    'inventory_value', (select coalesce(sum(stock_available * product_effective_cost(p)),0) from products p where owner_type = 'founder'),
    'low_stock', (select count(*) from products where owner_type = 'founder' and status in ('published','out_of_stock') and stock_available <= 3),
    'waiting_demand', (select count(*) from stock_requests where not fulfilled),
    'contributions', (select coalesce(sum(amount),0) from founder_contributions),
    'withdrawals', (select coalesce(sum(amount),0) from founder_withdrawals),
    'refund_count', (select count(*) from orders where lusaka_date(created_at) between p_from and p_to and status in ('refunded','returned')),
    'cod_failed', (select count(*) from orders where lusaka_date(created_at) between p_from and p_to and status in ('failed_delivery','customer_unreachable'))
  ) end;
$$;


-- Which times are already taken for a service on a date (counts only).
create or replace function booked_slots(p_product uuid, p_date date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slots', coalesce((select jsonb_object_agg(t, n) from (
       select i.choices->>'Time' t, sum(i.quantity) n from order_items i join orders o on o.id = i.order_id
       where i.product_id = p_product and o.needed_by = p_date and i.choices ? 'Time'
         and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review') group by 1) x), '{}'),
    'day', (select coalesce(sum(i.quantity), 0) from order_items i join orders o on o.id = i.order_id
       where i.product_id = p_product and o.needed_by = p_date and o.status not in ('cancelled', 'refunded', 'returned', 'fraud_review')),
    'capacity', (select slot_capacity from products where id = p_product),
    'daily_limit', (select daily_limit from products where id = p_product));
$$;

-- ---------- Vendor order desk ----------
-- Vendors see the customer's name and area straight away; phone and address once ZaMarket has confirmed the order.
-- Customers still pay ZaMarket, and vendors never get raw access to the customers or orders tables.
create or replace function vendor_orders_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid := my_vendor_id();
begin
  if v is null then raise exception 'Not allowed'; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'sort'))
    from (
      select jsonb_build_object(
        'order_id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'needed_by', o.needed_by,
        'status', o.status, 'district', d.name, 'area', o.area,
        'customer', c.full_name,
        'repeat', (select count(distinct x.id) from orders x join order_items xi on xi.order_id = x.id
                   where x.customer_id = o.customer_id and xi.vendor_id = v and x.id <> o.id and x.status not in ('cancelled','fraud_review')),
        'contact', case when o.status in ('confirmed','payment_pending','paid','processing','ready_for_dispatch','out_for_delivery','delivered','completed','failed_delivery')
                        then jsonb_build_object('phone', c.phone, 'address', o.address, 'instructions', o.instructions) end,
        'sort', coalesce(o.needed_by::text, to_char(lusaka_date(o.created_at), 'YYYY-MM-DD')) || o.order_number,
        'cancel_requested', coalesce(o.notes, '') like '%[Vendor requested cancellation]%',
        'items', (select jsonb_agg(jsonb_build_object('id', i.id, 'name', p.name, 'quantity', i.quantity, 'line_total', i.line_total,
                                                       'choices', i.choices, 'note', i.note, 'vendor_status', i.vendor_status) order by p.name)
                  from order_items i join products p on p.id = i.product_id where i.order_id = o.id and i.vendor_id = v),
        'total', (select sum(i.line_total) from order_items i where i.order_id = o.id and i.vendor_id = v)
      ) as x
      from orders o left join districts d on d.id = o.district_id left join customers c on c.id = o.customer_id
      where exists (select 1 from order_items i where i.order_id = o.id and i.vendor_id = v)
      order by o.created_at desc limit 500
    ) t), '[]');
end $$;

-- Vendor progress on their items: new → preparing → ready (staff mark collected)
create or replace function vendor_set_item_status(p_item uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare it order_items%rowtype; o orders%rowtype;
begin
  select * into it from order_items where id = p_item for update;
  if not found then raise exception 'Not found'; end if;
  if not (is_staff() or it.vendor_id = my_vendor_id()) then raise exception 'Not allowed'; end if;
  if p_status not in ('new', 'preparing', 'ready', 'collected') then raise exception 'Unknown status'; end if;
  if p_status = 'collected' and not is_staff() then raise exception 'The marketplace team marks items as collected'; end if;
  select * into o from orders where id = it.order_id;
  if o.status in ('cancelled', 'refunded', 'fraud_review') then raise exception 'This order is %', o.status; end if;
  if not is_staff() and o.status in ('pending', 'customer_unreachable') and p_status <> 'new' then
    raise exception 'Wait until we confirm this order with the customer before you start';
  end if;
  update order_items set vendor_status = p_status where id = p_item;
  perform log_audit('order_item.vendor_status', 'orders', it.order_id, jsonb_build_object('status', it.vendor_status), jsonb_build_object('status', p_status, 'item', p_item));
end $$;

-- Public store pages: who the seller is, never how to reach them outside ZaMarket.
create or replace view public_vendors as
select v.id, v.business_name, v.category, v.description, split_part(coalesce(v.location, ''), ',', 1) as town,
       (select round(avg(r.vendor_rating), 1) from reviews r where r.vendor_id = v.id and r.approved) as rating,
       (select count(*) from reviews r where r.vendor_id = v.id and r.approved) as review_count,
       (select count(*) from products p where p.vendor_id = v.id and p.status = 'published') as product_count
, v.slug
from vendors v where v.status = 'approved';

create or replace function vendor_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales', coalesce((select sum(i.line_total) from order_items i join orders o on o.id = i.order_id where i.vendor_id = my_vendor_id() and o.status not in ('cancelled','refunded','returned','fraud_review')), 0),
    'units', coalesce((select sum(i.quantity) from order_items i join orders o on o.id = i.order_id where i.vendor_id = my_vendor_id() and o.status not in ('cancelled','refunded','returned','fraud_review')), 0),
    'returns', (select count(distinct o.id) from order_items i join orders o on o.id = i.order_id where i.vendor_id = my_vendor_id() and o.status in ('refunded','returned')),
    'to_make', (select count(*) from order_items i join orders o on o.id = i.order_id where i.vendor_id = my_vendor_id() and i.vendor_status in ('new','preparing') and o.status not in ('cancelled','refunded','returned','fraud_review','completed','delivered')),
    'rating', (select round(avg(vendor_rating), 1) from reviews where vendor_id = my_vendor_id() and approved),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', vendor_rating, 'comment', comment, 'created_at', created_at) order by created_at desc) from (select * from reviews where vendor_id = my_vendor_id() order by created_at desc limit 5) r), '[]')
  );
$$;

-- ---------- Marketing: campaign links ----------
-- /go/<code> → counts the visit and returns where to send the person (only paths on this site).
create or replace function go_link(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c campaigns%rowtype; dest text;
begin
  select * into c from campaigns where code = lower(p_code);
  if not found then return jsonb_build_object('path', '/', 'found', false); end if;
  dest := case when c.destination ~ '^/[A-Za-z0-9/_?=&.%-]*$' and c.destination !~ '//' then c.destination else '/' end;
  if c.status = 'active' and (c.ends_on is null or c.ends_on >= lusaka_date(now())) then
    update campaigns set visits = visits + 1 where id = c.id;
    return jsonb_build_object('path', dest, 'found', true, 'code', c.code, 'live', true);
  end if;
  return jsonb_build_object('path', dest, 'found', true, 'code', c.code, 'live', false);
end $$;

create or replace function validate_campaign() returns trigger
language plpgsql as $$
begin
  new.code := make_slug(new.code);
  if new.code is null then raise exception 'Give the link a short name, e.g. amina-cakes'; end if;
  if new.destination !~ '^/' or new.destination ~ '//' then raise exception 'The destination must be a page on ZaMarket, starting with /'; end if;
  if new.owner_type = 'vendor' and new.vendor_id is null then raise exception 'Choose which vendor this campaign is for'; end if;
  return new;
end $$;
drop trigger if exists trg_validate_campaign on campaigns;
create trigger trg_validate_campaign before insert or update on campaigns for each row execute function validate_campaign();

create or replace function campaign_stats(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_market() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'status', c.status, 'platform', c.platform, 'goal', c.goal,
      'owner_type', c.owner_type, 'vendor', v.business_name, 'destination', c.destination, 'budget', c.budget, 'visits', c.visits, 'created_at', c.created_at,
      'orders', (select count(*) from orders o where o.campaign_id = c.id and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to),
      'channel', campaign_channel(c),
      'leads', (select count(*) from leads l where l.campaign_id = c.id and lusaka_date(l.created_at) between p_from and p_to),
      'engaged', (select count(*) from leads l where l.campaign_id = c.id and l.stage in ('engaged','won') and lusaka_date(l.created_at) between p_from and p_to),
      'completed', (select count(*) from orders o where o.campaign_id = c.id and o.status = 'completed' and lusaka_date(o.created_at) between p_from and p_to),
      'revenue', (select coalesce(sum(o.subtotal), 0) from orders o where o.campaign_id = c.id and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to),
      'spend', (select coalesce(sum(m.amount), 0) from marketing_spend m where m.campaign_id = c.id and m.spent_on between p_from and p_to),
      'applications', case when c.goal = 'resellers' then (select count(*) from resellers r where lusaka_date(r.created_at) between p_from and p_to)
                           when c.goal = 'vendors' then (select count(*) from vendors vv where lusaka_date(vv.created_at) between p_from and p_to) end
    ) as x
    from campaigns c left join vendors v on v.id = c.vendor_id) t), '[]');
end $$;

-- Vendors: how sales from their own store link are doing
create or replace function vendor_store_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slug', (select slug from vendors where id = my_vendor_id()),
    'own_orders', (select count(*) from orders where store_vendor_id = my_vendor_id() and status not in ('cancelled','fraud_review')),
    'own_sales', (select coalesce(sum(i.line_total), 0) from orders o join order_items i on i.order_id = o.id and i.vendor_id = my_vendor_id()
                  where o.store_vendor_id = my_vendor_id() and o.status not in ('cancelled','fraud_review')),
    'own_fee_pct', setting_num('own_audience_fee_pct'),
    'normal_fee_pct', coalesce((select fee_pct_override from vendors where id = my_vendor_id()), setting_num('marketplace_fee_pct'))
  );
$$;

-- ---------- Earnings tracker ----------
-- Dates are Zambian local dates (Africa/Lusaka).
-- What one completed order actually left the marketplace with.
create or replace function order_profit(p_order uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and not is_staff() then null else o.subtotal + o.delivery_fee
    - coalesce((select sum(oi.unit_cost_snapshot * oi.quantity) from order_items oi join products p on p.id = oi.product_id
                where oi.order_id = o.id and p.owner_type = 'founder'), 0)
    - coalesce((select sum(net_payable) from settlements st where st.order_id = o.id and st.status <> 'cancelled'), 0)
    - coalesce((select sum(amount) from commissions c where c.order_id = o.id and c.status not in ('rejected','reversed')), 0)
    - coalesce((select sum(delivery_cost + fuel_cost) from deliveries d where d.order_id = o.id), 0) end
  from orders o where o.id = p_order;
$$;

create or replace function earnings_guard(p_scope text, p_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_scope = 'business' and is_staff() then return; end if;
  if p_scope = 'reseller' and (is_staff() or p_id = my_reseller_id()) then return; end if;
  if p_scope = 'vendor' and (is_staff() or p_id = my_vendor_id()) then return; end if;
  raise exception 'Not allowed';
end $$;

-- One row per day/week/month in the range.
-- business: sales = order value placed, earned = profit on completed orders minus expenses & ads,
--           paid = cash received, pending = unpaid order value, costs = expenses + ads
-- reseller: sales = value they sold, earned = commission, paid = commission paid, pending = not yet paid
-- vendor:   sales = value of their items sold, earned = payout owed, paid = paid out, pending = not yet paid, costs = marketplace fees
create or replace function earnings_series(p_scope text, p_id uuid, p_from date, p_to date, p_bucket text default 'day')
returns table (bucket date, orders bigint, units bigint, sales numeric, earned numeric, paid numeric, pending numeric, costs numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare b text := case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end;
begin
  perform earnings_guard(p_scope, p_id);
  if p_to - p_from > 1100 then raise exception 'Choose a range of 3 years or less'; end if;
  return query
  with s as (
    select generate_series(date_trunc(b, p_from::timestamp), date_trunc(b, p_to::timestamp), ('1 ' || b)::interval)::date as bk
  ),
  o as (  -- orders placed in range that count
    select date_trunc(b, lusaka_date(x.created_at)::timestamp)::date as bk, x.*
    from orders x
    where lusaka_date(x.created_at) between p_from and p_to and x.status not in ('cancelled', 'fraud_review')
      and (p_scope = 'business'
           or (p_scope = 'reseller' and x.reseller_id = p_id)
           or (p_scope = 'vendor' and exists (select 1 from order_items vi where vi.order_id = x.id and vi.vendor_id = p_id)))
  ),
  oi as (
    select o.bk, i.quantity, i.line_total from o join order_items i on i.order_id = o.id
    where p_scope <> 'vendor' or i.vendor_id = p_id
  ),
  placed as (
    select bk, count(distinct id) as orders, sum(subtotal) filter (where payment_status <> 'paid') as unpaid from o group by bk
  ),
  lines as (select bk, sum(quantity) as units, sum(line_total) as sales from oi group by bk),
  money as (
    -- business
    select date_trunc(b, lusaka_date(x.completed_at)::timestamp)::date as bk, sum(order_profit(x.id)) as earned, 0::numeric as paid, 0::numeric as pend, 0::numeric as costs
      from orders x where p_scope = 'business' and x.status = 'completed' and lusaka_date(x.completed_at) between p_from and p_to group by 1
    union all
    select date_trunc(b, lusaka_date(py.created_at)::timestamp)::date, 0, sum(py.amount), 0, 0
      from payments py where p_scope = 'business' and lusaka_date(py.created_at) between p_from and p_to group by 1
    union all
    select date_trunc(b, e.spent_on::timestamp)::date, -sum(e.amount), 0, 0, sum(e.amount)
      from expenses e where p_scope = 'business' and e.spent_on between p_from and p_to group by 1
    union all
    select date_trunc(b, m.spent_on::timestamp)::date, -sum(m.amount), 0, 0, sum(m.amount)
      from marketing_spend m where p_scope = 'business' and m.spent_on between p_from and p_to group by 1
    -- reseller
    union all
    select date_trunc(b, lusaka_date(c.created_at)::timestamp)::date, sum(c.amount), 0,
           sum(c.amount) filter (where c.status in ('pending', 'verified', 'approved')), 0
      from commissions c where p_scope = 'reseller' and c.reseller_id = p_id and c.status not in ('rejected', 'reversed')
        and lusaka_date(c.created_at) between p_from and p_to group by 1
    union all
    select date_trunc(b, lusaka_date(c.paid_at)::timestamp)::date, 0, sum(c.amount), 0, 0
      from commissions c where p_scope = 'reseller' and c.reseller_id = p_id and c.status = 'paid'
        and lusaka_date(c.paid_at) between p_from and p_to group by 1
    -- vendor
    union all
    select date_trunc(b, lusaka_date(st.created_at)::timestamp)::date, sum(st.net_payable), 0,
           sum(st.net_payable) filter (where st.status in ('pending', 'eligible', 'approved')), sum(st.marketplace_fee)
      from settlements st where p_scope = 'vendor' and st.vendor_id = p_id and st.status <> 'cancelled'
        and lusaka_date(st.created_at) between p_from and p_to group by 1
    union all
    select date_trunc(b, lusaka_date(st.paid_at)::timestamp)::date, 0, sum(st.net_payable), 0, 0
      from settlements st where p_scope = 'vendor' and st.vendor_id = p_id and st.status = 'paid'
        and lusaka_date(st.paid_at) between p_from and p_to group by 1
  ),
  m as (select bk, sum(earned) earned, sum(paid) paid, sum(pend) pend, sum(costs) costs from money group by bk)
  select s.bk,
         coalesce(placed.orders, 0), coalesce(lines.units, 0)::bigint, round(coalesce(lines.sales, 0), 2),
         round(coalesce(m.earned, 0), 2), round(coalesce(m.paid, 0), 2),
         round(case when p_scope = 'business' then coalesce(placed.unpaid, 0) else coalesce(m.pend, 0) end, 2),
         round(coalesce(m.costs, 0), 2)
  from s
  left join placed on placed.bk = s.bk
  left join lines on lines.bk = s.bk
  left join m on m.bk = s.bk
  order by s.bk;
end $$;

-- The records behind the chart, newest first.
create or replace function earnings_records(p_scope text, p_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform earnings_guard(p_scope, p_id);
  if p_scope = 'business' then
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') into r from (
      select jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'status', o.status, 'payment_status', o.payment_status,
        'customer', c.full_name, 'channel', o.channel, 'seller', coalesce(rs.full_name, 'Founder'),
        'items', (select string_agg(i.quantity || ' × ' || p.name, ', ') from order_items i join products p on p.id = i.product_id where i.order_id = o.id),
        'amount', o.total, 'earned', case when o.status = 'completed' then round(order_profit(o.id), 2) end) as x
      from orders o left join customers c on c.id = o.customer_id left join resellers rs on rs.id = o.reseller_id
      where lusaka_date(o.created_at) between p_from and p_to
      order by o.created_at desc limit 2000) t;
  elsif p_scope = 'reseller' then
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') into r from (
      select jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'status', o.status,
        'customer', split_part(c.full_name, ' ', 1), 'channel', o.channel,
        'items', (select string_agg(i.quantity || ' × ' || p.name, ', ') from order_items i join products p on p.id = i.product_id where i.order_id = o.id),
        'amount', o.subtotal,
        'earned', (select sum(cm.amount) from commissions cm where cm.order_id = o.id),
        'earning_status', (select cm.status from commissions cm where cm.order_id = o.id order by cm.created_at desc limit 1),
        'paid_at', (select max(cm.paid_at) from commissions cm where cm.order_id = o.id)) as x
      from orders o left join customers c on c.id = o.customer_id
      where o.reseller_id = p_id and lusaka_date(o.created_at) between p_from and p_to
      order by o.created_at desc limit 2000) t;
  else
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]') into r from (
      select jsonb_build_object(
        'id', o.id, 'order_number', o.order_number, 'created_at', o.created_at, 'status', o.status,
        'items', (select string_agg(i.quantity || ' × ' || p.name, ', ') from order_items i join products p on p.id = i.product_id where i.order_id = o.id and i.vendor_id = p_id),
        'amount', (select sum(i.line_total) from order_items i where i.order_id = o.id and i.vendor_id = p_id),
        'fee', (select sum(st.marketplace_fee) from settlements st where st.order_id = o.id and st.vendor_id = p_id and st.status <> 'cancelled'),
        'earned', (select sum(st.net_payable) from settlements st where st.order_id = o.id and st.vendor_id = p_id and st.status <> 'cancelled'),
        'earning_status', (select st.status from settlements st where st.order_id = o.id and st.vendor_id = p_id order by st.created_at desc limit 1),
        'paid_at', (select max(st.paid_at) from settlements st where st.order_id = o.id and st.vendor_id = p_id)) as x
      from orders o
      where exists (select 1 from order_items i where i.order_id = o.id and i.vendor_id = p_id)
        and lusaka_date(o.created_at) between p_from and p_to
      order by o.created_at desc limit 2000) t;
  end if;
  return r;
end $$;

-- Founders: how every reseller and vendor is doing in a period.
create or replace function partner_leaderboard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'resellers', coalesce((select jsonb_agg(x order by (x->>'sales')::numeric desc) from (
      select jsonb_build_object('id', r.id, 'name', r.full_name, 'code', r.code, 'status', r.status,
        'orders', (select count(*) from orders o where o.reseller_id = r.id and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to),
        'sales', (select coalesce(sum(o.subtotal), 0) from orders o where o.reseller_id = r.id and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to),
        'earned', (select coalesce(sum(c.amount), 0) from commissions c where c.reseller_id = r.id and c.status not in ('rejected','reversed') and lusaka_date(c.created_at) between p_from and p_to),
        'paid', (select coalesce(sum(c.amount), 0) from commissions c where c.reseller_id = r.id and c.status = 'paid' and lusaka_date(c.paid_at) between p_from and p_to)) as x
      from resellers r where r.status in ('approved', 'suspended')) t), '[]'),
    'vendors', coalesce((select jsonb_agg(x order by (x->>'sales')::numeric desc) from (
      select jsonb_build_object('id', v.id, 'name', v.business_name, 'status', v.status,
        'orders', (select count(distinct i.order_id) from order_items i join orders o on o.id = i.order_id where i.vendor_id = v.id and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to),
        'sales', (select coalesce(sum(i.line_total), 0) from order_items i join orders o on o.id = i.order_id where i.vendor_id = v.id and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to),
        'earned', (select coalesce(sum(st.net_payable), 0) from settlements st where st.vendor_id = v.id and st.status <> 'cancelled' and lusaka_date(st.created_at) between p_from and p_to),
        'fees', (select coalesce(sum(st.marketplace_fee), 0) from settlements st where st.vendor_id = v.id and st.status <> 'cancelled' and lusaka_date(st.created_at) between p_from and p_to)) as x
      from vendors v where v.status in ('approved', 'suspended')) t), '[]')
  );
end $$;


-- =====================================================================
-- Marketing department: leads, outreach, content, lead magnets, referrals
-- =====================================================================

-- Which of the four ways of getting customers a campaign belongs to
create or replace function campaign_channel(c campaigns) returns text
language sql immutable as $$
  select coalesce(c.channel, case
    when c.platform in ('meta', 'google') then 'paid'
    when c.platform in ('instagram', 'facebook', 'tiktok', 'youtube', 'print') then 'content'
    when c.platform in ('whatsapp') then 'warm'
    when c.platform in ('outreach') then 'cold'
    when c.platform in ('referral') then 'referral'
    else 'other' end);
$$;

-- Clean, readable codes: chanda → chanda-mulenga → chanda2
create or replace function clean_code(p_first text, p_full text, p_taken text) returns text
language plpgsql stable as $$
declare f text := coalesce(nullif(replace(make_slug(p_first), '-', ''), ''), 'friend'); v_full text := coalesce(make_slug(p_full), f); cand text := f; k int := 2; hit boolean;
begin
  loop
    execute format('select exists (select 1 from %s where code = $1)', p_taken) into hit using cand;
    exit when not hit;
    if cand = f and v_full <> f then cand := v_full; else cand := f || k; k := k + 1; end if;
  end loop;
  return cand;
end $$;

-- Create or refresh an open lead for a phone number (one open lead per person)
create or replace function upsert_lead(p_name text, p_phone text, p_channel text, p_interest text,
  p_campaign uuid default null, p_magnet uuid default null, p_vendor uuid default null, p_product uuid default null, p_email text default null, p_source text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_phone text := norm_phone(p_phone); v_id uuid;
begin
  if length(v_phone) < 10 then return null; end if;
  select id into v_id from leads where phone = v_phone and stage in ('new','contacted','engaged');
  if v_id is null then
    insert into leads (name, phone, email, channel, interest, campaign_id, magnet_id, vendor_id, product_id, source, stage)
    values (nullif(p_name, ''), v_phone, nullif(p_email, ''), coalesce(p_channel, 'other'), p_interest, p_campaign, p_magnet, p_vendor, p_product, p_source, 'new')
    returning id into v_id;
    insert into lead_activities (lead_id, kind, note) values (v_id, 'system', 'New lead: ' || coalesce(p_interest, p_source, 'enquiry'));
  else
    update leads set name = coalesce(nullif(p_name, ''), name), email = coalesce(nullif(p_email, ''), email),
      interest = coalesce(p_interest, interest), campaign_id = coalesce(campaign_id, p_campaign), magnet_id = coalesce(magnet_id, p_magnet),
      vendor_id = coalesce(vendor_id, p_vendor), product_id = coalesce(product_id, p_product), updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

-- Checkout: someone typed their name and phone but may not finish. Becomes a lead to follow up.
create or replace function capture_checkout_lead(p_name text, p_phone text, p_items text, p_campaign_code text default null, p_store text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c campaigns%rowtype; v uuid;
begin
  if length(norm_phone(p_phone)) < 10 or coalesce(p_name, '') = '' then return; end if;
  if exists (select 1 from customers cu join orders o on o.customer_id = cu.id where cu.phone = norm_phone(p_phone) and o.created_at > now() - interval '15 minutes') then return; end if;
  if coalesce(p_campaign_code, '') <> '' then select * into c from campaigns where code = lower(p_campaign_code); end if;
  if coalesce(p_store, '') <> '' then select id into v from vendors where slug = lower(p_store); end if;
  perform upsert_lead(left(p_name, 80), p_phone, case when c.id is not null then campaign_channel(c) else 'organic' end,
                      left('Started checkout: ' || coalesce(p_items, ''), 200), c.id, null, coalesce(c.vendor_id, v), null, null, 'checkout');
end $$;

-- "Tell me when it's back" requests are leads too
create or replace function stock_request_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform upsert_lead(new.customer_name, new.phone, 'organic',
    'Wants ' || new.quantity || ' × ' || (select name from products where id = new.product_id) || ' when back in stock',
    null, null, (select vendor_id from products where id = new.product_id), new.product_id, null, 'stock_request');
  return new;
end $$;
drop trigger if exists trg_stock_request_lead on stock_requests;
create trigger trg_stock_request_lead after insert on stock_requests for each row execute function stock_request_lead();

-- Log a call / message and move the lead along
create or replace function log_lead_activity(p_lead uuid, p_kind text, p_outcome text, p_note text, p_next date default null)
returns void language plpgsql security definer set search_path = public as $$
declare l leads%rowtype; new_stage text;
begin
  select * into l from leads where id = p_lead for update;
  if not found then raise exception 'Lead not found'; end if;
  if not (sees_all_leads() or (can_market() and (l.owner_id = auth.uid() or l.owner_id is null))) then raise exception 'Not allowed'; end if;
  insert into lead_activities (lead_id, user_id, kind, outcome, note) values (p_lead, auth.uid(), p_kind, nullif(p_outcome, ''), nullif(p_note, ''));
  new_stage := case
    when p_outcome = 'ordered' then 'won'
    when p_outcome in ('not_interested', 'wrong_number') then 'lost'
    when p_outcome in ('interested', 'follow_up') then 'engaged'
    when p_kind not in ('note', 'system') and l.stage = 'new' then 'contacted'
    else l.stage end;
  update leads set stage = new_stage,
    owner_id = coalesce(owner_id, case when p_kind not in ('note','system') then auth.uid() end),
    last_contact_at = case when p_kind not in ('note', 'system') then now() else last_contact_at end,
    next_follow_up = case when new_stage in ('won', 'lost') then null when p_next is not null then p_next else next_follow_up end,
    lost_reason = case when new_stage = 'lost' then coalesce(nullif(p_note, ''), replace(p_outcome, '_', ' ')) else lost_reason end,
    updated_at = now()
  where id = p_lead;
end $$;

-- Lead magnets people can see (never the download link or voucher until they sign up)
create or replace view public_magnets as
select m.id, m.slug, m.name, m.format, m.headline, m.description, m.bullets, m.cta_text, m.delivery_type, m.audience,
       v.business_name as vendor_name, v.slug as vendor_slug, p.name as product_name, p.slug as product_slug
from lead_magnets m left join vendors v on v.id = m.vendor_id left join products p on p.id = m.product_id
where m.status = 'live';

create or replace function view_magnet(p_slug text) returns void
language sql security definer set search_path = public as $$
  update lead_magnets set views = views + 1 where slug = lower(p_slug) and status = 'live';
$$;

create or replace function claim_magnet(p_slug text, p_name text, p_phone text, p_email text default null, p_campaign_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m lead_magnets%rowtype; c campaigns%rowtype;
begin
  select * into m from lead_magnets where slug = lower(p_slug) and status = 'live';
  if not found then raise exception 'This offer has ended'; end if;
  if coalesce(p_name, '') = '' then raise exception 'Please enter your name'; end if;
  if length(norm_phone(p_phone)) < 10 then raise exception 'Please enter a full phone number, e.g. 0977 123 456'; end if;
  if coalesce(p_campaign_code, '') <> '' then select * into c from campaigns where code = lower(p_campaign_code); end if;
  perform upsert_lead(left(p_name, 80), p_phone, case when c.id is not null then campaign_channel(c) when m.campaign_id is not null then (select campaign_channel(x) from campaigns x where x.id = m.campaign_id) else 'content' end,
                      'Claimed: ' || m.name, coalesce(c.id, m.campaign_id), m.id, m.vendor_id, m.product_id, left(p_email, 120), 'lead_magnet');
  return jsonb_build_object('type', m.delivery_type, 'value', m.delivery_value, 'name', m.name);
end $$;

-- Customer invites: a clean link per customer, e.g. /invite/chanda
create or replace function get_invite(p_phone text, p_order_number int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; cu customers%rowtype; r referrals%rowtype;
begin
  select * into o from orders where order_number = p_order_number;
  if not found then raise exception 'Order not found'; end if;
  select * into cu from customers where id = o.customer_id;
  if cu.phone <> norm_phone(p_phone) then raise exception 'That phone number does not match this order'; end if;
  select * into r from referrals where referrer_customer_id = cu.id and order_id is null and code is not null limit 1;
  if not found then
    insert into referrals (referrer_name, referrer_phone, referrer_customer_id, code, status, reward)
    values (cu.full_name, cu.phone, cu.id, clean_code(split_part(cu.full_name, ' ', 1), cu.full_name, 'referrals'), 'created', setting_num('referral_reward'))
    returning * into r;
  end if;
  return jsonb_build_object('code', r.code, 'reward', setting_num('referral_reward'), 'name', split_part(cu.full_name, ' ', 1));
end $$;

create or replace function invite_info(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', split_part(referrer_name, ' ', 1), 'found', true)
  from referrals where code = lower(p_code) and order_id is null limit 1;
$$;

-- Vendors: results of campaigns ZaMarket runs for them
create or replace function vendor_campaigns() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'code', c.code, 'status', c.status, 'platform', c.platform, 'starts_on', c.starts_on, 'ends_on', c.ends_on,
    'visits', c.visits,
    'leads', (select count(*) from leads l where l.campaign_id = c.id),
    'engaged', (select count(*) from leads l where l.campaign_id = c.id and l.stage in ('engaged','won')),
    'orders', (select count(*) from orders o where o.campaign_id = c.id and o.status not in ('cancelled','fraud_review')),
    'sales', (select coalesce(sum(i.line_total), 0) from orders o join order_items i on i.order_id = o.id and i.vendor_id = c.vendor_id where o.campaign_id = c.id and o.status not in ('cancelled','fraud_review')),
    'spend', (select coalesce(sum(amount), 0) from marketing_spend m where m.campaign_id = c.id)
  ) order by c.created_at desc), '[]')
  from campaigns c where c.vendor_id = my_vendor_id() and my_vendor_id() is not null;
$$;

-- The marketing overview
create or replace function marketing_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ch text[] := array['warm','content','cold','paid','referral','reseller','organic','other'];
begin
  if not can_market() then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'leads', (select count(*) from leads where lusaka_date(created_at) between p_from and p_to),
    'engaged', (select count(*) from leads where lusaka_date(created_at) between p_from and p_to and stage in ('engaged','won')),
    'won', (select count(*) from leads where stage = 'won' and lusaka_date(updated_at) between p_from and p_to),
    'lost', (select count(*) from leads where stage = 'lost' and lusaka_date(updated_at) between p_from and p_to),
    'open', (select count(*) from leads where stage in ('new','contacted','engaged')),
    'due', (select count(*) from leads where stage in ('new','contacted','engaged') and next_follow_up <= lusaka_date(now())),
    'untouched', (select count(*) from leads where stage = 'new' and last_contact_at is null),
    'marketing_orders', (select count(*) from orders where lusaka_date(created_at) between p_from and p_to and status not in ('cancelled','fraud_review')
                          and (campaign_id is not null or invite_code is not null or reseller_id is not null or store_vendor_id is not null
                               or exists (select 1 from leads l where l.order_id = orders.id))),
    'marketing_sales', (select coalesce(sum(subtotal), 0) from orders where lusaka_date(created_at) between p_from and p_to and status not in ('cancelled','fraud_review')
                          and (campaign_id is not null or invite_code is not null or reseller_id is not null or store_vendor_id is not null
                               or exists (select 1 from leads l where l.order_id = orders.id))),
    'all_sales', (select coalesce(sum(subtotal), 0) from orders where lusaka_date(created_at) between p_from and p_to and status not in ('cancelled','fraud_review')),
    'new_customers', (select count(*) from customers cu where lusaka_date(cu.created_at) between p_from and p_to
                        and exists (select 1 from orders o where o.customer_id = cu.id and o.status not in ('cancelled','fraud_review'))),
    'spend', (select coalesce(sum(amount), 0) from marketing_spend where spent_on between p_from and p_to),
    'visits', (select coalesce(sum(visits), 0) from campaigns),
    'content', (select count(*) from content_posts where posted_on between p_from and p_to),
    'channels', (select jsonb_agg(jsonb_build_object(
        'channel', x,
        'leads', (select count(*) from leads l where l.channel = x and lusaka_date(l.created_at) between p_from and p_to),
        'engaged', (select count(*) from leads l where l.channel = x and l.stage in ('engaged','won') and lusaka_date(l.created_at) between p_from and p_to),
        'won', (select count(*) from leads l where l.channel = x and l.stage = 'won' and lusaka_date(l.updated_at) between p_from and p_to),
        'orders', case
            when x = 'reseller' then (select count(*) from orders o where o.reseller_id is not null and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to)
            when x = 'referral' then (select count(*) from orders o where o.invite_code is not null and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to)
            else (select count(*) from orders o join campaigns c on c.id = o.campaign_id where campaign_channel(c) = x and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to) end,
        'sales', case
            when x = 'reseller' then (select coalesce(sum(o.subtotal), 0) from orders o where o.reseller_id is not null and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to)
            when x = 'referral' then (select coalesce(sum(o.subtotal), 0) from orders o where o.invite_code is not null and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to)
            else (select coalesce(sum(o.subtotal), 0) from orders o join campaigns c on c.id = o.campaign_id where campaign_channel(c) = x and o.status not in ('cancelled','fraud_review') and lusaka_date(o.created_at) between p_from and p_to) end,
        'spend', (select coalesce(sum(m.amount), 0) from marketing_spend m left join campaigns c on c.id = m.campaign_id
                  where m.spent_on between p_from and p_to and coalesce(campaign_channel(c), case when m.source in ('facebook_ad','instagram') then 'paid' else 'other' end) = x)
      )) from unnest(ch) x),
    'series', (select jsonb_agg(jsonb_build_object('day', d::date,
        'leads', (select count(*) from leads l where lusaka_date(l.created_at) = d::date),
        'won', (select count(*) from leads l where l.stage = 'won' and lusaka_date(l.updated_at) = d::date)) order by d)
      from generate_series(p_from::timestamp, p_to::timestamp, '1 day') d),
    'resellers', jsonb_build_object(
        'applied', (select count(*) from resellers where lusaka_date(created_at) between p_from and p_to),
        'approved', (select count(*) from resellers where status = 'approved' and lusaka_date(created_at) between p_from and p_to),
        'first_sale', (select count(*) from resellers r where status = 'approved' and exists (select 1 from orders o where o.reseller_id = r.id and o.status not in ('cancelled','fraud_review'))),
        'active', (select count(distinct reseller_id) from orders where reseller_id is not null and created_at > now() - interval '30 days' and status not in ('cancelled','fraud_review')),
        'total_approved', (select count(*) from resellers where status = 'approved')),
    'referrals', jsonb_build_object(
        'invites', (select count(*) from referrals where code is not null and order_id is null),
        'orders', (select count(*) from referrals where order_id is not null and status <> 'void'),
        'owed', (select coalesce(sum(reward), 0) from referrals where status = 'eligible')),
    'requests', (select count(*) from ad_requests where status = 'new'),
    'magnets', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'slug', m.slug, 'views', m.views,
        'leads', (select count(*) from leads l where l.magnet_id = m.id),
        'won', (select count(*) from leads l where l.magnet_id = m.id and l.stage = 'won')) order by m.created_at desc), '[]')
      from lead_magnets m where m.status = 'live')
  );
end $$;

-- How a funnel performed: numbers at each step, so you can see where people fall away.
create or replace function funnel_report(p_funnel uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f funnels%rowtype; v_saw int; v_leads int; v_buyers int; v_added int; v_repeat int; v_sales numeric; v_spend numeric;
begin
  if not can_market() then raise exception 'Not allowed'; end if;
  select * into f from funnels where id = p_funnel;
  if not found then raise exception 'Funnel not found'; end if;

  v_saw := coalesce((select visits from campaigns where id = f.campaign_id), 0)
         + coalesce((select views from lead_magnets where id = f.magnet_id), 0);

  select count(*) into v_leads from leads l
   where lusaka_date(l.created_at) between p_from and p_to
     and ((f.magnet_id is not null and l.magnet_id = f.magnet_id) or (f.campaign_id is not null and l.campaign_id = f.campaign_id));

  select count(distinct o.id), coalesce(sum(o.subtotal), 0) into v_buyers, v_sales
    from orders o
   where o.status not in ('cancelled', 'fraud_review') and lusaka_date(o.created_at) between p_from and p_to
     and ((f.campaign_id is not null and o.campaign_id = f.campaign_id)
          or exists (select 1 from leads l where l.order_id = o.id and ((f.magnet_id is not null and l.magnet_id = f.magnet_id) or (f.campaign_id is not null and l.campaign_id = f.campaign_id)))
          or (f.campaign_id is null and f.magnet_id is null and f.product_id is not null
              and exists (select 1 from order_items i where i.order_id = o.id and i.product_id = f.product_id)));

  select count(distinct i.order_id) into v_added from order_items i join orders o on o.id = i.order_id
   where f.bump_offer_id is not null and i.offer_id = f.bump_offer_id
     and o.status not in ('cancelled', 'fraud_review') and lusaka_date(o.created_at) between p_from and p_to;

  select count(*) into v_repeat from (
    select o.customer_id from orders o
     where o.status not in ('cancelled', 'fraud_review') and lusaka_date(o.created_at) between p_from and p_to
       and (f.product_id is null or exists (select 1 from order_items i where i.order_id = o.id and i.product_id = f.product_id))
     group by o.customer_id having count(*) > 1) x;

  select coalesce(sum(amount), 0) into v_spend from marketing_spend
   where spent_on between p_from and p_to and (f.campaign_id is null or campaign_id = f.campaign_id);

  return jsonb_build_object(
    'saw', v_saw, 'leads', v_leads, 'buyers', v_buyers, 'added', v_added, 'repeat', v_repeat,
    'sales', round(v_sales, 2), 'spend', round(v_spend, 2),
    'lead_rate', case when v_saw > 0 then round(v_leads::numeric * 100 / v_saw, 1) else null end,
    'buy_rate', case when v_leads > 0 then round(v_buyers::numeric * 100 / v_leads, 1) else null end,
    'add_rate', case when v_buyers > 0 then round(v_added::numeric * 100 / v_buyers, 1) else null end,
    'per_customer', case when v_buyers > 0 then round(v_sales / v_buyers, 2) else 0 end,
    'cost_per_customer', case when v_buyers > 0 and v_spend > 0 then round(v_spend / v_buyers, 2) else null end);
end $$;

-- A marketer's day: the one-page checklist
create or replace function marketing_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g marketing_goals%rowtype; wk date := date_trunc('week', lusaka_date(now()))::date;
begin
  if not can_market() then raise exception 'Not allowed'; end if;
  select * into g from marketing_goals where user_id = auth.uid();
  return jsonb_build_object(
    'goals', jsonb_build_object('outreach_daily', coalesce(g.outreach_daily, 20), 'content_weekly', coalesce(g.content_weekly, 5), 'engaged_weekly', coalesce(g.engaged_weekly, 10)),
    'outreach_today', (select count(*) from lead_activities where user_id = auth.uid() and kind not in ('note','system') and lusaka_date(created_at) = lusaka_date(now())),
    'responses_today', (select count(*) from lead_activities where user_id = auth.uid() and outcome in ('interested','follow_up','ordered') and lusaka_date(created_at) = lusaka_date(now())),
    'content_week', (select count(*) from content_posts where (owner_id = auth.uid() or owner_id is null) and posted_on >= wk),
    'engaged_week', (select count(distinct lead_id) from lead_activities where user_id = auth.uid() and outcome in ('interested','follow_up','ordered') and lusaka_date(created_at) >= wk),
    'won_week', (select count(*) from leads where owner_id = auth.uid() and stage = 'won' and lusaka_date(updated_at) >= wk),
    'due', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'interest', interest, 'stage', stage, 'next_follow_up', next_follow_up, 'channel', channel) order by next_follow_up nulls last, created_at), '[]')
            from (select * from leads where stage in ('new','contacted','engaged')
                    and (next_follow_up <= lusaka_date(now()) or (stage = 'new' and last_contact_at is null))
                    and (owner_id = auth.uid() or owner_id is null or sees_all_leads())
                  order by next_follow_up nulls last, created_at limit 30) x)
  );
end $$;


-- =====================================================================
-- Enquiries and negotiated deals
-- =====================================================================
-- Public: "Enquire" / "Make an offer" on an offering. Creates a lead, and a deal for negotiated offerings.
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

  if prod.sales_model = 'negotiate' then
    insert into deals (product_id, package_id, vendor_id, customer_name, customer_phone, message, advertised_price, commission_type, commission_value, fee_pct,
                       reseller_id, invite_code, campaign_id, source, status)
    values (prod.id, pkg.id, prod.vendor_id, v_name, v_phone, left(payload->>'message', 1000), coalesce(pkg.price, prod.price),
            coalesce(prod.commission_type, 'pct'), coalesce(prod.commission_value, setting_num('default_commission_pct')),
            coalesce(prod.deal_fee_pct, setting_num('marketplace_fee_pct')),
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
  if d.status in ('closed') and p_action <> 'note' then raise exception 'This deal is closed'; end if;

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
    v_res := case when d.reseller_id is null then 0 when d.commission_type = 'flat' then v_rate else round(p_amount * v_rate / 100, 2) end;
    v_fee := round(p_amount * coalesce(d.fee_pct, 0) / 100, 2);
    update deals set status = 'closed', final_price = p_amount, reseller_amount = v_res, marketplace_amount = v_fee, evidence = p_evidence,
                     verified_by = auth.uid(), closed_at = now(), updated_at = now() where id = p_deal;
    insert into deal_events (deal_id, kind, amount, party, note, user_id) values (p_deal, 'closed', p_amount, 'marketplace', coalesce(p_note, p_evidence), auth.uid());
    if d.reseller_id is not null and v_res > 0 then
      insert into commissions (deal_id, reseller_id, base_amount, rate_type, rate_value, amount, status, eligible_at, notes)
      values (p_deal, d.reseller_id, p_amount, coalesce(d.commission_type, 'pct'), v_rate, v_res, 'pending',
              now() + (setting_num('commission_grace_hours') || ' hours')::interval, 'Deal D' || d.deal_number || ' closed at K' || p_amount);
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
    update deals set fee_status = 'received', updated_at = now() where id = p_deal;
    perform log_audit('deal.fee_received', 'deals', p_deal, null, jsonb_build_object('amount', d.marketplace_amount), p_note);
  else
    raise exception 'Unknown action';
  end if;
end $$;

-- Resellers: deals they brought in (no customer phone)
create or replace function reseller_deals() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('deal_number', d.deal_number, 'product', p.name, 'status', d.status, 'advertised_price', d.advertised_price,
    'final_price', d.final_price, 'commission_type', d.commission_type, 'commission_value', d.commission_value, 'reseller_amount', d.reseller_amount,
    'customer', split_part(d.customer_name, ' ', 1), 'created_at', d.created_at) order by d.created_at desc), '[]')
  from deals d join products p on p.id = d.product_id where d.reseller_id = my_reseller_id() and my_reseller_id() is not null;
$$;

-- Public packages for published offerings
create or replace view public_packages as
select pk.id, pk.product_id, pk.name, pk.subtitle, pk.price, pk.normal_price, pk.items, pk.featured, pk.sort
from product_packages pk join products p on p.id = pk.product_id
where pk.active and p.status in ('published', 'out_of_stock');


-- Five example offerings a founder can create with one tap, to see how each type looks.
-- They are ordinary products marked as samples, so they can be deleted just as easily.
create or replace function create_samples() returns jsonb
language plpgsql security definer set search_path = public as $$
declare made int := 0; pid uuid;
begin
  if not is_founder() then raise exception 'Only a founder can add the examples'; end if;

  -- 1. Driving course, packages and schedule
  if not exists (select 1 from products where name = 'Driving lessons (example)') then
    insert into products (name, category, description, price, status, owner_type, offering_type, sales_model, fulfilment,
      lead_time_days, order_days, time_slots, slot_capacity, service_location, duration_text, commission_type, commission_value, page)
    values ('Driving lessons (example)', 'Services',
      E'Lessons for beginners and nervous drivers.\nDual-control cars and patient instructors.',
      1800, 'published', 'founder', 'course', 'book', 'service', 1, '{1,2,3,4,5,6}', '{08:00,13:00}', 2, 'at_seller', '2 hours per lesson', 'pct', 10,
      jsonb_build_object(
        'hero_headline', 'Learn to drive with confidence', 'location_text', 'Lusaka, Zambia',
        'hero_points', jsonb_build_array('Qualified instructors', 'Dual-control training cars', 'Weekday and weekend classes', 'Pick-up and drop-off'),
        'cta_primary', 'Book your classes', 'packages_title', 'Our driving classes',
        'media_section', jsonb_build_object('title', 'Our training vehicle', 'name', 'Toyota Corolla (manual)', 'note', 'Dual controls for safety',
          'specs', jsonb_build_array(jsonb_build_object('label','Transmission','value','Manual'), jsonb_build_object('label','Year','value','2022'))),
        'benefits', jsonb_build_array(
          jsonb_build_object('icon','book','title','Learner''s permit','text','We help you through the permit process.'),
          jsonb_build_object('icon','car','title','Practical training','text','Hands-on lessons with an instructor beside you.'),
          jsonb_build_object('icon','certificate','title','Test preparation','text','Mock tests before the real thing.'),
          jsonb_build_object('icon','shield','title','Road safety','text','Defensive driving and road rules.')),
        'included', jsonb_build_array('All lessons with a qualified instructor', 'Use of the training car'),
        'requirements', jsonb_build_array('A valid NRC', 'Comfortable shoes'),
        'schedule_title', 'Class schedule',
        'schedule', jsonb_build_array(jsonb_build_object('label','Weekdays','hours','08:00 - 18:00'), jsonb_build_object('label','Saturdays','hours','08:00 - 14:00'), jsonb_build_object('label','Sundays','hours','By appointment')),
        'areas', jsonb_build_array('Lusaka District', 'Kabulonga', 'Chalala', 'Matero'),
        'why', jsonb_build_array('Patient with nervous beginners', 'Cars serviced every month', 'Flexible times around work'),
        'sections', jsonb_build_array(jsonb_build_object('title','What you''ll cover','items', jsonb_build_array('Road signs and rules','Town driving and parking','Highway driving','Test routes')))))
    returning id into pid;
    insert into product_packages (product_id, name, subtitle, price, normal_price, items, featured, sort) values
      (pid, 'Beginner package', 'Basic driving lessons', 1800, null, array['6 practical lessons','2 hours per lesson','Road safety training','Pre-test preparation'], false, 0),
      (pid, 'Standard package', 'Complete driving course', 2800, 3200, array['10 practical lessons','2 hours per lesson','Road safety training','Pre-test and mock test','Learner''s permit help'], true, 1),
      (pid, 'Premium package', 'Intensive driving course', 4000, null, array['15 practical lessons','2 hours per lesson','Road safety training','Pre-test and mock test','Learner''s permit help','Priority test booking'], false, 2);
    made := made + 1;
  end if;

  -- 2. Simple service, one price, no packages
  if not exists (select 1 from products where name = 'House cleaning (example)') then
    insert into products (name, category, description, price, status, owner_type, offering_type, sales_model, fulfilment,
      lead_time_days, order_days, service_location, duration_text, commission_type, commission_value, page)
    values ('House cleaning (example)', 'Services', 'A team of two cleans your home from top to bottom.', 450, 'published', 'founder', 'service', 'book', 'service',
      1, '{1,2,3,4,5,6}', 'at_customer', 'About 3 hours', 'pct', 10,
      jsonb_build_object('hero_headline', 'Come home to a clean house', 'location_text', 'Lusaka District',
        'hero_points', jsonb_build_array('Two cleaners', 'We bring our own supplies', 'Same-week booking'),
        'benefits', jsonb_build_array(
          jsonb_build_object('icon','check','title','Whole house','text','Rooms, kitchen and bathrooms.'),
          jsonb_build_object('icon','clock','title','About 3 hours','text','Longer for bigger homes, agreed first.')),
        'areas', jsonb_build_array('Lusaka District')))
    returning id into pid;
    made := made + 1;
  end if;

  -- 3. Course with certificate
  if not exists (select 1 from products where name = 'Basic computer course (example)') then
    insert into products (name, category, description, price, status, owner_type, offering_type, sales_model, fulfilment,
      lead_time_days, order_days, duration_text, commission_type, commission_value, page)
    values ('Basic computer course (example)', 'Services', 'Four weeks of evening classes for complete beginners.', 950, 'published', 'founder', 'course', 'book', 'service',
      2, '{1,2,3,4,5}', '2 evenings a week for 4 weeks', 'pct', 10,
      jsonb_build_object('hero_headline', 'Learn the computer from scratch', 'location_text', 'Lusaka',
        'hero_points', jsonb_build_array('Evening classes', 'Certificate at the end', 'Small groups'),
        'packages_title', 'Choose your course',
        'benefits', jsonb_build_array(
          jsonb_build_object('icon','book','title','From the beginning','text','Mouse, typing, files and folders.'),
          jsonb_build_object('icon','certificate','title','Certificate','text','Given when you finish the course.')),
        'sections', jsonb_build_array(jsonb_build_object('title','What you''ll cover','items', jsonb_build_array('Windows basics','Typing and documents','Email and internet','Printing and saving files'))),
        'schedule', jsonb_build_array(jsonb_build_object('label','Tue and Thu','hours','17:30 - 19:30'))))
    returning id into pid;
    insert into product_packages (product_id, name, subtitle, price, items, featured, sort) values
      (pid, 'Evening course', '4 weeks', 950, array['8 sessions','Course notes','Certificate'], true, 0),
      (pid, 'One-to-one', 'At your own pace', 1600, array['6 private sessions','Course notes','Certificate'], false, 1);
    made := made + 1;
  end if;

  -- 4. Vehicle, sold by negotiation
  if not exists (select 1 from products where name = 'Toyota Vitz 2014 (example)') then
    insert into products (name, category, description, price, status, owner_type, offering_type, sales_model, fulfilment,
      deal_fee_pct, commission_type, commission_value, page)
    values ('Toyota Vitz 2014 (example)', 'Other', 'One owner, service book available, tyres in good condition.', 85000, 'published', 'founder', 'vehicle', 'negotiate', 'in_stock',
      3, 'pct', 5,
      jsonb_build_object('hero_headline', 'Toyota Vitz 2014 — ready to drive', 'location_text', 'Lusaka',
        'hero_points', jsonb_build_array('One owner', 'Service book available', 'Inspection welcome'),
        'specs', jsonb_build_array(
          jsonb_build_object('label','Year','value','2014'), jsonb_build_object('label','Transmission','value','Automatic'),
          jsonb_build_object('label','Mileage','value','118,000 km'), jsonb_build_object('label','Fuel','value','Petrol')),
        'why', jsonb_build_array('Inspection welcome before you pay', 'Paperwork in order')))
    returning id into pid;
    made := made + 1;
  end if;

  -- 5. Something unrelated: made-to-order food
  if not exists (select 1 from products where name = 'Office lunch packs (example)') then
    insert into products (name, category, description, price, status, owner_type, offering_type, sales_model, fulfilment,
      lead_time_days, order_days, daily_limit, options, note_label, commission_type, commission_value, page)
    values ('Office lunch packs (example)', 'Food & cakes', 'Hot lunch delivered to your office, ordered the day before.', 60, 'published', 'founder', 'product', 'buy', 'made_to_order',
      1, '{1,2,3,4,5}', 40, '[{"name":"Main","choices":["Chicken","Beef","Vegetarian"]}]'::jsonb, 'Any allergies we should know about?', 'pct', 8,
      jsonb_build_object('hero_headline', 'Hot lunch, delivered to the office', 'location_text', 'Lusaka District',
        'hero_points', jsonb_build_array('Ordered the day before', 'Delivered by 12:30', 'Bulk orders welcome'),
        'benefits', jsonb_build_array(
          jsonb_build_object('icon','clock','title','On time','text','Delivered between 12:00 and 12:30.'),
          jsonb_build_object('icon','people','title','Office orders','text','One delivery for the whole team.')),
        'areas', jsonb_build_array('Lusaka District')))
    returning id into pid;
    made := made + 1;
  end if;

  return jsonb_build_object('created', made);
end $$;

create or replace function remove_samples() returns jsonb
language plpgsql security definer set search_path = public as $$
declare gone int;
begin
  if not is_founder() then raise exception 'Only a founder can remove the examples'; end if;
  delete from products where name like '%(example)'
    and not exists (select 1 from order_items i where i.product_id = products.id);
  get diagnostics gone = row_count;
  return jsonb_build_object('removed', gone);
end $$;

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table staff_invites enable row level security;
alter table customers enable row level security;
alter table suppliers enable row level security;
alter table vendors enable row level security;
alter table resellers enable row level security;
alter table products enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table inventory_movements enable row level security;
alter table stock_requests enable row level security;
alter table offers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table deliveries enable row level security;
alter table commissions enable row level security;
alter table settlements enable row level security;
alter table reviews enable row level security;
alter table referrals enable row level security;
alter table leads enable row level security;
alter table product_packages enable row level security;
alter table deals enable row level security;
alter table deal_events enable row level security;
alter table lead_activities enable row level security;
alter table content_posts enable row level security;
alter table funnels enable row level security;
alter table training_progress enable row level security;
alter table lead_magnets enable row level security;
alter table marketing_goals enable row level security;
alter table expenses enable row level security;
alter table marketing_spend enable row level security;
alter table founder_contributions enable row level security;
alter table founder_withdrawals enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;
alter table provinces enable row level security;
alter table districts enable row level security;
alter table quotes enable row level security;

-- helper to (re)create policies idempotently
create or replace function ensure_policy(p_name text, p_table text, p_cmd text, p_using text, p_check text default null)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on %I', p_name, p_table);
  if p_cmd = 'insert' then
    execute format('create policy %I on %I for insert with check (%s)', p_name, p_table, coalesce(p_check, p_using));
  elsif p_cmd in ('update') then
    execute format('create policy %I on %I for update using (%s) with check (%s)', p_name, p_table, p_using, coalesce(p_check, p_using));
  else
    execute format('create policy %I on %I for %s using (%s)', p_name, p_table, p_cmd, p_using);
  end if;
end $$;

-- public reference data
select ensure_policy('public_read', 'provinces', 'select', 'true');
select ensure_policy('public_read', 'districts', 'select', 'true');
select ensure_policy('public_read', 'quotes', 'select', 'true');
select ensure_policy('read_settings', 'settings', 'select', 'key in (''local_delivery_fee'',''currency'',''delivery_included'',''departments'',''reseller_terms'',''vendor_terms'') or (auth.uid() is not null and key <> ''founder_emails'') or is_founder()');
select ensure_policy('founder_settings', 'settings', 'update', 'is_founder()');
select ensure_policy('founder_settings_insert', 'settings', 'insert', 'is_founder()');

-- profiles
select ensure_policy('own_profile', 'profiles', 'select', 'id = auth.uid() or is_staff()');
select ensure_policy('own_profile_update', 'profiles', 'update', 'id = auth.uid()');
select ensure_policy('founder_roles', 'profiles', 'update', 'is_founder()');
select ensure_policy('founder_invites', 'staff_invites', 'all', 'is_founder()');

-- products: public sees published; staff all; vendor own
-- Full product rows (with costs) only for staff and the owning vendor. Everyone else reads public_products.
select ensure_policy('public_products', 'products', 'select', 'is_staff() or vendor_id = my_vendor_id()');
select ensure_policy('staff_packages', 'product_packages', 'all', 'is_staff()');
select ensure_policy('vendor_packages', 'product_packages', 'all', 'exists (select 1 from products p where p.id = product_packages.product_id and p.vendor_id = my_vendor_id() and p.status in (''draft'',''submitted'',''rejected''))');
select ensure_policy('vendor_packages_read', 'product_packages', 'select', 'exists (select 1 from products p where p.id = product_packages.product_id and p.vendor_id = my_vendor_id())');
select ensure_policy('staff_deals', 'deals', 'all', 'is_staff()');
select ensure_policy('vendor_deals', 'deals', 'select', 'vendor_id is not null and vendor_id = my_vendor_id()');
select ensure_policy('staff_deal_events', 'deal_events', 'all', 'is_staff()');
select ensure_policy('vendor_deal_events', 'deal_events', 'select', 'exists (select 1 from deals d where d.id = deal_events.deal_id and d.vendor_id is not null and d.vendor_id = my_vendor_id())');
select ensure_policy('staff_products', 'products', 'all', 'is_staff()');
select ensure_policy('vendor_products_insert', 'products', 'insert', 'vendor_id = my_vendor_id() and owner_type = ''vendor'' and status in (''draft'',''submitted'') and deal_fee_pct is null and not featured_for_resellers and commission_type is null and cost_override is null');
select ensure_policy('vendor_products_update', 'products', 'update', 'vendor_id = my_vendor_id()', 'vendor_id = my_vendor_id() and status in (''draft'',''submitted'',''out_of_stock'') ');

-- staff-only operational tables
select ensure_policy('staff_all', 'customers', 'all', 'is_staff()');
select ensure_policy('staff_all', 'suppliers', 'all', 'is_staff()');
select ensure_policy('staff_all', 'purchases', 'all', 'is_staff()');
select ensure_policy('staff_all', 'purchase_items', 'all', 'is_staff()');
select ensure_policy('staff_all', 'inventory_movements', 'all', 'is_staff()');
select ensure_policy('staff_all', 'stock_requests', 'all', 'is_staff()');
select ensure_policy('public_insert', 'stock_requests', 'insert', 'true');
select ensure_policy('staff_all', 'leads', 'all', 'sees_all_leads() or (can_market() and (owner_id = auth.uid() or owner_id is null))');
select ensure_policy('staff_all', 'lead_activities', 'all', 'exists (select 1 from leads l where l.id = lead_activities.lead_id and (sees_all_leads() or (can_market() and (l.owner_id = auth.uid() or l.owner_id is null))))');
select ensure_policy('market_all', 'content_posts', 'all', 'can_market()');
select ensure_policy('market_all', 'funnels', 'all', 'can_market()');
select ensure_policy('own_training', 'training_progress', 'all', 'user_id = auth.uid()');
select ensure_policy('staff_training_read', 'training_progress', 'select', 'is_staff()');
select ensure_policy('market_all', 'lead_magnets', 'all', 'can_market()');
select ensure_policy('own_goals', 'marketing_goals', 'select', 'user_id = auth.uid() or sees_all_leads()');
select ensure_policy('set_goals', 'marketing_goals', 'all', 'sees_all_leads()');
select ensure_policy('staff_all', 'expenses', 'all', 'is_staff()');
select ensure_policy('staff_all', 'marketing_spend', 'all', 'can_market()');
alter table campaigns enable row level security;
alter table ad_requests enable row level security;
select ensure_policy('staff_all', 'campaigns', 'all', 'can_market()');
select ensure_policy('staff_all', 'ad_requests', 'all', 'can_market()');
select ensure_policy('vendor_read_requests', 'ad_requests', 'select', 'vendor_id = my_vendor_id()');
select ensure_policy('vendor_create_requests', 'ad_requests', 'insert', 'vendor_id = my_vendor_id() and status = ''new'' and reply is null and campaign_id is null');
select ensure_policy('founder_all', 'founder_contributions', 'all', 'is_founder()');
select ensure_policy('founder_all', 'founder_withdrawals', 'all', 'is_founder()');
select ensure_policy('founder_read', 'audit_logs', 'select', 'is_founder()');
select ensure_policy('staff_all', 'referrals', 'all', 'is_staff() or can_market()');
select ensure_policy('staff_all', 'payments', 'all', 'is_staff()');
select ensure_policy('staff_all', 'deliveries', 'all', 'is_staff()');

-- offers: public sees active; staff all
select ensure_policy('read_offers', 'offers', 'select', 'is_staff()');
select ensure_policy('staff_offers', 'offers', 'all', 'is_staff()');

-- applications: anyone logged in can apply; see own; staff see all
select ensure_policy('apply_vendor', 'vendors', 'insert', 'user_id = auth.uid()');
select ensure_policy('read_vendor', 'vendors', 'select', 'user_id = auth.uid() or is_staff()');
select ensure_policy('staff_vendor', 'vendors', 'update', 'is_staff()');
select ensure_policy('own_vendor_update', 'vendors', 'update', 'user_id = auth.uid()');
select ensure_policy('apply_reseller', 'resellers', 'insert', 'user_id = auth.uid()');
select ensure_policy('read_reseller', 'resellers', 'select', 'user_id = auth.uid() or is_staff()');
select ensure_policy('staff_reseller', 'resellers', 'update', 'is_staff()');

-- orders: staff all; reseller own; vendor when items belong to them
select ensure_policy('staff_orders', 'orders', 'all', 'is_staff()');
select ensure_policy('reseller_orders', 'orders', 'select', 'reseller_id = my_reseller_id()');
drop policy if exists vendor_orders on orders;
select ensure_policy('staff_items', 'order_items', 'all', 'is_staff()');
select ensure_policy('reseller_items', 'order_items', 'select', 'my_reseller_id() is not null and order_reseller(order_id) = my_reseller_id()');
drop policy if exists vendor_items on order_items;

-- money
select ensure_policy('staff_commissions', 'commissions', 'all', 'is_staff()');
select ensure_policy('reseller_commissions', 'commissions', 'select', 'reseller_id = my_reseller_id()');
select ensure_policy('staff_settlements', 'settlements', 'all', 'is_staff()');
select ensure_policy('vendor_settlements', 'settlements', 'select', 'vendor_id = my_vendor_id()');

-- reviews: public reads approved; staff manage; vendor reads own
select ensure_policy('read_reviews', 'reviews', 'select', 'approved or is_staff()');
select ensure_policy('staff_reviews', 'reviews', 'all', 'is_staff()');

grant usage on schema public to anon, authenticated;

-- Product photos: public bucket; staff and vendors can upload.
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict (id) do nothing;
    execute 'drop policy if exists "zm product image upload" on storage.objects';
    execute $p$create policy "zm product image upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images' and (public.is_staff() or public.my_vendor_id() is not null))$p$;
  end if;
end $$;
grant select on public_products to anon, authenticated;
grant select on public_offers to anon, authenticated;
grant select on public_vendors to anon, authenticated;
grant select on public_magnets to anon, authenticated;
grant select on public_packages to anon, authenticated;
grant execute on function submit_enquiry(jsonb) to anon, authenticated;
grant execute on function capture_checkout_lead(text, text, text, text, text) to anon, authenticated;
grant execute on function claim_magnet(text, text, text, text, text) to anon, authenticated;
grant execute on function view_magnet(text) to anon, authenticated;
grant execute on function get_invite(text, int) to anon, authenticated;
grant execute on function invite_info(text) to anon, authenticated;
grant select on settings to anon;
grant execute on function place_order(jsonb) to anon, authenticated;
grant execute on function booked_slots(uuid, date) to anon, authenticated;
grant execute on function go_link(text) to anon, authenticated;
grant execute on function submit_review(int, text, jsonb, text) to anon, authenticated;
grant execute on function review_open(text) to anon, authenticated;
grant execute on function review_submit(text, jsonb, text) to anon, authenticated;

-- ---------- Seed: Zambia's provinces and districts ----------
insert into provinces (name) values
  ('Lusaka'),('Copperbelt'),('Central'),('Eastern'),('Luapula'),('Muchinga'),('Northern'),('North-Western'),('Southern'),('Western')
on conflict (name) do nothing;

insert into districts (province_id, name, is_local_zone)
select p.id, d.name, d.name = 'Lusaka' from provinces p
join (values
  ('Lusaka','Lusaka'),('Lusaka','Chilanga'),('Lusaka','Chongwe'),('Lusaka','Kafue'),('Lusaka','Luangwa'),('Lusaka','Rufunsa'),
  ('Copperbelt','Kitwe'),('Copperbelt','Ndola'),('Copperbelt','Chingola'),('Copperbelt','Mufulira'),('Copperbelt','Luanshya'),('Copperbelt','Kalulushi'),('Copperbelt','Chililabombwe'),('Copperbelt','Masaiti'),('Copperbelt','Mpongwe'),('Copperbelt','Lufwanyama'),
  ('Central','Kabwe'),('Central','Kapiri Mposhi'),('Central','Mkushi'),('Central','Mumbwa'),('Central','Serenje'),('Central','Chibombo'),('Central','Chisamba'),('Central','Chitambo'),('Central','Itezhi-Tezhi'),('Central','Luano'),('Central','Ngabwe'),('Central','Shibuyunji'),
  ('Eastern','Chipata'),('Eastern','Katete'),('Eastern','Petauke'),('Eastern','Lundazi'),('Eastern','Nyimba'),('Eastern','Chadiza'),('Eastern','Mambwe'),('Eastern','Sinda'),('Eastern','Vubwi'),('Eastern','Chasefu'),('Eastern','Kasenengwa'),('Eastern','Lumezi'),('Eastern','Chipangali'),('Eastern','Lusangazi'),
  ('Luapula','Mansa'),('Luapula','Samfya'),('Luapula','Kawambwa'),('Luapula','Nchelenge'),('Luapula','Mwense'),('Luapula','Chiengi'),('Luapula','Milenge'),('Luapula','Chembe'),('Luapula','Chifunabuli'),('Luapula','Chipili'),('Luapula','Lunga'),('Luapula','Mwansabombwe'),
  ('Muchinga','Chinsali'),('Muchinga','Mpika'),('Muchinga','Isoka'),('Muchinga','Nakonde'),('Muchinga','Mafinga'),('Muchinga','Shiwang''andu'),('Muchinga','Chama'),('Muchinga','Kanchibiya'),('Muchinga','Lavushimanda'),
  ('Northern','Kasama'),('Northern','Mbala'),('Northern','Mpulungu'),('Northern','Luwingu'),('Northern','Mporokoso'),('Northern','Kaputa'),('Northern','Mungwi'),('Northern','Chilubi'),('Northern','Nsama'),('Northern','Senga Hill'),('Northern','Lunte'),('Northern','Lupososhi'),
  ('North-Western','Solwezi'),('North-Western','Mwinilunga'),('North-Western','Kasempa'),('North-Western','Zambezi'),('North-Western','Kabompo'),('North-Western','Mufumbwe'),('North-Western','Chavuma'),('North-Western','Ikelenge'),('North-Western','Manyinga'),('North-Western','Kalumbila'),('North-Western','Mushindamo'),
  ('Southern','Livingstone'),('Southern','Choma'),('Southern','Mazabuka'),('Southern','Monze'),('Southern','Kalomo'),('Southern','Namwala'),('Southern','Siavonga'),('Southern','Sinazongwe'),('Southern','Gwembe'),('Southern','Kazungula'),('Southern','Pemba'),('Southern','Zimba'),('Southern','Chikankata'),('Southern','Chirundu'),
  ('Western','Mongu'),('Western','Kaoma'),('Western','Senanga'),('Western','Sesheke'),('Western','Kalabo'),('Western','Lukulu'),('Western','Shangombo'),('Western','Limulunga'),('Western','Luampa'),('Western','Mitete'),('Western','Mulobezi'),('Western','Mwandi'),('Western','Nalolo'),('Western','Nkeyema'),('Western','Sikongo'),('Western','Sioma')
) as d(province, name) on d.province = p.name
on conflict (province_id, name) do nothing;

insert into quotes (text, author)
select * from (values
  ('Sell the outcome, not the product.', null),
  ('Cash today beats profit on paper.', null),
  ('Every kwacha has a reason.', 'ZaMarket rule #2'),
  ('Test three, then commit.', null),
  ('An order is not a sale until it is delivered and paid.', 'ZaMarket rule #8'),
  ('What gets measured gets improved.', null),
  ('Small budgets, sharp lessons.', null),
  ('Make the offer so good people feel stupid saying no.', 'Alex Hormozi'),
  ('The customer''s problem is the business.', null),
  ('Speed of delivery is a feature.', null)
) as q(text, author)
where not exists (select 1 from quotes);
