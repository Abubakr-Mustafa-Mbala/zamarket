import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n } from '../../lib/format'
import { Loading, Empty } from '../../components/ui'
import { DateBar, useRange } from '../shared/Earnings'

// Two questions this answers: have we covered what the month costs, and is any
// order actually losing money?
export default function ProfitGuard() {
  const { settings } = useAuth()
  const [range, setRange] = useRange('month')
  const { data, loading } = useData(async () => ({
    be: await q(supabase.rpc('break_even', { p_from: range.from, p_to: range.to })),
    losers: await q(supabase.rpc('losing_orders', { p_from: range.from, p_to: range.to })),
  }), [range.from, range.to])
  if (loading || !data) return <><div className="card"><DateBar range={range} setRange={setRange} /></div><Loading /></>
  const b = data.be || {}
  const losers = data.losers || []
  const fixed = n(b.fixed)
  const profit = n(b.profit)
  const pct = fixed > 0 ? Math.max(0, Math.min(100, (profit / fixed) * 100)) : null
  const covered = fixed > 0 && profit >= fixed
  const shortBy = Math.max(0, fixed - profit)

  return (
    <div className="stack">
      <div className="card"><DateBar range={range} setRange={setRange} /></div>

      <section className={`card stack-sm ${covered ? '' : 'warn-card'}`}>
        <h3>Have we covered the month?</h3>
        {fixed <= 0 ? (
          <p className="small muted">Set what the business must cover every month — rent, airtime, transport, data — in Settings, and this tells you whether you have covered it yet.</p>
        ) : (
          <>
            <div className="be-bar"><span style={{ width: `${pct}%` }} className={covered ? 'ok' : 'short'} /></div>
            <div className="between">
              <span className="small">{covered ? 'Covered — everything past this is yours' : `Still short by ${money(shortBy)}`}</span>
              <span className="strong">{money(profit)} of {money(fixed)}</span>
            </div>
            <div className="mini-stats">
              <div><b>{b.orders}</b><span>orders completed</span></div>
              <div><b>{money(b.avg_contribution)}</b><span>average each leaves you</span></div>
              <div><b>{b.orders_needed ?? '—'}</b><span>orders to cover the month</span></div>
              <div><b>{b.orders_short ?? '—'}</b><span>still to go</span></div>
            </div>
            <p className="tiny muted">Worked out from what each completed order actually left after costs, including delivery — whether you charged for it or not.</p>
          </>
        )}
      </section>

      <section className="card stack-sm">
        <div className="between">
          <h3>Orders that lost money</h3>
          <span className="small muted">{losers.length}</span>
        </div>
        {losers.length === 0 ? (
          <Empty title="None in these dates">Every completed order left something behind after costs.</Empty>
        ) : (
          <div className="mini-table">
            {losers.map((o) => {
              const reasons = []
              if (n(o.delivery_cost) > n(o.delivery_charged)) reasons.push(`delivery cost ${money(o.delivery_cost)}${n(o.delivery_charged) > 0 ? `, charged ${money(o.delivery_charged)}` : ', charged nothing'}`)
              if (n(o.commission) > 0) reasons.push(`${money(o.commission)} commission`)
              if (n(o.discount) > 0) reasons.push(`${money(o.discount)} off the normal price`)
              return (
                <div key={o.id} className="mini-row">
                  <span className="grow">
                    <strong>#{o.order_number} · {o.customer || 'Customer'}</strong>
                    <span className="tiny muted">{date(o.date)} · sold for {money(o.total)}{reasons.length ? ` · ${reasons.join(' · ')}` : ''}</span>
                  </span>
                  <span className="strong bad">{money(o.profit)}</span>
                  <a className="btn sm" href={`/admin/orders/${o.id}`}>Open</a>
                </div>
              )
            })}
          </div>
        )}
        <p className="tiny muted">Delivery is counted at what you recorded, or {money(settings.assumed_delivery_cost ?? 25)} where nothing was recorded. Free delivery for the customer still costs the business.</p>
      </section>
    </div>
  )
}
