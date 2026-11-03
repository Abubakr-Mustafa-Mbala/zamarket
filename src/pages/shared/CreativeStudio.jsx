import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, Empty, Input, Field, useToast, Problem, Segmented } from '../../components/ui'
import { renderPriceList, renderCatalogue, pagesFor, SHEET, STYLES, roomFor } from '../../lib/priceList'
import { renderPromo, renderArrival, renderCollection, renderSpotlight, compositionsFor } from '../../lib/promoArt'
import { approvedFacts, buildHooks } from '../../lib/hooks'
import { sharePicture } from '../../lib/shareCard'
import Icon from '../../lib/icons'
import { studioExportPlan, STUDIO_TOOLS, isRecentProduct, isActualOffer } from '../../lib/studioPlan'

// The Creative Studio. A seller shouldn't need to know design to have a price
// list that looks like a real business made it — and it is built from the live
// catalogue, so a price change tomorrow is on the next sheet automatically.
// The first screen is not a form. It shows what the vendor can make, built from
// their own products, so the tool sells itself before they touch a control.
function Gallery({ products, vendor, onPick }) {
  const [shots, setShots] = useState({})
  const hero = products.find((p) => p.images?.[0]) || products[0]
  const arrivalItem = products.find((p) => isRecentProduct(p))

  useEffect(() => {
    let dead = false
    const generated = []
    const previewUrl = (blob) => {
      const url = URL.createObjectURL(blob)
      if (dead) URL.revokeObjectURL(url)
      else generated.push(url)
      return url
    }
    const make = async () => {
      const out = {}
      try {
        out.priceList = previewUrl(await renderPriceList({
          vendor, products: products.slice(0, 8), style: 'editorial', sheet: 'post', title: 'Price list',
        }))
      } catch { /* ignore */ }
      try {
        out.collection = previewUrl(await renderCollection({
          products: products.slice(0, 4), vendor, settings: {}, link: `${window.location.host}`, title: 'The collection',
        }))
      } catch { /* ignore */ }
      try {
        out.spotlight = previewUrl(await renderSpotlight({
          vendor, products: products.slice(0, 3), settings: {}, link: `${window.location.host}`,
        }))
      } catch { /* ignore */ }
      if (hero) {
        if (arrivalItem) {
          try {
            out.arrival = previewUrl(await renderArrival({ product: arrivalItem, settings: {}, link: `${window.location.host}/p/${arrivalItem.slug}` }))
          } catch { /* ignore */ }
        }
        const facts = approvedFacts({ product: hero, offer: null, reviews: [], settings: {} })
        const hook = buildHooks(facts)[0]?.text
        for (const comp of compositionsFor(hero, null).slice(0, 3)) {
          try {
            out[comp.key] = previewUrl(await renderPromo({
              product: hero, offer: null, settings: {}, hook, link: `${window.location.host}/p/${hero.slug}`,
              format: 'portrait', composition: comp.key,
            }))
          } catch { /* ignore */ }
        }
      }
      if (!dead) setShots(out)
    }
    make()
    return () => { dead = true; generated.forEach((url) => URL.revokeObjectURL(url)) }
  }, [products, vendor, hero?.id, arrivalItem?.id])

  const tiles = [
    { key: 'priceList', title: 'Price list', note: 'Everything you sell, on one sheet', action: 'Make a price list' },
    { key: 'collection', title: 'Collection', note: 'Several products in one picture', action: 'Make a collection' },
    { key: 'spotlight', title: 'Business spotlight', note: 'Your shop, not one item', action: 'Make a spotlight' },
    { key: 'arrival', title: 'New arrival', note: 'For a recently added product', action: 'Announce it' },
    { key: 'hero', title: 'Product advert', note: 'One product, made to stop the scroll', action: 'Make an advert' },
    { key: 'editorial', title: 'Editorial', note: 'For the things worth looking at twice', action: 'Make an advert' },
    { key: 'offer', title: 'Offer card', note: 'When there is a real saving to shout about', action: 'Make an advert' },
    { key: 'price', title: 'Price first', note: 'When the price is the reason to buy', action: 'Make an advert' },
    { key: 'dark', title: 'Premium', note: 'Dark and quiet, for higher-value items', action: 'Make an advert' },
  ].filter((t) => (t.key === 'arrival' ? Boolean(arrivalItem) : true) && (t.key === 'offer' ? products.some(isActualOffer) : true) && (t.key === 'dark' ? products.some((p) => p.images?.[0]) : true))

  return (
    <section className="gallery studio-gallery">
      <div className="gallery-head">
        <span className="eyebrow"><Icon.sparkles /> ZA MARKET CREATIVE SUITE</span>
        <div className="between"><div><h2>Bring your products into the spotlight.</h2>
        <p>Design ready-to-share adverts, collections and price lists from your published catalogue.</p></div>
        <span className="gallery-counter">{products.length} live product{products.length === 1 ? '' : 's'}</span></div>
      </div>
      <div className="studio-flow" aria-label="How Creative Studio works"><span><b>01</b> Pick a design</span><span><b>02</b> Choose products</span><span><b>03</b> Export and share</span></div>
      <div className="gallery-grid">
        {tiles.map((t) => (
          <button key={t.key} type="button" className="gtile" onClick={() => onPick(t.key)}>
            <span className="gtile-shot">
              {shots[t.key] ? <img src={shots[t.key]} alt="" /> : <span className="gtile-placeholder"><Icon.sparkles /><span>Choose to generate</span></span>}
            </span>
            <span className="gtile-text">
              <strong>{t.title}</strong>
              <span className="tiny muted">{t.note}</span>
              <span className="gtile-go">{t.action} <Icon.arrow /></span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function CreativeStudio({ vendorId, vendor }) {
  const toast = useToast()
  const { profile, settings } = useAuth()
  const [style, setStyle] = useState('catalogue')
  const [sheet, setSheet] = useState('post')
  const [title, setTitle] = useState('Price list')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState(null)      // null = everything published
  const [img, setImg] = useState(null)
  const [pages, setPages] = useState([])
  const pageUrls = useRef([])
  useEffect(() => () => pageUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const [tool, setTool] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const generationId = useRef(0)

  const { data, loading, error, reload } = useData(async () => {
    let sel = supabase.from('public_products')
      .select('id,name,slug,price,normal_price,images,category,featured_in_store,offering_type,fulfilment,created_at,description,benefits,vendor_name,sales_model')
      .eq('status', 'published').order('category').order('name')
    if (vendorId) sel = sel.eq('vendor_id', vendorId)
    else sel = sel.eq('owner_type', 'founder')
    return q(sel)
  }, [vendorId])

  const products = data || []
  const cats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products])
  const shown = useMemo(() => products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())), [products, search])
  const picked = chosen === null ? products : products.filter((p) => chosen.includes(p.id))
  const isCatalogue = tool === 'priceList'
  const totalPages = isCatalogue && picked.length ? pagesFor(picked, sheet).length : picked.length ? 1 : 0
  const exportPlan = picked.length && tool ? (() => { try { return studioExportPlan(tool, picked, sheet) } catch { return null } })() : null

  // A design is a snapshot. Never let an old price, product selection, or title
  // masquerade as the current export after the vendor edits the inputs.
  useEffect(() => {
    generationId.current += 1
    pageUrls.current.forEach((url) => URL.revokeObjectURL(url))
    pageUrls.current = []
    setPages([])
    setBlob(null)
    setImg(null)
    setBusy(false)
  }, [data, vendor, tool, style, sheet, title, note, chosen])

  if (error) return <Problem error={error} what="your products" onRetry={reload} />
  if (loading) return <Loading shape="rows" />
  if (!products.length) return <Empty title="Publish a product first">A price list is built from what you already sell, so there is nothing to put on it yet.</Empty>

  const toggle = (id) => {
    const base = chosen === null ? products.map((p) => p.id) : chosen
    setChosen(base.includes(id) ? base.filter((x) => x !== id) : [...base, id])
  }
  const pickAll = () => setChosen(null)
  const pickNone = () => setChosen([])
  const pickCategory = (cat) => setChosen(products.filter((p) => p.category === cat).map((p) => p.id))
  const pickOffers = () => setChosen(products.filter((p) => p.normal_price > p.price).map((p) => p.id))
  const pickFeatured = () => setChosen(products.filter((p) => p.featured_in_store).map((p) => p.id))

  const make = async () => {
    let plan
    try { plan = studioExportPlan(tool, picked, sheet) }
    catch (e) { return toast(e.message, true) }
    const currentGeneration = ++generationId.current
    setBusy(true)
    try {
      const seller = vendor || { business_name: profile?.full_name || 'ZaMarket' }
      const link = seller?.slug ? `${window.location.origin}/${seller.slug}` : window.location.origin
      const product = plan.products[0]
      const productLink = `${window.location.origin}/p/${product.slug || product.id}`
      const config = { vendor: seller, products: plan.products, settings: settings || {}, link, title }
      let blobs
      if (tool === 'priceList') {
        blobs = await renderCatalogue({ ...config, products: picked, style, sheet, note: note || undefined })
      } else if (tool === 'collection') {
        blobs = [await renderCollection({ ...config, format: plan.format })]
      } else if (tool === 'spotlight') {
        blobs = [await renderSpotlight({ ...config, format: plan.format })]
      } else if (tool === 'arrival') {
        blobs = [await renderArrival({ product, settings: settings || {}, link: productLink, format: plan.format })]
      } else {
        const facts = approvedFacts({ product, offer: null, reviews: [], settings: settings || {} })
        const hook = buildHooks(facts)[0]?.text || product.name
        blobs = [await renderPromo({ product, offer: null, settings: settings || {}, hook, link: productLink, format: plan.format, composition: tool })]
      }
      if (currentGeneration !== generationId.current) return
      if (!blobs?.length || blobs.some((b) => !b)) throw new Error('Image export returned no data')
      pageUrls.current.forEach((url) => URL.revokeObjectURL(url))
      const nextPages = blobs.map((b) => ({ blob: b, url: URL.createObjectURL(b) }))
      pageUrls.current = nextPages.map((p) => p.url)
      setPages(nextPages)
      setBlob(blobs[0])
      setImg(nextPages[0]?.url || null)
    } catch (e) { if (currentGeneration === generationId.current) toast('Could not generate the design. Please try again.', true) }
    finally { if (currentGeneration === generationId.current) setBusy(false) }
  }

  const filename = (pageIndex = null) => {
    const base = (vendor?.business_name || 'zamarket').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const suffix = pageIndex == null ? '' : `-${pageIndex}`
    return `${base}-${exportPlan?.filenameBase || 'creative'}${suffix}.${exportPlan?.extension || 'png'}`
  }
  const downloadBlob = (file, name) => {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const download = () => {
    if (!blob) return
    downloadBlob(blob, filename())
    toast('Saved to your downloads')
  }
  const share = async () => {
    if (!blob) return
    const how = await sharePicture(blob, { caption: `${vendor?.business_name || 'ZaMarket'} — ${STUDIO_TOOLS[tool]?.name || title}`, filename: filename() })
    if (how === 'downloaded') toast('Saved to your downloads')
  }

  if (!tool) return <Gallery products={products} vendor={vendor || { business_name: 'ZaMarket' }} onPick={(k) => {
    if (k === 'arrival') setChosen([products.find(isRecentProduct)?.id].filter(Boolean))
    else if (k === 'offer') setChosen([products.find(isActualOffer)?.id].filter(Boolean))
    else if (['hero', 'editorial', 'dark'].includes(k) && products.some((p) => p.images?.[0])) setChosen([products.find((p) => p.images?.[0])?.id].filter(Boolean))
    else setChosen(null)
    setTool(k)
    setTitle(k === 'collection' ? 'The collection' : 'Price list')
    if (k !== 'priceList') setStyle('editorial')
  }} />

  return (
    <div className="studio">
      <div className="studio-back"><button className="btn sm ghost" onClick={() => setTool(null)}>← All designs</button></div>
      <div className="studio-editor-head"><span className="eyebrow">CREATIVE STUDIO / EDITOR</span><h2>{STUDIO_TOOLS[tool]?.name || 'Design your creative'}</h2><p>{STUDIO_TOOLS[tool]?.description}</p></div>
      <div className="studio-pick stack">
        <section className="card stack-sm">
          <div className="between"><h3>What goes on it</h3><span className="small muted">{picked.length} chosen</span></div>
          <div className="chips wrap">
            <button className={`chip ${chosen === null ? 'on' : ''}`} onClick={pickAll}>Everything ({products.length})</button>
            {products.some((p) => p.featured_in_store) && <button className="chip" onClick={pickFeatured}>My featured</button>}
            {products.some((p) => p.normal_price > p.price) && <button className="chip" onClick={pickOffers}>On offer</button>}
            {cats.map((c) => <button key={c} className="chip" onClick={() => pickCategory(c)}>{c}</button>)}
            <button className="chip" onClick={pickNone}>Clear</button>
          </div>
          <Input value={search} onChange={setSearch} placeholder="Search your products" />
          <div className="studio-list">
            {shown.map((p) => {
              const on = chosen === null || chosen.includes(p.id)
              return (
                <button key={p.id} type="button" className={`studio-item ${on ? 'on' : ''}`} onClick={() => toggle(p.id)}>
                  <span className="si-check" aria-hidden>{on ? <Icon.check /> : ''}</span>
                  <span className="si-thumb">{p.images?.[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : <Icon.box />}</span>
                  <span className="si-name"><strong>{p.name}</strong><span className="tiny muted">{p.category || 'Uncategorised'}</span></span>
                  <span className="si-price">{money(p.price)}</span>
                </button>
              )
            })}
          </div>
          {isCatalogue && pagesFor(picked, sheet).length > 1 && (
            <p className="tiny muted">{picked.length} products will be laid out as <strong>{pagesFor(picked, sheet).length} pages</strong>, kept in their categories. Squeezing them onto one sheet would make it unreadable.</p>
          )}
        </section>

        <section className="card form-grid">
          {(isCatalogue || tool === 'collection') && <Field label="Heading"><Input value={title} onChange={setTitle} placeholder="Price list" /></Field>}
          {isCatalogue && <Field label="Line at the bottom" hint="Leave empty for “Order on ZaMarket”"><Input value={note} onChange={setNote} placeholder="Order on ZaMarket" /></Field>}
          {isCatalogue && <Field label="Design" hint={(STYLES[style] || {}).note} span>
            <div className="chips wrap">
              {Object.values(STYLES).map((s) => (
                <button key={s.key} className={`chip ${style === s.key ? 'on' : ''}`} onClick={() => setStyle(s.key)} title={s.note}>{s.label}</button>
              ))}
            </div>
          </Field>}
          <Field label="Size" span>
            <Segmented options={Object.values(SHEET).filter((s) => isCatalogue || s.key !== 'a4').map((s) => [s.key, s.label])} value={sheet === 'a4' && !isCatalogue ? 'post' : sheet} onChange={setSheet} />
          </Field>
          <div className="span studio-export-note"><strong>{isCatalogue ? 'High-resolution PNG catalogue' : 'High-resolution JPEG creative'}</strong><span>{isCatalogue ? SHEET[sheet].w : 1080} × {isCatalogue ? SHEET[sheet].h : ({post:1350, story:1920, square:1080}[sheet] || 1350)} px · {totalPages} {totalPages === 1 ? 'page' : 'pages'} · Current catalogue prices · zamarket.shop</span></div>
          <div className="span"><button className="btn primary block" onClick={make} disabled={busy}>{busy ? 'Making it…' : 'Generate high-quality design'}</button></div>
        </section>
      </div>

      <aside className="studio-preview">
        <div className="studio-preview-heading"><div><span className="eyebrow">EXPORT PREVIEW</span><strong>{STUDIO_TOOLS[tool]?.name}</strong></div><span className="badge">{img ? 'Ready to share' : 'Not generated'}</span></div>
        {img ? (
          <>
            <img className="studio-sheet" src={img} alt="Your price list" />
            {pages.length > 1 && (
              <div className="page-strip">
                {pages.map((p, i) => (
                  <button key={i} type="button" className={p.url === img ? 'on' : ''}
                    onClick={() => { setImg(p.url); setBlob(p.blob) }}>Page {i + 1}</button>
                ))}
              </div>
            )}
            <div className="btn-row">
              <button className="btn primary" onClick={share}>Share it</button>
              <button className="btn" onClick={download}>Download{pages.length > 1 ? ' this page' : ''}</button>
              {pages.length > 1 && (
                <button className="btn" onClick={() => pages.forEach((p, i) => setTimeout(() => downloadBlob(p.blob, filename(i + 1)), i * 400))}>Download all {pages.length}</button>
              )}
              <button className="btn ghost" onClick={make}>Make it again</button>
            </div>
            <p className="tiny muted">Your exported design uses selected catalogue prices. Check the final image before sharing, especially when product details change.</p>
          </>
        ) : (
          <div className="studio-blank">
            <Icon.box />
            <strong>See your design here</strong><p className="small muted">Select your products and generate a creative. Preview the actual export before sharing it.</p>
          </div>
        )}
      </aside>
    </div>
  )
}
