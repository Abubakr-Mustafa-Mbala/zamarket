import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, useToast } from '../../components/ui'
import { videoScript, prepare, drawFrame, recordVideo, videoLength, bestMime, voiceController, W, H } from '../../lib/listingVideo'
import { vehicleOf, vehicleTitle } from '../../lib/vehicle'
import { loadDealDishes } from '../../lib/lunchData'
import { fromPrice } from '../../lib/lunch'
import '../../motors.css'

// Faceless videos from what is already on the site. Pick a car, a product or
// a lunch plan; the video is made from its own photos and details, ending on
// the link and a QR code. Record it silent (add music or a voice in TikTok or
// CapCut) or talk over it while it records, reading the script shown.
const KINDS = [['vehicle', 'Cars'], ['product', 'Products'], ['lunch', 'Lunch plans']]

// On phones, the share sheet is the reliable way to keep a video: it offers
// "Save to gallery"/Files, TikTok, WhatsApp and Facebook directly.
const canShareFile = (file) => { try { return !!file && !!navigator.canShare?.({ files: [file] }) } catch { return false } }
const shareFile = async (file) => { try { await navigator.share({ files: [file], title: 'ZaMarket video' }) } catch { /* closed */ } }

export default function VideoMaker() {
  const toast = useToast()
  const { profile } = useAuth()
  const [kind, setKind] = useState('vehicle')
  const [items, setItems] = useState(null)
  const [pick, setPick] = useState(null)
  const [assets, setAssets] = useState(null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [scene, setScene] = useState(0)
  const ctrl = useRef(null)
  const [out, setOut] = useState(null)
  const canvas = useRef(null)
  const playing = useRef(0)

  useEffect(() => {
    setItems(null); setPick(null); setOut(null)
    if (kind === 'lunch') {
      supabase.from('meal_deals').select('*').eq('status', 'published').then(async ({ data }) => {
        const list = await Promise.all((data || []).map(async (d) => {
          const dishes = await loadDealDishes(d)
          const { data: v } = await supabase.from('vendors').select('business_name').eq('id', d.vendor_id).maybeSingle()
          return { ...d, name: d.title, dishList: dishes, from: fromPrice(dishes, d), vendor_name: v?.business_name, images: [d.cover_url].filter(Boolean) }
        }))
        setItems(list)
      })
      return
    }
    let q = supabase.from('public_products').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(80)
    q = kind === 'vehicle' ? q.eq('offering_type', 'vehicle') : q.neq('offering_type', 'vehicle')
    q.then(({ data }) => setItems((data || []).filter((p) => (p.images || []).length)))
  }, [kind])

  const code = profile?.partner?.code
  const link = pick ? (kind === 'lunch'
    ? `https://zamarket.shop/lunch/${pick.slug}`
    : code ? `https://zamarket.shop/r/${code}/${pick.slug || pick.id}` : `https://zamarket.shop/p/${pick.slug || pick.id}`) : ''
  const script = useMemo(() => (pick ? videoScript(pick, kind, link) : null), [pick, kind, link])

  useEffect(() => {
    if (!script) return
    let alive = true
    setAssets(null); setOut(null)
    prepare(script, link).then((a) => { if (alive) setAssets(a) })
    return () => { alive = false }
  }, [script, link])

  // A looping preview while nothing is recording.
  useEffect(() => {
    if (!assets || !script || busy) return
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const len = videoLength(script.slides)
    const start = performance.now()
    let id
    const step = () => { drawFrame(ctx, ((performance.now() - start) / 1000) % len, script.slides, assets.imgs, assets.end); id = requestAnimationFrame(step) }
    id = requestAnimationFrame(step)
    playing.current = id
    return () => cancelAnimationFrame(id)
  }, [assets, script, busy])

  const make = async (voice) => {
    if (!assets) return
    setBusy(voice ? 'voice' : 'silent'); setProgress(0); setOut(null); setScene(0)
    // With your voice you set the pace: Next moves on, Finish ends it.
    ctrl.current = voice ? voiceController(script.slides.length, setScene) : null
    try {
      const r = await recordVideo(canvas.current, script, assets, { voice, onProgress: setProgress, onStage: setStage, controller: ctrl.current })
      const name = `${(pick.slug || 'zamarket').slice(0, 40)}.${r.ext}`
      setOut({ url: URL.createObjectURL(r.blob), ext: r.ext, size: r.blob.size, file: new File([r.blob], name, { type: r.blob.type }), name })
      toast('Video ready')
    } catch (e) {
      toast(/Permission|NotAllowed/i.test(e.name || e.message) ? 'Allow the microphone to record your voice.' : e.message, true)
    }
    setBusy(''); setStage(''); ctrl.current = null
  }
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`) } catch { toast('Copy did not work here', true) } }
  const title = (p) => (kind === 'vehicle' ? vehicleTitle(vehicleOf(p), p.name) : p.name)

  return (
    <div className="vx vx-form vx-video">
      <div className="vx-form-head">
        <div><h1>Video maker</h1><p>Turn a car, a product or a lunch plan into a short vertical video for TikTok, Reels, Facebook and WhatsApp status, made from its own photos and details. No face or camera needed.</p></div>
      </div>
      <div className="vx-tabs">{KINDS.map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>

      {!pick ? (
        items === null ? <Loading /> : !items.length ? <p className="vx-muted">Nothing live here yet.</p> : (
          <div className="vx-video-pick">
            {items.map((p) => (
              <button key={p.id} type="button" onClick={() => setPick(p)}>
                {p.images?.[0] || p.cover_url ? <img src={p.images?.[0] || p.cover_url} alt="" loading="lazy" /> : <span />}
                <strong>{title(p)}</strong>
                <small>{kind === 'lunch' ? (p.from ? `From ${money(p.from, { whole: true })}` : '') : money(p.price, { whole: true })}</small>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="vx-video-work">
          <div className="vx-video-stage">
            <canvas ref={canvas} width={W} height={H} />
            {!assets && <div className="vx-video-wait"><Loading /></div>}
            {busy && <div className="vx-video-rec"><span>{stage === 'Recording' ? (busy === 'voice' ? '● Recording' : `● Recording ${Math.round(progress * 100)}%`) : stage || 'Getting ready…'}</span></div>}
          </div>
          {busy === 'voice' && stage === 'Recording' && ctrl.current && (
            <div className="vx-prompter">
              <small>Scene {Math.min(scene + 1, script.slides.length + 1)} of {script.slides.length + 1} · take your time, it waits for you</small>
              <p>{scene < script.slides.length ? (script.slides[scene].say || 'Say anything about this photo, or tap Next.') : script.endSay}</p>
              <div className="vx-prompter-buttons">
                <button type="button" className="vx-btn ghost" disabled={scene === 0} onClick={() => ctrl.current?.back()}>Back</button>
                {scene < script.slides.length
                  ? <button type="button" className="vx-btn primary big" onClick={() => ctrl.current?.next()}>Next scene</button>
                  : <button type="button" className="vx-btn primary big" onClick={() => ctrl.current?.finish()}>Finish recording</button>}
              </div>
              {scene < script.slides.length && <button type="button" className="vx-btn ghost vx-prompter-end" onClick={() => ctrl.current?.finish()}>Finish now</button>}
            </div>
          )}
          <div className="vx-video-side">
            <button type="button" className="vx-btn ghost" onClick={() => setPick(null)} disabled={!!busy}>← Choose another</button>
            <h2>{title(pick)}</h2>
            <p className="vx-muted tiny">About {Math.round(videoLength(script.slides))} seconds · {script.slides.length} scenes · {bestMime().includes('mp4') ? 'MP4' : 'WebM'}</p>
            <div className="vx-video-buttons">
              <button type="button" className="vx-btn primary big" disabled={!assets || !!busy} onClick={() => make(false)}>{busy === 'silent' ? 'Making…' : 'Make video'}</button>
              <button type="button" className="vx-btn outline" disabled={!assets || !!busy} onClick={() => make(true)}>{busy === 'voice' ? 'Recording your voice…' : 'Make it with my voice'}</button>
            </div>
            {out && (
              <div className="vx-video-out">
                <video src={out.url} controls playsInline />
                <p className="vx-muted tiny">{out.ext.toUpperCase()} · {(out.size / 1048576).toFixed(1)} MB · keep this page open until you have saved it</p>
                {canShareFile(out.file) && <button type="button" className="vx-btn primary" onClick={() => shareFile(out.file)}>Save or share video</button>}
                <a className={`vx-btn ${canShareFile(out.file) ? 'outline' : 'primary'}`} href={out.url} download={out.name}>Download video</a>
                {out.ext === 'webm' && <p className="vx-muted tiny">This browser saves WebM. If TikTok refuses it, open it in CapCut and export, or make it in Chrome on Android, which saves MP4.</p>}
              </div>
            )}
            <section className="vx-card-block">
              <div className="between"><h3>Voice-over script</h3><button type="button" className="vx-btn ghost" onClick={() => copy(script.voice, 'Script')}>Copy</button></div>
              <p className="vx-video-script">{script.voice}</p>
              <p className="vx-muted tiny">Tap “Make it with my voice” and read this while the video plays (about {Math.round(videoLength(script.slides))} seconds). Or record your voice in CapCut or TikTok over the silent video.</p>
            </section>
            <section className="vx-card-block">
              <div className="between"><h3>Caption</h3><button type="button" className="vx-btn ghost" onClick={() => copy(script.caption, 'Caption')}>Copy</button></div>
              <p className="vx-video-script">{script.caption}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
