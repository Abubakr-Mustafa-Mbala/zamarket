-- ZaMarket Journal 2.0: curated article themes, featured stores, reactions,
-- moderated comments and privacy-conscious aggregate engagement reporting.
-- Review and run in Supabase SQL Editor BEFORE deploying the matching frontend.
-- No changes to orders, payments, prices, affiliates or product permissions.

alter table public.posts add column if not exists reading_theme text not null default 'auto';
alter table public.posts add column if not exists featured_vendor_id uuid references public.vendors(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='posts_journal_reading_theme_check') then
    alter table public.posts add constraint posts_journal_reading_theme_check
      check (reading_theme in ('auto','ivory','stone','sage','cocoa','night'));
  end if;
end $$;

create table if not exists public.journal_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);
create table if not exists public.journal_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 1200),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index if not exists journal_comments_pending_idx on public.journal_comments(status,created_at desc);
create index if not exists journal_comments_post_idx on public.journal_comments(post_id,status,created_at desc);

-- Anonymous UUIDs are client-generated and do not contain email, phone or IP.
-- A token may submit one event type per article per day. Events are indicative,
-- not a substitute for audited orders or Google Search Console statistics.
create table if not exists public.journal_events (
  post_id uuid not null references public.posts(id) on delete cascade,
  visitor_token uuid not null,
  event_type text not null check (event_type in ('engaged_read','product_click','share_click')),
  event_day date not null default (now() at time zone 'Africa/Lusaka')::date,
  primary key(post_id,visitor_token,event_type,event_day)
);
create index if not exists journal_events_report_idx on public.journal_events(post_id,event_type,event_day);

alter table public.journal_likes enable row level security;
alter table public.journal_comments enable row level security;
alter table public.journal_events enable row level security;
revoke all on public.journal_likes,public.journal_comments,public.journal_events from anon, authenticated;
-- All client interaction goes through narrowly scoped and validated functions.

create or replace function public.journal_public_meta(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'theme',p.reading_theme,
      'vendor', case when v.id is not null then jsonb_build_object(
        'name',v.business_name,'slug',v.slug,'logo',v.logo_url) else null end
    )
    from public.posts p
    left join public.vendors v on v.id = coalesce(p.featured_vendor_id,
      (select pp.vendor_id from public.post_products l
       join public.products pp on pp.id=l.product_id
       join public.vendors pv on pv.id=pp.vendor_id and pv.status='approved'
       where l.post_id=p.id and pp.status in ('published','out_of_stock')
       order by l.sort limit 1)) and v.status='approved'
    where p.slug=p_slug and p.status='published'
  ), '{}'::jsonb);
$$;
revoke all on function public.journal_public_meta(text) from public;
grant execute on function public.journal_public_meta(text) to anon,authenticated;

create or replace function public.journal_engagement(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'likes',(select count(*) from public.journal_likes l where l.post_id=p.id),
    'liked',(select exists(select 1 from public.journal_likes l where l.post_id=p.id and l.user_id=auth.uid())),
    'comments',(select count(*) from public.journal_comments c where c.post_id=p.id and c.status='approved')
  ) from public.posts p where p.slug=p_slug and p.status='published'),
  jsonb_build_object('likes',0,'liked',false,'comments',0));
$$;
revoke all on function public.journal_engagement(text) from public;
grant execute on function public.journal_engagement(text) to anon,authenticated;

create or replace function public.journal_toggle_like(p_slug text) returns boolean
language plpgsql security definer set search_path=public as $$
declare pid uuid; removed uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to like an article'; end if;
  select id into pid from public.posts where slug=p_slug and status='published';
  if pid is null then raise exception 'Article unavailable'; end if;
  delete from public.journal_likes where post_id=pid and user_id=auth.uid() returning user_id into removed;
  if removed is not null then return false; end if;
  insert into public.journal_likes(post_id,user_id) values(pid,auth.uid()) on conflict do nothing;
  return true;
end $$;
revoke all on function public.journal_toggle_like(text) from public;
grant execute on function public.journal_toggle_like(text) to authenticated;

