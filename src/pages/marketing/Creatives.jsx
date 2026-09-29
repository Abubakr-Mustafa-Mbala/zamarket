import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { date } from '../../lib/format'
import { Loading, Empty, Problem, Modal, Field, Input, useToast, Badge } from '../../components/ui'

const NAMES = {
  hero: 'Product first', offer: 'Offer first', editorial: 'Editorial', price: 'Price first', dark: 'Premium',
  promotion: 'Adverts', price_list: 'Price lists', new_arrival: 'New arrivals', collection: 'Collections',
  vendor_spotlight: 'Business spotlights', share_card: 'Share pictures',
}

// What has been made, and eventually what it produced. Deliberately quiet until
// there is enough of it to mean something.
export default function Creatives() {
  const toast = useToast()
  const [blocking, setBlocking] = useState(null)
  const [why, setWhy] = useState('')
  const { data, loading, error, reload } = useData(async () => ({
    report: await q(supabase.rpc('creative_report')),
    recent: await q(supabase.rpc('recent_creatives', { p_limit: 40 })).catch(() => []),
  }), [])
  if (error) return <Problem error={error} what="the creative record" onRetry={reload} />
  if (loading) return <Loading shape="rows" />
  const r = data?.report || {}
  const recent = data?.recent || []

  const setBlock = async (productId, blocked, note) => {
    const { error: e } = await supabase.rpc('set_promo_block', { p_product: productId, p_blocked: blocked, p_note: note || null })
    if (e) return toast(e.message, true)
    toast(blocked ? 'Nobody can promote this now' : 'Promotion allowed again')
    setBlocking(null); setWhy(''); reload()
  }
  if (!r.total) return <Empty title="Nothing made yet">Every advert, price list and promotion is recorded here once someone makes one.</Empty>

  const Bar = ({ rows, unit }) => {
    const top = Math.max(1, ...rows.map((x) => Number(x.made || 0)))
    return (
      <div className="stack-sm">
        {rows.map((x) => (
          <div key={x.name} className="cbar">
            <span className="cbar-name">{NAMES[x.name] || x.name}</span>
            <span className="cbar-track"><span style={{ width: `${(Number(x.made) / top) * 100}%` }} /></span>
            <span className="cbar-n">{x.made}{unit ? ` ${unit}` : ''}{x.shared ? ` · ${x.shared} shared` : ''}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="mk-kpis">
        <div className="kpi lead"><span className="kpi-l">Creatives made</span><span className="kpi-v">{r.total}</span><span className="kpi-s">adverts, price lists and promotions</span></div>
        <div className="kpi"><span className="kpi-l">Shared</span><span className="kpi-v">{r.shared}</span><span className="kpi-s">sent out from ZaMarket</span></div>
      </div>

      <section className="card stack-sm">
        <h3>What people make</h3>
        <Bar rows={r.by_kind || []} />
      </section>

      <section className="card stack-sm">
        <h3>Which advert style gets chosen</h3>
        <Bar rows={r.by_composition || []} />
      </section>

      {recent.length > 0 && (
        <section className="card stack-sm">
          <h3>Made lately</h3>
          <p className="small muted">What is going out, and who made it. Stop anything you cannot stand behind.</p>
          <div className="mini-table">
            {recent.slice(0, 20).map((c) => (
              <div key={c.id} className="mini-row">
                <span className="grow">
                  <strong>{c.product || NAMES[c.kind] || c.kind}</strong>
                  <span className="tiny muted">
                    {NAMES[c.composition] || NAMES[c.kind] || c.kind}
                    {c.hook ? ` · “${c.hook.slice(0, 48)}${c.hook.length > 48 ? '…' : ''}”` : ''}
                    {' · '}{c.made_by}{c.vendor ? ` · ${c.vendor}` : ''} · {date(c.created_at)}
                  </span>
                </span>
                {c.shares > 0 && <span className="tiny muted">{c.shares} shared</span>}
                {c.blocked && <Badge tone="bad">Blocked</Badge>}
                {c.product_id && (c.blocked
                  ? <button className="btn sm" onClick={() => setBlock(c.product_id, false)}>Allow again</button>
                  : <button className="btn sm ghost" onClick={() => setBlocking(c)}>Stop promotion</button>)}
              </div>
            ))}
          </div>
        </section>
      )}

      {blocking && (
        <Modal title={`Stop promotion of ${blocking.product}`} onClose={() => setBlocking(null)}>
          <div className="stack">
            <p className="small">Nobody — affiliates, vendors or the team — will be able to make a promotion for this until you allow it again. The product stays in the shop.</p>
            <Field label="Why, in a sentence" hint="The seller sees this, so make it something they can act on">
              <Input value={why} onChange={setWhy} placeholder="e.g. The photo shows an accessory that is not included" />
            </Field>
            <button className="btn primary" onClick={() => setBlock(blocking.product_id, true, why)} disabled={!why.trim()}>Stop promotion</button>
          </div>
        </Modal>
      )}

      <div className="card explain small">
        {r.enough_to_judge ? (
          <p><strong>There is now enough here to look for patterns.</strong> Compare the styles being shared most against the products actually selling, and lean the marketplace's own posts that way.</p>
        ) : (
          <p><strong>Not enough yet to draw conclusions.</strong> With fewer than 30 creatives, any pattern you see is chance. Keep making them; this page will start being useful on its own.</p>
        )}
        <p className="mt">What is recorded: the style, the angle, the format, the product and who made it. Never anything about a customer.</p>
      </div>
    </div>
  )
}
