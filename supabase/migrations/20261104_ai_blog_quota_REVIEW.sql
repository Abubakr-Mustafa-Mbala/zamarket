-- APPLY IN SUPABASE SQL EDITOR BEFORE ENABLING THE AI BLOG WRITER.
-- Staff-only, database-enforced hourly and daily usage caps; does not change posts.
create table if not exists public.ai_blog_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_blog_generations_user_created_idx
  on public.ai_blog_generations(user_id, created_at desc);
alter table public.ai_blog_generations enable row level security;
revoke all on public.ai_blog_generations from anon, authenticated;

create or replace function public.claim_ai_blog_generation() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not (public.is_staff() or public.can_market()) then
    raise exception 'Marketing permission required' using errcode = '42501';
  end if;
  -- Serialize quota checking per signed-in user. No client can bypass this RPC.
  perform pg_advisory_xact_lock(hashtext(uid::text));
  if (select count(*) from public.ai_blog_generations
      where user_id = uid and created_at >= now() - interval '1 hour') >= 6
     or (select count(*) from public.ai_blog_generations
      where user_id = uid and created_at >= now() - interval '1 day') >= 20 then
    return false;
  end if;
  insert into public.ai_blog_generations (user_id) values (uid);
  return true;
end;
$$;
revoke all on function public.claim_ai_blog_generation() from public, anon;
grant execute on function public.claim_ai_blog_generation() to authenticated;

-- Optional periodic cleanup (e.g. a monthly admin maintenance job):
-- delete from public.ai_blog_generations where created_at < now() - interval '90 days';
