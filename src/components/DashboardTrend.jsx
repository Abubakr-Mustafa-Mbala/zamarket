import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../lib/supabase'
import { useData } from '../lib/useData'
import { money } from '../lib/format'
import Icon from '../lib/icons'

const day = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const start = (period) => { const d = new Date(); if (period === '7d') d.setDate(d.getDate()-6); else if (period === '30d') d.setDate(d.getDate()-29); else d.setMonth(d.getMonth()-11, 1); return day(d) }

// Uses the existing permission-checked earnings_series RPC; no new SQL or mock numbers.
export default function DashboardTrend({ scope, id, href }) {
  const [period, setPeriod] = useState('7d')
  const bucket = period === '12m' ? 'month' : 'day'
  const from = start(period), to = day(new Date())
  const { data, loading, error } = useData(() => id ? q(supabase.rpc('earnings_series', { p_scope: scope, p_id: id, p_from: from, p_to: to, p_bucket: bucket })) : Promise.resolve([]), [scope, id, from, to, bucket])
  const points = (Array.isArray(data) ? data : []).map(row => ({ label: String(row.bucket || '').slice(0,10), value: Math.max(0, Number(row[scope === 'vendor' ? 'sales' : 'earned']) || 0) }))
  const W=640,H=210,L=15,R=15,T=16,B=26
  const max=Math.max(1,...points.map(p=>p.value))
  const x=i=>L+(points.length<2?(W-L-R)/2:i*(W-L-R)/(points.length-1))
  const y=v=>T+(1-v/max)*(H-T-B)
  const path=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const area=points.length ? `${path} L${x(points.length-1)} ${H-B} L${x(0)} ${H-B} Z` : ''
  return <section className="card dashboard-trend" aria-label={`${scope === 'vendor' ? 'Sales' : 'Commission earnings'} performance`}>
    <div className="dashboard-trend-head"><div><h2><Icon.sparkles /> {scope === 'vendor' ? 'Sales performance' : 'Commission earnings'}</h2><p className="small muted">{scope === 'vendor' ? 'Orders placed in this period' : 'Commission recorded in this period; payment may still be pending'}</p></div><div className="dashboard-trend-filters" role="group" aria-label="Chart period">{[['7d','7 days'],['30d','30 days'],['12m','12 months']].map(([key,label])=><button type="button" key={key} className={`chip ${period===key?'on':''}`} aria-pressed={period===key} onClick={()=>setPeriod(key)}>{label}</button>)}</div></div>
    {error ? <p className="small bad" role="alert">Chart unavailable: {String(error.message||error)}. <Link to={href}>Open detailed earnings</Link></p> : loading && !data ? <p className="small muted" role="status">Loading performance…</p> : points.length===0 || points.every(p=>p.value===0) ? <div className="dashboard-trend-empty"><Icon.sparkles /><strong>No activity in this period yet</strong><p className="small muted">Your graph will appear here when sales are recorded.</p></div> : <>
      <div className="dashboard-trend-total"><span className="small muted">Total for selected period</span><strong>{money(points.reduce((sum,p)=>sum+p.value,0))}</strong></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${scope === 'vendor'?'Sales':'Commission earnings'} trend for ${period}`} className="dashboard-line-svg"><defs><linearGradient id={`trend-fill-${scope}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8A6CFF" stopOpacity=".35"/><stop offset="1" stopColor="#8A6CFF" stopOpacity="0"/></linearGradient></defs>{[0,.25,.5,.75,1].map(t=><line key={t} x1={L} x2={W-R} y1={y(max*t)} y2={y(max*t)} stroke="var(--line)" strokeDasharray="4 5"/>)}<path d={area} fill={`url(#trend-fill-${scope})`}/><path d={path} stroke="#A892FF" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fill="none"/>{points.length<=31 && points.map((p,i)=><circle key={p.label+i} cx={x(i)} cy={y(p.value)} r="3.5" fill="#A892FF"><title>{`${p.label}: ${money(p.value)}`}</title></circle>)}</svg>
      <div className="dashboard-trend-axis"><span>{points[0]?.label}</span><span>{points[points.length-1]?.label}</span></div>
    </>}
    <Link className="dashboard-trend-link" to={href}>View detailed earnings <Icon.arrow /></Link>
  </section>
}
