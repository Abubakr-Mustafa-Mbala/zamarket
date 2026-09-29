import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, Empty, Problem } from '../../components/ui'

const NAMES = {
  hero: 'Product first', offer: 'Offer first', editorial: 'Editorial', price: 'Price first', dark: 'Premium',
  promotion: 'Adverts', price_list: 'Price lists', new_arrival: 'New arrivals', collection: 'Collections',
  vendor_spotlight: 'Business spotlights', share_card: 'Share pictures',
}

// What has been made, and eventually what it produced. Deliberately quiet until
// there is enough of it to mean something.
export default function Creatives() {
  const { data, loading, error, reload } = useData(() => q(supabase.rpc('creative_report')), [])
  if (error) return <Problem error={error} what="the creative record" onRetry={reload} />
  if (loading) return <Loading shape="rows" />
  const r = data || {}
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
