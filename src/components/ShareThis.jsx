import { useState } from 'react'
import { money } from '../lib/format'
import { productCard, storeCard, sharePicture } from '../lib/shareCard'
import { Modal, useToast } from './ui'

// "Share this" — makes the picture, shows it, then shares or saves it.
export default function ShareThis({ product, store, products, link, sellerName, caption, label = 'Share this', className = 'btn' }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [img, setImg] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)

  const text = caption || (product
    ? `${product.name} — ${money(product.price)}. Delivered in Lusaka, pay when you receive it.\n${link}`
    : `${store?.business_name} on ZaMarket. Order online, pay when you receive it.\n${link}`)

  const make = async () => {
    setBusy(true); setOpen(true)
    try {
      const b = product
        ? await productCard({ product, link, sellerName })
        : await storeCard({ store, products, link })
      setBlob(b)
      setImg(URL.createObjectURL(b))
    } catch (e) { toast('Could not make the picture', true); setOpen(false) } finally { setBusy(false) }
  }

  const share = async () => {
    if (!blob) return
    const how = await sharePicture(blob, { caption: text, filename: `${(product?.name || store?.business_name || 'zamarket').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg` })
    if (how === 'downloaded') toast('Picture saved. Post it with the caption below.')
  }
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Caption copied') } catch { toast('Could not copy', true) } }

  return (
    <>
      <button type="button" className={className} onClick={make}>{label}</button>
      {open && (
        <Modal title="Share this" onClose={() => setOpen(false)}>
          <div className="stack share-this">
            {busy || !img ? <p className="small muted">Making the picture…</p> : <img className="share-preview" src={img} alt="" />}
            <div className="share-box">{text}</div>
            <div className="btn-row">
              <button className="btn primary" onClick={share} disabled={!blob}>Share the picture</button>
              <a className="btn buy" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
              <button className="btn" onClick={copy}>Copy caption</button>
            </div>
            <p className="tiny muted">On a phone, "Share the picture" opens WhatsApp, Facebook, TikTok and the rest. On a computer it saves the picture so you can upload it.</p>
          </div>
        </Modal>
      )}
    </>
  )
}
