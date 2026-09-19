import { useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, date, n } from '../../lib/format'
import { Loading, Empty, useToast, Badge, Field, Input, Modal } from '../../components/ui'

// Affiliates naturally pile onto two or three easy products. This shows what is
// being ignored and lets you pay more on it for a while.
export default function Coverage() {
  const toast = useToast()
  const { settings, isStaff } = useAuth()
  const [boosting, setBoosting] = useState(null)
  const { data, loading, reload } = useData(() => q(supabase.rpc('product_coverage')), [])
  const rows = data || []

  const groups = useMemo(() => {
    const boosted = rows.filter((r) => r.boost_pct && new Date(r.boost_until) > new Date())
    const never = rows.filter((r) => !boosted.includes(r) && Number(r.affiliate_sales) === 0)
    const quiet = rows.filter((r) => !boosted.includes(r) && Number(r.affiliate_sales) > 0 && Number(r.recent_affiliate_sales) === 0)
    const working = rows.filter((r) => !boosted.includes(r) && Number(r.recent_affiliate_sales) > 0)
    return { boosted, never, quiet, working }
  }, [rows])

  if (loading) return <Loading />
  if (!rows.length) return <Empty title="No published products yet">Publish something first.</Empty>

  const covered = rows.length ? Math.round((groups.working.length / rows.length) * 100) : 0

  const Row = ({ r }) => {
    const live = r.boost_pct && new Date(r.boost_until) > new Date()
    return (
      <div className="mini-row">
        <span className="grow">
          <strong>{r.name}</strong>
          <span className="tiny muted">
            {money(r.price)}{r.vendor ? ` · ${r.vendor}` : ''} · {r.all_sales} sold in total
            {Number(r.affiliate_sales) > 0 ? ` · ${r.affiliates} affiliate${r.affiliates > 1 ? 's' : ''} selling it` : ' · no affiliate has ever sold it'}
            {r.last_affiliate_sale ? ` · last affiliate sale ${date(r.last_affiliate_sale)}` : ''}
          </span>
        </span>
        <span className="right">
          <b className="copper">{money(r.earns)}</b>
          <span className="tiny muted">per sale to the affiliate</span>
        </span>
        {live && <Badge tone="warn">Boosted {n(r.boost_pct)}% until {date(r.boost_until)}</Badge>}
        {isStaff && <button className="btn sm" onClick={() => setBoosting(r)}>{live ? 'Change' : 'Pay more'}</button>}
      </div>
    )
  }

  const Section = ({ title, note, list, tone }) => list.length === 0 ? null : (
    <section className={`card stack-sm ${tone || ''}`}>
      <div className="between"><h3>{title}</h3><span className="small muted">{list.length}</span></div>
      <p className="small muted">{note}</p>
      <div className="mini-table">{list.map((r) => <Row key={r.id} r={r} />)}</div>
    </section>
  )

  return (
    <div className="stack">
      <div className="mk-kpis">
        <div className="kpi lead"><span className="kpi-l">Products affiliates are selling</span><span className="kpi-v">{covered}%</span><span className="kpi-s">{groups.working.length} of {rows.length} in the last {settings.coverage_days || 30} days</span></div>
        <div className="kpi"><span className="kpi-l">Never sold by an affiliate</span><span className="kpi-v">{groups.never.length}</span><span className="kpi-s">the ones to fix first</span></div>
        <div className="kpi"><span className="kpi-l">Paying extra right now</span><span className="kpi-v">{groups.boosted.length}</span><span className="kpi-s">boosts running</span></div>
      </div>

      <div className="card explain small">
        <p><strong>Why this happens.</strong> Affiliates push whatever earns them most for the least effort. A K80 case at 5% pays K4; nobody will work for that. The fix is not begging them — it is making the ignored product worth their time: pay more for a while, raise its commission for good, or accept that some cheap items only ever sell from the shop itself.</p>
        <p className="mt">Every affiliate also earns a <strong>{money(settings.first_sale_bonus ?? 25)} bonus</strong> the first time anyone sells a product through an affiliate link, which pushes them towards products nobody has touched.</p>
      </div>

      <Section title="Never sold by an affiliate" note="Nobody has earned a kwacha from these. Boost the ones that could actually sell." list={groups.never} />
      <Section title="Gone quiet" note={`Sold by affiliates before, but nothing in the last ${settings.coverage_days || 30} days.`} list={groups.quiet} />
      <Section title="Paying extra right now" note="These pay a raised commission until the date shown." list={groups.boosted} />
      <Section title="Affiliates are selling these" note="Leave them alone. This is what is working." list={groups.working} />

      {boosting && <BoostModal product={boosting} settings={settings} onClose={() => setBoosting(null)} onDone={() => { setBoosting(null); reload() }} />}
    </div>
  )
}

function BoostModal({ product, settings, onClose, onDone }) {
  const toast = useToast()
  const base = product.commission_type === 'pct' ? n(product.commission_value) : n(settings.default_commission_pct)
  const [pct, setPct] = useState(String(Math.min(25, Math.max(10, Math.round(base * 2)))))
  const [days, setDays] = useState('14')
  const [busy, setBusy] = useState(false)
  const earns = (n(product.price) * n(pct)) / 100

  const save = async (clear) => {
    setBusy(true)
    const { error } = await supabase.rpc('boost_product', { p_product: product.id, p_pct: clear ? null : n(pct), p_days: n(days) })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(clear ? 'Boost removed' : `Affiliates now earn ${money(earns)} on this`)
    onDone()
  }

  return (
    <Modal title={`Pay more on ${product.name}`} onClose={onClose}>
      <div className="stack">
        <p className="small muted">The affiliate currently earns <strong>{money(product.earns)}</strong> per sale. Raise it for a set number of days and it goes back by itself.</p>
        <div className="form-grid">
          <Field label="Commission while boosted (%)"><Input type="number" value={pct} onChange={setPct} /></Field>
          <Field label="For how many days"><Input type="number" value={days} onChange={setDays} /></Field>
        </div>
        <div className="card flat">
          <div className="between"><span>Affiliate earns</span><strong className="copper">{money(earns)}</strong></div>
          <div className="between"><span className="muted small">You keep, before costs</span><span>{money(n(product.price) - earns)}</span></div>
          <p className="tiny muted mt">Check this still leaves you a profit. The product's own economics do not change — only what the affiliate is paid.</p>
        </div>
        <div className="btn-row">
          <button className="btn primary" disabled={busy} onClick={() => save(false)}>{busy ? 'Saving…' : 'Start paying more'}</button>
          {product.boost_pct && <button className="btn" disabled={busy} onClick={() => save(true)}>Remove the boost</button>}
        </div>
      </div>
    </Modal>
  )
}