create or replace function public.journal_comments_for_post(p_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,
    'name',coalesce(nullif(split_part(pr.full_name,' ',1),''),'Reader'),
    'created_at',c.created_at) order by c.created_at desc),'[]'::jsonb)
  from public.journal_comments c
  join public.posts p on p.id=c.post_id and p.slug=p_slug and p.status='published'
  left join public.profiles pr on pr.id=c.user_id
  where c.status='approved';
$$;
revoke all on function public.journal_comments_for_post(text) from public;
grant execute on function public.journal_comments_for_post(text) to anon,authenticated;

create or replace function public.journal_submit_comment(p_slug text,p_body text) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid; new_id uuid; clean text := btrim(coalesce(p_body,''));
begin
  if auth.uid() is null then raise exception 'Sign in to comment'; end if;
  if char_length(clean) < 2 or char_length(clean) > 1200 then
    raise exception 'Comment must be between 2 and 1200 characters';
  end if;
  select id into pid from public.posts where slug=p_slug and status='published';
  if pid is null then raise exception 'Article unavailable'; end if;
  if (select count(*) from public.journal_comments
      where user_id=auth.uid() and created_at > now()-interval '10 minutes') >= 3 then
    raise exception 'Please wait before sending another comment';
  end if;
  insert into public.journal_comments(post_id,user_id,body)
  values(pid,auth.uid(),clean) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.journal_submit_comment(text,text) from public;
grant execute on function public.journal_submit_comment(text,text) to authenticated;

create or replace function public.journal_moderation_queue() returns jsonb
language sql stable security definer set search_path=public as $$
  select case when not public.is_staff() then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'body',c.body,
      'article',p.title,'slug',p.slug,'created_at',c.created_at,
      'name',coalesce(nullif(split_part(pr.full_name,' ',1),''),'Reader')) order by c.created_at)
      from public.journal_comments c join public.posts p on p.id=c.post_id
      left join public.profiles pr on pr.id=c.user_id
      where c.status='pending'), '[]'::jsonb) end;
$$;
revoke all on function public.journal_moderation_queue() from public;
grant execute on function public.journal_moderation_queue() to authenticated;

create or replace function public.journal_moderate_comment(p_id uuid,p_action text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  if p_action not in ('approved','rejected') then raise exception 'Invalid moderation action'; end if;
  update public.journal_comments
  set status=p_action, reviewed_at=now(), reviewed_by=auth.uid()
  where id=p_id and status='pending';
  return found;
end $$;
revoke all on function public.journal_moderate_comment(uuid,text) from public;
grant execute on function public.journal_moderate_comment(uuid,text) to authenticated;

create or replace function public.journal_track_event(p_slug text,p_event text,p_visitor uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
  if p_visitor is null or p_event not in ('engaged_read','product_click','share_click') then return false; end if;
  select id into pid from public.posts where slug=p_slug and status='published';
  if pid is null then return false; end if;
  insert into public.journal_events(post_id,event_type,visitor_token)
  values (pid,p_event,p_visitor) on conflict do nothing;
  return true;
end $$;
revoke all on function public.journal_track_event(text,text,uuid) from public;
grant execute on function public.journal_track_event(text,text,uuid) to anon,authenticated;

create or replace function public.journal_metrics() returns jsonb
language sql stable security definer set search_path=public as $$
  select case when not public.is_staff() then '[]'::jsonb else
  coalesce((select jsonb_agg(jsonb_build_object(
    'slug',p.slug,'title',p.title,'views',p.views,
    'likes',(select count(*) from public.journal_likes l where l.post_id=p.id),
    'comments',(select count(*) from public.journal_comments c where c.post_id=p.id and c.status='approved'),
    'engaged',(select count(*) from public.journal_events e where e.post_id=p.id and e.event_type='engaged_read'),
    'product_clicks',(select count(*) from public.journal_events e where e.post_id=p.id and e.event_type='product_click'),
    'share_clicks',(select count(*) from public.journal_events e where e.post_id=p.id and e.event_type='share_click')
  ) order by p.published_at desc) from public.posts p where p.status='published'), '[]'::jsonb) end;
$$;
revoke all on function public.journal_metrics() from public;
grant execute on function public.journal_metrics() to authenticated;
