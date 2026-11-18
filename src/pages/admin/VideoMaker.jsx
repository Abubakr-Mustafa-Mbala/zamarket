import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, useToast } from '../../components/ui'
import { videoParts, sceneFrom, voiceFor, loadPhotos, endCard, drawFrame, recordVideo, videoLength, bestMime, voiceController, setPace, pace, PACES, W, H } from '../../lib/listingVideo'
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
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [secs, setSecs] = useState(() => { try { return Number(localStorage.getItem('zm-video-pace')) || 4 } catch { return 4 } })
  setPace(secs)
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
  const parts = useMemo(() => (pick ? videoParts(pick, kind, link) : null), [pick, kind, link])
  const draftKey = pick ? `zm-video-draft-${kind}-${pick.id}` : ''
  const [scenes, setScenes] = useState([])
  const [open, setOpen] = useState(null)
  const [choosing, setChoosing] = useState(null)
  const cache = useRef(new Map())
  const [loaded, setLoaded] = useState(0)
  const [end, setEnd] = useState(null)

  // Your arrangement is kept on this device for each listing.
  useEffect(() => {
    if (!parts) return
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(draftKey) || 'null') } catch { saved = null }
    setScenes(Array.isArray(saved) && saved.length ? saved : parts.starter)
    setOpen(null); setOut(null)
    endCard(parts, link).then(setEnd)
    loadPhotos(parts.photos, cache.current).then(() => setLoaded((n) => n + 1))
  }, [parts])
  useEffect(() => { if (draftKey && scenes.length) { try { localStorage.setItem(draftKey, JSON.stringify(scenes)) } catch { /* full */ } } }, [scenes, draftKey])
  useEffect(() => {
    const missing = scenes.map((x) => x.photo).filter((u) => u && !cache.current.has(u))
    if (missing.length) loadPhotos(missing, cache.current).then(() => setLoaded((n) => n + 1))
  }, [scenes])

  const script = useMemo(() => (parts ? { slides: scenes, end: parts.end, endSay: parts.endSay, caption: parts.caption, voice: voiceFor(scenes, parts.endSay) } : null), [parts, scenes])
  const assets = useMemo(() => (end && script ? { imgs: script.slides.map((x) => cache.current.get(x.photo) || null), end } : null), [script, end, loaded])

  // Editing scenes
  const update = (id, patch) => setScenes((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const move = (i, d) => setScenes((list) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return list; [n[i], n[j]] = [n[j], n[i]]; return n })
  const remove = (id) => { setScenes((list) => list.filter((x) => x.id !== id)); setOpen(null) }
  const add = (block) => {
    const at = open ? scenes.findIndex((x) => x.id === open) + 1 : scenes.length
    const sc = sceneFrom(block, block.photo || (block.scene.type === 'specs' ? scenes[Math.max(0, at - 1)]?.photo : null))
    setScenes((list) => [...list.slice(0, at), sc, ...list.slice(at)])
    setOpen(sc.id)
    // A feature needs the photo that shows it: ask for it straight away.
    if (!sc.photo && block.scene.type !== 'specs') setChoosing({ id: sc.id, hint: block.feature ? `Choose the photo that shows “${block.label}”` : 'Choose a photo for this scene' })
  }
  const restart = () => { if (window.confirm('Start again from the plain starting point? Your arrangement for this listing is replaced.')) { setScenes(parts.starter); setOpen(null) } }

  // A looping preview while nothing is recording. With a scene open, only
  // that scene plays, so you can see exactly what it looks like.
  useEffect(() => {
    if (!assets || !script || busy || !script.slides.length) return
    setPace(secs)
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const focus = open ? script.slides.findIndex((x) => x.id === open) : -1
    const len = videoLength(script.slides)
    const start = performance.now()
    let id
    const step = () => {
      const el = (performance.now() - start) / 1000
      const t = focus >= 0 ? focus * pace() + (el % pace()) : el % len
      drawFrame(ctx, t, script.slides, assets.imgs, assets.end); id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    playing.current = id
    return () => cancelAnimationFrame(id)
  }, [assets, script, busy, secs, open])

  const make = async (voice) => {
    if (!assets || !script.slides.length) return
    setOpen(null)
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
            {open && !busy && <div className="vx-video-focus">Showing scene {scenes.findIndex((x) => x.id === open) + 1}</div>}
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
            <p className="vx-muted tiny">About {Math.round(videoLength(script.slides || []))} seconds · {script.slides.length} scenes · {bestMime().includes('mp4') ? 'MP4' : 'WebM'}</p>
            <div className="vx-pace">
              <span>Each scene stays</span>
              <div className="vx-tabs">{PACES.map((p) => <button key={p} type="button" disabled={!!busy} className={secs === p ? 'on' : ''} onClick={() => { setSecs(p); try { localStorage.setItem('zm-video-pace', String(p)) } catch { /* ignore */ } }}>{p}s</button>)}</div>
              <small className="vx-muted">With your voice, each scene waits for you instead.</small>
            </div>
            <SceneEditor parts={parts} scenes={scenes} open={open} setOpen={setOpen} update={update} move={move} remove={remove} add={add}
              restart={restart} choosing={choosing} setChoosing={setChoosing} busy={!!busy} />
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

const TYPES = [['', 'Photo with words'], ['photo', 'Photo only'], ['specs', 'Specifications card']]

// The scenes, in order. Tap one to change its photo, words and what you
// will say; add scenes from the listing's own details.
function SceneEditor({ parts, scenes, open, setOpen, update, move, remove, add, restart, choosing, setChoosing, busy }) {
  if (!parts) return null
  const specsBlock = parts.blocks.find((b) => b.id === 'specs')
  const used = new Set(scenes.map((x) => x.line))
  return (
    <section className="vx-card-block vx-scenes">
      <div className="between"><h3>Your scenes</h3><button type="button" className="vx-btn ghost" disabled={busy} onClick={restart}>Start again</button></div>
      <p className="vx-muted tiny">The video plays these in order. Nothing is added unless you add it. Tap a scene to choose its photo and words.</p>
      <ol className="vx-scene-list">
        {scenes.map((sc, i) => {
          const isOpen = open === sc.id
          const mode = sc.type === 'specs' ? 'specs' : sc.line || sc.kicker ? '' : 'photo'
          const kind = TYPES.find(([t]) => t === mode)[1]
          return (
            <li key={sc.id} className={isOpen ? 'on' : ''}>
              <div className="vx-scene-row">
                <button type="button" className="vx-scene-main" disabled={busy} onClick={() => setOpen(isOpen ? null : sc.id)}>
                  <span className="vx-scene-n">{i + 1}</span>
                  {sc.photo ? <img src={sc.photo} alt="" /> : <span className="vx-scene-nophoto">No photo</span>}
                  <span className="vx-scene-text"><strong>{sc.type === 'specs' ? 'Specifications card' : sc.line || 'Photo only'}</strong><small>{kind}{sc.say ? ' · has words to say' : ''}</small></span>
                </button>
                <span className="vx-scene-tools">
                  <button type="button" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={busy || i === scenes.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" aria-label="Remove scene" disabled={busy} onClick={() => remove(sc.id)}>✕</button>
                </span>
              </div>
              {isOpen && (
                <div className="vx-scene-edit">
                  <div className="vx-tabs">{TYPES.map(([t, l]) => <button key={t || 'words'} type="button" className={mode === t ? 'on' : ''}
                    onClick={() => update(sc.id, t === 'specs' ? { type: 'specs', kicker: 'Specifications', rows: sc.rows || specsBlock?.scene.rows || [] } : t === 'photo' ? { type: '', kicker: '', line: '', sub: '' } : { type: '', line: sc.line || 'Your words here' })}
                    disabled={t === 'specs' && !specsBlock}>{l}</button>)}</div>

                  <span className="vx-field-label">Photo</span>
                  {choosing?.id === sc.id && <p className="vx-scene-hint">{choosing.hint}</p>}
                  <div className="vx-photo-strip">
                    {parts.photos.map((p) => <button key={p} type="button" className={sc.photo === p ? 'on' : ''} onClick={() => { update(sc.id, { photo: p }); setChoosing(null) }}><img src={p} alt="" /></button>)}
                    <button type="button" className={!sc.photo ? 'on none' : 'none'} onClick={() => { update(sc.id, { photo: null }); setChoosing(null) }}>None</button>
                  </div>

                  {sc.type === 'specs' ? (
                    <div className="vx-spec-pick">
                      <span className="vx-field-label">What the card shows</span>
                      {(specsBlock?.allRows || []).map(([label, value]) => {
                        const on = (sc.rows || []).some((r) => r[0] === label)
                        return (
                          <label key={label}><input type="checkbox" checked={on} onChange={() => update(sc.id, { rows: on ? sc.rows.filter((r) => r[0] !== label) : [...(sc.rows || []), [label, value]].sort((a, b) => specsBlock.allRows.findIndex((r) => r[0] === a[0]) - specsBlock.allRows.findIndex((r) => r[0] === b[0])) })} />
                            <span>{label}</span><b>{value}</b></label>
                        )
                      })}
                    </div>
                  ) : mode === '' ? (
                    <div className="vx-fields">
                      <label className="vx-field"><span className="vx-field-label">Small heading</span><input value={sc.kicker || ''} maxLength={40} onChange={(e) => update(sc.id, { kicker: e.target.value })} placeholder="e.g. Highlights" /></label>
                      <label className="vx-field"><span className="vx-field-label">Main words</span><input value={sc.line || ''} maxLength={70} onChange={(e) => update(sc.id, { line: e.target.value })} /></label>
                      <label className="vx-field"><span className="vx-field-label">Second line (price, place…)</span><input value={sc.sub || ''} maxLength={50} onChange={(e) => update(sc.id, { sub: e.target.value })} /></label>
                    </div>
                  ) : null}
                  <label className="vx-field"><span className="vx-field-label">What you will say (shown while you record)</span><textarea rows={2} value={sc.say || ''} maxLength={300} onChange={(e) => update(sc.id, { say: e.target.value })} placeholder="Optional" /></label>
                  <button type="button" className="vx-btn outline" onClick={() => setOpen(null)}>Done</button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {!scenes.length && <p className="vx-muted">No scenes yet. Add one below.</p>}

      <div className="vx-add">
        <span className="vx-field-label">Add a scene{open ? ' after the open one' : ''}</span>
        <div className="vx-add-chips">
          <button type="button" disabled={busy} onClick={() => add({ label: 'Photo', scene: { kicker: '', line: '', sub: '', say: '' } })}>+ Photo</button>
          {parts.blocks.filter((b) => !b.feature).map((b) => <button key={b.id} type="button" disabled={busy} onClick={() => add(b)}>+ {b.label}</button>)}
        </div>
        {parts.blocks.some((b) => b.feature) && (
          <>
            <span className="vx-field-label">Features from the listing</span>
            <div className="vx-add-chips">
              {parts.blocks.filter((b) => b.feature).map((b) => <button key={b.id} type="button" className={used.has(b.scene.line) ? 'used' : ''} disabled={busy} onClick={() => add(b)}>+ {b.label}</button>)}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
