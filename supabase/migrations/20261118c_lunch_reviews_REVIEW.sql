-- 31. Weekly lunch: customer messages (WhatsApp screenshots) kept apart from
--     kitchen photos, shown whole in their own section, never on posters.
--     Run after section 30. Safe to run more than once.

alter table public.meal_deals add column if not exists review_images text[] not null default '{}';
grant select (review_images) on public.meal_deals to anon, authenticated;
