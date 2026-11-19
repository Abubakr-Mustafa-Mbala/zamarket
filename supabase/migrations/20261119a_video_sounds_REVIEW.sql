-- 32. Video maker: your background sounds (nasheeds), kept online so they
--     show on every phone you sign in on. A PRIVATE folder: only the team
--     (staff and marketing) can list, play, add or remove them; never public.
--     Run after section 31. Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-sounds', 'video-sounds', false, 31457280,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/opus', 'audio/flac'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "zm video sounds team read" on storage.objects;
create policy "zm video sounds team read" on storage.objects
for select to authenticated
using (bucket_id = 'video-sounds' and (public.is_staff() or public.can_market()));

drop policy if exists "zm video sounds team add" on storage.objects;
create policy "zm video sounds team add" on storage.objects
for insert to authenticated
with check (bucket_id = 'video-sounds' and (public.is_staff() or public.can_market()));

drop policy if exists "zm video sounds team remove" on storage.objects;
create policy "zm video sounds team remove" on storage.objects
for delete to authenticated
using (bucket_id = 'video-sounds' and (public.is_staff() or public.can_market()));
