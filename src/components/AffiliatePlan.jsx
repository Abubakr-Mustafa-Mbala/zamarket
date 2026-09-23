import { useMemo, useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useData } from '../lib/useData'
import { money, num, n } from '../lib/format'
import { Loading, Field, Input } from './ui'

const since = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

// Your own numbers, and what a target would take — based on your results, not promises.
export default function AffiliatePlan() {
  const [goal, setGoal] = useState('500')
  const { data, loading } = useData(() => q(supabase.rpc('affiliate_funnel', { p_from: since(30), p_to: today() })), [])
  const f = data || {}

  const plan = useMemo(() => {
    const want = n(goal)
    const perSale = n(f.avg_commission) || 0
    const clicks = n(f.clicks)
    const orders = n(f.orders)
    const buyRate = clicks > 0 ? orders / clicks : 0
    if (!want || !perSale) return null
    const salesNeeded = Math.ceil(want / perSale)
    const clicksNeeded = buyRate > 0 ? Math.ceil(salesNeeded / buyRate) : null
    return { salesNeeded, clicksNeeded, perSale, buyRate }
  }, [goal, f])

  if (loading) return <Loading />
  const steps = [
    ['Opened your link', num(f.clicks)],
    ['Ordered', num(f.orders)],
    ['Order completed', num(f.completed)],
  ]
  const top = Math.max(1, n(f.clicks), n(f.orders))

  return (
    <section className="card stack-sm">
      <h3>Your last 30 days</h3>
      <div className="funnel-steps">
        {steps.map(([label, value], i) => (
          <div key={label} className="fs">
            <div className="fs-bar"><span style={{ width: `${Math.max((n(value) / top) * 100, n(value) ? 5 : 0)}%` }} /></div>
            <div className="fs-row"><span className="fs-label"><strong>{label}</strong></span><span className="fs-num"><b>{value}</b></span></div>
          </div>
        ))}
      </div>
      <div className="mini-stats">
        <div><b>{money(f.earned)}</b><span>commission earned</span></div>
        <div><b>{money(f.waiting)}</b><span>still being checked</span></div>
        <div><b>{money(f.avg_commission)}</b><span>average per sale</span></div>
        {f.best?.name && <div><b>{f.best.name}</b><span>your best seller</span></div>}
      </div>

      <div className="card flat stack-sm">
        <h3>What would a target take?</h3>
        <Field label="I want to earn this much in a month (K)"><Input money value={goal} onChange={setGoal} /></Field>
        {!plan ? (
          <p className="small muted">Once you have made a sale or two, this works out what a target would take, using your own numbers.</p>
        ) : (
          <>
            <p className="small">At your average of <strong>{money(plan.perSale)}</strong> per sale, {money(n(goal))} means about <strong>{plan.salesNeeded} sales</strong> a month — roughly {Math.ceil(plan.salesNeeded / 4)} a week.</p>
            {plan.clicksNeeded
              ? <p className="small">So far {Math.round(plan.buyRate * 100)} out of every 100 people who open your link order something, so that is about <strong>{num(plan.clicksNeeded)} link opens</strong> a month, or {Math.ceil(plan.clicksNeeded / 30)} a day.</p>
              : <p className="small muted">Once people start opening your link we can also show how many opens that would take.</p>}
            <p className="tiny muted">These are working assumptions from your own past results, not a promise. Your numbers change as you get better, and as products change.</p>
          </>
        )}
      </div>
    </section>
  )
}
