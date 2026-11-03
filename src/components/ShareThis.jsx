import { useEffect, useRef, useState } from 'react'
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
  const previewUrl = useRef(null)
  const generation = useRef(0)
  const releasePreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
  }
  useEffect(() => () => { generation.current++; releasePreview() }, [])
  const close = () => {
    generation.current++
    releasePreview()
    setImg(null)
    setBlob(null)
    setBusy(false)
    setOpen(false)
  }

  const text = caption || (product
    ? `${product.name} — ${money(product.price)}. Delivered in Lusaka. We call to confirm before any money moves.\n${link}`
    : `${store?.business_name} on ZaMarket. Order online and we call you to confirm.\n${link}`)

  const make = async () => {
    const request = ++generation.current
    setBusy(true); setOpen(true)
    try {
      const b = product
        ? await productCard({ product, link, sellerName })
        : await storeCard({ store, products, link })
      if (request !== generation.current) return
      releasePreview()
      const url = URL.createObjectURL(b)
      previewUrl.current = url
      setBlob(b)
      setImg(url)
    } catch (e) { if (request === generation.current) { toast('Could not make the picture', true); close() } } finally { if (request === generation.current) setBusy(false) }
  }

  const filename = `${(product?.name || store?.business_name || 'zamarket').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
  const canShareFiles = typeof navigator !== 'undefined' && navigator.canShare?.({ files: [new File([], 'x.jpg', { type: 'image/jpeg' })] })
  const share = async () => {
    if (!blob) return
    const how = await sharePicture(blob, { caption: text, filename })
    if (how === 'downloaded') toast('Picture saved to your downloads')
  }
  const download = () => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast('Picture saved to your downloads')
  }
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Caption copied') } catch { toast('Could not copy', true) } }

  return (
    <>
      <button type="button" className={className} onClick={make}>{label}</button>
      {open && (
        <Modal title="Share this" onClose={close}>
          <div className="stack share-this">
            {busy || !img ? <p className="small muted">Making the picture…</p> : <img className="share-preview" src={img} alt="" />}
            <div className="share-box">{text}</div>
            <div className="btn-row">
              {canShareFiles && <button className="btn primary" onClick={share} disabled={!blob}>Share picture and caption</button>}
              <button className="btn buy" onClick={download} disabled={!blob}>Download the picture</button>
              <button className="btn" onClick={copy}>Copy the caption</button>
              <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp (text only)</a>
            </div>
            <p className="tiny muted">{canShareFiles
              ? 'The first button sends the picture itself to WhatsApp, Facebook, TikTok or anywhere else on your phone.'
              : 'This browser cannot attach a picture directly. Download it, then post it with the caption. On an Android phone the picture attaches by itself.'}</p>
          </div>
        </Modal>
      )}
    </>
  )
}
