import { useEffect, useMemo, useState } from 'react'
import { money } from '../lib/format'
import { commissionLabel } from '../lib/economics'
import { buildKit, CHANNELS, IMAGE_LAYOUTS } from '../lib/promoKit'
import { productCard, offerCard, sharePicture } from '../lib/shareCard'
import { Modal, useToast, Segmented, Badge } from './ui'

// Everything an affiliate needs to promote one product, in one place.
// The facts come from the marketplace; only the personal opening is theirs.
export default function PromoKit({ product, offer, code, settings, onClose }) {
  const toast = useToast()
  const [channel, setChannel] = useState('whatsapp')
  const [variant, setVariant] = useState(0)
  const [intro, setIntro] = useState('')
  const [layout, setLayout] = useState('product')
  const [edited, setEdited] = useState(null)
  const [img, setImg] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)

  const link = `${window.location.origin}/r/${code}/${product.slug}`
  const kit = useMemo(() => buildKit({ product, offer, link, channel, variant, settings, intro }), [product, offer, link, channel, variant, settings, intro])
  const text = edited ?? kit.text
  const earn = commissionLabel(product, settings)

  useEffect(() => { setEdited(null) }, [channel, variant, intro])

  useEffect(() => {
    let dead = false
    if (layout === 'none') { setImg(null); setBlob(null); return }
    setBusy(true)
    const make = layout === 'offer'
      ? offerCard({ product, link, offerText: offer?.copy })
      : productCard({ product, link, sellerName: product.vendor_name })
    make.then((b) => {
      if (dead || !b) return
      setBlob(b); setImg(URL.createObjectURL(b))
    }).catch(() => toast('Could not make the picture', true)).finally(() => !dead && setBusy(false))
    return () => { dead = true }
  }, [layout, product, link, offer])

  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied') } catch { toast('Could not copy', true) } }
  const canShareFiles = typeof navigator !== 'undefined' && navigator.canShare?.({ files: [new File([], 'x.jpg', { type: 'image/jpeg' })] })
  const share = async () => {
    if (!blob) return copy()
    const how = await sharePicture(blob, { caption: text, filename: `${product.slug}.jpg` })
    if (how === 'downloaded') toast('Picture saved to your downloads')
  }

  return (
    <Modal title={`Promote ${product.name}`} onClose={onClose} wide>
      <div className="kit">
        <div className="kit-main">
          <div className="kit-row">
            <Segmented options={CHANNELS.map((c) => [c.key, c.label])} value={channel} onChange={(v) => { setChannel(v); setVariant(0) }} />
            <button className="btn sm" onClick={() => setVariant(variant + 1)}>Shuffle wording</button>
          </div>
          <p className="tiny muted">{kit.templateName} · version {(variant % kit.variants) + 1} of {kit.variants}</p>

          <label className="field">
            <span>Your own opening <span className="muted">(optional)</span></span>
            <input className="input" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="e.g. Guys, I've been using this one myself…" maxLength={140} />
          </label>

          <textarea className="input kit-text" rows={9} value={text} onChange={(e) => setEdited(e.target.value)} />
          <div className="btn-row">
            {layout === 'none'
              ? <button className="btn primary" onClick={copy}>Copy the message</button>
              : canShareFiles
                ? <button className="btn primary" onClick={share}>Share picture and message</button>
                : <button className="btn primary" onClick={share}>Download the picture</button>}
            <a className="btn buy" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp (text only)</a>
            <button className="btn" onClick={copy}>Copy the message</button>
            {edited !== null && <button className="btn ghost sm" onClick={() => setEdited(null)}>Undo my edits</button>}
          </div>
        </div>

        <aside className="kit-side">
          <div className="kit-facts">
            <div className="between"><span className="muted small">Customer pays</span><strong>{money(product.price)}</strong></div>
            {product.normal_price > product.price && <div className="between"><span className="muted small">Normally</span><span className="strike">{money(product.normal_price)}</span></div>}
            {offer?.copy && <div className="between"><span className="muted small">Offer</span><Badge tone="warn">{offer.copy}</Badge></div>}
            <div className="between"><span className="muted small">You earn</span><strong className="copper">{money(earn.perUnit)}</strong></div>
            <p className="tiny muted">Paid after the order is delivered and checked. Prices and offers come from the marketplace — if they change, your link always shows the current price.</p>
          </div>

          <Segmented options={IMAGE_LAYOUTS.map((l) => [l.key, l.label])} value={layout} onChange={setLayout} />
          {layout !== 'none' && (busy || !img ? <p className="small muted">Making the picture…</p> : <img className="share-preview" src={img} alt="" />)}
          <p className="tiny muted">Your link is already in the picture and the message: <br /><span className="strong">{link.replace(/^https?:\/\//, '')}</span></p>
        </aside>
      </div>
    </Modal>
  )
}
