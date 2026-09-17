import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money, num } from '../../lib/format'
import Earnings, { DateBar, useRange } from './Earnings'
import { Tabs, Table, Loading, Empty, Badge } from '../../components/ui'

export function AdminEarnings() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'business'
  return (
    <div className="stack">
      <Tabs tabs={[['business', 'Our business'], ['partners', "Resellers & vendors"]]} value={tab} onChange={(v) => setSp({ tab: v })} />
      {tab === 'business'
        ? <Earnings scope="business" heading="Earnings" sub="What the business is making, day by day." />
        : <PartnersBoard />}
    </div>
  )
}

function PartnersBoard() {
  const nav = useNavigate()
  const [range, setRange] = useRange('month')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    setData(null); setError(null)
    supabase.rpc('partner_leaderboard', { p_from: range.from, p_to: range.to }).then(({ data, error }) => (error ? setError(error.message) : setData(data)))
  }, [range.from, range.to])
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Who's making money</h1><p>How every reseller and vendor is doing. Tap anyone to see their full tracker and records.</p></div></div>
      <div className="card"><DateBar range={range} setRange={setRange} /></div>
      {error ? <Empty title="Couldn't load">{error}</Empty> : !data ? <Loading /> : (
        <>
          <div className="card">
            <div className="between mb"><h3>Resellers</h3><span className="small muted">Commission earned {money(data.resellers.reduce((t, r) => t + Number(r.earned), 0))}</span></div>
            <div className="records-cards">
              {data.resellers.length === 0 ? <p className="small muted">No approved resellers yet.</p> : data.resellers.map((r) => (
                <button key={r.id} type="button" className="pick" onClick={() => nav(`/admin/earnings/reseller/${r.id}`)}>
                  <span className="grow"><span className="strong">{r.name}</span><span className="small muted">{num(r.orders)} sales · {money(r.sales)}</span></span>
                  <span className="right"><span className="strong copper">{money(r.earned)}</span><br /><span className="tiny muted">paid {money(r.paid)}</span></span>
                </button>
              ))}
            </div>
            <div className="records-table"><Table rows={data.resellers} empty="No approved resellers yet" onRow={(r) => nav(`/admin/earnings/reseller/${r.id}`)} cols={[
              { key: 'name', label: 'Reseller', render: (r) => <div><div className="strong">{r.name}</div><div className="tiny muted">{r.code}{r.status !== 'approved' ? ' · ' + r.status : ''}</div></div> },
              { key: 'orders', label: 'Sales', num: true, render: (r) => num(r.orders) },
              { key: 'sales', label: 'Sales value', num: true, render: (r) => money(r.sales) },
              { key: 'earned', label: 'Earned', num: true, render: (r) => <span className="strong copper">{money(r.earned)}</span> },
              { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid) },
            ]} /></div>
          </div>
          <div className="card">
            <div className="between mb"><h3>Vendors</h3><span className="small muted">Fees earned {money(data.vendors.reduce((t, v) => t + Number(v.fees), 0))}</span></div>
            <div className="records-cards">
              {data.vendors.length === 0 ? <p className="small muted">No approved vendors yet.</p> : data.vendors.map((v) => (
                <button key={v.id} type="button" className="pick" onClick={() => nav(`/admin/earnings/vendor/${v.id}`)}>
                  <span className="grow"><span className="strong">{v.name}</span><span className="small muted">{num(v.orders)} orders · {money(v.sales)}</span></span>
                  <span className="right"><span className="strong">{money(v.earned)}</span><br /><span className="tiny ok">our fee {money(v.fees)}</span></span>
                </button>
              ))}
            </div>
            <div className="records-table"><Table rows={data.vendors} empty="No approved vendors yet" onRow={(v) => nav(`/admin/earnings/vendor/${v.id}`)} cols={[
              { key: 'name', label: 'Vendor', render: (v) => <div><div className="strong">{v.name}</div>{v.status !== 'approved' && <Badge status={v.status} />}</div> },
              { key: 'orders', label: 'Orders', num: true, render: (v) => num(v.orders) },
              { key: 'sales', label: 'Sales', num: true, render: (v) => money(v.sales) },
              { key: 'earned', label: 'Their earnings', num: true, render: (v) => <span className="strong">{money(v.earned)}</span> },
              { key: 'fees', label: 'Our fees', num: true, render: (v) => <span className="ok">{money(v.fees)}</span> },
            ]} /></div>
          </div>
        </>
      )}
    </div>
  )
}

export function PartnerEarnings() {
  const { scope, id } = useParams()
  const [name, setName] = useState('')
  useEffect(() => {
    const table = scope === 'vendor' ? 'vendors' : 'resellers'
    supabase.from(table).select(scope === 'vendor' ? 'business_name' : 'full_name,code').eq('id', id).maybeSingle()
      .then(({ data }) => setName(data ? (data.business_name || `${data.full_name}${data.code ? ` (${data.code})` : ''}`) : ''))
  }, [scope, id])
  if (!['reseller', 'vendor'].includes(scope)) return <Empty title="Not found" />
  return <Earnings scope={scope} id={id} heading={name || 'Earnings'} sub={scope === 'vendor' ? 'Vendor earnings — exactly what they see on their own tracker.' : 'Reseller earnings — exactly what they see on their own tracker.'} back="/admin/earnings?tab=partners" />
}

export function ResellerEarnings() {
  const { profile } = useAuth()
  return <Earnings scope="reseller" id={profile?.partner?.id} heading="My earnings" sub="What you've earned from your sales. Pick any dates to check your records." />
}

export function VendorEarnings() {
  const { profile } = useAuth()
  return <Earnings scope="vendor" id={profile?.partner?.id} heading="My earnings" sub="What you've made selling on ZaMarket. Pick any dates to check your records." />
}
