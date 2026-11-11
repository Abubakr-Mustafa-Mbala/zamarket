import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { commissionLabel } from '../lib/economics'
import { buildKit, CHANNELS } from '../lib/promoKit'
import { sharePicture } from '../lib/shareCard'
import { renderProductPoster, PRODUCT_FORMATS, PRODUCT_DESIGNS, recommendedDesign, shotsOf, sellingPoints } from '../lib/productPoster'
import { approvedFacts, buildHooks, FAMILIES } from '../lib/hooks'
import { checkCreative } from '../lib/creativeCheck'
import { Modal, useToast, Segmented, Badge } from './ui'

// Everything an affiliate needs to promote one product, in one place.
// The facts come from the marketplace; only the personal opening is theirs.
export default function PromoKit({ product, offer, code, settings, vehicleReward = 0, onClose }) {
  const toast = useToast()
  const [channel, setChannel] = useState('whatsapp')
  const [variant, setVariant] = useState(0)
  const [intro, setIntro] = useState('')
  const [format, setFormat] = useState('portrait')
  const [hookIndex, setHookIndex] = useState(0)
  const [look, setLook] = useState(0)
  const [edited, setEdited] = useState(null)
  const [img, setImg] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const madeId = useRef(null)

  const link = `${window.location.origin}/r/${code}/${product.slug}`
  const kit = useMemo(() => buildKit({ product, offer, link, channel, variant, settings, intro }), [product, offer, link, channel, variant, settings, intro])
  const text = edited ?? kit.text
  const earn = commissionLabel(product, settings)
  const isVehicle = product.offering_type === 'vehicle'

  useEffect(() => { setEdited(null) }, [channel, variant, intro])

  const hooks = useMemo(() => buildHooks(approvedFacts({ product, offer, reviews: product.reviews || [], settings })), [product, offer, settings])
  const hook = hooks[hookIndex % Math.max(1, hooks.length)]

  // Affiliate and public product promotions now share the same proven image
  // renderer. This avoids the old mismatched templates and missing photographs.
  const store = useMemo(() => product.vendor_name ? ({
    business_name: product.vendor_name,
    logo_url: product.vendor_logo,
    location: product.vendor_location,
    category: product.vendor_category,
  }) : null, [product])
  const looks = useMemo(() => Object.values(PRODUCT_DESIGNS).filter((design) =>
    (design.key !== 'gallery' || shotsOf(product, 4).length > 1)
    && (design.key !== 'detail' || sellingPoints(product, 4).length > 0)
  ), [product])
  const preferred = recommendedDesign(product, store)
  const composition = looks[look % Math.max(1, looks.length)] || looks.find((c) => c.key === preferred) || looks[0]

  useEffect(() => {
    let dead = false
    setBusy(true)
    renderProductPoster({ product, store, settings, link, format, design: composition?.key })
      .then((b) => {
        if (dead || !b) return
        setBlob(b)
        setImg((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(b) })
        supabase.rpc('log_creative', { payload: {
          kind: 'promotion', composition: composition?.key, hook: hook?.text, hook_family: hook?.family,
          format, product_id: product.id,
        } }).then(({ data }) => { madeId.current = data }).catch(() => {})
      })
      .catch(() => toast('Could not make the picture', true))
      .finally(() => !dead && setBusy(false))
    return () => { dead = true }
  }, [product, store, settings, link, format, composition?.key])

  const check = useMemo(() => checkCreative({ product, offer, hook: hook?.text, caption: text, link, settings }),
    [product, offer, hook?.text, text, link, settings])

  useEffect(() => () => { if (img) URL.revokeObjectURL(img) }, [img])
  const copyValue = async (value, label) => {
    try { await navigator.clipboard.writeText(value); toast(`${label} copied`) }
    catch { toast(`Could not copy ${label.toLowerCase()}`, true) }
  }
  const copy = () => copyValue(text, 'Message')
  const copyLink = () => copyValue(link, 'Referral link')
  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof File !== 'undefined' && navigator.canShare({ files: [new File([], 'poster.jpg', { type: 'image/jpeg' })] })
  const share = async () => {
    if (!blob) return copy()
    if (madeId.current) supabase.rpc('creative_shared', { p_id: madeId.current }).catch(() => {})
    try {
      const how = await sharePicture(blob, { caption: text, filename: `${product.slug}.jpg` })
      if (how === 'downloaded') {
        try { await navigator.clipboard.writeText(text); toast('Poster downloaded and caption copied. Paste the caption when posting.') }
        catch { toast('Poster downloaded. Please copy the caption separately.') }
      }
    } catch (error) { if (error?.name !== 'AbortError') toast('Sharing failed. Download the poster and copy the caption.', true) }
  }

  return (
    <Modal title={`Create a promotion — ${product.name}`} onClose={onClose} wide>
      <div className="kit">
        <div className="kit-main">
          <div className="stack-sm">
            <span className="small strong">Choose your angle</span>
            <div className="hooks">
              {hooks.map((h, i) => (
                <button type="button" key={h.text} className={`hook ${i === hookIndex ? 'on' : ''}`} onClick={() => setHookIndex(i)}>
                  <span className="hook-family">{FAMILIES[h.family] || h.family}</span>
                  <span>{h.text}</span>
                </button>
              ))}
            </div>
            <p className="tiny muted">Every line comes from what the seller actually wrote — the benefits, the price, the offer, your real reviews. Nothing is invented.</p>
          </div>

          <div className="kit-row">
            <Segmented options={CHANNELS.map((c) => [c.key, c.label])} value={channel} onChange={(v) => { setChannel(v); setVariant(0) }} />
            <button className="btn sm" onClick={() => { setVariant(variant + 1); setLook(look + 1); setHookIndex(hookIndex + 1) }}>Another version</button>
          </div>
          <p className="tiny muted">{kit.templateName} · version {(variant % kit.variants) + 1} of {kit.variants}</p>

          <label className="field">
            <span>Your own opening <span className="muted">(optional)</span></span>
            <input className="input" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="e.g. Guys, I've been using this one myself…" maxLength={140} />
          </label>

          <label className="field"><span>Promotion message <span className="muted">({text.length} characters)</span></span>
            <textarea className="input kit-text" rows={9} value={text} onChange={(e) => setEdited(e.target.value)} aria-label="Promotion message" />
          </label>
          {(!check.ok || check.warnings.length > 0) && (
            <div className={`check-box ${check.ok ? 'warn' : 'bad'}`}>
              <strong>{check.ok ? 'Worth a second look' : 'This cannot be shared yet'}</strong>
              <ul>
                {check.problems.map((p) => <li key={p} className="bad">{p}</li>)}
                {check.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="btn-row">
            {canShareFiles
              ? <button className="btn primary" onClick={share} disabled={!check.ok}>Share picture (copy caption separately if needed)</button>
              : <button className="btn primary" onClick={share} disabled={!check.ok}>Save poster and copy caption</button>}
            <a className="btn buy" href={check.ok ? `https://wa.me/?text=${encodeURIComponent(text)}` : undefined} aria-disabled={!check.ok} onClick={(e) => { if (!check.ok) e.preventDefault() }} target="_blank" rel="noreferrer">WhatsApp (text only)</a>
            <button className="btn" onClick={copy} disabled={!check.ok}>Copy the message</button>
            <button className="btn" onClick={copyLink}>Copy referral link</button>
            {edited !== null && <button className="btn ghost sm" onClick={() => setEdited(null)}>Undo my edits</button>}
          </div>
        </div>

        <aside className="kit-side">
          <div className="kit-facts">
            <div className="between"><span className="muted small">Customer pays</span><strong>{money(product.price)}</strong></div>
            {product.normal_price > product.price && <div className="between"><span className="muted small">Normally</span><span className="strike">{money(product.normal_price)}</span></div>}
            {offer?.copy && <div className="between"><span className="muted small">Offer</span><Badge tone="warn">{offer.copy}</Badge></div>}
            <div className="between"><span className="muted small">You earn</span><strong className="copper">{isVehicle ? (vehicleReward > 0 ? `Estimate ${money(vehicleReward)}` : 'Reward not confirmed yet') : money(earn.perUnit)}</strong></div>
            <p className="tiny muted">{isVehicle ? 'Vehicle payout is an estimate at the advertised price. It depends on the final sale price, the agreed seller success fee being received by ZaMarket, and verification of your referral.' : 'Paid after the order is delivered and checked. Prices and offers come from the marketplace — if they change, your link always shows the current price.'}</p>
          </div>

          <Segmented options={Object.values(PRODUCT_FORMATS).map((f) => [f.key, f.label])} value={format} onChange={setFormat} />
          <div className="chips wrap">
            {looks.map((c, i) => (
              <button key={c.key} className={`chip ${i === look % looks.length ? 'on' : ''}`} onClick={() => setLook(i)} title={c.note}>{c.label}</button>
            ))}
          </div>
          {busy || !img ? <p className="small muted">Making the picture…</p> : <img className="share-preview" src={img} alt={`Promotion preview for ${product.name}`} />}
          <p className="tiny muted">Real catalogue photographs and a tracked QR link are included. On some phones the caption must be pasted separately after sharing the photo.</p>
          <button className="btn ghost sm" type="button" onClick={() => setShowLink(!showLink)} aria-expanded={showLink}>{showLink ? "Hide referral link" : "Show referral link"}</button>
          {showLink && <input className="input" readOnly value={link} aria-label="Your referral link" onFocus={(e) => e.target.select()} />}
        </aside>
      </div>
    </Modal>
  )
}
