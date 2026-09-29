import { useEffect, useMemo, useState } from 'react'
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

// The Creative Studio. A seller shouldn't need to know design to have a price
// list that looks like a real business made it — and it is built from the live
// catalogue, so a price change tomorrow is on the next sheet automatically.
// The first screen is not a form. It shows what the vendor can make, built from
// their own products, so the tool sells itself before they touch a control.
function Gallery({ products, vendor, onPick }) {
  const [shots, setShots] = useState({})
  const hero = products.find((p) => p.images?.[0]) || products[0]

  useEffect(() => {
    let dead = false
    const make = async () => {
      const out = {}
      try {
        out.priceList = URL.createObjectURL(await renderPriceList({
          vendor, products: products.slice(0, 8), style: 'editorial', sheet: 'post', title: 'Price list',
        }))
      } catch { /* ignore */ }
      try {
        out.collection = URL.createObjectURL(await renderCollection({
          products: products.slice(0, 4), vendor, settings: {}, link: `${window.location.host}`, title: 'The collection',
        }))
      } catch { /* ignore */ }
      try {
        out.spotlight = URL.createObjectURL(await renderSpotlight({
          vendor, products: products.slice(0, 3), settings: {}, link: `${window.location.host}`,
        }))
      } catch { /* ignore */ }
      if (hero) {
        try {
          out.arrival = URL.createObjectURL(await renderArrival({ product: hero, settings: {}, link: `${window.location.host}/p/${hero.slug}` }))
        } catch { /* ignore */ }
        const facts = approvedFacts({ product: hero, offer: null, reviews: [], settings: {} })
        const hook = buildHooks(facts)[0]?.text
        for (const comp of compositionsFor(hero, null).slice(0, 3)) {
          try {
            out[comp.key] = URL.createObjectURL(await renderPromo({
              product: hero, offer: null, settings: {}, hook, link: `${window.location.host}/p/${hero.slug}`,
              format: 'portrait', composition: comp.key,
            }))
          } catch { /* ignore */ }
        }
      }
      if (!dead) setShots(out)
    }
    make()
    return () => { dead = true }
  }, [products.length, hero?.id])

  const tiles = [
    { key: 'priceList', title: 'Price list', note: 'Everything you sell, on one sheet', action: 'Make a price list' },
    { key: 'collection', title: 'Collection', note: 'Several products in one picture', action: 'Make a collection' },
    { key: 'spotlight', title: 'Business spotlight', note: 'Your shop, not one item', action: 'Make a spotlight' },
    { key: 'arrival', title: 'New arrival', note: 'For something you have just added', action: 'Announce it' },
    { key: 'hero', title: 'Product advert', note: 'One product, made to stop the scroll', action: 'Make an advert' },
    { key: 'editorial', title: 'Editorial', note: 'For the things worth looking at twice', action: 'Make an advert' },
    { key: 'offer', title: 'Offer card', note: 'When there is a real saving to shout about', action: 'Make an advert' },
    { key: 'price', title: 'Price first', note: 'When the price is the reason to buy', action: 'Make an advert' },
    { key: 'dark', title: 'Premium', note: 'Dark and quiet, for higher-value items', action: 'Make an advert' },
  ].filter((t) => shots[t.key] || t.key === 'priceList')

  return (
    <section className="gallery">
      <div className="gallery-head">
        <h2>What you can make</h2>
        <p className="small muted">Made from your own products, not examples. Nothing to design, nothing to type twice.</p>
      </div>
      <div className="gallery-grid">
        {tiles.map((t) => (
          <button key={t.key} type="button" className="gtile" onClick={() => onPick(t.key)}>
            <span className="gtile-shot">
              {shots[t.key] ? <img src={shots[t.key]} alt="" /> : <span className="sk sk-img" />}
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
  const { profile } = useAuth()
  const [style, setStyle] = useState('catalogue')
  const [sheet, setSheet] = useState('post')
  const [title, setTitle] = useState('Price list')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState(null)      // null = everything published
  const [img, setImg] = useState(null)
  const [pages, setPages] = useState([])
  const [tool, setTool] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useData(async () => {
    let sel = supabase.from('public_products')
      .select('id,name,slug,price,normal_price,images,category,featured_in_store,offering_type,fulfilment')
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
  const room = roomFor(sheet)

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
    if (!picked.length) return toast('Choose at least one product', true)
    setBusy(true)
    try {
      const blobs = await renderCatalogue({
        vendor: vendor || { business_name: profile?.full_name || 'ZaMarket' },
        products: picked, style, sheet, title, note: note || undefined,
      })
      setPages(blobs.map((b) => ({ blob: b, url: URL.createObjectURL(b) })))
      setBlob(blobs[0])
      setImg(URL.createObjectURL(blobs[0]))
    } catch (e) { toast('Could not make the price list', true) } finally { setBusy(false) }
  }

  const download = () => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(vendor?.business_name || 'zamarket').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-price-list.jpg`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast('Saved to your downloads')
  }
  const share = async () => {
    if (!blob) return
    const how = await sharePicture(blob, { caption: `${vendor?.business_name || 'ZaMarket'} — ${title}`, filename: 'price-list.jpg' })
    if (how === 'downloaded') toast('Saved to your downloads')
  }

  if (!tool) return <Gallery products={products} vendor={vendor || { business_name: 'ZaMarket' }} onPick={(k) => { setTool(k); if (k !== 'priceList') setStyle('editorial') }} />

  return (
    <div className="studio">
      <div className="studio-back">
        <button className="btn sm ghost" onClick={() => setTool(null)}>← Everything you can make</button>
      </div>
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
          {pagesFor(picked, sheet).length > 1 && (
            <p className="tiny muted">{picked.length} products will be laid out as <strong>{pagesFor(picked, sheet).length} pages</strong>, kept in their categories. Squeezing them onto one sheet would make it unreadable.</p>
          )}
        </section>

        <section className="card form-grid">
          <Field label="Heading"><Input value={title} onChange={setTitle} placeholder="Price list" /></Field>
          <Field label="Line at the bottom" hint="Leave empty for “Order on ZaMarket”"><Input value={note} onChange={setNote} placeholder="Order on ZaMarket" /></Field>
          <Field label="Design" hint={(STYLES[style] || {}).note} span>
            <div className="chips wrap">
              {Object.values(STYLES).map((s) => (
                <button key={s.key} className={`chip ${style === s.key ? 'on' : ''}`} onClick={() => setStyle(s.key)} title={s.note}>{s.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Size" span>
            <Segmented options={Object.values(SHEET).map((s) => [s.key, s.label])} value={sheet} onChange={setSheet} />
          </Field>
          <div className="span"><button className="btn primary block" onClick={make} disabled={busy}>{busy ? 'Making it…' : 'Make the price list'}</button></div>
        </section>
      </div>

      <aside className="studio-preview">
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
                <button className="btn" onClick={() => pages.forEach((p, i) => setTimeout(() => {
                  const url = URL.createObjectURL(p.blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `price-list-${i + 1}.jpg`
                  document.body.appendChild(a); a.click(); a.remove()
                  setTimeout(() => URL.revokeObjectURL(url), 2000)
                }, i * 400))}>Download all {pages.length}</button>
              )}
              <button className="btn ghost" onClick={make}>Make it again</button>
            </div>
            <p className="tiny muted">Prices come from your catalogue as it is right now. Change a price and make it again — the new price will be on it.</p>
          </>
        ) : (
          <div className="studio-blank">
            <Icon.box />
            <p className="small muted">Choose your products, pick a style, and it appears here.</p>
          </div>
        )}
      </aside>
    </div>
  )
}
