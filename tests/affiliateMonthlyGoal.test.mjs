import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { goalPlan, lusakaMonth } from '../src/lib/affiliateGoals.js'

const goalComponent = readFileSync(new URL('../src/components/AffiliateMonthlyGoal.jsx',import.meta.url), 'utf8')
const home = readFileSync(new URL('../src/pages/reseller/Reseller.jsx',import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/migrations/20261109_affiliate_monthly_earnings_goals_REVIEW.sql',import.meta.url), 'utf8')

test('calendar month is determined in Zambia, not browser timezone', () => {
  assert.equal(lusakaMonth('2026-10-31T22:30:00.000Z'), '2026-11-01')
  assert.equal(lusakaMonth('2026-11-30T21:30:00.000Z'), '2026-11-01')
})
test('only eligible earned commissions move goal progress; pending shown separately', () => {
  assert.deepEqual(goalPlan({target:5000,earned:1500,pending:180,averagePerSale:125,now:'2026-11-09T10:00:00.000Z'}), {
    goal:5000,earned:1500,pending:180,remaining:3500,percent:30,daysLeft:22,averagePerSale:125,salesNeeded:28,dailySales:2,weeklySales:9,complete:false,
  })
})
test('zero history is not presented as an invented sales forecast', () => {
  const p = goalPlan({target:5000,earned:0,averagePerSale:0})
  assert.equal(p.salesNeeded,0)
  assert.equal(p.percent,0)
})
test('completion is capped at 100% and remaining does not go negative', () => {
  const p=goalPlan({target:5000,earned:7000})
  assert.equal(p.complete,true)
  assert.equal(p.percent,100)
  assert.equal(p.remaining,0)
})
test('goals persist per affiliate per month and are isolated with RLS', () => {
  assert.match(sql,/primary key \(reseller_id, month\)/)
  assert.match(sql,/enable row level security/i)
  assert.match(sql,/reseller_id = public\.my_reseller_id\(\)/)
  assert.match(sql,/c\.status in \('approved','paid'\)/)
  assert.match(sql,/c\.status in \('pending','verified'\)/)
  assert.match(goalComponent,/upsert\(/)
  assert.match(goalComponent,/averagePerSale/)
})
test('affiliate dashboard no longer equates gross order revenue to commission goals', () => {
  assert.match(home, /<AffiliateMonthlyGoal resellerId=\{r\.id\}/)
  assert.doesNotMatch(home,/n\(s\.revenue_month\) \/ target/)
  assert.match(home,/Orders this month/)
})
