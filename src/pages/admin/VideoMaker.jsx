import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, useToast } from '../../components/ui'
import { videoParts, sceneFrom, voiceFor, loadPhotos, endCard, drawFrame, recordVideo, videoLength, heldTime, voiceController, setPace, pace, PACES, MOTIONS, defaultMotion, setMotion, MARKET_TOPICS, W, H } from '../../lib/listingVideo'
import { vehicleOf, vehicleTitle } from '../../lib/vehicle'
import { loadDealDishes } from '../../lib/lunchData'
import { fromPrice } from '../../lib/lunch'
import { startVideo, keepVideo, subscribeVideos, removeVideo, retryVideo, markSeen } from '../../lib/videoJobs'
import { fastEncoder } from '../../lib/fastEncoder'
import { listSounds, addSound, addSoundFromLink, removeSound, savedChoice, saveChoice } from '../../lib/videoSounds'
import '../../motors.css'

// Faceless videos from what is already on the site. Pick a car, a product or
// a lunch plan; the video is made from its own photos and details, ending on
// the link and a QR code. Record it silent (add music or a voice in TikTok or
// CapCut) or talk over it while it records, reading the script shown.
const KINDS = [['vehicle', 'Cars'], ['product', 'Products'], ['lunch', 'Lunch plans'], ['market', 'Marketplace']]

