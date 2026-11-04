import { useEffect, useRef, useState } from 'react'
import { Modal, useToast } from './ui'
import { sharePicture } from '../lib/shareCard'
import { tagLink } from '../lib/channel'
import {
  renderStorePoster, storeCaption, directionFor,
  STORE_FORMATS, DESIGNS, offersOf, reasonsOf, photosOf,
} from '../lib/storePoster'

// Share a SHOP — not a product.
//
// These are separate jobs and they were sharing one template, which is why a
// shop came out looking like a product with the price missing. A product post
// argues one thing: this item, this price, buy it. A shop post has to answer
// "what is this business and why would I look?" — and that needs the brand,
// what they sell, a few real photographs and a way in.
//
// The seller's brand leads. ZaMarket is the footer: where you find them, not
// the headline.
// Where this poster is going. The link and the QR code are tagged with it, so
// a completed order can be traced back to the platform it came from — which
// is the only way to find out whether the status posts or the Facebook posts
// are actually doing the work.
const POST_TO = [
  ['status', 'WhatsApp status'],
  ['whatsapp', 'WhatsApp chat'],
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['qr', 'Printing it'],
]

export default function ShareStore({
  store, products = [], sections = [], settings = {}, link,
  label = 'Share this shop', className = 'btn',
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [design, setDesign] = useState(null)
  const [format, setFormat] = useState('portrait')
  const [postTo, setPostTo] = useState('status')
  const [img, setImg] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const url = useRef(null)

  // Which look suits this trade. A bakery and a phone shop should not come out
  // of the same mould, so the recommendation follows the business.
  const dir = directionFor(store, products)
  const recommended = {
    food: 'editorial', beauty: 'spotlight', fashion: 'showcase',
    tech: 'commerce', vehicles: 'commerce', home: 'luxury',
    services: 'commerce', default: 'editorial',
  }[dir.key] || 'editorial'
  const chosen = design || recommended

  const offers = offersOf(store, products, sections)
  const reasons = reasonsOf(store, products, settings)
  const shots = photosOf(store, products, 4)
  // Everything the viewer receives — the QR on the poster, the link in the
  // caption, the copied link — carries the same tag.
  const shareLink = tagLink(link, postTo)
  const caption = storeCaption({ store, products, sections, settings, link: shareLink })

  // Redraw whenever the modal opens or the design or size changes. The store
  // data is read through a ref so a parent re-render does not redraw the
  // poster for no reason — rendering one is not free.
  const inputs = useRef({ store, products, sections, settings, link: shareLink })
  inputs.current = { store, products, sections, settings, link: shareLink }

  useEffect(() => {
    if (!open) return
    let alive = true
    setBusy(true)
    renderStorePoster({ ...inputs.current, design: chosen, format })
      .then((b) => {
        if (!alive) return
        if (url.current) URL.revokeObjectURL(url.current)
        url.current = URL.createObjectURL(b)
        setBlob(b); setImg(url.current)
      })
      .catch(() => { if (alive) toast('Could not make the poster', true) })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [open, chosen, format, postTo, toast])

  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  const slug = (store?.business_name || 'shop').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const filename = `${slug}-${format}.jpg`
  const canShareFiles = typeof navigator !== 'undefined'
    && navigator.canShare?.({ files: [new File([], 'x.jpg', { type: 'image/jpeg' })] })

  const share = async () => {
    if (!blob) return
    const how = await sharePicture(blob, { caption, filename })
    if (how === 'downloaded') toast('Poster saved to your downloads')
  }
  const download = () => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    toast('Poster saved to your downloads')
  }
  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); toast('Caption copied') }
    catch { toast('Could not copy', true) }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink || ''); toast('Shop link copied') }
    catch { toast('Could not copy', true) }
  }
  const another = () => {
    const keys = Object.keys(DESIGNS)
    setDesign(keys[(keys.indexOf(chosen) + 1) % keys.length])
  }

  // What the poster will be able to say, so nobody is surprised by a thin one.
  const thin = []
  if (!store?.logo_url) thin.push('no logo')
  if (!store?.cover_url && !shots.length) thin.push('no photos')
  if (!store?.about && !store?.description && !store?.tagline) thin.push('no description')
  if (!offers.length) thin.push('no sections')

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title="Share this shop" onClose={() => setOpen(false)}>
          <div className="stack share-store">
            <div className="ss-preview">
              {busy || !img
                ? <div className="ss-wait"><span /><p className="small muted">Designing the poster…</p></div>
                : <img src={img} alt={`Poster for ${store?.business_name || 'this shop'}`} />}
            </div>

            <div className="ss-row">
              <span className="ss-label">Design</span>
              <div className="ss-chips">
                {Object.values(DESIGNS).map((d) => (
                  <button key={d.key} type="button"
                    className={`ss-chip ${chosen === d.key ? 'on' : ''}`}
                    title={d.note}
                    onClick={() => setDesign(d.key)}>
                    {d.label}{d.key === recommended ? ' ★' : ''}
                  </button>
                ))}
              </div>
            </div>
            <p className="tiny muted">{DESIGNS[chosen]?.note} {chosen === recommended && '★ suits this kind of business.'}</p>

            <div className="ss-row">
              <span className="ss-label">Posting to</span>
              <div className="ss-chips">
                {POST_TO.map(([key, label]) => (
                  <button key={key} type="button"
                    className={`ss-chip ${postTo === key ? 'on' : ''}`}
                    onClick={() => setPostTo(key)}>{label}</button>
                ))}
              </div>
            </div>
            <p className="tiny muted">
              The link and the QR code carry this, so when an order comes in you
              can see which platform it came from. Nothing about the person is
              recorded &mdash; only where the link was posted.
            </p>

            <div className="ss-row">
              <span className="ss-label">Size</span>
              <div className="ss-chips">
                {Object.values(STORE_FORMATS).map((f) => (
                  <button key={f.key} type="button"
                    className={`ss-chip ${format === f.key ? 'on' : ''}`}
                    onClick={() => setFormat(f.key)}>{f.label}</button>
                ))}
              </div>
            </div>

            {thin.length > 0 && (
              <div className="ss-thin">
                <strong>The poster is working with {thin.join(', ')}.</strong> It will still
                look finished, but a shop photo and a line about the business make a
                noticeably better one. Add them under My shopfront.
              </div>
            )}

            <div className="btn-row">
              {canShareFiles && <button className="btn primary" onClick={share} disabled={!blob}>Share the poster</button>}
              <button className="btn buy" onClick={download} disabled={!blob}>Download</button>
              <button className="btn" onClick={another}>Another design</button>
              <button className="btn ghost" onClick={copyCaption}>Copy caption</button>
              <button className="btn ghost" onClick={copyLink}>Copy shop link</button>
            </div>

            <details className="ss-caption">
              <summary className="small">The caption that goes with it</summary>
              <div className="share-box">{caption}</div>
            </details>

            <p className="tiny muted">
              Everything on the poster comes from your shopfront — your name, your photos,
              your own words. Nothing is invented. The QR code goes to your real shop page.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}
