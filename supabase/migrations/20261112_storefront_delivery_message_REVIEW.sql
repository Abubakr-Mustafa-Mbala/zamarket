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
