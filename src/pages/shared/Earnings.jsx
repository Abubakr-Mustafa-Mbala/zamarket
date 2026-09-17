import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { money, title, num } from '../../lib/format'
import BarChart from '../../components/BarChart'
import { Badge, Loading, Table, Empty, Segmented } from '../../components/ui'

// ---------- dates (local phone time; Zambia) ----------
const pad = (x) => String(x).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (s, k) => { const d = parse(s); d.setDate(d.getDate() + k); return ymd(d) }
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5)

export const PRESETS = [
  ['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Pick dates'],
]

export function presetRange(key) {
  const now = new Date()
  const today = ymd(now)
  switch (key) {
    case 'today': return [today, today]
    case '7d': return [addDays(today, -6), today]
    case 'month': return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today]
    case 'lastmonth': return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))]
    case 'year': return [ymd(new Date(now.getFullYear(), 0, 1)), today]
    default: return [addDays(today, -29), today]
  }
}

const autoBucket = (from, to) => { const d = daysBetween(from, to); return d <= 45 ? 'day' : d <= 190 ? 'week' : 'month' }

function bucketLabel(s, bucket) {
  const d = parse(s)
  if (bucket === 'month') return { label: d.toLocaleDateString('en-GB', { month: 'short' }), long: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
  if (bucket === 'week') return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), long: `Week of ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` }
  return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }
}

export function DateBar({ range, setRange }) {
  const { preset, from, to } = range
  const pick = (k) => {
    if (k === 'custom') return setRange({ ...range, preset: 'custom' })
    const [f, t] = presetRange(k)
    setRange({ preset: k, from: f, to: t })
  }
  return (
    <div className="stack-sm">
      <div className="chips">{PRESETS.map(([k, l]) => <button key={k} type="button" className={`chip ${preset === k ? 'on' : ''}`} onClick={() => pick(k)}>{l}</button>)}</div>
      {preset === 'custom' && (
        <div className="row">
          <label className="small">From <input className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} style={{ width: 'auto' }} /></label>
          <label className="small">To <input className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} style={{ width: 'auto' }} /></label>
        </div>
      )}
    </div>
  )
}

export function useRange(initial = '30d') {
  const [f, t] = presetRange(initial)
  return useState({ preset: initial, from: f, to: t })
}

