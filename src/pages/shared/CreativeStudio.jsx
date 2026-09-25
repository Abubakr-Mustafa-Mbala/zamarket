import { useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, Empty, Input, Field, useToast, Problem, Segmented } from '../../components/ui'
import { renderPriceList, SHEET, STYLES, roomFor } from '../../lib/priceList'
import { sharePicture } from '../../lib/shareCard'
import Icon from '../../lib/icons'

// The Creative Studio. A seller shouldn't need to know design to have a price
// list that looks like a real business made it — and it is built from the live
// catalogue, so a price change tomorrow is on the next sheet automatically.
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
      const b = await renderPriceList({
        vendor: vendor || { business_name: profile?.full_name || 'ZaMarket' },
        products: picked, style, sheet, title, note: note || undefined,
      })
      setBlob(b)
      setImg(URL.createObjectURL(b))
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

  return (
    <div className="studio">
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
          {picked.length > room && (
            <p className="tiny warn">{picked.length} products on one sheet gets crowded. About {room} reads best on this size — or make one sheet per category.</p>
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
            <div className="btn-row">
              <button className="btn primary" onClick={share}>Share it</button>
              <button className="btn" onClick={download}>Download</button>
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
