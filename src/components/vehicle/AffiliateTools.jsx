import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { Modal, useToast } from '../ui'
import { vehicleOf, vehiclePostText } from '../../lib/vehicle'
import { VI } from './icons'
import ShareProduct from '../ShareProduct'

const photosOf = (p) => (Array.isArray(p?.images) ? p.images : []).filter((s) => typeof s === 'string' && /^https?:\/\//i.test(s))
const fileName = (title, i) => `${String(title || 'vehicle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${i + 1}.jpg`

async function asFile(url, name) {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error('A photo could not be downloaded')
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

function saveBlob(file) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1500)
}

// Every photo of the vehicle, to post on a WhatsApp status, Facebook or
// Instagram. On a phone "Share all photos" hands them straight to WhatsApp
// or the gallery; anywhere else each photo downloads.
export function PhotoSaver({ p, title, onClose }) {
  const toast = useToast()
  const photos = photosOf(p)
  const [busy, setBusy] = useState('')
  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare

  const shareAll = async () => {
    setBusy('all')
    try {
      const files = await Promise.all(photos.map((u, i) => asFile(u, fileName(title, i))))
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files, title })
      } else {
        for (const f of files) { saveBlob(f); await new Promise((r) => setTimeout(r, 350)) }
        toast(`${files.length} photos saved`)
      }
    } catch (e) {
      if (e?.name !== 'AbortError') toast(e.message || 'The photos could not be saved', true)
    } finally { setBusy('') }
  }
  const saveOne = async (u, i) => {
    setBusy(String(i))
    try { saveBlob(await asFile(u, fileName(title, i))) } catch (e) { toast(e.message, true) } finally { setBusy('') }
  }

  return (
    <Modal title="Photos to post" onClose={onClose}>
      <div className="stack">
        <p className="small muted">Post them with your link so buyers who contact ZaMarket are credited to you.</p>
        <button type="button" className="vx-btn primary big" onClick={shareAll} disabled={!!busy || !photos.length}>
          {busy === 'all' ? 'Preparing…' : canShareFiles ? `Share all ${photos.length} photos` : `Save all ${photos.length} photos`}
        </button>
        <div className="vx-saver">
          {photos.map((u, i) => (
            <div key={`${u}-${i}`} className="vx-saver-item">
              <img src={u} alt={`Photo ${i + 1}`} loading="lazy" />
              <button type="button" onClick={() => saveOne(u, i)} disabled={!!busy}>{busy === String(i) ? '…' : 'Save'}</button>
            </div>
          ))}
        </div>
        <p className="tiny muted">If a save does nothing, press and hold the photo and choose "Download image".</p>
      </div>
    </Modal>
  )
}

// What an affiliate sees on a vehicle page, in the order they use it: what
// they could earn (an estimate), one big button for the poster, the quick
// tools (photos, ready post, link, WhatsApp), then registering a buyer who
// contacted them directly.
export default function AffiliateTools({ p, title, link, store = null, settings = {}, onRegister }) {
  const toast = useToast()
  const [reward, setReward] = useState(null)
  const [photos, setPhotos] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.rpc('affiliate_vehicle_reward_estimates').then(({ data }) => {
      if (!alive) return
      const row = (data || []).find((r) => r.product_id === p.id)
      setReward(row ? Number(row.estimated_reward) : 0)
    })
    return () => { alive = false }
  }, [p.id])

  const post = vehiclePostText(p, vehicleOf(p), link)
  const copy = async (text, done) => {
    try { await navigator.clipboard.writeText(text); toast(done) } catch { toast('Copy did not work on this phone. Press and hold the text to copy it.', true) }
  }

  return (
    <div className="vx-aff">
      <div className="vx-aff-top">
        <div>
          <strong>Promote this vehicle</strong>
          <span>Buyers who use your link or poster are credited to you.</span>
        </div>
        {reward > 0 && <div className="vx-aff-est"><small>Estimated reward</small><b>≈ {money(reward, { whole: true })}</b></div>}
      </div>

      <ShareProduct product={{ ...p, name: title }} store={store} settings={settings} link={link} audience="affiliate"
        className="vx-btn primary big vx-aff-main" label="Make a poster to share">{VI.share}</ShareProduct>

      <div className="vx-aff-grid">
        <button type="button" className="vx-btn ghost" onClick={() => setPhotos(true)}>{VI.camera}Photos</button>
        <button type="button" className="vx-btn ghost" onClick={() => copy(post, 'Post copied. Paste it with the photos.')}>{VI.chat}Copy post</button>
        <button type="button" className="vx-btn ghost" onClick={() => copy(link, 'Your link is copied')}>{VI.link || VI.share}Copy link</button>
        <a className="vx-btn ghost" href={`https://wa.me/?text=${encodeURIComponent(post)}`} target="_blank" rel="noreferrer">{VI.whatsapp}WhatsApp</a>
      </div>

      <div className="vx-aff-buyer">
        <span>A buyer contacted you directly?</span>
        <button type="button" className="vx-btn outline" onClick={onRegister}>Register a buyer</button>
      </div>

      <p className="vx-aff-note">
        {reward > 0
          ? 'The reward shown is an estimate at the asking price. Your final reward is worked out on the price the buyer actually pays, and paid once the deal is closed.'
          : 'You earn your share of ZaMarket\'s fee when a buyer you bring closes the deal. The final amount is worked out on the agreed price.'}
        {' '}Follow your buyers in Vehicles → My buyers.
      </p>
      {photos && <PhotoSaver p={p} title={title} onClose={() => setPhotos(false)} />}
    </div>
  )
}
