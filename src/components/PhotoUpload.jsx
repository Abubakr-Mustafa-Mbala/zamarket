import { useState } from 'react'
import { previewBoth } from '../lib/photoStudio'
import { uploadBlob, PHOTO_TIPS } from '../lib/photos'
import { Modal, useToast } from './ui'

// Choose a photo, see it both ways, pick the one that looks best, upload it.
export default function PhotoUpload({ onDone, label = '📷 Add photo', className = 'btn sm', multiple = false }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [shots, setShots] = useState(null)
  const [pick, setPick] = useState('studio')
  const [queue, setQueue] = useState([])

  const handle = async (files) => {
    const [first, ...rest] = files
    setBusy(true)
    try {
      const both = await previewBoth(first)
      setShots({
        original: { blob: both.original.blob, url: URL.createObjectURL(both.original.blob) },
        studio: { blob: both.studio.blob, url: URL.createObjectURL(both.studio.blob), cut: both.studio.cut },
      })
      setPick(both.studio.cut ? 'studio' : 'original')
      setQueue(rest)
    } catch (e) { toast(e.message, true) } finally { setBusy(false) }
  }

  const use = async () => {
    setBusy(true)
    try {
      const url = await uploadBlob(shots[pick].blob)
      onDone(url)
      setShots(null)
      if (queue.length) await handle(queue)
      else toast('Photo added')
    } catch (e) { toast(e.message, true) } finally { setBusy(false) }
  }

  return (
    <>
      <label className={className}>
        {busy && !shots ? 'Working…' : label}
        <input type="file" accept="image/*" hidden multiple={multiple} disabled={busy}
          onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) handle(f) }} />
      </label>

      {shots && (
        <Modal title="Which looks better?" onClose={() => setShots(null)}>
          <div className="stack">
            <div className="shot-choices">
              <button type="button" className={`shot ${pick === 'studio' ? 'on' : ''}`} onClick={() => setPick('studio')} disabled={!shots.studio.cut}>
                <img src={shots.studio.url} alt="" />
                <span className="shot-label">Catalogue<span className="tiny muted">{shots.studio.cut ? 'Background removed, white, with a shadow' : 'Not possible on this photo'}</span></span>
              </button>
              <button type="button" className={`shot ${pick === 'original' ? 'on' : ''}`} onClick={() => setPick('original')}>
                <img src={shots.original.url} alt="" />
                <span className="shot-label">As photographed<span className="tiny muted">Squared, centred and brightened</span></span>
              </button>
            </div>
            {!shots.studio.cut && (
              <p className="small muted">The background here is too busy to remove cleanly. Shoot the item on a plain surface — a white wall, a bedsheet, a clean table — and the catalogue option will work.</p>
            )}
            <details className="explain small">
              <summary>How to get better photos</summary>
              <ul className="fc-rules">{PHOTO_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
            </details>
            <div className="btn-row">
              <button className="btn primary" onClick={use} disabled={busy}>{busy ? 'Uploading…' : queue.length ? `Use this, then next (${queue.length} left)` : 'Use this photo'}</button>
              <button className="btn ghost" onClick={() => setShots(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
