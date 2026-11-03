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
