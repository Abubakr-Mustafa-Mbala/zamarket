import { useEffect, useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useData } from '../lib/useData'
import { money } from '../lib/format'
import { goalPlan, lusakaMonth } from '../lib/affiliateGoals'
import Icon from '../lib/icons'

export default function AffiliateMonthlyGoal({ resellerId }) {
  const month = lusakaMonth()
  const monthLabel = new Date(`${month}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Lusaka' })
  const { data, error, loading, reload } = useData(async () => {
    if (!resellerId) return null
    const [goal, metrics] = await Promise.all([
      q(supabase.from('affiliate_monthly_goals').select('target_amount').eq('reseller_id', resellerId).eq('month', month).maybeSingle()),
      q(supabase.rpc('affiliate_goal_metrics', { p_reseller: resellerId })),
    ])
    return { goal: goal?.target_amount || 0, metrics: metrics || {} }
  }, [resellerId, month])
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (data && !editing) setAmount(data.goal ? String(data.goal) : '') }, [data, editing])
  const current = goalPlan({
    target: data?.goal,
    earned: data?.metrics?.earned_month,
    pending: data?.metrics?.pending_month,
    averagePerSale: data?.metrics?.average_commission,
  })

  const save = async (event) => {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value < 1 || value > 100000000) {
      setSaveError('Enter a goal between K1 and K100,000,000.')
      return
    }
    setSaving(true); setSaveError(''); setNotice('')
    try {
      await q(supabase.from('affiliate_monthly_goals').upsert({
        reseller_id: resellerId, month, target_amount: Math.round(value * 100) / 100,
      }, { onConflict: 'reseller_id,month' }))
      setEditing(false)
      await reload()
      setNotice('Your goal is saved for this month.')
    } catch (e) { setSaveError(e.message || 'Could not save goal. Try again.') }
    finally { setSaving(false) }
  }

  return <section className="aff-goal-card" aria-label="Monthly affiliate earnings goal">
    <div className="aff-goal-header">
      <div><span className="aff-home-eyebrow">YOUR MONTHLY GOAL · {monthLabel.toUpperCase()}</span><h2>Make this month count</h2></div>
      <button type="button" className="aff-goal-edit" onClick={() => { setEditing(v => !v); setSaveError(''); setNotice('') }}>
        <Icon.edit /> {data?.goal ? 'Edit goal' : 'Set goal'}
      </button>
    </div>
    {error ? <div className="aff-goal-setup" role="alert"><strong>Goal tracking needs setup</strong><p>Apply the included affiliate monthly goals migration in Supabase, then reload. Your existing earnings remain unchanged.</p><small>{error}</small></div>
      : loading || !data ? <p className="small muted" role="status">Loading your earnings goal…</p>
      : <>
        {editing && <form className="aff-goal-form" onSubmit={save}>
          <label htmlFor="aff-goal-target">Monthly commission target (K)</label>
          <div className="aff-goal-form-line"><input id="aff-goal-target" type="number" inputMode="decimal" min="1" max="100000000" step="0.01" placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
            <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save goal'}</button></div>
          <div className="aff-goal-presets" aria-label="Suggested goal amounts">{[1000,2500,5000].map(value => <button type="button" key={value} onClick={() => setAmount(String(value))}>K{value.toLocaleString('en-ZM')}</button>)}</div>
          <p className="tiny muted">Personal motivation only. Your commission rates and payouts will not change.</p>
          {saveError && <p className="small bad" role="alert">{saveError}</p>}
        </form>}
        {notice && <p className="small aff-goal-notice" role="status">{notice}</p>}
        {current.goal ? <>
          <div className="aff-goal-display">
            <div className="aff-goal-ring" style={{ '--goal-progress': `${current.percent}%` }} aria-label={`${current.percent}% of monthly goal achieved`}><div><strong>{current.percent}%</strong><span>achieved</span></div></div>
            <div className="aff-goal-amounts"><span>Approved and paid this month</span><strong>{money(current.earned)}</strong><p>of {money(current.goal)} target</p></div>
          </div>
          <div className="aff-goal-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={current.percent} aria-label="Goal progress"><span style={{ width: `${current.percent}%` }} /></div>
          <div className="aff-goal-balance"><div><span>Still to earn</span><strong>{money(current.remaining)}</strong></div><div><span>In review (not counted yet)</span><strong>{money(current.pending)}</strong></div></div>
          {current.complete ? <div className="aff-goal-advice"><strong>Goal reached!</strong><p>Your approved and paid commission this month meets your target.</p></div>
            : current.averagePerSale > 0 ? <div className="aff-goal-advice"><strong>Your estimated path</strong><p>Based on your recent verified average of <b>{money(current.averagePerSale)}</b> per sale, you need roughly <b>{current.salesNeeded} more qualifying sales</b> — about <b>{current.weeklySales} a week</b> or <b>{current.dailySales} per day</b> over the {current.daysLeft} days remaining.</p></div>
            : <div className="aff-goal-advice"><strong>Build your first results</strong><p>Once you have approved commissions, we'll estimate how many more sales could help you reach your goal. No invented conversion rates or guaranteed income.</p></div>}
        </> : <div className="aff-goal-empty"><div className="aff-goal-empty-mark"><Icon.target /></div><div><strong>What would you like to earn this month?</strong><p>Set a personal target. Watch it grow as commissions become approved or paid.</p></div></div>}
        <p className="aff-goal-footnote">Progress counts commissions created this month that are approved or paid. Pending, reversed and rejected amounts do not count. Estimates are not guaranteed earnings.</p>
      </>}
  </section>
}
