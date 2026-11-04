-- ZA Market affiliate recruitment, REVIEW BEFORE DEPLOYMENT.
-- Requires existing public.profiles, public.resellers, public.can_market().
--
-- Training does NOT live in ZaMarket. Affiliates are trained in Al-Halaqa
-- Academy, which is a separate system. The earlier draft of this migration
-- created academy_lessons / academy_sessions / academy_questions tables for
-- lessons inside the marketplace; those have been removed deliberately. Do
-- not add them back. The only link between the two is the training_url
-- setting below, which points affiliates at the academy.

-- Where each applicant came from, so a campaign can be judged.
alter table public.resellers add column if not exists application_source text not null default 'direct';
alter table public.resellers add column if not exists application_campaign text not null default 'organic';
-- Existing roles and reviews remain unchanged. Do not expose contact details
-- through public recruitment reports; these columns use the current RLS.

-- Where affiliates go to be trained. Empty means no training link is shown
-- anywhere, rather than a dead page.
insert into settings (key, value, description) values
  ('training_url', '""', 'Link to the academy where affiliates are trained (Al-Halaqa). Training is not inside ZaMarket. Leave empty to hide the link.')
on conflict (key) do nothing;

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

-- If an earlier run of the academy draft created these, clear them out.
-- CASCADE takes their policies and grants with them. These tables only ever
-- held lesson text and scheduled calls, so there is nothing of value to lose;
-- no money, order or commission record is touched here.
drop table if exists public.academy_questions cascade;
drop table if exists public.academy_sessions cascade;
drop table if exists public.academy_lessons cascade;
drop function if exists public.is_approved_affiliate();
