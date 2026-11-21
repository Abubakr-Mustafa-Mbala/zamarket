-- 38. URGENT: the shop failed to load for everyone not signed in.
--
-- The shop's product list (public_products) hides lunch-only dishes using
-- products.lunch_only. Visitors who are not signed in may only read the
-- product columns they were granted, and lunch_only was never granted, so
-- the database refused the whole list ("permission denied", Ref 42501).
-- Signed-in staff were unaffected. lunch_only says nothing private.
grant select (lunch_only) on public.products to anon, authenticated;
