import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money } from '../../lib/format'
import { Loading, Empty, CopyLine, Badge } from '../../components/ui'

// Plain checks that decide whether a page can be found and whether anyone clicks it.
function check(p) {
  const issues = []
  const seo = p.page?.seo || {}
  const words = (p.description || '').trim().split(/\s+/).filter(Boolean).length
  if (!p.images?.length) issues.push({ key: 'photo', label: 'No photo', fix: 'Add at least one clear photo. Pages without photos rarely get clicked.' })
  if (words < 25) issues.push({ key: 'words', label: 'Thin description', fix: 'Write 40 words or more saying what it is, who it suits, and what is included.' })
  if (!p.category) issues.push({ key: 'cat', label: 'No department', fix: 'Pick a department so it shows in browsing and in the sitemap.' })
  if (!seo.title) issues.push({ key: 'title', label: 'Using the automatic title', fix: 'Write a search title with the words people type, e.g. "Solar lamp Lusaka".' })
  if ((p.name || '').split(/\s+/).length < 3) issues.push({ key: 'name', label: 'Very short name', fix: 'Name it the way people search: "Tecno Spark 20, 128GB" beats "Spark".' })
  return issues
}

const TIPS = [
  {
    t: 'Name things the way people search',
    b: 'Nobody types "premium illumination device". They type "solar lamp Lusaka" or "rechargeable lamp price". Put the plain word first, then the detail, then the place.',
  },
  {
    t: 'One page per thing you sell',
    b: 'Each product and each store has its own address, like zamarket.com/aminas-kitchen/birthday-cake. That is what Google lists. The more real pages you publish, the more chances to be found.',
  },
  {
    t: 'Write for one person, not for Google',
    b: 'Answer what a buyer worries about: does it fit, how long does it last, do you deliver to my area, what happens if it breaks. Pages that answer questions rank, because people stay and read them.',
  },
  {
    t: 'Get listed on Google Maps too',
    b: 'Create a free Google Business Profile for your business in Lusaka. Many people searching "cakes near me" see Maps before anything else. Use the same business name and phone everywhere.',
  },
  {
    t: 'Links from real places',
    b: 'Ask vendors to link to their ZaMarket store from their Instagram and Facebook pages. Put your link in WhatsApp groups where selling is allowed. Those links are what tell Google you are real.',
  },
  {
    t: 'Be patient, and keep publishing',
    b: 'New sites take weeks to show up, and months to rank for anything competitive. Ads and WhatsApp bring customers today; search brings them later, for free, for years.',
  },
]

export default function Seo() {
  const [open, setOpen] = useState(null)
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('products').select('id,name,slug,description,images,category,price,status,page,vendor_id').eq('status', 'published').order('name')),
    vendors: await q(supabase.from('public_vendors').select('id,slug,business_name,description')),
  }), [])
  const rows = useMemo(() => (data?.products || []).map((p) => ({ ...p, issues: check(p) })), [data])
  if (loading) return <Loading />
  const clean = rows.filter((r) => r.issues.length === 0).length
  const site = window.location.origin

  return (
    <div className="stack">
      <div className="mk-kpis">
        <div className="kpi lead"><span className="kpi-l">Pages Google can list</span><span className="kpi-v">{rows.length + (data.vendors?.length || 0)}</span><span className="kpi-s">{rows.length} products, {data.vendors?.length || 0} stores</span></div>
        <div className="kpi"><span className="kpi-l">Ready to rank</span><span className="kpi-v">{clean}</span><span className="kpi-s">no problems found</span></div>
        <div className="kpi"><span className="kpi-l">Need work</span><span className="kpi-v">{rows.length - clean}</span><span className="kpi-s">listed below</span></div>
      </div>

      <section className="card stack-sm">
        <h3>Tell Google your site exists</h3>
        <p className="small muted">Do this once, after you deploy. It is free and takes ten minutes.</p>
        <ol className="week">
          <li>Open <strong>Google Search Console</strong> and add your site address.</li>
          <li>Verify it by adding the DNS record or HTML tag they give you.</li>
          <li>Submit your sitemap: <CopyLine text={`${site}/sitemap.xml`} /></li>
          <li>Create a free <strong>Google Business Profile</strong> for your business in Lusaka, with the same name and phone you use here.</li>
        </ol>
        <p className="tiny muted">Your sitemap updates itself every time you publish a product or approve a vendor, so you never resubmit it.</p>
      </section>

      <section className="stack-sm">
        <h3>Pages that need work</h3>
        {rows.length === 0 ? <Empty title="No published products yet">Publish something first, then come back.</Empty>
          : rows.filter((r) => r.issues.length).length === 0 ? <p className="small ok">Every published page passes the checks. Keep adding products.</p>
          : rows.filter((r) => r.issues.length).map((r) => (
            <div key={r.id} className="card stack-sm">
              <div className="between">
                <div>
                  <strong>{r.name}</strong>
                  <div className="tiny muted">{site}/p/{r.slug}</div>
                </div>
                <div className="btn-row">
                  {r.issues.map((i) => <Badge key={i.key} tone="warn">{i.label}</Badge>)}
                  <button className="btn sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'How to fix'}</button>
                </div>
              </div>
              {open === r.id && (
                <ul className="fc-rules">
                  {r.issues.map((i) => <li key={i.key}>{i.fix}</li>)}
                  <li><Link to="/admin/products">Open Products</Link> and edit {r.name}.</li>
                </ul>
              )}
            </div>
          ))}
      </section>

      <section className="stack-sm">
        <h3>How people will find you in search</h3>
        <div className="steps-list">
          {TIPS.map((tip, i) => (
            <div key={tip.t} className="sh-step open">
              <div className="sh-head" style={{ cursor: 'default' }}>
                <span className="sh-n">{i + 1}</span>
                <span className="grow"><strong>{tip.t}</strong><span className="small muted">{tip.b}</span></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card small muted">
        <p><strong>What is already handled for you.</strong> Every page sends Google a proper title, description and product details (price, photos, ratings), plus a share picture so links look right in WhatsApp. Admin, checkout and personal pages are kept out of search. The sitemap is generated from live data. You don't have to touch any of that.</p>
      </section>
    </div>
  )
}
