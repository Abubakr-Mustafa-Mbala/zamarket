import { useState } from 'react'
import { previewBoth } from '../lib/photoStudio'
import { uploadWithOriginal, PHOTO_TIPS } from '../lib/photos'
import { analysePhoto, LEVEL_WORDS } from '../lib/photoQuality'
import { checklistFor } from '../lib/photoChecklists'
import { Modal, useToast } from './ui'

// Choose a photo, see it both ways, pick the one that looks best, upload it.
export default function PhotoUpload({ onDone, label = '📷 Add photo', className = 'btn sm', multiple = false, about }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [shots, setShots] = useState(null)
  const [pick, setPick] = useState('studio')
  const [queue, setQueue] = useState([])
  const [quality, setQuality] = useState(null)
  const [source, setSource] = useState(null)
  const list = about ? checklistFor(about) : null

  const handle = async (files) => {
    const [first, ...rest] = files
    setBusy(true)
    try {
      const [both, q] = await Promise.all([previewBoth(first), analysePhoto(first).catch(() => null)])
      setQuality(q)
      setSource(first)
      setShots({
        original: { blob: both.original.blob, url: URL.createObjectURL(both.original.blob) },
        studio: { blob: both.studio.blob, url: URL.createObjectURL(both.studio.blob), cut: both.studio.cut },
      })
      setPick('original')
      setQueue(rest)
    } catch (e) { toast(e.message, true) } finally { setBusy(false) }
  }

  const use = async () => {
    setBusy(true)
    try {
      const url = await uploadWithOriginal(source, shots[pick].blob, { quality })
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
            {quality && (
              <div className={`pq pq-${quality.level}`}>
                <div className="pq-head">
                  <span className="pq-score">{quality.score}<em>/100</em></span>
                  <span className="pq-words">
                    <strong>{LEVEL_WORDS[quality.level].label}</strong>
                    <span className="tiny">{LEVEL_WORDS[quality.level].note}</span>
                  </span>
                </div>
                {quality.notes.length > 0 && (
                  <ul className="pq-notes">
                    {quality.notes.slice(0, 3).map((n) => <li key={n.text} className={n.level}>{n.text}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="shot-choices">
              <button type="button" className={`shot ${pick === 'studio' ? 'on' : ''}`} onClick={() => setPick('studio')} disabled={!shots.studio.cut}>
                <img src={shots.studio.url} alt="" />
                <span className="shot-label">Cut out<span className="tiny muted">{shots.studio.cut ? 'Optional — background removed, white, with a shadow' : 'Not possible on this photo'}</span></span>
              </button>
              <button type="button" className={`shot ${pick === 'original' ? 'on' : ''}`} onClick={() => setPick('original')}>
                <img src={shots.original.url} alt="" />
                <span className="shot-label">Your photo<span className="tiny muted">Squared, centred and brightened. Recommended.</span></span>
              </button>
            </div>
            <p className="tiny muted">Most photos look best as you took them. The cut-out suits a single item on a plain surface — try it and compare.</p>
            {!shots.studio.cut && (
              <p className="small muted">The background here is too busy to remove cleanly. Shoot the item on a plain surface — a white wall, a bedsheet, a clean table — and the catalogue option will work.</p>
            )}
            <details className="explain small">
              <summary>What to photograph{list ? ` — ${list.label.toLowerCase()}` : ''}</summary>
              {list ? (
                <>
                  <ul className="fc-rules">{list.shots.map((t) => <li key={t}>{t}</li>)}</ul>
                  <p className="small strong mt">Getting it right</p>
                  <ul className="fc-rules">{list.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                </>
              ) : <ul className="fc-rules">{PHOTO_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>}
            </details>
            <div className="btn-row">
              <button className={`btn ${quality?.level === 'red' ? '' : 'primary'}`} onClick={use} disabled={busy}>{busy ? 'Uploading…' : queue.length ? `Use this, then next (${queue.length} left)` : 'Use this photo'}</button>
              <button className={`btn ${quality?.level === 'red' ? 'primary' : 'ghost'}`} onClick={() => setShots(null)} disabled={busy}>
                {quality?.level === 'red' ? 'Take another photo' : 'Cancel'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
