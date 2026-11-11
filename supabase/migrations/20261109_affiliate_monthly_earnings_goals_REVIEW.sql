-- ZaMarket Affiliate Hub: personal monthly commission goals and private metrics.
-- Review in Supabase SQL editor and apply ONCE after the current migrations.
-- It does not modify vendor pricing, commissions, payout amounts or existing goals.

create table if not exists public.affiliate_monthly_goals (
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  month date not null,
  target_amount numeric(14,2) not null check (target_amount >= 1 and target_amount <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (reseller_id, month),
  constraint affiliate_goals_month_first_day check (extract(day from month) = 1)
);

alter table public.affiliate_monthly_goals enable row level security;
revoke all on public.affiliate_monthly_goals from anon;
grant select, insert, update on public.affiliate_monthly_goals to authenticated;

drop policy if exists affiliate_goals_read on public.affiliate_monthly_goals;
create policy affiliate_goals_read on public.affiliate_monthly_goals
for select to authenticated using (reseller_id = public.my_reseller_id() or public.is_staff());

drop policy if exists affiliate_goals_insert on public.affiliate_monthly_goals;
create policy affiliate_goals_insert on public.affiliate_monthly_goals
for insert to authenticated with check (reseller_id = public.my_reseller_id());

drop policy if exists affiliate_goals_update on public.affiliate_monthly_goals;
create policy affiliate_goals_update on public.affiliate_monthly_goals
for update to authenticated
using (reseller_id = public.my_reseller_id())
with check (reseller_id = public.my_reseller_id());

-- Work in Zambia's local calendar month. The 90-day verified average is
-- only an estimate, and pending/reversed commissions never count as earned.
create or replace function public.affiliate_goal_metrics(p_reseller uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with permitted as (
    select coalesce(p_reseller = public.my_reseller_id() or public.is_staff(), false) as allowed
  ), bounds as (
    select date_trunc('month', now() at time zone 'Africa/Lusaka') at time zone 'Africa/Lusaka' as starts,
           (date_trunc('month', now() at time zone 'Africa/Lusaka') + interval '1 month') at time zone 'Africa/Lusaka' as ends
  )
  select case when (select allowed from permitted) then jsonb_build_object(
    'earned_month', coalesce((select sum(c.amount) from public.commissions c cross join bounds b
      where c.reseller_id = p_reseller and c.created_at >= b.starts and c.created_at < b.ends
        and c.status in ('approved','paid')), 0),
    'pending_month', coalesce((select sum(c.amount) from public.commissions c cross join bounds b
      where c.reseller_id = p_reseller and c.created_at >= b.starts and c.created_at < b.ends
        and c.status in ('pending','verified')), 0),
    'average_commission', coalesce((select avg(c.amount) from public.commissions c
      where c.reseller_id = p_reseller and c.created_at >= now() - interval '90 days'
        and c.status in ('approved','paid') and c.amount > 0), 0)
  ) else null end;
$$;
revoke all on function public.affiliate_goal_metrics(uuid) from public, anon;
grant execute on function public.affiliate_goal_metrics(uuid) to authenticated;