// On phones, the share sheet is the reliable way to keep a video: it offers
// "Save to gallery"/Files, TikTok, WhatsApp and Facebook directly.
const canShareFile = (file) => { try { return !!file && !!navigator.canShare?.({ files: [file] }) } catch { return false } }
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
// A short soft tick for each number of the countdown.
function tick(high) {
  try {
    const A = window.AudioContext || window.webkitAudioContext
    const a = tick.ctx || (tick.ctx = new A())
    const o = a.createOscillator(); const g = a.createGain()
    o.frequency.value = high ? 1320 : 880; g.gain.setValueAtTime(0.18, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.18)
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.2)
  } catch { /* no sound */ }
  try { navigator.vibrate?.(high ? 120 : 40) } catch { /* ignore */ }
}
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const shareFile = async (file) => { try { await navigator.share({ files: [file], title: 'ZaMarket video' }) } catch { /* closed */ } }
// Phones that can build a video frame by frame (fast, and it carries on when
// you leave the page). Others record in real time, as before.
const pickAudio = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }) || ''

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
  const [count, setCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const ctrl = useRef(null)
  const [videos, setVideos] = useState([])
  // Background sound for videos without a voice (your own nasheeds).
  const [sounds, setSounds] = useState([])
  const [sound, setSoundState] = useState(savedChoice)
  useEffect(() => { listSounds().then(setSounds) }, [])
  const setSound = (c) => { setSoundState(c); saveChoice(c) }
  const music = sound?.id ? sounds.find((x) => x.id === sound.id) : null
  // Whether this phone can build videos quickly (checked once, remembered).
  const [fastWay, setFastWay] = useState(undefined)
  useEffect(() => { fastEncoder().then(setFastWay, () => setFastWay(null)) }, [videos.some((v) => v.slow)])
  const fast = () => !!fastWay
  useEffect(() => subscribeVideos(setVideos), [])
  useEffect(() => { if (!document.hidden) markSeen() }, [videos])
  const canvas = useRef(null)
  const playing = useRef(0)

  useEffect(() => {
    setItems(null); setPick(null)
    if (kind === 'market') {
      Promise.all([
        supabase.from('public_products').select('images,offering_type').eq('status', 'published').order('created_at', { ascending: false }).limit(80),
        supabase.from('meal_deals').select('cover_url').eq('status', 'published'),
      ]).then(([{ data: ps }, { data: ds }]) => {
        const first = (list) => [...new Set((list || []).map((p) => (p.images || [])[0]).filter(Boolean))]
        const cars = first((ps || []).filter((p) => p.offering_type === 'vehicle')).slice(0, 8)
        const products = first((ps || []).filter((p) => p.offering_type !== 'vehicle')).slice(0, 10)
        const lunch = (ds || []).map((d) => d.cover_url).filter(Boolean).slice(0, 4)
        setItems(MARKET_TOPICS.map(([topic, name, desc, url]) => ({ id: topic, slug: `zamarket-${topic}`, topic, name, desc, link: url, cars, products, lunch, images: [...products, ...cars, ...lunch].slice(0, 1) })))
      }, () => setItems([]))
      return
    }
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
  const link = pick ? (kind === 'market' ? pick.link : kind === 'lunch'
    ? `https://zamarket.shop/lunch/${pick.slug}`
    : code ? `https://zamarket.shop/r/${code}/${pick.slug || pick.id}` : `https://zamarket.shop/p/${pick.slug || pick.id}`) : ''
  const parts = useMemo(() => (pick ? videoParts(pick, kind, link) : null), [pick, kind, link])
  const draftKey = pick ? `zm-video-v3-${kind}-${pick.id}` : ''
  const [editing, setEditing] = useState(false)
  const [motion, setMotionState] = useState(() => defaultMotion(kind))
  useEffect(() => { let m = null; try { m = localStorage.getItem(`zm-video-motion-${kind}`) } catch { /* ignore */ } setMotionState(m || defaultMotion(kind)) }, [kind])
  setMotion(motion)
  const chooseMotion = (m) => { setMotionState(m); try { localStorage.setItem(`zm-video-motion-${kind}`, m) } catch { /* ignore */ } }
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
    setOpen(null); setEditing(false)
    endCard(parts, link).then(setEnd)
    loadPhotos(parts.photos, cache.current).then(() => setLoaded((n) => n + 1))
  }, [parts])
  useEffect(() => { if (draftKey && scenes.length) { try { localStorage.setItem(draftKey, JSON.stringify(scenes)) } catch { /* full */ } } }, [scenes, draftKey])
  useEffect(() => {
    const missing = scenes.flatMap((x) => [x.photo, ...(x.photos || [])]).filter((u) => u && !cache.current.has(u))
    if (missing.length) loadPhotos(missing, cache.current).then(() => setLoaded((n) => n + 1))
  }, [scenes])

  const script = useMemo(() => (parts ? { slides: scenes, end: parts.end, endSay: parts.endSay, caption: parts.caption, voice: voiceFor(scenes, parts.endSay) } : null), [parts, scenes])
  const assets = useMemo(() => (end && script ? { imgs: script.slides.map((x) => (x.type === 'collage' ? (x.photos || []).map((u) => cache.current.get(u)).filter(Boolean) : cache.current.get(x.photo) || null)), end } : null), [script, end, loaded])

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
  const restart = () => { if (window.confirm('Go back to the automatic video? Your changes for this listing are replaced.')) { setScenes(parts.starter); setOpen(null) } }

  // A looping preview while nothing is recording. With a scene open, only
  // that scene plays, so you can see exactly what it looks like.
  useEffect(() => {
    if (!assets || !script || busy || !script.slides.length) return
    setPace(secs); setMotion(motion)
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
  }, [assets, script, busy, secs, open, motion])

  const spec = () => ({
    title: title(pick), slug: pick.slug || pick.id, kind, link, pace: secs, motion,
    script: { slides: scenes, end: parts.end, endSay: parts.endSay, caption: parts.caption },
    ...(music ? { music: { blob: music.blob, start: sound.start || 0, name: music.name } } : {}),
  })

  // Silent: hand the video to My videos and carry on. It is built in the
  // background; you can leave this page.
  const make = async (voice) => {
    if (!assets || !script.slides.length) return
    if (fast()) {
      if (voice) return recordVoice()
      await startVideo(spec())
      toast('Making your video. You can leave this page; it will be in My videos.')
      return
    }
    // Older phones: record in real time, as before.
    setOpen(null); setMotion(motion)
    setBusy(voice ? 'voice' : 'silent'); setProgress(0); setScene(0)
    ctrl.current = voice ? voiceController(script.slides.length, setScene) : null
    try {
      const countdown = voice ? countIn : null
      const r = await recordVideo(canvas.current, script, assets, { voice, onProgress: setProgress, onStage: setStage, controller: ctrl.current, countdown })
      await keepVideo({ title: title(pick), slug: pick.slug || pick.id, kind, caption: parts.caption, blob: r.blob })
      toast('Video ready')
    } catch (e) {
      toast(/Permission|NotAllowed/i.test(e.name || e.message) ? 'Allow the microphone to record your voice.' : e.message, true)
    }
    setBusy(''); setStage(''); setCount(0); ctrl.current = null
  }

  const countIn = async () => {
    setStage('Get ready')
    for (const n of [3, 2, 1]) { setCount(n); tick(false); await sleep(1000) }
    setCount(0); tick(true)
  }

  // With your voice: only your voice is recorded live, with the moments you
  // tap Next. The video is then built around it, quickly, in My videos.
  const recordVoice = async () => {
    setOpen(null); setBusy('voice'); setScene(0); setStage('Getting ready…')
    const marks = [{ i: 0, at: 0 }]
    let t0 = 0
    const c = voiceController(script.slides.length, (i) => { setScene(i); marks.push({ i, at: (c.at - t0) / 1000 }) })
    ctrl.current = c
    let mic = null; let raf = 0
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      setPace(secs); setMotion(motion)
      const ctx = canvas.current.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      drawFrame(ctx, 0.6, script.slides, assets.imgs, assets.end)
      await countIn()
      const type = pickAudio()
      const rec = new MediaRecorder(mic, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined)
      const chunks = []
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
      const stopped = new Promise((ok) => { rec.onstop = ok })
      await new Promise((ok) => { rec.onstart = ok; rec.start(500) })
      t0 = performance.now(); c.at = t0
      setStage('Recording')
      const done = new Promise((ok) => { const f = c.finish; c.finish = () => { f(); ok() } })
      const draw = () => {
        drawFrame(ctx, heldTime(c.i, (performance.now() - c.at) / 1000, script.slides), script.slides, assets.imgs, assets.end)
        raf = requestAnimationFrame(draw)
      }
      raf = requestAnimationFrame(draw)
      await done
      const duration = (performance.now() - t0) / 1000
      cancelAnimationFrame(raf)
      rec.stop(); await stopped
      const audio = new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] })
      await startVideo({ ...spec(), audio, marks, duration })
      toast('Recorded. Your video is being made; you can leave this page.')
    } catch (e) {
      toast(/Permission|NotAllowed/i.test(e.name || e.message) ? 'Allow the microphone to record your voice.' : e.message, true)
    } finally {
      cancelAnimationFrame(raf)
      mic?.getTracks().forEach((t) => t.stop())
      setBusy(''); setStage(''); setCount(0); ctrl.current = null
    }
  }
  useEffect(() => {
    if (stage !== 'Recording') return
    const at = performance.now(); setElapsed(0)
    const id = setInterval(() => setElapsed((performance.now() - at) / 1000), 500)
    return () => clearInterval(id)
  }, [stage])
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`) } catch { toast('Copy did not work here', true) } }
  const title = (p) => (kind === 'market' ? p.name : kind === 'vehicle' ? vehicleTitle(vehicleOf(p), p.name) : p.name)

  return (
    <div className="vx vx-form vx-video">
      <div className="vx-form-head">
        <div><h1>Video maker</h1><p>Turn a car, a product or a lunch plan into a short vertical video for TikTok, Reels, Facebook and WhatsApp status, made from its own photos and details. No face or camera needed.</p></div>
      </div>
      {!pick && <MyVideos videos={videos} toast={toast} copy={copy} />}
      <div className="vx-tabs">{KINDS.map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>

      {!pick ? (
        items === null ? <Loading /> : !items.length ? <p className="vx-muted">Nothing live here yet.</p> : (
          <div className="vx-video-pick">
            {items.map((p) => (
              <button key={p.id} type="button" onClick={() => setPick(p)}>
                {kind === 'market' && <span className="vx-video-topic">ZaMarket</span>}
                {p.images?.[0] || p.cover_url ? <img src={p.images?.[0] || p.cover_url} alt="" loading="lazy" /> : <span />}
                <strong>{title(p)}</strong>
                <small>{kind === 'market' ? p.desc : kind === 'lunch' ? (p.from ? `From ${money(p.from, { whole: true })}` : '') : money(p.price, { whole: true })}</small>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className={`vx-video-work${busy === 'voice' && (stage === 'Get ready' || stage === 'Recording') ? ' studio' : ''}`}>
          <div className="vx-video-stage">
            <canvas ref={canvas} width={W} height={H} />
            {!assets && <div className="vx-video-wait"><Loading /></div>}
            {open && !busy && <div className="vx-video-focus">Showing scene {scenes.findIndex((x) => x.id === open) + 1}</div>}
            {busy && !count && <div className={`vx-video-rec${stage === 'Recording' ? ' live' : ''}`}><span>{stage === 'Recording' ? (busy === 'voice' ? `● REC ${clock(elapsed)}` : `● Recording ${Math.round(progress * 100)}%`) : stage || 'Getting ready…'}</span></div>}
            {count > 0 && <div className="vx-countdown" aria-live="assertive"><b key={count}>{count}</b><small>Recording starts…</small></div>}
          </div>
          {busy === 'voice' && (stage === 'Recording' || stage === 'Get ready') && ctrl.current && (
            <div className="vx-prompter">
              <div className="vx-prompter-top">
                <small>{stage === 'Get ready' ? 'Get ready. Your first line:' : scene < script.slides.length ? `Scene ${scene + 1} of ${script.slides.length + 1}` : 'Last scene'}</small>
                <small>It waits for you. Read at your own pace.</small>
              </div>
              <p className="vx-prompter-now">{scene < script.slides.length ? (script.slides[scene].say || 'No words for this scene. Say something about it, or tap Next.') : script.endSay}</p>
              {scene + 1 < script.slides.length && script.slides[scene + 1].say && <p className="vx-prompter-next"><span>Next</span>{script.slides[scene + 1].say}</p>}
              {scene + 1 === script.slides.length && <p className="vx-prompter-next"><span>Next</span>{script.endSay}</p>}
              <div className="vx-prompter-buttons">
                <button type="button" className="vx-btn ghost" disabled={scene === 0 || stage !== 'Recording'} onClick={() => ctrl.current?.back()}>Back</button>
                {scene < script.slides.length
                  ? <button type="button" className="vx-btn primary big" disabled={stage !== 'Recording'} onClick={() => ctrl.current?.next()}>Next scene →</button>
                  : <button type="button" className="vx-btn primary big" onClick={() => ctrl.current?.finish()}>Finish recording</button>}
              </div>
              {scene < script.slides.length && stage === 'Recording' && <button type="button" className="vx-btn ghost vx-prompter-end" onClick={() => ctrl.current?.finish()}>Finish now</button>}
            </div>
          )}
          <div className="vx-video-side">
            <button type="button" className="vx-btn ghost" onClick={() => setPick(null)} disabled={!!busy}>← Choose another</button>
            <h2>{title(pick)}</h2>
            <p className="vx-muted tiny">About {Math.round(videoLength(script.slides || []))} seconds · {script.slides.length} scenes · MP4{fast() ? ' · made in seconds, you can leave the page' : ''}</p>
            <div className="vx-video-buttons">
              <button type="button" className="vx-btn primary big" disabled={!assets || !!busy} onClick={() => make(false)}>{busy === 'silent' ? 'Recording…' : 'Make video'}</button>
              <button type="button" className="vx-btn outline" disabled={!assets || !!busy} onClick={() => make(true)}>{busy === 'voice' ? 'Recording your voice…' : 'Make it with my voice'}</button>
            </div>
            <MyVideos videos={videos} toast={toast} copy={copy} />
            {!editing ? (
              <section className="vx-card-block vx-change">
                <h3>Something not right?</h3>
                <p className="vx-muted tiny">The video is made for you from the listing. If a photo, the words or the specifications should be different, change just that scene.</p>
                <button type="button" className="vx-btn outline" disabled={!!busy} onClick={() => setEditing(true)}>Change scenes ({scenes.length})</button>
              </section>
            ) : (
              <SceneEditor parts={parts} scenes={scenes} open={open} setOpen={setOpen} update={update} move={move} remove={remove} add={add}
                restart={restart} choosing={choosing} setChoosing={setChoosing} busy={!!busy} close={() => { setEditing(false); setOpen(null) }} />
            )}
            <div className="vx-pace">
              <span>Photos</span>
              <div className="vx-tabs">{MOTIONS.map(([m, l]) => <button key={m} type="button" disabled={!!busy} className={motion === m ? 'on' : ''} onClick={() => chooseMotion(m)}>{l}</button>)}</div>
            </div>
            <div className="vx-pace">
              <span>Each scene stays</span>
              <div className="vx-tabs">{PACES.map((p) => <button key={p} type="button" disabled={!!busy} className={secs === p ? 'on' : ''} onClick={() => { setSecs(p); try { localStorage.setItem('zm-video-pace', String(p)) } catch { /* ignore */ } }}>{p}s</button>)}</div>
              <small className="vx-muted">With your voice, each scene waits for you instead.</small>
            </div>
            <SoundPicker sounds={sounds} setSounds={setSounds} sound={sound} setSound={setSound} music={music} fast={fast()} toast={toast} busy={!!busy} />
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

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

// Your own nasheeds or qasa'id (voices only), added from the phone once and
// chosen for each video made without your voice. You pick where it starts;
// it loops to the length of the video and fades out at the end.
function SoundPicker({ sounds, setSounds, sound, setSound, music, fast: quick, toast, busy }) {
  const player = useRef(null)
  const [adding, setAdding] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [playing, setPlaying] = useState(false)
  const timer = useRef(0)
  const url = useMemo(() => (music ? URL.createObjectURL(music.blob) : null), [music])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const stop = () => { clearTimeout(timer.current); player.current?.pause(); setPlaying(false) }
  const listen = () => {
    const a = player.current
    if (!a) return
    if (playing) return stop()
    a.currentTime = sound?.start || 0
    a.play().then(() => { setPlaying(true); timer.current = setTimeout(stop, 10000) }, () => toast('This phone cannot play that sound', true))
  }
  const progress = (word) => (p) => setAdding(`${word} ${Math.round((p || 0) * 100)}%`)
  const added = async (s) => {
    setSounds(await listSounds())
    setSound({ id: s.id, start: 0 })
    toast(`${s.name} added`)
  }
  const add = async (file) => {
    if (!file) return
    const video = file.type?.startsWith('video/')
    setAdding(video ? 'Taking out the sound…' : 'Adding…')
    try { await added(await addSound(file, { onProgress: progress(video ? 'Taking out the sound' : 'Making it smaller') })) } catch (e) { toast(e.message, true) }
    setAdding('')
  }
  const fromLink = async () => {
    if (!linkText.trim()) return
    setAdding('Getting it…')
    try { await added(await addSoundFromLink(linkText, { onProgress: progress('Taking out the sound') })); setLinkText(''); setLinkOpen(false) } catch (e) { toast(e.message, true) }
    setAdding('')
  }
  const remove = async () => {
    if (!music || !window.confirm(`Remove "${music.name}" from this phone?`)) return
    stop(); await removeSound(music.id); setSounds(await listSounds()); setSound(null)
  }
  return (
    <section className="vx-card-block vx-sound">
      <h3>Background sound</h3>
      <p className="vx-muted tiny">For videos without your voice. Add a nasheed or qasida with voices only: a sound file, a video (only its sound is kept), or a link. It plays for the whole video, from the part you choose.</p>
      <div className="vx-tabs vx-sound-list">
        <button type="button" disabled={busy} className={!music ? 'on' : ''} onClick={() => { stop(); setSound(null) }}>No sound</button>
        {sounds.map((x) => <button key={x.id} type="button" disabled={busy} className={music?.id === x.id ? 'on' : ''} onClick={() => { stop(); setSound({ id: x.id, start: 0 }) }}>♪ {x.name}</button>)}
      </div>
      <div className="vx-sound-adds">
        <label className={`vx-sound-add ${adding ? 'busy' : ''}`}>+ From phone<input type="file" disabled={!!adding} accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus" hidden onChange={(e) => { add(e.target.files?.[0]); e.target.value = '' }} /></label>
        <label className={`vx-sound-add ${adding ? 'busy' : ''}`}>+ From a video<input type="file" disabled={!!adding} accept="video/*,.mp4,.mov,.3gp" hidden onChange={(e) => { add(e.target.files?.[0]); e.target.value = '' }} /></label>
        <button type="button" className={`vx-sound-add ${linkOpen ? 'on' : ''}`} disabled={!!adding} onClick={() => setLinkOpen(!linkOpen)}>+ From a link</button>
      </div>
      {adding && <p className="vx-sound-busy"><span className="vx-spin" /> {adding}</p>}
      {linkOpen && (
        <div className="vx-sound-link">
          <input type="url" inputMode="url" placeholder="https://… link of the MP3 or video file" value={linkText} onChange={(e) => setLinkText(e.target.value)} />
          <button type="button" className="vx-btn primary" disabled={!!adding || !linkText.trim()} onClick={fromLink}>Add</button>
          <small className="vx-muted tiny">Paste the link of the file itself (it usually ends in .mp3 or .mp4). On the <a href="https://archive.org/search?query=nasheed+acapella&and%5B%5D=mediatype%3A%22audio%22" target="_blank" rel="noreferrer">Internet Archive</a>, open a nasheed, then copy the link under Download options. YouTube, TikTok and Facebook do not allow it.</small>
        </div>
      )}
      {music && (
        <div className="vx-sound-part">
          <label>
            <span>Starts at <b>{mmss(sound.start || 0)}</b> of {mmss(music.seconds)}</span>
            <input type="range" min={0} max={Math.max(0, Math.floor(music.seconds - 3))} step={1} value={sound.start || 0}
              onChange={(e) => { setSound({ ...sound, start: Number(e.target.value) }); if (playing && player.current) player.current.currentTime = Number(e.target.value) }} />
          </label>
          <div className="vx-sound-actions">
            <button type="button" className="vx-btn outline" onClick={listen}>{playing ? '■ Stop' : '▶ Listen from here'}</button>
            <button type="button" className="vx-btn ghost" onClick={remove}>Remove from phone</button>
          </div>
          <audio ref={player} src={url || undefined} preload="auto" onEnded={stop} />
          {!quick && <p className="vx-muted tiny">This phone makes videos the slower way, which cannot add a sound yet.</p>}
        </div>
      )}
      <p className="vx-muted tiny">Use recordings you are allowed to share. TikTok and Facebook may mute a sound they recognise.</p>
    </section>
  )
}

function MyVideos({ videos, copy }) {
  if (!videos.length) return null
  const save = async (v) => {
    const file = new File([v.blob], `${String(v.slug || 'zamarket').slice(0, 40)}.mp4`, { type: 'video/mp4' })
    if (canShareFile(file)) return shareFile(file)
    const a = document.createElement('a'); a.href = v.url; a.download = file.name; a.click()
  }
  const when = (t) => new Date(t).toLocaleString('en-ZM', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <section className="vx-card-block vx-myvideos">
      <h3>My videos</h3>
      <p className="vx-muted tiny">Kept on this phone. While one is being made you can go to another page; if the phone pauses it, it carries on when you come back.</p>
      <ul>
        {videos.map((v) => (
          <li key={v.id} className={`vx-myvideo is-${v.status}`}>
            {v.url ? <video src={v.url} controls playsInline preload="metadata" /> : (
              <div className="vx-myvideo-wait">
                {v.status === 'failed' ? <b>!</b> : <span className="vx-spin" />}
                <small>{v.status === 'making' ? `${Math.round((v.progress || 0) * 100)}%` : v.status === 'waiting' ? 'Waiting' : 'Stopped'}</small>
              </div>
            )}
            <div className="vx-myvideo-body">
              <strong>{v.title}</strong>
              <small className="vx-muted">{when(v.createdAt)}{v.status === 'ready' && v.size ? ` · ${Math.round(v.seconds || 0) || ''}${v.seconds ? 's · ' : ''}${(v.size / 1048576).toFixed(1)} MB` : ''}</small>
              {v.status === 'making' && <div className="vx-myvideo-bar"><span style={{ width: `${Math.round((v.progress || 0) * 100)}%` }} /></div>}
              {v.status === 'waiting' && <small className="vx-muted">Starts in a moment. Paused while the phone is locked.</small>}
              {v.status === 'failed' && <small className="vx-myvideo-error">It did not finish: {v.error || 'unknown problem'}</small>}
              <div className="vx-myvideo-actions">
                {v.status === 'ready' && <button type="button" className="vx-btn primary" onClick={() => save(v)}>Save or share</button>}
                {v.status === 'ready' && v.caption && <button type="button" className="vx-btn outline" onClick={() => copy(v.caption, 'Caption')}>Copy caption</button>}
                {v.status === 'failed' && v.spec && !v.slow && <button type="button" className="vx-btn outline" onClick={() => retryVideo(v.id)}>Try again</button>}
                {v.status !== 'making' && <button type="button" className="vx-btn ghost" onClick={() => { if (window.confirm('Delete this video from this phone?')) removeVideo(v.id) }}>Delete</button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TYPES = [['', 'Photo with words'], ['photo', 'Photo only'], ['collage', 'Photo grid'], ['specs', 'Specifications card']]

// The scenes, in order. Tap one to change its photo, words and what you
// will say; add scenes from the listing's own details.
function SceneEditor({ parts, scenes, open, setOpen, update, move, remove, add, restart, choosing, setChoosing, busy, close }) {
  const [adding, setAdding] = useState(false)
  if (!parts) return null
  const specsBlock = parts.blocks.find((b) => b.id === 'specs')
  const used = new Set(scenes.map((x) => x.line))
  return (
    <section className="vx-card-block vx-scenes">
      <div className="between"><h3>Scenes</h3><button type="button" className="vx-btn ghost" onClick={close}>Done</button></div>
      <p className="vx-muted tiny">Tap a scene to change its photo, words or specifications. The video above shows that scene while you change it.</p>
      <ol className="vx-scene-list">
        {scenes.map((sc, i) => {
          const isOpen = open === sc.id
          const mode = sc.type === 'specs' ? 'specs' : sc.type === 'collage' ? 'collage' : sc.line || sc.kicker ? '' : 'photo'
          const kind = TYPES.find(([t]) => t === mode)[1]
          return (
            <li key={sc.id} className={isOpen ? 'on' : ''}>
              <div className="vx-scene-row">
                <button type="button" className="vx-scene-main" disabled={busy} onClick={() => setOpen(isOpen ? null : sc.id)}>
                  <span className="vx-scene-n">{i + 1}</span>
                  {sc.photo || sc.photos?.[0] ? <img src={sc.photo || sc.photos[0]} alt="" /> : <span className="vx-scene-nophoto">No photo</span>}
                  <span className="vx-scene-text"><strong>{sc.type === 'specs' ? 'Specifications card' : sc.line || (sc.type === 'collage' ? 'Photo grid' : 'Photo only')}</strong><small>{sc.feature && !sc.checked ? <em className="vx-scene-check">Check the photo shows it</em> : kind}</small></span>
                </button>
                <span className="vx-scene-tools">
                  <button type="button" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={busy || i === scenes.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" aria-label="Remove scene" disabled={busy} onClick={() => remove(sc.id)}>✕</button>
                </span>
              </div>
              {isOpen && (
                <div className="vx-scene-edit">
                  <div className="vx-tabs">{TYPES.filter(([t]) => (t !== 'specs' || specsBlock) && (t !== 'collage' || parts.photos.length > 1)).map(([t, l]) => <button key={t || 'words'} type="button" className={mode === t ? 'on' : ''}
                    onClick={() => update(sc.id, t === 'specs' ? { type: 'specs', kicker: 'Specifications', rows: sc.rows || specsBlock?.scene.rows || [] }
                      : t === 'photo' ? { type: '', kicker: '', line: '', sub: '' }
                        : t === 'collage' ? { type: 'collage', photos: sc.photos?.length ? sc.photos : [...new Set([sc.photo, ...parts.photos].filter(Boolean))].slice(0, 4) }
                          : { type: '', line: sc.line || 'Your words here' })}>{l}</button>)}</div>

                  <span className="vx-field-label">{mode === 'collage' ? `Photos in the grid (${(sc.photos || []).length} of 4, tap to add or remove)` : 'Photo'}</span>
                  {sc.feature && !sc.checked && choosing?.id !== sc.id && <p className="vx-scene-hint">Does this photo show “{sc.line}”? If not, tap the one that does.</p>}
                  {choosing?.id === sc.id && <p className="vx-scene-hint">{choosing.hint}</p>}
                  <div className="vx-photo-strip">
                    {mode === 'collage' ? parts.photos.map((p) => {
                      const has = (sc.photos || []).includes(p)
                      return <button key={p} type="button" className={has ? 'on' : ''} disabled={!has && (sc.photos || []).length >= 4} onClick={() => update(sc.id, { photos: has ? sc.photos.filter((u) => u !== p) : [...(sc.photos || []), p] })}><img src={p} alt="" /></button>
                    }) : (
                      <>
                        {parts.photos.map((p) => <button key={p} type="button" className={sc.photo === p ? 'on' : ''} onClick={() => { update(sc.id, { photo: p, checked: true }); setChoosing(null) }}><img src={p} alt="" /></button>)}
                        <button type="button" className={!sc.photo ? 'on none' : 'none'} onClick={() => { update(sc.id, { photo: null }); setChoosing(null) }}>None</button>
                      </>
                    )}
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
                  ) : mode === '' || mode === 'collage' ? (
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

      {!adding ? (
        <div className="vx-scene-foot">
          <button type="button" className="vx-btn outline" disabled={busy} onClick={() => setAdding(true)}>+ Add a scene</button>
          <button type="button" className="vx-btn ghost" disabled={busy} onClick={restart}>Back to automatic</button>
        </div>
      ) : (
      <div className="vx-add">
        <div className="between"><span className="vx-field-label">Add a scene{open ? ' after the open one' : ''}</span><button type="button" className="vx-btn ghost" onClick={() => setAdding(false)}>Close</button></div>
        <div className="vx-add-chips">
          <button type="button" disabled={busy} onClick={() => { add({ label: 'Photo', scene: { kicker: '', line: '', sub: '', say: '' } }); setAdding(false) }}>+ Photo</button>
          {parts.blocks.filter((b) => !b.feature).map((b) => <button key={b.id} type="button" disabled={busy} onClick={() => { add(b); setAdding(false) }}>+ {b.label}</button>)}
        </div>
        {parts.blocks.some((b) => b.feature) && (
          <>
            <span className="vx-field-label">Features from the listing</span>
            <div className="vx-add-chips">
              {parts.blocks.filter((b) => b.feature).map((b) => <button key={b.id} type="button" className={used.has(b.scene.line) ? 'used' : ''} disabled={busy} onClick={() => { add(b); setAdding(false) }}>+ {b.label}</button>)}
            </div>
          </>
        )}
      </div>
      )}
    </section>
  )
}
