-- ZA Market affiliate recruitment and Academy, REVIEW BEFORE DEPLOYMENT.
-- This migration is not applied by bundling it in the ZIP.
-- Requires existing public.profiles, public.resellers, public.can_market().

alter table public.resellers add column if not exists application_source text not null default 'direct';
alter table public.resellers add column if not exists application_campaign text not null default 'organic';
-- Existing roles and reviews remain unchanged. Do not expose contact details
-- through public recruitment reports; these columns use the current RLS.

create table if not exists public.academy_lessons (
  lesson_key text primary key check (length(lesson_key) between 1 and 60),
  summary text not null default '' check (length(summary) <= 2000),
  video_url text not null default '' check (length(video_url) <= 1500),
  resource_url text not null default '' check (length(resource_url) <= 1500),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 150),
  description text not null default '' check (length(description) <= 1500),
  starts_at timestamptz not null,
  duration_minutes integer not null default 45 check (duration_minutes between 15 and 240),
  meeting_url text not null default '' check (length(meeting_url) <= 1500),
  recording_url text not null default '' check (length(recording_url) <= 1500),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists academy_sessions_starts_at_idx on public.academy_sessions(starts_at);

create table if not exists public.academy_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (length(trim(question)) between 10 and 800),
  answer text check (answer is null or length(answer) <= 4000),
  show_to_others boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists academy_questions_user_created_idx on public.academy_questions(user_id,created_at desc);

-- Helper is SECURITY DEFINER to check affiliate eligibility without depending
-- on SELECT privileges for the parent resellers table in the policy context.
create or replace function public.is_approved_affiliate() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.resellers where user_id = auth.uid() and status = 'approved');
$$;
revoke all on function public.is_approved_affiliate() from public;
grant execute on function public.is_approved_affiliate() to authenticated;

alter table public.academy_lessons enable row level security;
alter table public.academy_sessions enable row level security;
alter table public.academy_questions enable row level security;

-- Only affiliate members and the marketing team can see private class links.
create policy academy_lesson_read on public.academy_lessons for select to authenticated
  using ((published and public.is_approved_affiliate()) or public.can_market());
create policy academy_lesson_write on public.academy_lessons for all to authenticated
  using (public.can_market()) with check (public.can_market());

create policy academy_session_read on public.academy_sessions for select to authenticated
  using (public.is_approved_affiliate() or public.can_market());
create policy academy_session_write on public.academy_sessions for all to authenticated
  using (public.can_market()) with check (public.can_market());

create policy academy_question_read on public.academy_questions for select to authenticated
  using (public.can_market() or user_id = auth.uid() or
         (public.is_approved_affiliate() and show_to_others and answer is not null));
create policy academy_question_insert on public.academy_questions for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved_affiliate()
              and answer is null and answered_at is null and show_to_others = false);
create policy academy_question_update on public.academy_questions for update to authenticated
  using (public.can_market()) with check (public.can_market());
create policy academy_question_delete on public.academy_questions for delete to authenticated
  using (public.can_market());

revoke all on public.academy_lessons, public.academy_sessions, public.academy_questions from anon;
grant select, insert, update, delete on public.academy_lessons, public.academy_sessions, public.academy_questions to authenticated;
-- Content is private by default; do not add anon policies to these tables.

-- Aggregate-only recruitment metrics. No applicant names, phones, or emails
-- are exposed to marketing staff (they cannot SELECT the resellers table).
create or replace function public.affiliate_recruitment_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare output jsonb;
begin
  if not public.can_market() then raise exception 'Not permitted'; end if;
  select jsonb_build_object(
    'applied', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'approved', count(*) filter (where status = 'approved'),
    'rejected', count(*) filter (where status = 'rejected'),
    'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', x.application_source, 'applications', x.applications, 'approved', x.approved) order by x.applications desc)
      from (select application_source, count(*) applications, count(*) filter (where status='approved') approved
       from public.resellers group by application_source) x), '[]'::jsonb)
  ) into output from public.resellers;
  return output;
end $$;
revoke all on function public.affiliate_recruitment_report() from public;
grant execute on function public.affiliate_recruitment_report() to authenticated;
