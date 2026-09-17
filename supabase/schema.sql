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
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare founder_exists boolean;
begin
  select exists(select 1 from profiles where role = 'founder') into founder_exists;
  insert into profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    case when founder_exists then 'customer'::user_role else 'founder'::user_role end
  );
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
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  offer_id uuid references offers(id),
  vendor_id uuid references vendors(id),
  quantity int not null check (quantity > 0),
  unit_price numeric not null,
  unit_cost_snapshot numeric not null default 0,
  line_total numeric not null
);

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

create table if not exists marketing_spend (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  spent_on date not null default current_date,
  amount numeric not null,
  clicks int default 0,
  notes text,
  created_at timestamptz not null default now()
);

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
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('founder','ops','finance','delivery') from profiles where id = auth.uid()), false);
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

  update products set status = 'out_of_stock' where id = p_product and stock_available <= 0 and status = 'published';
  update products set status = 'published' where id = p_product and stock_available > 0 and status = 'out_of_stock';
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
language plpgsql immutable as $$
declare cfg jsonb := coalesce(o.config, '{}');
begin
  case o.type
    when 'buy_x_get_y' then
      units := coalesce((cfg->>'buyQty')::int, 1) + coalesce((cfg->>'freeQty')::int, 0);
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
  normal_value := units * coalesce(nullif(normal, 0), base);
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
  deal record;
  deals int;
  v_line numeric;
