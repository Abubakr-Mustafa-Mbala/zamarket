import { useEffect, useRef, useState } from 'react'
import { Modal, useToast } from './ui'
import { sharePicture } from '../lib/shareCard'
import { tagLink } from '../lib/channel'
import {
  renderProductPoster, productCaption, recommendedDesign,
  PRODUCT_FORMATS, PRODUCT_DESIGNS, shotsOf, sellingPoints, savingOf,
} from '../lib/productPoster'

// Share a PRODUCT — one item, one price, one reason to tap.
//
// This is the other half of the pair: ShareStore argues for the business,
// this argues for the thing. Same art direction underneath (posterKit), so a
// seller's shop post and their product posts look like the same business,
// but the layouts are built around a price rather than a brand.
//
// Nothing on the poster is invented. What the seller has not entered simply
// does not appear, and the warning below tells them what is missing so they
// can go and fix it rather than wonder why the poster looks thin.
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

export default function ShareProduct({
  product, store = null, settings = {}, link,
  label = 'Share this', className = 'btn',
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

  const recommended = recommendedDesign(product, store)
  const chosen = design || recommended

  const shots = shotsOf(product, 4)
  const points = sellingPoints(product, 4)
  const saving = savingOf(product)
  // Everything the viewer receives — the QR on the poster, the link in the
  // caption, the copied link — carries the same tag.
  const shareLink = tagLink(link, postTo)
  const caption = productCaption({ product, store, settings, link: shareLink })

  // Read through a ref so a parent re-render does not redraw the poster for
  // no reason — rendering one is not free on a phone.
  const inputs = useRef({ product, store, settings, link: shareLink })
  inputs.current = { product, store, settings, link: shareLink }

  useEffect(() => {
    if (!open) return
    let alive = true
    setBusy(true)
    renderProductPoster({ ...inputs.current, design: chosen, format })
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

  const slug = String(product?.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `${slug || 'product'}-${format}.jpg`
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
    try { await navigator.clipboard.writeText(shareLink || ''); toast('Product link copied') }
    catch { toast('Could not copy', true) }
  }
  const another = () => {
    const keys = Object.keys(PRODUCT_DESIGNS)
    setDesign(keys[(keys.indexOf(chosen) + 1) % keys.length])
  }

  // Which designs this product can actually fill. A design that would draw an
  // empty frame is shown as unavailable, with the reason, instead of silently
  // producing something worse.
  const why = {
    gallery: shots.length < 2 ? 'needs more than one photo' : '',
    detail: !points.length ? 'needs a description or benefit lines' : '',
    hero: !shots.length ? 'needs a photo' : '',
    statement: !shots.length ? 'needs a photo' : '',
    editorial: '',
  }

  const thin = []
  if (!shots.length) thin.push('no photo')
  if (!points.length) thin.push('no description')
  if (!store?.logo_url) thin.push('no shop logo')

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title="Share this product" onClose={() => setOpen(false)}>
          <div className="stack share-store">
            <div className="ss-preview">
              {busy || !img
                ? <div className="ss-wait"><span /><p className="small muted">Designing the poster…</p></div>
                : <img src={img} alt={`Poster for ${product?.name || 'this product'}`} />}
            </div>

            <div className="ss-row">
              <span className="ss-label">Design</span>
              <div className="ss-chips">
                {Object.values(PRODUCT_DESIGNS).map((d) => (
                  <button key={d.key} type="button"
                    className={`ss-chip ${chosen === d.key ? 'on' : ''} ${why[d.key] ? 'off' : ''}`}
                    title={why[d.key] ? `${d.note} — ${why[d.key]}` : d.note}
                    disabled={!!why[d.key]}
                    onClick={() => setDesign(d.key)}>
                    {d.label}{d.key === recommended && !why[d.key] ? ' ★' : ''}
                  </button>
                ))}
              </div>
            </div>
            <p className="tiny muted">
              {PRODUCT_DESIGNS[chosen]?.note}
              {chosen === recommended && ' ★ suits what you have for this product.'}
            </p>

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
                {Object.values(PRODUCT_FORMATS).map((f) => (
                  <button key={f.key} type="button"
                    className={`ss-chip ${format === f.key ? 'on' : ''}`}
                    onClick={() => setFormat(f.key)}>{f.label}</button>
                ))}
              </div>
            </div>

            {thin.length > 0 && (
              <div className="ss-thin">
                <strong>The poster is working with {thin.join(', ')}.</strong> It will
                still look finished, but one clear photograph and a line about what
                the item actually is make a far better one. Add them on the product.
              </div>
            )}

            <div className="btn-row">
              {canShareFiles && <button className="btn primary" onClick={share} disabled={!blob}>Share the poster</button>}
              <button className="btn buy" onClick={download} disabled={!blob}>Download</button>
              <button className="btn" onClick={another}>Another design</button>
              <button className="btn ghost" onClick={copyCaption}>Copy caption</button>
              <button className="btn ghost" onClick={copyLink}>Copy product link</button>
            </div>

            <details className="ss-caption">
              <summary className="small">The caption that goes with it</summary>
              <div className="share-box">{caption}</div>
            </details>

            <p className="tiny muted">
              Everything here comes from the product itself — its name, its price,
              its photographs, your own words. No review, no discount and no
              &ldquo;only a few left&rdquo; is ever added.
              {saving && ' The crossed-out price is the normal price you entered.'}
              {' '}The QR code opens this product&rsquo;s real page.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}
