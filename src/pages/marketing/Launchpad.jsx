import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, useToast } from '../../components/ui'
import { makeLaunchPack, matchingCampaigns, storefrontPath } from '../../lib/campaignLaunch'

const CHANNELS = [
  ['whatsapp', 'WhatsApp'], ['facebook', 'Facebook'], ['instagram', 'Instagram'],
  ['tiktok', 'TikTok / short video'], ['sms', 'SMS'], ['visualBrief', 'Creative Studio brief'],
]

export default function Launchpad() {
  const toast = useToast()
  const [selected, setSelected] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [channel, setChannel] = useState('whatsapp')
  const [variant, setVariant] = useState('A')
  const { data, loading, error } = useData(async () => {
    const [products, articles, campaigns] = await Promise.all([
      q(supabase.from('public_products').select('id,name,slug,vendor_slug,description,price,images,category').eq('status', 'published').eq('promo_blocked', false).order('created_at', { ascending: false }).limit(400)),
      q(supabase.from('public_posts').select('slug,title,excerpt,cover_url,published_at').order('published_at', { ascending: false }).limit(200)),
      q(supabase.from('campaigns').select('id,name,code,status,destination').eq('status', 'active')),
    ])
    return { items: [
      ...products.map(x => ({ ...x, type: 'product', key: `p:${x.id}`, cover: x.images?.[0] || '' })),
      ...articles.map(x => ({ ...x, type: 'article', key: `a:${x.slug}`, name: x.title, cover: x.cover_url || '' })),
    ], campaigns }
  }, [])

  const item = data?.items.find(x => x.key === selected) || data?.items[0]
  const path = item && storefrontPath(item, item.type)
  const matching = useMemo(() => matchingCampaigns(data?.campaigns, path), [data?.campaigns, path])
  const campaign = matching.find(c => c.id === campaignId) || null
  const pack = useMemo(() => {
    try { return item ? makeLaunchPack(item, item.type, campaign) : null }
    catch { return null }
  }, [item, campaign])
  const content = variant === 'B' ? (pack?.alternates?.[channel] || pack?.[channel]) : pack?.[channel]
  const copy = async (value) => {
    try { await navigator.clipboard.writeText(value); toast('Copied to clipboard') }
    catch { toast('Select the text and copy manually', true) }
  }

  if (loading) return <Loading />
  if (error) return <div className="card stack"><h2>Could not load campaign data</h2><p>{String(error.message || error)}</p><Link className="btn" to="/admin/marketing">Back</Link></div>
  if (!data?.items.length) return <div className="card stack"><h2>No products or articles published yet</h2><p>Publish products or a blog post first, then return to create campaign content.</p><Link to="/admin/marketing/blog" className="btn">Write a blog post</Link></div>

  return (
    <div className="stack launchpad">
      <div className="card stack-sm">
        <div className="between">
          <div><h2>Campaign launchpad</h2><p className="small muted">Turn a real product or buying guide into ready-to-share posts. Every claim comes from your marketplace listing.</p></div>
          <Link className="btn sm" to="/admin/marketing/campaigns">Manage campaigns</Link>
        </div>
        <div className="launch-controls">
          <label className="stack-sm"><strong className="small">What are we promoting?</strong>
            <select className="input" value={item?.key} onChange={e => { setSelected(e.target.value); setCampaignId('') }}>
              {data.items.map(x => <option key={x.key} value={x.key}>{x.type === 'article' ? 'Article' : 'Product'} · {x.name}</option>)}
            </select>
          </label>
          <label className="stack-sm"><strong className="small">Where will it be shared?</strong>
            <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
              {CHANNELS.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select>
          </label>
          <label className="stack-sm"><strong className="small">Track a campaign (optional)</strong>
            <select className="input" value={campaign?.id || ''} onChange={e => setCampaignId(e.target.value)}>
              <option value="">Direct link (not campaign-tracked)</option>
              {matching.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <p className="small muted">{matching.length ? `${matching.length} campaign${matching.length === 1 ? '' : 's'} send visitors to this exact page.` : 'No active campaigns currently point to this page. Create one in Campaigns to measure visits, leads and sales.'} Never use a campaign link pointing to a different product.</p>
      </div>

      {pack && <div className="launch-content-grid">
        <div className="card stack-sm launch-product">
          {item.cover && <img src={item.cover} alt={item.name} className="launch-cover" loading="lazy" />}
          <div><span className="tiny muted">{item.type === 'article' ? 'Buying guide' : 'Product'}</span><h3>{item.name}</h3></div>
          {pack.details.price && <strong className="launch-price">{pack.details.price}</strong>}
          {pack.details.description && <p className="small muted">{pack.details.description}</p>}
          {(!item.cover || !pack.details.description || !pack.tracked) && <div className="launch-warnings small">
            <strong>Before publishing</strong>
            {!item.cover && <p>Add a real, clear photo to improve click-through.</p>}
            {!pack.details.description && <p>Add a helpful product/article description.</p>}
            {!pack.tracked && <p>Use a matching campaign link to measure sales from this post.</p>}
          </div>}
          <a className="btn" href={pack.path} target="_blank" rel="noopener noreferrer">View landing page</a>
          <div className="launch-track">
            <strong>{pack.tracked ? 'Campaign-tracked link' : 'Direct product/article link'}</strong>
            <code>{pack.link}</code>
            <button type="button" className="btn sm" onClick={() => copy(pack.link)}>Copy link</button>
          </div>
        </div>

        <div className="card stack launch-copy">
          <div className="between">
            <div><h3>{CHANNELS.find(([id]) => id === channel)?.[1]} content</h3><p className="small muted">Review product details before publishing. Updated prices can change after this draft is copied.</p></div>
            <button type="button" className="btn primary" onClick={() => copy(content)}>Copy content</button>
          </div>
          {pack.alternates[channel] && <div className="btn-row wrap">
            <button type="button" className={`btn sm ${variant === 'A' ? 'primary' : ''}`} onClick={() => setVariant('A')}>Angle A: informative</button>
            <button type="button" className={`btn sm ${variant === 'B' ? 'primary' : ''}`} onClick={() => setVariant('B')}>Angle B: direct</button>
          </div>}
          <textarea className="input launch-text" readOnly aria-label="Marketing copy" value={content} rows={12} onFocus={e => e.target.select()} />
          <div className="btn-row wrap">
            {channel === 'whatsapp' && <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(content)}`} target="_blank" rel="noopener noreferrer">Share to WhatsApp</a>}
            <Link className="btn" to="/admin/studio">Open Creative Studio</Link>
            <Link className="btn" to="/admin/marketing/content">Log content after posting</Link>
          </div>
        </div>
      </div>}

      <section className="card stack-sm launch-advice">
        <h3>A stronger marketing workflow</h3>
        <p>Start with a product customers actually need. Show clear original photos or video, explain the benefit without exaggeration, publish using its campaign link, then measure real visits and orders. Try a different angle only when you know the first one's results.</p>
        <p className="small muted">For low-cost bakery and everyday essentials, test bundles and repeat-purchase messaging. Don't promise discounts, scarcity, delivery times or verified reviews unless the offer and evidence actually exist.</p>
      </section>
    </div>
  )
}
