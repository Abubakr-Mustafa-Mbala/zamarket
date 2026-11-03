import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, Empty, CopyLine, Badge, useToast } from '../../components/ui'

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
    b: 'Each product and each store has its own address, like zamarket.shop/aminas-kitchen/birthday-cake. That is what Google lists. The more real pages you publish, the more chances to be found.',
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
  const toast = useToast()
  const [open, setOpen] = useState(null)
  const [notifyPath, setNotifyPath] = useState('')
  const [notifying, setNotifying] = useState(false)
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('public_products').select('id,name,slug,description,images,category,price,status,page,vendor_id,vendor_slug').eq('status', 'published').order('name')),
    vendors: await q(supabase.from('public_vendors').select('id,slug,business_name,description')),
  }), [])
  const rows = useMemo(() => (data?.products || []).map((p) => ({ ...p, issues: check(p) })), [data])
  if (loading) return <Loading />
  const clean = rows.filter((r) => r.issues.length === 0).length
  const site = 'https://zamarket.shop'
  const notifyIndexNow = async () => {
    if (!notifyPath.trim()) return toast('Enter a published ZA Market page URL', true)
    let path
    try {
      const url = new URL(notifyPath, site)
      if (url.origin !== site) throw new Error('Only zamarket.shop URLs are supported')
      path = url.pathname
    } catch { return toast('Enter a valid zamarket.shop product, store or blog URL', true) }
    setNotifying(true)
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error('Sign in first')
      const result = await fetch('/.netlify/functions/indexnow', {
        method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path }),
      })
      const json = await result.json()
      if (!result.ok) throw new Error(json.message || 'Could not submit')
      toast('URL submitted to IndexNow-enabled search engines')
    } catch (e) { toast(e.message, true) }
    finally { setNotifying(false) }
  }

  return (
    <div className="stack">
      <div className="mk-kpis">
        <div className="kpi lead"><span className="kpi-l">Public product/store pages</span><span className="kpi-v">{rows.length + (data.vendors?.length || 0)}</span><span className="kpi-s">{rows.length} products, {data.vendors?.length || 0} stores</span></div>
        <div className="kpi"><span className="kpi-l">Pass on-page checks</span><span className="kpi-v">{clean}</span><span className="kpi-s">no issues flagged here</span></div>
        <div className="kpi"><span className="kpi-l">Need work</span><span className="kpi-v">{rows.length - clean}</span><span className="kpi-s">listed below</span></div>
      </div>

      <section className="card stack-sm">
        <h3>Get ZA Market discovered on Google and other search engines</h3>
        <p className="small muted">After deploying and verifying your site, submit the same sitemap to each webmaster service. Submission helps discovery, not guaranteed ranking.</p>
        <ol className="week">
          <li>Verify <strong>zamarket.shop</strong> in <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Google Search Console</a> using a DNS record or verification tag.</li>
          <li>Verify the site in <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer">Bing Webmaster Tools</a> (you can import verification from Google).</li>
          <li>Submit this sitemap in both tools: <CopyLine text={`${site}/sitemap.xml`} /></li>
          <li>Check your most important product and article pages with URL Inspection. Request indexing for priority pages when needed; repeated submissions do not force ranking.</li>
          <li>Only if ZA Market has an eligible customer-facing business location, create a Google Business Profile using your real name, location and contact details.</li>
        </ol>
        <p className="tiny muted">The sitemap paginates published listings and articles. It is generated from live data; it does not submit URLs by itself. IndexNow notifications for newly published articles are optional and require INDEXNOW_KEY configured in Netlify.</p>
      </section>

      <section className="card stack-sm">
        <h3>Notify Bing and other IndexNow search engines</h3>
        <p className="small muted">After deploying and configuring INDEXNOW_KEY, submit a recently published or changed product, seller or blog page. This does not notify Google or guarantee indexing.</p>
        <div className="btn-row wrap">
          <input className="input" style={{ flex: '1 1 320px' }} aria-label="Published page URL" placeholder="https://zamarket.shop/blog/your-guide" value={notifyPath} onChange={e => setNotifyPath(e.target.value)} />
          <button type="button" className="btn primary" disabled={notifying} onClick={notifyIndexNow}>{notifying ? 'Submitting…' : 'Notify IndexNow'}</button>
        </div>
        <p className="tiny muted">This feature needs a real Netlify INDEXNOW_KEY and a working public key URL. Never put secret keys in browser code. Google discovery still requires a sitemap and Search Console.</p>
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
                  <div className="tiny muted">{site}{r.vendor_slug ? `/${r.vendor_slug}/${r.slug}` : `/p/${r.slug}`}</div>
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

      <section className="card stack-sm">
        <h3>Content and product visibility</h3>
        <p className="small muted">Write original shopping guides with useful photos and video, clear product names, real prices and descriptive image alt text. Link each guide to the specific products mentioned, then share its own URL through a tracked marketing campaign.</p>
        <div className="btn-row wrap">
          <Link className="btn" to="/admin/marketing/blog">Write a buying guide</Link>
          <Link className="btn" to="/admin/marketing/launch">Create promotional posts</Link>
          <a className="btn" href="https://search.google.com/test/rich-results" rel="noopener noreferrer" target="_blank">Check product rich results</a>
        </div>
        <p className="tiny muted">The local checks above inspect product content; they cannot confirm search-engine indexing, search position, Core Web Vitals, or actual results shown by Google/Bing. Check those separately in Search Console, Bing Webmaster Tools, and your analytics.</p>
      </section>
    </div>
  )
}
