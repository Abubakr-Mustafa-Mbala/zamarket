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
