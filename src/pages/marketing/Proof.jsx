import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { date } from '../../lib/format'
import { Loading, Empty, useToast, Problem, Badge } from '../../components/ui'
import Icon from '../../lib/icons'

// Every completed order can leave something behind: a real sentence, a real photo,
// a real number. This is where that becomes marketing you didn't have to invent.
export default function Proof() {
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const { data, loading, error, reload } = useData(() => q(supabase.rpc('proof_library')), [])
  if (error) return <Problem error={error} what="the proof library" onRetry={reload} />
  if (loading) return <Loading shape="cards" />

  const c = data.counts || {}
  const items = (data.items || []).filter((i) =>
    filter === 'all' ? true
      : filter === 'waiting' ? !i.approved
        : filter === 'photos' ? !!i.photo
          : filter === 'shareable' ? i.approved && i.may_share && i.comment
            : true)

  const approve = async (id, on) => {
    const { error: e } = await supabase.from('reviews').update({ approved: on }).eq('id', id)
    if (e) return toast(e.message, true)
    toast(on ? 'Published' : 'Hidden')
    reload()
  }

  const copy = async (i) => {
    const text = `"${i.comment}"\n\n— ${i.name}, verified ZaMarket purchase${i.product ? `\n${i.product}${i.vendor ? ` from ${i.vendor}` : ''}` : ''}\n\n${window.location.origin}`
    try { await navigator.clipboard.writeText(text); toast('Copied — post it as it is') } catch { toast('Could not copy', true) }
  }

  return (
    <div className="stack">
      <div className="mk-kpis">
        <div className="kpi lead"><span className="kpi-l">Verified reviews</span><span className="kpi-v">{c.reviews || 0}</span><span className="kpi-s">attached to real orders</span></div>
        <div className="kpi"><span className="kpi-l">In their own words</span><span className="kpi-v">{c.with_words || 0}</span><span className="kpi-s">reviews with a sentence</span></div>
        <div className="kpi"><span className="kpi-l">With photos</span><span className="kpi-v">{c.with_photos || 0}</span><span className="kpi-s">customer photos</span></div>
        <div className="kpi"><span className="kpi-l">Ready to share</span><span className="kpi-v">{c.shareable || 0}</span><span className="kpi-s">customer said yes</span></div>
      </div>

      {c.waiting > 0 && (
        <div className="card warn-card">
          <strong>{c.waiting} review{c.waiting === 1 ? '' : 's'} waiting for you</strong>
          <p className="small">Publish the honest ones, good and bad. Hiding bad reviews is the fastest way to lose the trust this whole thing is built on.</p>
        </div>
      )}

      <div className="chips wrap">
        {[['all', 'Everything'], ['waiting', 'Waiting'], ['shareable', 'Ready to share'], ['photos', 'With photos']].map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <Empty title="Nothing here yet">
          Proof arrives after deliveries. Send the rating link when you mark an order delivered, and ask the customer to add a photo.
        </Empty>
      ) : (
        <div className="proof-grid">
          {items.map((i) => (
            <article key={i.id} className={`proof ${i.approved ? '' : 'pending'}`}>
              {i.photo && <img className="proof-photo" src={i.photo} alt="" loading="lazy" />}
              <div className="proof-body">
                <div className="between">
                  <span className="proof-stars">{'★'.repeat(i.rating || 0)}<span className="muted">{'★'.repeat(Math.max(0, 5 - (i.rating || 0)))}</span></span>
                  {i.as_described === false && <Badge tone="bad">Not as described</Badge>}
                  {!i.approved && <Badge status="pending">Waiting</Badge>}
                </div>
                {i.comment && <p className="proof-words">“{i.comment}”</p>}
                <span className="tiny muted">
                  {i.name} · {i.product || 'ZaMarket order'}{i.vendor ? ` · ${i.vendor}` : ''} · {date(i.created_at)}
                  {i.verified && <> · <span className="ok">verified purchase</span></>}
                </span>
                <div className="btn-row">
                  <button className="btn sm" onClick={() => approve(i.id, !i.approved)}>{i.approved ? 'Hide' : 'Publish'}</button>
                  {i.comment && i.may_share && <button className="btn sm primary" onClick={() => copy(i)}>Copy for posting</button>}
                  {i.comment && !i.may_share && <span className="tiny muted">Customer didn't agree to sharing</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="card explain small">
        <p><strong>What to do with this.</strong> One real sentence from a customer does more than ten adverts. Post them as they are — no editing, no polishing. If somebody says the delivery was slow, publish that too; it is the reason people believe the good ones.</p>
        <p className="mt">Only reviews where the customer ticked the box appear to affiliates and on the shop.</p>
      </div>
    </div>
  )
}
