import { useEffect, useRef, useState } from 'react'
import { Modal, useToast } from './ui'
import { sharePicture } from '../lib/shareCard'
import { tagLink } from '../lib/channel'
import { track } from '../lib/traffic'
import { lunchPostText } from '../lib/lunch'
import { renderLunchPoster, LUNCH_FORMATS } from '../lib/lunchPoster'

// Share the weekly lunch as the whole offer: the dishes, this week's menu,
// the packages and "choose your days", one order link. Not the single-product
// designs, because this is not one product.
const POST_TO = [['status', 'WhatsApp status'], ['whatsapp', 'WhatsApp chat'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']]

export default function ShareLunch({ deal, vendorName, menu, from, link, audience = 'customer', label = 'Share', className = 'ln-btn ghost' }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState('story')
  const [postTo, setPostTo] = useState('status')
  const [img, setImg] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const url = useRef(null)
  const shareLink = audience === 'customer' ? link : tagLink(link, postTo)
  const caption = lunchPostText({ deal, vendorName, from, link: shareLink })
  const data = useRef({})
  data.current = { deal, vendorName, menu, from }

  useEffect(() => {
    if (!open) return
    let alive = true
    setBusy(true)
    renderLunchPoster({ ...data.current, link: shareLink, format })
      .then((b) => {
        if (!alive || !b) return
        if (url.current) URL.revokeObjectURL(url.current)
        url.current = URL.createObjectURL(b)
        setBlob(b); setImg(url.current)
      })
      .catch(() => { if (alive) toast('Could not make the poster', true) })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [open, format, shareLink, toast])
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current) }, [])

  const filename = `${deal.slug || 'weekly-lunch'}-${format}.jpg`
  const share = async () => {
    if (!blob) return
    track('share', { lunch: deal.id })
    try {
      const how = await sharePicture(blob, { caption, filename })
      if (how === 'downloaded') { try { await navigator.clipboard.writeText(caption); toast('Poster saved and caption copied. Paste the caption when posting.') } catch { toast('Poster saved.') } }
    } catch (e) { if (e?.name !== 'AbortError') toast('Sharing failed. Try Download.', true) }
  }
  const download = () => {
    if (!blob) return
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg) } catch { toast('Could not copy', true) } }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <Modal title="Share the weekly lunch offer" onClose={() => setOpen(false)}>
          <div className="stack share-store">
            <div className="ss-preview">
              {busy || !img ? <div className="ss-wait"><span /><p className="small muted">Designing the offer…</p></div> : <img src={img} alt="Weekly lunch offer poster" />}
            </div>
            <div className="ss-row">
              <span className="ss-label">Size</span>
              <div className="ss-chips">{Object.values(LUNCH_FORMATS).map((f) => <button key={f.key} type="button" className={`ss-chip ${format === f.key ? 'on' : ''}`} onClick={() => setFormat(f.key)}>{f.label}</button>)}</div>
            </div>
            {audience !== 'customer' && (
              <div className="ss-row">
                <span className="ss-label">Posting to</span>
                <div className="ss-chips">{POST_TO.map(([k, l]) => <button key={k} type="button" className={`ss-chip ${postTo === k ? 'on' : ''}`} onClick={() => setPostTo(k)}>{l}</button>)}</div>
              </div>
            )}
            <div className="btn-row">
              <button className="btn primary" onClick={share} disabled={!blob}>Share poster</button>
              <button className="btn buy" onClick={download} disabled={!blob}>Download</button>
              {audience !== 'customer' && <button className="btn ghost" onClick={() => copy(caption, 'Caption copied')}>Copy caption</button>}
              <button className="btn ghost" onClick={() => copy(shareLink, 'Link copied')}>Copy {shareLink.includes('/r/') ? 'your ' : ''}link</button>
            </div>
            {audience !== 'customer' && <details className="ss-caption"><summary className="small">The caption that goes with it</summary><div className="share-box">{caption}</div></details>}
            {audience === 'seller' && <p className="tiny muted">Everything on it is real: your dishes, this week&rsquo;s menu, the package prices. A saving shows only when the plan has a real package discount.</p>}
          </div>
        </Modal>
      )}
    </>
  )
}
