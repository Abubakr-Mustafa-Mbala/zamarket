-- ZaMarket Motors: approved affiliates may see their estimated reward in Kwacha
-- without exposing the private seller success-fee agreement to customers.
-- Run AFTER 20261109_vehicle_success_fee_REVIEW.sql.
-- Safe to review/reapply: creates/replaces one narrowly scoped read-only RPC.

create or replace function public.affiliate_vehicle_reward_estimates()
returns table(product_id uuid, estimated_reward numeric)
language sql stable security definer
set search_path=public
as $$
  select p.id,
    round(p.price * p.deal_fee_pct / 100
      * coalesce(p.vehicle_affiliate_share_pct, 50) / 100, 2)
  from public.products p
  where p.offering_type = 'vehicle'
    and p.status = 'published'
    and p.deal_fee_pct is not null and p.deal_fee_pct > 0
    and exists (
      select 1 from public.resellers r
      where r.user_id = auth.uid() and r.status = 'approved'
    );
$$;
revoke all on function public.affiliate_vehicle_reward_estimates() from public, anon;
grant execute on function public.affiliate_vehicle_reward_estimates() to authenticated;

comment on function public.affiliate_vehicle_reward_estimates() is
  'Only approved affiliates receive estimated referral rewards for published vehicles. Estimates use advertised price and can change with final close. No seller terms are exposed.';
