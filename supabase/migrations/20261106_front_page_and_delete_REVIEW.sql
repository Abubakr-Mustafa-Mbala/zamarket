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

-- Expose it to the public view. The column is appended to the end of the
-- select list, because create-or-replace cannot insert one in the middle.
do $$
declare def text; body text;
begin
  if exists (
    select 1 from pg_attribute
     where attrelid = 'public.public_products'::regclass
       and attname = 'front_rank' and attnum > 0 and not attisdropped
  ) then
    return;  -- already exposed
  end if;

  select pg_get_viewdef('public.public_products'::regclass, true) into def;

  if position('AS package_count
   FROM products p' in def) = 0 then
    raise exception 'public_products is not in the expected shape; review before deploying';
  end if;

  body := replace(def,
    'AS package_count
   FROM products p',
    'AS package_count,
    p.front_rank
   FROM products p');

  execute 'create or replace view public.public_products as ' || body;
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
