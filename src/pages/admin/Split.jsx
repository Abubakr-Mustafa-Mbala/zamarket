import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n } from '../../lib/format'
import { Loading, Field, Input, useToast, Empty } from '../../components/ui'
import { DateBar, useRange } from '../shared/Earnings'

// Two founders, one profit. This says what stays in the business and what each
// person can take, so nobody has to work it out at the end of the month.
export default function Split() {
  const toast = useToast()
  const { settings, refresh, isFounder } = useAuth()
  const [range, setRange] = useRange('month')
  const [editing, setEditing] = useState(false)
  const [reinvest, setReinvest] = useState(String(settings.reinvest_pct ?? 30))
  const [shares, setShares] = useState({})
  const { data, loading, reload } = useData(() => q(supabase.rpc('profit_split', { p_from: range.from, p_to: range.to })), [range.from, range.to])

  if (!isFounder) return <Empty title="Founders only">This page shows how the founders' profit is split.</Empty>
  if (loading || !data) return <><div className="card"><DateBar range={range} setRange={setRange} /></div><Loading /></>

  const s = data
  const loss = n(s.profit) <= 0
  const mine = (s.people || []).find((p) => p.is_me)

  const saveShares = async () => {
    try {
      for (const p of s.people) {
        const pct = shares[p.user_id] != null ? n(shares[p.user_id]) : n(p.pct)
        const { error } = await supabase.rpc('set_profit_share', { p_user: p.user_id, p_pct: pct })
        if (error) throw new Error(error.message)
      }
      const { error } = await supabase.from('settings').upsert({ key: 'reinvest_pct', value: n(reinvest) })
      if (error) throw new Error(error.message)
      await refresh()
      toast('Split saved')
      setEditing(false)
      reload()
    } catch (e) { toast(e.message, true) }
  }

  const totalPct = (s.people || []).reduce((t, p) => t + n(shares[p.user_id] ?? p.pct), 0)

  return (
    <div className="stack">
      <div className="card"><DateBar range={range} setRange={setRange} /></div>

      <div className="split-top">
        <div className="split-profit">
          <span className="small">Profit in these dates</span>
          <strong className={loss ? 'bad' : ''}>{money(s.profit)}</strong>
          <span className="tiny muted">After product costs, commissions, vendor payouts, delivery, adverts and expenses</span>
        </div>
        <div className="split-flow">
          <div>
            <span className="tiny muted">Stays in the business</span>
            <strong>{money(s.reinvested)}</strong>
            <span className="tiny muted">{n(s.reinvest_pct)}% for stock, adverts and a reserve</span>
          </div>
          <span className="split-arrow" aria-hidden>→</span>
          <div>
            <span className="tiny muted">To share between you</span>
            <strong className="ok">{money(s.to_share)}</strong>
            <span className="tiny muted">what the founders can take</span>
          </div>
        </div>
      </div>

      {loss && <div className="card warn-line bad">The business did not make a profit in these dates, so there is nothing to share. Taking money out now takes it from the float.</div>}

      <section className="card stack-sm">
        <div className="between">
          <h3>Each founder's share</h3>
          {!editing ? <button className="btn sm" onClick={() => setEditing(true)}>Change the split</button> : <button className="btn sm ghost" onClick={() => { setEditing(false); setShares({}) }}>Cancel</button>}
        </div>

        {editing ? (
          <div className="stack-sm">
            <Field label="Keep in the business (%)" hint="Taken off the profit before anyone's share">
              <Input type="number" value={reinvest} onChange={setReinvest} />
            </Field>
            {s.people.map((p) => (
              <Field key={p.user_id} label={p.name}>
                <Input type="number" value={shares[p.user_id] ?? p.pct} onChange={(v) => setShares({ ...shares, [p.user_id]: v })} />
              </Field>
            ))}
            <p className={`small ${Math.round(totalPct) === 100 ? 'muted' : 'bad'}`}>Shares add up to {Math.round(totalPct)}%. {Math.round(totalPct) === 100 ? '' : 'They should add up to 100.'}</p>
            <button className="btn primary" onClick={saveShares} disabled={Math.round(totalPct) !== 100}>Save the split</button>
          </div>
        ) : (
          <div className="split-people">
            {s.people.map((p) => (
              <div key={p.user_id} className={`split-person ${p.is_me ? 'me' : ''}`}>
                <span className="sp-name">{p.name}{p.is_me && <span className="tiny muted"> — you</span>}</span>
                <span className="sp-pct">{n(p.pct)}%</span>
                <span className="sp-amount">{money(p.amount)}</span>
              </div>
            ))}
            {n(s.shares_total) !== 100 && <p className="tiny bad">Shares add up to {n(s.shares_total)}%, not 100. Change the split so the money adds up properly.</p>}
          </div>
        )}
      </section>

      {mine && !loss && (
        <section className="card mine-card">
          <h3>What you can take</h3>
          <div className="mine-amount">{money(mine.amount)}</div>
          <p className="small muted">Your {n(mine.pct)}% of {money(s.to_share)}, for {date(range.from)} to {date(range.to)}. Record it under Founder money when you take it, so the books stay right.</p>
        </section>
      )}

      {(s.withdrawn || []).length > 0 && (
        <section className="card stack-sm">
          <h3>Already taken in these dates</h3>
          <div className="mini-table">
            {s.withdrawn.map((w) => <div key={w.name} className="mini-row"><span className="grow">{w.name}</span><span className="strong money">{money(w.amount)}</span></div>)}
          </div>
          <p className="tiny muted">Money taken out is not an expense. It comes from the share above.</p>
        </section>
      )}
    </div>
  )
}