// ---------- what each person sees ----------
const CONFIG = {
  business: {
    cards: [
      { key: 'earned', label: 'Profit', hint: 'Completed orders, after costs, commissions, vendor payouts, expenses and ads' },
      { key: 'sales', label: 'Sales', hint: 'Value of orders placed' },
      { key: 'orders', label: 'Orders', count: true },
      { key: 'paid', label: 'Cash received' },
      { key: 'pending', label: 'Unpaid orders', hint: 'Orders placed but not yet paid', noTrend: true },
      { key: 'costs', label: 'Expenses & ads', costLike: true },
    ],
    columns: (nav) => [
      { key: 'order_number', label: 'Order', render: (r) => <span className="strong">#{r.order_number}</span> },
      { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
      { key: 'customer', label: 'Customer' },
      { key: 'seller', label: 'Seller' },
      { key: 'items', label: 'Items', render: (r) => <span className="small">{r.items}</span> },
      { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
      { key: 'amount', label: 'Total', num: true, render: (r) => money(r.amount) },
      { key: 'earned', label: 'Profit', num: true, render: (r) => r.earned == null ? <span className="muted tiny">when completed</span> : <span className={r.earned < 0 ? 'bad' : 'ok'}>{money(r.earned)}</span> },
    ],
    csv: ['order_number', 'created_at', 'customer', 'seller', 'channel', 'items', 'status', 'payment_status', 'amount', 'earned'],
    empty: 'No orders in these dates',
  },
  reseller: {
    cards: [
      { key: 'earned', label: 'Commission earned', hint: 'From completed orders' },
      { key: 'paid', label: 'Paid to you' },
      { key: 'pending', label: 'Waiting', hint: 'Earned, not yet paid. Paid after checks — not guaranteed until approved.', noTrend: true },
      { key: 'sales', label: 'Sales value' },
      { key: 'orders', label: 'Sales', count: true },
    ],
    columns: () => [
      { key: 'order_number', label: 'Order', render: (r) => <span className="strong">#{r.order_number}</span> },
      { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
      { key: 'customer', label: 'Customer' },
      { key: 'items', label: 'Items', render: (r) => <span className="small">{r.items}</span> },
      { key: 'status', label: 'Order', render: (r) => <Badge status={r.status} /> },
      { key: 'amount', label: 'Sale', num: true, render: (r) => money(r.amount) },
      { key: 'earned', label: 'You earn', num: true, render: (r) => r.earned == null ? <span className="muted tiny">after delivery</span> : <span className="strong">{money(r.earned)}</span> },
      { key: 'earning_status', label: 'Payment', render: (r) => r.earning_status ? <Badge status={r.earning_status} /> : '—' },
    ],
    csv: ['order_number', 'created_at', 'customer', 'items', 'status', 'amount', 'earned', 'earning_status', 'paid_at'],
    empty: 'No sales in these dates',
  },
  vendor: {
    cards: [
      { key: 'earned', label: 'Your earnings', hint: 'What you receive from completed orders' },
      { key: 'paid', label: 'Paid to you' },
      { key: 'pending', label: 'Waiting', hint: 'Earned, not yet paid out', noTrend: true },
      { key: 'sales', label: 'Sales' },
      { key: 'orders', label: 'Orders', count: true },
      { key: 'costs', label: 'Marketplace fees', costLike: true },
    ],
    columns: () => [
      { key: 'order_number', label: 'Order', render: (r) => <span className="strong">#{r.order_number}</span> },
      { key: 'created_at', label: 'Date', render: (r) => shortDate(r.created_at) },
      { key: 'items', label: 'Items', render: (r) => <span className="small">{r.items}</span> },
      { key: 'status', label: 'Order', render: (r) => <Badge status={r.status} /> },
      { key: 'amount', label: 'Sale', num: true, render: (r) => money(r.amount) },
      { key: 'fee', label: 'Fee', num: true, render: (r) => r.fee == null ? '—' : money(r.fee) },
      { key: 'earned', label: 'You get', num: true, render: (r) => r.earned == null ? <span className="muted tiny">when completed</span> : <span className="strong">{money(r.earned)}</span> },
      { key: 'earning_status', label: 'Payout', render: (r) => r.earning_status ? <Badge status={r.earning_status} /> : '—' },
    ],
    csv: ['order_number', 'created_at', 'items', 'status', 'amount', 'fee', 'earned', 'earning_status', 'paid_at'],
    empty: 'No orders in these dates',
  },
}

const shortDate = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

function downloadCsv(rows, cols, filename) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const text = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(c === 'created_at' || c === 'paid_at' ? (r[c] ? new Date(r[c]).toLocaleString('en-GB') : '') : r[c])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const sum = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0)

export default function Earnings({ scope, id, heading, sub, back }) {
  const nav = useNavigate()
  const cfg = CONFIG[scope]
  const [range, setRange] = useRange('30d')
  const [bucketChoice, setBucketChoice] = useState('auto')
  const [metric, setMetric] = useState(cfg.cards[0].key)
  const [state, setState] = useState({ loading: true })
  const [search, setSearch] = useState('')
  const bucket = bucketChoice === 'auto' ? autoBucket(range.from, range.to) : bucketChoice
  const len = daysBetween(range.from, range.to) + 1
  const prevFrom = addDays(range.from, -len)
  const prevTo = addDays(range.from, -1)

  useEffect(() => {
    if (scope !== 'business' && !id) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    const args = { p_scope: scope, p_id: id || null }
    Promise.all([
      supabase.rpc('earnings_series', { ...args, p_from: range.from, p_to: range.to, p_bucket: bucket }),
      supabase.rpc('earnings_series', { ...args, p_from: prevFrom, p_to: prevTo, p_bucket: 'month' }),
      supabase.rpc('earnings_records', { ...args, p_from: range.from, p_to: range.to }),
    ]).then(([cur, prev, rec]) => {
      if (!alive) return
      const err = cur.error || prev.error || rec.error
      if (err) return setState({ loading: false, error: err.message })
      setState({ loading: false, series: cur.data || [], prev: prev.data || [], records: rec.data || [] })
    })
    return () => { alive = false }
  }, [scope, id, range.from, range.to, bucket])

  const card = cfg.cards.find((c) => c.key === metric) || cfg.cards[0]
  const fmt = (v, short) => card.count ? num(Math.round(v)) : short ? shortMoney(v) : money(v)
  const points = useMemo(() => (state.series || []).map((r) => ({ key: r.bucket, value: Number(r[metric]) || 0, ...bucketLabel(r.bucket, bucket) })), [state.series, metric, bucket])
  const records = (state.records || []).filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()))

  if (scope !== 'business' && !id) return <Empty title="No account linked">This account isn't linked to an approved partner.</Empty>

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          {back && <Link to={back} className="small">← Back</Link>}
          <h1>{heading || 'Earnings'}</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>

      <div className="card stack-sm">
        <DateBar range={range} setRange={setRange} />
        <div className="between">
          <span className="small muted">{parse(range.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – {parse(range.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <Segmented options={[['auto', 'Auto'], ['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]} value={bucketChoice} onChange={setBucketChoice} />
        </div>
      </div>

      {state.loading && !state.series ? <Loading /> : state.error ? <Empty title="Couldn't load earnings">{state.error}</Empty> : (
        <>
          <div className="earn-cards">
            {cfg.cards.map((c, i) => {
              const now = sum(state.series, c.key)
              const before = sum(state.prev, c.key)
              const change = before !== 0 ? ((now - before) / Math.abs(before)) * 100 : now !== 0 ? null : 0
              const good = c.costLike ? now <= before : now >= before
              return (
                <button key={c.key} type="button" className={`card stat earn-card ${metric === c.key ? 'on' : ''} ${i === 0 ? 'lead' : ''}`} onClick={() => setMetric(c.key)} title={c.hint}>
                  <div className="label">{c.label}</div>
                  <div className={`value ${now < 0 ? 'bad' : ''}`}>{c.count ? num(now) : money(now)}</div>
                  {!c.noTrend && (
                    <div className={`trend ${change === 0 ? '' : good ? 'up' : 'down'}`}>
                      {change === null ? 'New this period' : change === 0 ? 'Same as before' : `${now >= before ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}% vs previous ${len === 1 ? 'day' : `${len} days`}`}
                    </div>
                  )}
                  {c.noTrend && c.hint && <div className="sub">{c.hint}</div>}
                </button>
              )
            })}
          </div>

          <div className="card">
            <div className="between mb">
              <h3>{card.label} · {bucket === 'day' ? 'by day' : bucket === 'week' ? 'by week' : 'by month'}</h3>
              {state.loading && <span className="tiny muted">Updating…</span>}
            </div>
            <BarChart points={points} format={fmt} tone={scope === 'business' ? 'green' : 'copper'} />
            {card.hint && <p className="tiny muted mt">{card.hint}</p>}
          </div>

          <div className="stack-sm">
            <div className="between">
              <h2>Records</h2>
              <div className="row">
                <input className="input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 150 }} />
                <button type="button" className="btn sm" disabled={!records.length} onClick={() => downloadCsv(records, cfg.csv, `zamarket-${scope}-${range.from}-to-${range.to}.csv`)}>Download</button>
              </div>
            </div>
            <div className="records-table"><Table rows={records} cols={cfg.columns(nav)} empty={cfg.empty} onRow={scope === 'business' ? (r) => nav(`/admin/orders/${r.id}`) : undefined} /></div>
            <div className="records-cards">
              {records.length === 0 ? <Empty title={cfg.empty} /> : records.slice(0, 300).map((r) => (
                <div key={r.id + r.order_number} className={`card record ${scope === 'business' ? 'click' : ''}`} onClick={scope === 'business' ? () => nav(`/admin/orders/${r.id}`) : undefined}>
                  <div className="between"><span><span className="strong">#{r.order_number}</span> <span className="muted small">{shortDate(r.created_at)}</span></span><Badge status={r.status} /></div>
                  {r.items && <div className="small">{r.items}</div>}
                  <div className="between small">
                    <span className="muted">{[r.customer, scope === 'business' ? r.seller : null].filter(Boolean).join(' · ')}</span>
                    <span>{money(r.amount)}</span>
                  </div>
                  <div className="between small">
                    <span className="muted">{scope === 'business' ? 'Profit' : scope === 'vendor' ? 'You get' : 'You earn'}{r.earning_status ? <> · <Badge status={r.earning_status} /></> : ''}</span>
                    {r.earned == null ? <span className="muted tiny">{scope === 'reseller' ? 'after delivery' : 'when completed'}</span> : <span className={`strong ${r.earned < 0 ? 'bad' : 'ok'}`}>{money(r.earned)}</span>}
                  </div>
                </div>
              ))}
              {records.length > 300 && <p className="tiny muted">Showing the latest 300 here. Download to get all {records.length}.</p>}
            </div>
            <p className="tiny muted">{records.length} record{records.length === 1 ? '' : 's'}. Everything stays saved in the system; Download gives you a spreadsheet copy (opens in Excel or Google Sheets).</p>
          </div>
        </>
      )}
    </div>
  )
}

function shortMoney(v) {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1e6) return `${sign}K${(a / 1e6).toFixed(1)}m`
  if (a >= 1e4) return `${sign}K${Math.round(a / 1e3)}k`
  if (a >= 1e3) return `${sign}K${(a / 1e3).toFixed(1)}k`
  return `${sign}K${Math.round(a)}`
}
