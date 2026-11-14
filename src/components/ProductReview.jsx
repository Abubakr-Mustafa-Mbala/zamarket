import { useState } from 'react'
import PhotoViewer from './PhotoViewer'
import { money } from '../lib/format'

// The founder's review of a seller's product: every photo large enough to
// judge (tap for full screen and zoom), the facts that matter, and the
// decision. A product already approved can be put on hold or sent back.
//
// Statuses: submitted (waiting), published (live), suspended (on hold,
// hidden from shoppers), rejected (sent back to the seller to fix).
export default function ProductReview({ p, images, onDecide, busy }) {
  const [open, setOpen] = useState(null)
  const [reason, setReason] = useState(p.rejection_reason || '')
  const [asking, setAsking] = useState(null) // 'suspended' | 'rejected'
  const status = p.status
  const live = status === 'published'
  const words = {
    submitted: ['Waiting for your review', 'Not visible to shoppers yet.'],
    published: ['Live in the marketplace', 'Shoppers can see and buy it now.'],
    suspended: ['On hold', 'Hidden from shoppers. The seller sees your note.'],
    rejected: ['Sent back to the seller', 'Hidden from shoppers until they fix it and send it again.'],
    draft: ['Draft', 'The seller has not sent it yet.'],
    approved: ['Approved', 'Not yet published.'],
    out_of_stock: ['Out of stock', 'Visible, but cannot be bought.'],
  }[status] || [status, '']

  const confirm = (next) => {
    if (!reason.trim()) return
    onDecide(next, reason.trim())
    setAsking(null)
  }

  return (
    <section className="card flat stack-sm pr-review" aria-label="Review this product">
      <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>Review</h3>
        <span className={`pr-state is-${status}`}>{words[0]}</span>
      </div>
      <p className="small muted">{words[1]} Tap a photo to see it full screen. Check the photo really shows what the name says.</p>

      {images.length ? (
        <div className="pr-photos">
          {images.map((src, i) => (
            <button type="button" key={`${src}-${i}`} className="pr-photo" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} full screen`}>
              <img src={src} alt={`Photo ${i + 1}`} />
              <span>{i + 1}/{images.length}</span>
            </button>
          ))}
        </div>
      ) : <p className="small bad">No photos. Send it back and ask the seller to add real photos.</p>}

      <dl className="pr-facts">
        <div><dt>Name</dt><dd>{p.name || '—'}</dd></div>
        <div><dt>Seller</dt><dd>{p.vendor?.business_name || '—'}</dd></div>
        <div><dt>Department</dt><dd>{p.category || '—'}</dd></div>
        <div><dt>Shoppers pay</dt><dd>{Number(p.price) > 0 ? money(p.price) : 'Worked out when approved'}{p.vendor_price ? ` · seller receives ${money(p.vendor_price)}` : ''}</dd></div>
      </dl>
      {p.description && <p className="small pr-desc">{p.description}</p>}

      {asking ? (
        <div className="stack-sm pr-ask">
          <label className="small strong" htmlFor="pr-reason">{asking === 'suspended' ? 'Why is it on hold? The seller sees this.' : 'What should the seller fix? They see this.'}</label>
          <textarea id="pr-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={asking === 'suspended' ? 'e.g. Checking the photos with you, back soon' : 'e.g. The photo shows a cup, not a cupcake. Please add photos of the cupcakes.'} />
          <div className="btn-row">
            <button type="button" className="btn danger" disabled={busy || !reason.trim()} onClick={() => confirm(asking)}>{asking === 'suspended' ? 'Put on hold' : 'Send back to the seller'}</button>
            <button type="button" className="btn ghost" onClick={() => setAsking(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          {status !== 'published' && <button type="button" className="btn primary" disabled={busy || !images.length} onClick={() => onDecide('published', null)}>{status === 'suspended' ? 'Put back live' : 'Approve and publish'}</button>}
          {live && <button type="button" className="btn" disabled={busy} onClick={() => setAsking('suspended')}>Put on hold</button>}
          {status !== 'rejected' && <button type="button" className="btn danger" disabled={busy} onClick={() => setAsking('rejected')}>Send back to the seller</button>}
        </div>
      )}
      {open !== null && <PhotoViewer images={images} start={open} alt={p.name} onClose={() => setOpen(null)} />}
    </section>
  )
}