begin
  if v_manual and not (is_staff() or my_reseller_id() is not null) then raise exception 'Not allowed'; end if;
  if coalesce(c->>'phone','') = '' or coalesce(c->>'full_name','') = '' then raise exception 'Name and phone are required'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Cart is empty'; end if;

  -- customer (matched on phone)
  insert into customers (full_name, phone, email, province_id, district_id, area, address)
  values (c->>'full_name', c->>'phone', nullif(c->>'email',''), (c->>'province_id')::int, (c->>'district_id')::int, c->>'area', c->>'address')
  on conflict (phone) do update set
    full_name = excluded.full_name,
    email = coalesce(excluded.email, customers.email),
    province_id = coalesce(excluded.province_id, customers.province_id),
    district_id = coalesce(excluded.district_id, customers.district_id),
    area = coalesce(excluded.area, customers.area),
    address = coalesce(excluded.address, customers.address)
  returning * into cust;

  -- reseller attribution
  if coalesce(payload->>'referral_code','') <> '' then
    select * into rs from resellers where code = lower(payload->>'referral_code') and status = 'approved';
    if found then
      v_seller := 'reseller';
      if v_source = 'organic' then v_source := 'reseller:' || rs.code; end if;
      if rs.phone = cust.phone then flags := array_append(flags, 'self_purchase'); end if;
    end if;
  end if;

  -- delivery zone
  if (c->>'district_id') is not null then
    select is_local_zone into local_zone from districts where id = (c->>'district_id')::int;
  end if;
  if local_zone then fee := setting_num('local_delivery_fee'); end if;

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
    off := null;
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
    else
      qty := greatest(1, coalesce((item->>'quantity')::int, 1));
      unit := coalesce((item->>'unit_price')::numeric, prod.price);
      if unit <> prod.price and not is_staff() then unit := prod.price; end if;
      v_line := unit * qty;
    end if;
    insert into order_items (order_id, product_id, offer_id, vendor_id, quantity, unit_price, unit_cost_snapshot, line_total)
    values (o.id, prod.id, off.id, prod.vendor_id, qty, v_line / qty, product_effective_cost(prod), v_line);
    sub := sub + v_line;
    if prod.owner_type = 'founder' and prod.stock_available >= qty then
      perform apply_movement(prod.id, 'reserve', qty, 'Order ' || o.order_number, 'order', o.id);
    end if;
  end loop;

  -- free delivery: any live free-delivery offer on a product in this order whose minimum spend is met
  -- (local zone only; elsewhere the fee is still confirmed by phone)
  if local_zone and exists (
    select 1 from offers ofr join order_items oi on oi.product_id = ofr.product_id
    where oi.order_id = o.id and ofr.type = 'free_delivery' and offer_is_live(ofr)
      and sub >= coalesce((ofr.config->>'minSpend')::numeric, 0)
  ) then fee := 0; end if;

  update orders set subtotal = sub, delivery_fee = fee, total = sub + fee where id = o.id;
  insert into deliveries (order_id, status) values (o.id, (case when local_zone then 'fee_confirmed' else 'fee_pending' end)::delivery_status);
  perform log_audit(case when v_manual then 'order.manual' else 'order.placed' end, 'orders', o.id, null,
    jsonb_build_object('total', sub + fee, 'source', v_source, 'channel', v_channel, 'seller', v_seller));

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

  update orders set status = p_status,
    confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    payment_status = (case when p_status = 'paid' then 'paid' when p_status = 'refunded' then 'refunded' else payment_status::text end)::payment_status
  where id = p_order;

  if p_status = 'delivered' then
    update deliveries set status = 'delivered', delivered_at = now() where order_id = p_order;
  elsif p_status = 'failed_delivery' then
    update deliveries set status = 'failed', failure_reason = p_reason where order_id = p_order;
  elsif p_status = 'out_for_delivery' then
    update deliveries set status = 'out_for_delivery' where order_id = p_order;
  end if;

  -- completion: stock becomes sold, commissions + settlements are created
  if p_status = 'completed' then
    src := setting_text('commission_source');
    for it in select oi.* from order_items oi where oi.order_id = p_order loop
      select * into prod from products where id = it.product_id;
      if prod.owner_type = 'founder' then
        perform apply_movement(it.product_id, 'sale', it.quantity, 'Order ' || o.order_number, 'order', p_order);
      end if;
      gross := it.line_total;
      comm := 0;
      if o.reseller_id is not null then
        comm := commission_for(prod, it.unit_price, it.quantity);
      end if;
      if it.vendor_id is not null then
        select * into vend from vendors where id = it.vendor_id;
        fee_pct := coalesce(vend.fee_pct_override, setting_num('marketplace_fee_pct'));
        insert into settlements (vendor_id, order_id, gross, marketplace_fee, reseller_commission, net_payable, status)
        values (it.vendor_id, p_order, gross, round(gross * fee_pct / 100, 2),
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
        if (select stock_reserved from products where id = it.product_id) >= it.quantity then
          perform apply_movement(it.product_id, 'release', it.quantity, 'Order ' || o.order_number || ' ' || p_status, 'order', p_order);
        end if;
      elsif p_status = 'returned' then
        perform apply_movement(it.product_id, 'return', it.quantity, 'Order ' || o.order_number || ' returned', 'order', p_order);
      end if;
    end loop;
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
      update resellers set code = coalesce(resellers.code, lower(regexp_replace(split_part(full_name,' ',1), '[^a-zA-Z0-9]', '', 'g')) || substr(replace(id::text,'-',''),1,4)) where id = p_id;
      if uid is not null then update profiles set role = 'reseller' where id = uid and role = 'customer'; end if;
    end if;
  else
    raise exception 'Unknown application type';
  end if;
end $$;

-- Customer review (verified against the order's phone)
create or replace function submit_review(p_order_number int, p_phone text, p_ratings jsonb, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare o orders%rowtype; cust customers%rowtype; it record;
begin
  select * into o from orders where order_number = p_order_number;
  if not found then raise exception 'Order not found'; end if;
  select * into cust from customers where id = o.customer_id;
  if cust.phone <> p_phone then raise exception 'Phone number does not match this order'; end if;
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
       (select count(*) from reviews r where r.product_id = p.id and r.approved) as review_count
from products p left join vendors v on v.id = p.vendor_id
where p.status in ('published','out_of_stock');

-- Reseller earnings summary
create or replace function reseller_summary(p_reseller uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales_today', (select count(*) from orders where reseller_id = p_reseller and created_at::date = current_date and status not in ('cancelled','fraud_review')),
    'sales_month', (select count(*) from orders where reseller_id = p_reseller and date_trunc('month', created_at) = date_trunc('month', now()) and status not in ('cancelled','fraud_review')),
    'revenue_month', (select coalesce(sum(subtotal),0) from orders where reseller_id = p_reseller and date_trunc('month', created_at) = date_trunc('month', now()) and status not in ('cancelled','fraud_review')),
    'pending', (select coalesce(sum(amount),0) from commissions where reseller_id = p_reseller and status in ('pending','verified')),
    'approved', (select coalesce(sum(amount),0) from commissions where reseller_id = p_reseller and status = 'approved'),
    'paid', (select coalesce(sum(amount),0) from commissions where reseller_id = p_reseller and status = 'paid')
  );
$$;

-- Founder dashboard numbers
create or replace function dashboard_summary(p_from date default (current_date - 30), p_to date default current_date) returns jsonb
language sql stable security definer set search_path = public as $$
  with o as (
    select * from orders where created_at::date between p_from and p_to and status not in ('cancelled','fraud_review')
  ), items as (
    select oi.*, p.owner_type from order_items oi join o on o.id = oi.order_id join products p on p.id = oi.product_id
  )
  select jsonb_build_object(
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
    'refund_count', (select count(*) from orders where created_at::date between p_from and p_to and status in ('refunded','returned')),
    'cod_failed', (select count(*) from orders where created_at::date between p_from and p_to and status in ('failed_delivery','customer_unreachable'))
  );
$$;

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
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
select ensure_policy('read_settings', 'settings', 'select', 'auth.uid() is not null or key in (''local_delivery_fee'',''currency'')');
select ensure_policy('founder_settings', 'settings', 'update', 'is_founder()');
select ensure_policy('founder_settings_insert', 'settings', 'insert', 'is_founder()');

-- profiles
select ensure_policy('own_profile', 'profiles', 'select', 'id = auth.uid() or is_staff()');
select ensure_policy('own_profile_update', 'profiles', 'update', 'id = auth.uid()', 'id = auth.uid() and role = (select role from profiles where id = auth.uid())');
select ensure_policy('founder_roles', 'profiles', 'update', 'is_founder()');

-- products: public sees published; staff all; vendor own
select ensure_policy('public_products', 'products', 'select', 'status in (''published'',''out_of_stock'') or is_staff() or vendor_id = my_vendor_id() or (my_reseller_id() is not null and status = ''published'')');
select ensure_policy('staff_products', 'products', 'all', 'is_staff()');
select ensure_policy('vendor_products_insert', 'products', 'insert', 'vendor_id = my_vendor_id() and owner_type = ''vendor'' and status in (''draft'',''submitted'')');
select ensure_policy('vendor_products_update', 'products', 'update', 'vendor_id = my_vendor_id()', 'vendor_id = my_vendor_id() and status in (''draft'',''submitted'',''out_of_stock'') ');

-- staff-only operational tables
select ensure_policy('staff_all', 'customers', 'all', 'is_staff()');
select ensure_policy('staff_all', 'suppliers', 'all', 'is_staff()');
select ensure_policy('staff_all', 'purchases', 'all', 'is_staff()');
select ensure_policy('staff_all', 'purchase_items', 'all', 'is_staff()');
select ensure_policy('staff_all', 'inventory_movements', 'all', 'is_staff()');
select ensure_policy('staff_all', 'stock_requests', 'all', 'is_staff()');
select ensure_policy('public_insert', 'stock_requests', 'insert', 'true');
select ensure_policy('staff_all', 'leads', 'all', 'is_staff()');
select ensure_policy('staff_all', 'expenses', 'all', 'is_staff()');
select ensure_policy('staff_all', 'marketing_spend', 'all', 'is_staff()');
select ensure_policy('founder_all', 'founder_contributions', 'all', 'is_founder()');
select ensure_policy('founder_all', 'founder_withdrawals', 'all', 'is_founder()');
select ensure_policy('founder_read', 'audit_logs', 'select', 'is_founder()');
select ensure_policy('staff_all', 'referrals', 'all', 'is_staff()');
select ensure_policy('staff_all', 'payments', 'all', 'is_staff()');
select ensure_policy('staff_all', 'deliveries', 'all', 'is_staff()');

-- offers: public sees active; staff all
select ensure_policy('read_offers', 'offers', 'select', 'is_staff()');
select ensure_policy('staff_offers', 'offers', 'all', 'is_staff()');

-- applications: anyone logged in can apply; see own; staff see all
select ensure_policy('apply_vendor', 'vendors', 'insert', 'user_id = auth.uid()');
select ensure_policy('read_vendor', 'vendors', 'select', 'user_id = auth.uid() or is_staff()');
select ensure_policy('staff_vendor', 'vendors', 'update', 'is_staff()');
select ensure_policy('own_vendor_update', 'vendors', 'update', 'user_id = auth.uid()', 'user_id = auth.uid() and status = (select status from vendors v2 where v2.id = vendors.id)');
select ensure_policy('apply_reseller', 'resellers', 'insert', 'user_id = auth.uid()');
select ensure_policy('read_reseller', 'resellers', 'select', 'user_id = auth.uid() or is_staff()');
select ensure_policy('staff_reseller', 'resellers', 'update', 'is_staff()');

-- orders: staff all; reseller own; vendor when items belong to them
select ensure_policy('staff_orders', 'orders', 'all', 'is_staff()');
select ensure_policy('reseller_orders', 'orders', 'select', 'reseller_id = my_reseller_id()');
select ensure_policy('vendor_orders', 'orders', 'select', 'exists (select 1 from order_items oi where oi.order_id = orders.id and oi.vendor_id = my_vendor_id())');
select ensure_policy('staff_items', 'order_items', 'all', 'is_staff()');
select ensure_policy('reseller_items', 'order_items', 'select', 'exists (select 1 from orders o where o.id = order_items.order_id and o.reseller_id = my_reseller_id())');
select ensure_policy('vendor_items', 'order_items', 'select', 'vendor_id = my_vendor_id()');

-- money
select ensure_policy('staff_commissions', 'commissions', 'all', 'is_staff()');
select ensure_policy('reseller_commissions', 'commissions', 'select', 'reseller_id = my_reseller_id()');
select ensure_policy('staff_settlements', 'settlements', 'all', 'is_staff()');
select ensure_policy('vendor_settlements', 'settlements', 'select', 'vendor_id = my_vendor_id()');

-- reviews: public reads approved; staff manage; vendor reads own
select ensure_policy('read_reviews', 'reviews', 'select', 'approved or is_staff() or vendor_id = my_vendor_id()');
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
grant select on settings to anon;
grant execute on function place_order(jsonb) to anon, authenticated;
grant execute on function submit_review(int, text, jsonb, text) to anon, authenticated;

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
