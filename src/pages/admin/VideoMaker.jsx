import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { money } from '../../lib/format'
import { Loading, useToast } from '../../components/ui'
import { openMic } from '../../lib/studioVoice'
import { playClock } from '../../lib/videoFx'
import { AI_VOICES, AI_TONES, aiVoiceOver } from '../../lib/aiVoice'
import { placeVoice } from '../../lib/voiceAlign'
import { videoParts, sceneFrom, voiceFor, loadPhotos, endCard, drawFrame, recordVideo, videoLength, heldTime, voiceController, setPace, pace, PACES, MOTIONS, defaultMotion, setMotion, MARKET_TOPICS, applyPhotoMatch, adCut, sceneImages, W, H } from '../../lib/listingVideo'
import { vehicleOf, vehicleTitle } from '../../lib/vehicle'
import { loadDealDishes } from '../../lib/lunchData'
import { fromPrice, upcomingMenu } from '../../lib/lunch'
import { startVideo, keepVideo, subscribeVideos, removeVideo, retryVideo, markSeen } from '../../lib/videoJobs'
import { fastEncoder } from '../../lib/fastEncoder'
import { matchPhotos, cachedMatch } from '../../lib/photoMatch'
import { askAssist } from '../../lib/aiAssist'
import { listSounds, addSound, addSoundFromLink, removeSound, savedChoice, saveChoice, soundBlob, soundWave } from '../../lib/videoSounds'
import { DEAL_COLS } from '../public/Lunch'
import { lunchOfferFacts } from '../../lib/lunchPoster'
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
  const chosen = sound?.id ? sounds.find((x) => x.id === sound.id) : null
  // A sound added on another phone: fetched from the online folder when chosen.
  const [fetching, setFetching] = useState(false)
  useEffect(() => {
    if (!chosen || chosen.blob) return
    setFetching(true)
    soundBlob(chosen).then((blob) => setSounds((list) => list.map((x) => (x.id === chosen.id ? { ...x, blob } : x))), (e) => toast(e.message, true)).finally(() => setFetching(false))
  }, [chosen?.id, chosen?.blob])
  const music = chosen?.blob ? chosen : null
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
      // The same columns the lunch page reads (the database does not hand out
      // every column of a lunch plan, so '*' came back empty).
      supabase.from('meal_deals').select(DEAL_COLS).eq('status', 'published').then(async ({ data, error }) => {
        if (error) { console.warn('[video] lunch plans', error); setItems([]); return }
        const list = await Promise.all((data || []).map(async (d) => {
          const dishes = await loadDealDishes(d)
          const [{ data: v }, { data: avail }] = await Promise.all([
            supabase.from('public_vendors').select('business_name').eq('id', d.vendor_id).maybeSingle(),
            supabase.rpc('meal_availability', { p_deal: d.id, p_days: 24 }).then((x) => x, () => ({ data: [] })),
          ])
          const from = fromPrice(dishes, d)
          // The real menu and package prices, as on the poster and the booking page.
          const menu = upcomingMenu({ deal: d, products: dishes, availability: avail || [], days: 21 })
          const facts = lunchOfferFacts({ deal: d, menu, from })
          const offer = {
            week: facts.week.map((w) => ({ label: w.label, dish: w.dish?.name || '', photo: w.dish?.images?.[0] || null })),
            pkgs: facts.pkgs.map((p) => ({ title: p.title, total: p.total, days: p.days, saving: p.saving })),
            next: facts.next, cutoff: facts.cutoff, window: facts.window,
          }
          return { ...d, name: d.title, dishList: dishes, from, offer, vendor_name: v?.business_name, images: [d.cover_url].filter(Boolean) }
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
  // The seller's name shows only if you choose it, per seller: by default the
  // video shows only ZaMarket.
  const [named, setNamed] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('zm-video-named') || '[]')) } catch { return new Set() } })
  const sellerName = kind === 'market' || kind === 'vehicle' ? '' : String(pick?.vendor_name || '').trim()
  const sellerKey = pick ? String(pick.vendor_id || sellerName) : ''
  const showSeller = !!sellerName && named.has(sellerKey)
  const nameSeller = (on) => {
    const n = new Set(named); if (on) n.add(sellerKey); else n.delete(sellerKey)
    setNamed(n); try { localStorage.setItem('zm-video-named', JSON.stringify([...n])) } catch { /* ignore */ }
  }
  const subject = useMemo(() => {
    if (!pick || showSeller || !sellerName) return pick
    const esc = sellerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const scrub = (x) => (typeof x === 'string' ? x.replace(new RegExp(`\\s*(?:by|from|·|-|–)?\\s*${esc}(?:['’]s)?`, 'gi'), '').trim() : x)
    return { ...pick, vendor_name: '', title: scrub(pick.title), name: scrub(pick.name) || pick.name, tagline: scrub(pick.tagline) }
  }, [pick, showSeller, sellerName])
  const parts = useMemo(() => (subject ? videoParts(subject, kind, link) : null), [subject, kind, link])
  const draftKey = pick ? `zm-video-v5-${kind}-${pick.id}${showSeller ? '-named' : ''}` : ''
  const [editing, setEditing] = useState(false)
  const [motion, setMotionState] = useState(() => defaultMotion(kind))
  // The full video, or the ~30-second ad cut of it.
  const [short, setShort] = useState(() => { try { return localStorage.getItem('zm-video-ad') === '1' } catch { return false } })
  // Studio voice (cleaned and shaped) or the voice exactly as recorded.
  const [studio, setStudio] = useState(() => { try { return localStorage.getItem('zm-video-studio') !== '0' } catch { return true } })
  const chooseStudio = (v) => { setStudio(v); try { localStorage.setItem('zm-video-studio', v ? '1' : '0') } catch { /* ignore */ } }
  // The ticking clock under the 12:30 opening: on unless you turn it off.
  const [ticks, setTicks] = useState(() => { try { return localStorage.getItem('zm-video-ticks') !== '0' } catch { return true } })
  const chooseTicks = (v) => { setTicks(v); try { localStorage.setItem('zm-video-ticks', v ? '1' : '0') } catch { /* ignore */ } }
  // The AI voice: which voice and how it sounds, remembered on this phone.
  const [aiVoice, setAiVoice] = useState(() => { try { return localStorage.getItem('zm-video-ai-voice') || 'marin' } catch { return 'marin' } })
  const [aiTone, setAiTone] = useState(() => { try { return localStorage.getItem('zm-video-ai-tone') || 'warm' } catch { return 'warm' } })
  const pickVoice = (v) => { setAiVoice(v); try { localStorage.setItem('zm-video-ai-voice', v) } catch { /* ignore */ } }
  const pickTone = (v) => { setAiTone(v); try { localStorage.setItem('zm-video-ai-tone', v) } catch { /* ignore */ } }
  const [hearing, setHearing] = useState(null)
  const chooseShort = (v) => { setShort(v); try { localStorage.setItem('zm-video-ad', v ? '1' : '0') } catch { /* ignore */ } }
  useEffect(() => { let m = null; try { m = localStorage.getItem(`zm-video-motion-${kind}`) } catch { /* ignore */ } setMotionState(m || defaultMotion(kind)) }, [kind])
  setMotion(motion)
  const chooseMotion = (m) => { setMotionState(m); try { localStorage.setItem(`zm-video-motion-${kind}`, m) } catch { /* ignore */ } }
  const [scenes, setScenes] = useState([])
  const [open, setOpen] = useState(null)
  const [choosing, setChoosing] = useState(null)
  const cache = useRef(new Map())
  const [loaded, setLoaded] = useState(0)
  const [end, setEnd] = useState(null)

  // AI photo check (cars): which photo really shows each feature, before the
  // video is made. Runs by itself for a car with no changes of yours yet.
  const [ai, setAi] = useState({ state: 'idle' })
  const touched = useRef(false)
  // Cars and products: photo check. Lunch plans: the AI writes the whole
  // video as an offer, from the plan's own facts and photos.
  const aiKind = kind === 'vehicle' || kind === 'product' || kind === 'lunch'
  const [aiCaption, setAiCaption] = useState('')
  const lunchKey = pick && kind === 'lunch' ? `zm-lunch-ai-v2-${pick.id}-${showSeller ? 'named' : 'za'}-${JSON.stringify([pick.title, pick.dishes, pick.cover_url, pick.in_the_box, pick.group_discounts, pick.day_discounts, pick.trial_first, pick.guarantee, pick.cutoff_hour, pick.delivery_windows]).length}` : ''
  const applyLunch = (r) => {
    const written = (r.scenes || []).map((x) => sceneFrom({ scene: { kicker: x.kicker, line: x.line, sub: x.sub, say: x.say } }, x.photo_url || null))
    // The offer card goes after the food; the booking steps and "need another
    // day?" close the video, whatever the AI wrote.
    // The 12:30 opening first; then the AI's scenes about the food, the cook
    // and the savings; then the week menu, the delivery and the offer card;
    // the booking steps and "need another day?" close it.
    const fixed = parts.starter.filter((x) => x.fixed)
    const slot = (n) => fixed.filter((x) => (x.slot || (x.type === 'offer' ? 'after' : 'close')) === n)
    const food = Math.min(written.length, 2)
    const list = [...slot('open'), ...written.slice(0, food), ...slot('after'), ...written.slice(food), ...slot('close')].map((x) => ({ ...x, id: x.id || sceneFrom({ scene: {} }).id }))
    setScenes(list); setOpen(null)
    setAiCaption(r.caption ? `${r.caption}\n${link}` : '')
    setAi({ state: 'done', lunch: true, count: list.length })
  }
  const runLunch = async (fresh) => {
    let cached = null
    if (!fresh) { try { cached = JSON.parse(localStorage.getItem(lunchKey) || 'null') } catch { cached = null } }
    if (cached?.scenes?.length) return applyLunch(cached)
    setAi({ state: 'writing' })
    try {
      const r = await askAssist({ task: 'lunch_video', deal_id: pick.id, hide_seller: !showSeller })
      try { localStorage.setItem(lunchKey, JSON.stringify(r)) } catch { /* full */ }
      if (touched.current) { setAi({ state: 'done', lunch: true, count: (r.scenes || []).length, late: true }); return }
      applyLunch(r)
    } catch (e) { setAi({ state: 'error', note: e.message }) }
  }
  const featureList = useMemo(() => (parts && aiKind ? parts.blocks.filter((b) => b.feature).map((b) => b.label).slice(0, 12) : []), [parts, aiKind])
  // Features the AI saw that you left out (it saw them; you decide).
  const [leftOut, setLeftOut] = useState(() => new Set())
  const summarise = (m) => {
    const asked = m.features || []
    const found = asked.filter((f) => f.photo >= 0)
    const unseen = asked.filter((f) => f.photo < 0 && parts.starter.some((s) => s.feature && s.line === f.feature)).map((f) => f.feature)
    return { state: 'done', match: m, found: found.length, total: asked.length, unseen, maybe: found.filter((f) => f.sure === 'maybe').length, spotted: m.spotted || [] }
  }
  // Spotted features the AI was sure of are in unless you take them out;
  // "maybe" ones are out unless you put them in.
  const kept = (m, off) => (m.spotted || []).filter((f) => (f.sure === 'yes' ? !off.has(f.feature) : off.has(`+${f.feature}`)))
  const build = (m, off) => applyPhotoMatch(parts.starter, m, pick.images || [], { extra: kept(m, off), keepUnseen: kind !== 'vehicle' })
  const runAi = async (fresh) => {
    if (kind === 'lunch' && pick) return runLunch(fresh)
    if (!pick || !aiKind || !(pick.images || []).length) return
    const off = new Set(); setLeftOut(off)
    const cached = !fresh && cachedMatch(pick, featureList)
    if (cached) { setScenes(build(cached, off)); setAi(summarise(cached)); return }
    setAi({ state: 'checking', step: 0, steps: Math.ceil(Math.min((pick.images || []).length, 64) / 16) })
    try {
      const m = await matchPhotos(pick, featureList, (step, steps) => setAi({ state: 'checking', step, steps }))
      if (touched.current) { setAi({ ...summarise(m), late: true }); return }
      setScenes(build(m, off)); setOpen(null)
      setAi(summarise(m))
    } catch (e) { setAi({ state: 'error', note: e.message }) }
  }
  const toggleSeen = (f) => {
    if (!ai.match) return
    if (touched.current && !window.confirm('Rebuild the video with this change? Your own changes to the scenes are replaced.')) return
    const key = f.sure === 'yes' ? f.feature : `+${f.feature}`
    const off = new Set(leftOut); if (off.has(key)) off.delete(key); else off.add(key)
    touched.current = false; forget()
    setLeftOut(off); setScenes(build(ai.match, off)); setOpen(null)
  }
  const isKept = (f) => (f.sure === 'yes' ? !leftOut.has(f.feature) : leftOut.has(`+${f.feature}`))
  const aiAgain = () => {
    if (touched.current && !window.confirm(kind === 'lunch' ? 'Let the AI write the lunch video again? Your changes are replaced.' : 'Let the AI arrange the photos again? Your changes for this car are replaced.')) return
    touched.current = false; forget()
    runAi(true)
  }

  // Your arrangement is kept on this device for each listing.
  useEffect(() => {
    if (!parts) return
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(draftKey) || 'null') } catch { saved = null }
    const hasDraft = Array.isArray(saved) && saved.length
    setScenes(hasDraft ? saved : parts.starter)
    touched.current = !!hasDraft
    setAi({ state: 'idle' }); setAiCaption('')
    if (!hasDraft && aiKind) runAi(false)
    setOpen(null); setEditing(false)
    endCard(parts, link).then(setEnd)
    loadPhotos(parts.photos, cache.current).then(() => setLoaded((n) => n + 1))
  }, [parts])
  // Kept only once you have changed something: an untouched video is simply
  // rebuilt (and photo-checked) next time.
  useEffect(() => { if (draftKey && scenes.length && touched.current) { try { localStorage.setItem(draftKey, JSON.stringify(scenes)) } catch { /* full */ } } }, [scenes, draftKey])
  const forget = () => { try { localStorage.removeItem(draftKey) } catch { /* ignore */ } }
  useEffect(() => {
    const missing = scenes.flatMap((x) => [x.photo, ...(x.photos || [])]).filter((u) => u && !cache.current.has(u))
    if (missing.length) loadPhotos(missing, cache.current).then(() => setLoaded((n) => n + 1))
  }, [scenes])

  const cut = useMemo(() => (short ? adCut(scenes, secs) : scenes), [short, scenes, secs])
  const inCut = useMemo(() => new Set(cut.map((x) => x.id)), [cut])
  const script = useMemo(() => (parts ? { slides: cut, end: parts.end, endSay: parts.endSay, caption: aiCaption || parts.caption, voice: voiceFor(cut, parts.endSay) } : null), [parts, cut, aiCaption])
  const assets = useMemo(() => (end && script ? { imgs: script.slides.map((x) => sceneImages(x, (u) => cache.current.get(u))), end } : null), [script, end, loaded])

  // Editing scenes
  const update = (id, patch) => { touched.current = true; setScenes((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x))) }
  const move = (i, d) => setScenes((list) => {
    touched.current = true; const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return list; [n[i], n[j]] = [n[j], n[i]]; return n })
  const remove = (id) => { touched.current = true; setScenes((list) => list.filter((x) => x.id !== id)); setOpen(null) }
  const add = (block) => {
    touched.current = true
    const at = open ? scenes.findIndex((x) => x.id === open) + 1 : scenes.length
    const sc = sceneFrom(block, block.photo || (block.scene.type === 'specs' ? scenes[Math.max(0, at - 1)]?.photo : null))
    setScenes((list) => [...list.slice(0, at), sc, ...list.slice(at)])
    setOpen(sc.id)
    // A feature needs the photo that shows it: ask for it straight away.
    if (!sc.photo && block.scene.type !== 'specs') setChoosing({ id: sc.id, hint: block.feature ? `Choose the photo that shows “${block.label}”` : 'Choose a photo for this scene' })
  }
  const restart = () => {
    if (!window.confirm('Go back to the automatic video? Your changes for this listing are replaced.')) return
    touched.current = false; forget(); setScenes(parts.starter); setOpen(null)
    if (aiKind) runAi(false)
  }

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
    title: title(pick), slug: pick.slug || pick.id, kind, link, pace: secs, motion, studio, ticks,
    script: { slides: script.slides, end: parts.end, endSay: parts.endSay, caption: script.caption },
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
      await keepVideo({ title: title(pick), slug: pick.slug || pick.id, kind, caption: script.caption, blob: r.blob })
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
      mic = await openMic()
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
  // The AI reads the script; the video is built around its voice.
  const aiLines = (s) => ({ slides: s.slides, endSay: s.endSay })
  const makeAi = async () => {
    if (!fast()) return toast('This phone records videos the slow way, which cannot carry an AI voice. Use Chrome, or a newer phone.', true)
    setOpen(null); setBusy('ai'); setStage('The AI voice is reading the script…')
    try {
      const v = await aiVoiceOver(aiLines(script), aiVoice, aiTone)
      await startVideo({ ...spec(), studio: false, audio: v.audio, marks: v.marks, duration: v.duration })
      toast(v.unsure.length ? `Your video is being made. Listen to scene ${v.unsure.map((i) => i + 1).join(', ')}: the voice may not have read it word for word.` : 'Your video is being made with the AI voice; you can leave this page.')
    } catch (e) { toast(e.message, true) } finally { setBusy(''); setStage('') }
  }
  // Your own recording of the whole script, made in one go (here or in any
  // recorder app): each scene is placed where you start reading its line.
  const [reading, setReading] = useState(false)
  const useTake = async (file) => {
    if (!fast()) return toast('This phone records videos the slow way, which cannot use a separate recording. Use Chrome, or a newer phone.', true)
    setBusy('take'); setStage('Placing your voice…')
    try {
      const lines = [...script.slides.map((x) => x.say || ''), parts.endSay || '']
      const v = await placeVoice(file, lines)
      await startVideo({ ...spec(), audio: v.audio, marks: v.marks, duration: v.duration })
      setReading(false)
      toast(v.confident ? 'Your voice is in place. The video is being made; you can leave this page.' : `The video is being made, but only ${v.found} of ${v.needed} pauses between lines were clear. Watch it; next time take a breath between lines.`, !v.confident)
    } catch (e) { toast(/decode|Unable to/i.test(e.message) ? 'That file could not be read. Use an audio or video recording.' : e.message, true) } finally { setBusy(''); setStage('') }
  }
  const hearAi = async () => {
    if (hearing?.url) { hearing.el?.pause(); URL.revokeObjectURL(hearing.url); setHearing(null); return }
    setHearing({ loading: true })
    try {
      const v = await aiVoiceOver(aiLines(script), aiVoice, aiTone)
      const url = URL.createObjectURL(v.audio); const el = new Audio(url)
      el.onended = () => { URL.revokeObjectURL(url); setHearing(null) }
      setHearing({ url, el }); await el.play()
    } catch (e) { setHearing(null); toast(e.message, true) }
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
            {aiKind && <AiCheck ai={ai} again={aiAgain} toggle={toggleSeen} isKept={isKept} car={kind === 'vehicle'} />}
            <div className="vx-video-buttons">
              <button type="button" className="vx-btn primary big" disabled={!assets || !!busy} onClick={() => make(false)}>{busy === 'silent' ? 'Recording…' : 'Make video'}</button>
              <button type="button" className="vx-btn outline" disabled={!assets || !!busy} onClick={() => setReading((x) => !x)}>{busy === 'take' ? 'Placing your voice…' : 'Read the script and record'}</button>
              <button type="button" className="vx-btn outline" disabled={!assets || !!busy} onClick={() => make(true)}>{busy === 'voice' ? 'Recording your voice…' : 'Record while the scenes play'}</button>
              <button type="button" className="vx-btn outline" disabled={!assets || !!busy} onClick={makeAi}>{busy === 'ai' ? 'The AI is reading…' : 'Make it with an AI voice'}</button>
            </div>
            {reading && <ReadScript script={script} endSay={parts.endSay} kind={kind} busy={!!busy} onUse={useTake} hearAi={hearAi} hearing={hearing} toast={toast} close={() => setReading(false)} />}
            <section className="vx-card-block vx-aivoice">
              <h3>AI voice</h3>
              <div className="vx-tabs">{AI_VOICES.map(([v, l]) => <button key={v} type="button" disabled={!!busy} className={aiVoice === v ? 'on' : ''} onClick={() => pickVoice(v)}>{l}</button>)}</div>
              <div className="vx-tabs">{AI_TONES.map(([v, l]) => <button key={v} type="button" disabled={!!busy} className={aiTone === v ? 'on' : ''} onClick={() => pickTone(v)}>{l}</button>)}</div>
              <button type="button" className="vx-btn ghost" disabled={!!busy || hearing?.loading} onClick={hearAi}>{hearing?.loading ? 'Reading the script…' : hearing?.url ? '■ Stop' : '▶ Hear the whole voice-over'}</button>
              <small className="vx-muted">The AI reads the “Voice-over script” below, word for word, and each scene shows while its line is read. Change a scene’s words to change what it says. Hearing it first does not read it twice: the video uses the same recording.</small>
            </section>
            <MyVideos videos={videos} toast={toast} copy={copy} />
            {!editing ? (
              <section className="vx-card-block vx-change">
                <h3>Something not right?</h3>
                <p className="vx-muted tiny">The video is made for you from the listing. If a photo, the words or the specifications should be different, change just that scene.</p>
                <button type="button" className="vx-btn outline" disabled={!!busy} onClick={() => setEditing(true)}>Change scenes ({scenes.length})</button>
              </section>
            ) : (
              <SceneEditor parts={parts} scenes={scenes} left={short ? scenes.filter((x) => !inCut.has(x.id)).map((x) => x.id) : []} open={open} setOpen={setOpen} update={update} move={move} remove={remove} add={add}
                restart={restart} choosing={choosing} setChoosing={setChoosing} busy={!!busy} close={() => { setEditing(false); setOpen(null) }} />
            )}
            <div className="vx-pace">
              <span>Photos</span>
              <div className="vx-tabs">{MOTIONS.map(([m, l]) => <button key={m} type="button" disabled={!!busy} className={motion === m ? 'on' : ''} onClick={() => chooseMotion(m)}>{l}</button>)}</div>
            </div>
            {sellerName && (
              <div className="vx-pace">
                <span>Seller’s name</span>
                <div className="vx-tabs">{[[false, 'Only ZaMarket'], [true, `Show ${sellerName.length > 22 ? `${sellerName.slice(0, 20)}…` : sellerName}`]].map(([v, l]) => <button key={String(v)} type="button" disabled={!!busy} className={showSeller === v ? 'on' : ''} onClick={() => nameSeller(v)}>{l}</button>)}</div>
                <small className="vx-muted">{showSeller ? `The video names ${sellerName}. Remembered for this seller.` : 'The video shows only ZaMarket; the seller is not named in the words, the voice or the caption. Remembered for this seller.'}</small>
              </div>
            )}
            {script.slides.some((x) => x.type === 'clock') && (
              <div className="vx-pace">
                <span>Clock sound</span>
                <div className="vx-tabs">{[[true, 'Ticking'], [false, 'Off']].map(([v, l]) => <button key={l} type="button" disabled={!!busy} className={ticks === v ? 'on' : ''} onClick={() => chooseTicks(v)}>{l}</button>)}</div>
                <button type="button" className="btn small" onClick={() => playClock()}>▶ Listen</button>
                <small className="vx-muted">{ticks ? 'A loud, clear tick-tock while the clock runs to 12:30, then a soft whoosh as the food comes in. It plays over your voice and any nasheed.' : 'The opening is silent.'}</small>
              </div>
            )}
            <div className="vx-pace">
              <span>Your voice</span>
              <div className="vx-tabs">{[[true, 'Studio voice'], [false, 'As recorded']].map(([v, l]) => <button key={l} type="button" disabled={!!busy} className={studio === v ? 'on' : ''} onClick={() => chooseStudio(v)}>{l}</button>)}</div>
              <small className="vx-muted">{studio ? 'Your recording is cleaned up: room noise between words turned down, warmer and clearer, the same volume all through. Record close to the phone, in a room with curtains or a sofa.' : 'Your voice exactly as the phone recorded it.'}</small>
            </div>
            <div className="vx-pace">
              <span>Length</span>
              <div className="vx-tabs">{[[false, 'Full video'], [true, '30-second ad']].map(([v, l]) => <button key={l} type="button" disabled={!!busy} className={short === v ? 'on' : ''} onClick={() => chooseShort(v)}>{l}</button>)}</div>
              <small className="vx-muted">{short ? `${script.slides.length} of ${scenes.length} scenes, about ${Math.round(videoLength(script.slides))} seconds: the opening, the best features and the price. For adverts and Reels.` : `All ${scenes.length} scenes, about ${Math.round(videoLength(script.slides))} seconds.`}</small>
            </div>
            <div className="vx-pace">
              <span>Each scene stays</span>
              <div className="vx-tabs">{PACES.map((p) => <button key={p} type="button" disabled={!!busy} className={secs === p ? 'on' : ''} onClick={() => { setSecs(p); try { localStorage.setItem('zm-video-pace', String(p)) } catch { /* ignore */ } }}>{p}s</button>)}</div>
              <small className="vx-muted">With your voice, each scene waits for you instead.</small>
            </div>
            <SoundPicker sounds={sounds} setSounds={setSounds} sound={sound} setSound={setSound} music={music} fetching={fetching} length={videoLength(script.slides || [])} fast={fast()} toast={toast} busy={!!busy} />
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
function SoundPicker({ sounds, setSounds, sound, setSound, music, fetching, length, fast: quick, toast, busy }) {
  const player = useRef(null)
  const [adding, setAdding] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkText, setLinkText] = useState('')
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const url = useMemo(() => (music ? URL.createObjectURL(music.blob) : null), [music])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const stop = () => { player.current?.pause(); setPlaying(false) }
  // Plays the chosen part, as long as the video, then stops.
  const listen = () => {
    const a = player.current
    if (!a) return
    if (playing) return stop()
    a.currentTime = sound?.start || 0
    a.play().then(() => setPlaying(true), () => toast('This phone cannot play that sound', true))
  }
  const onTime = () => {
    const a = player.current
    if (!a) return
    setAt(a.currentTime)
    if (playing && music && music.seconds > length && a.currentTime >= (sound?.start || 0) + length) stop()
  }
  const setStart = (start) => {
    setSound({ ...sound, start })
    if (playing && player.current) player.current.currentTime = start
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
    if (!music || !window.confirm(`Remove "${music.name}"? It goes from every phone.`)) return
    stop(); await removeSound(music); setSounds(await listSounds()); setSound(null)
  }
  return (
    <section className="vx-card-block vx-sound">
      <h3>Background sound</h3>
      <p className="vx-muted tiny">Add a nasheed or qasida with voices only: a sound file, a video (only its sound is kept), or a link. It plays for the whole video, from the part you choose; with your voice, softly underneath.</p>
      <div className="vx-tabs vx-sound-list">
        <button type="button" disabled={busy} className={!music ? 'on' : ''} onClick={() => { stop(); setSound(null) }}>No sound</button>
        {sounds.map((x) => <button key={x.id} type="button" disabled={busy} className={sound?.id === x.id ? 'on' : ''} onClick={() => { stop(); setSound({ id: x.id, start: sound?.id === x.id ? sound.start || 0 : 0 }) }}>♪ {x.name}{x.online ? '' : ' (this phone)'}</button>)}
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
      {fetching && <p className="vx-sound-busy"><span className="vx-spin" /> Getting the sound…</p>}
      {music && (
        <div className="vx-sound-part">
          <SoundWave sound={music} start={sound.start || 0} length={length} onStart={setStart} at={playing ? at : null} />
          <div className="vx-sound-actions">
            <button type="button" className="vx-btn outline" onClick={listen}>{playing ? '■ Stop' : '▶ Play this part'}</button>
            <button type="button" className="vx-btn ghost" onClick={remove}>Remove</button>
          </div>
          <audio ref={player} src={url || undefined} preload="auto" onEnded={stop} onTimeUpdate={onTime} />
          {!quick && <p className="vx-muted tiny">This phone makes videos the slower way, which cannot add a sound yet.</p>}
        </div>
      )}
      <p className="vx-muted tiny">Use recordings you are allowed to share. TikTok and Facebook may mute a sound they recognise.</p>
    </section>
  )
}

// Choose the part of the sound, like on Instagram or WhatsApp: the whole
// sound as a wave, the part that plays (as long as the video) lit up; drag
// it along. While it plays, a line moves through the part.
function SoundWave({ sound, start, length, onStart, at }) {
  const [wave, setWave] = useState(null)
  const box = useRef(null)
  const drag = useRef(null)
  useEffect(() => { let alive = true; setWave(null); soundWave(sound, sound.blob).then((w) => { if (alive) setWave(w) }, () => { if (alive) setWave([]) }); return () => { alive = false } }, [sound])
  const total = Math.max(1, sound.seconds)
  const part = Math.min(total, Math.max(1, length))
  const max = Math.max(0, total - part)
  const left = (start / total) * 100
  const width = (part / total) * 100
  const fromX = (clientX, grab) => {
    const r = box.current.getBoundingClientRect()
    const x = (clientX - r.left) / r.width * total - grab
    onStart(Math.round(Math.min(max, Math.max(0, x))))
  }
  const down = (e) => {
    if (!box.current || max <= 0) return
    const r = box.current.getBoundingClientRect()
    const t = (e.clientX - r.left) / r.width * total
    // Grabbing inside the lit part moves it from where you hold it; tapping
    // elsewhere centres the part there.
    drag.current = t >= start && t <= start + part ? t - start : part / 2
    e.currentTarget.setPointerCapture?.(e.pointerId)
    fromX(e.clientX, drag.current)
  }
  const move = (e) => { if (drag.current != null) fromX(e.clientX, drag.current) }
  const up = () => { drag.current = null }
  return (
    <div className="vx-wave-wrap">
      <div className="vx-wave-head"><b>{mmss(start)} – {mmss(Math.min(total, start + part))}</b><span>{max > 0 ? 'Drag to choose the part that plays' : 'Shorter than the video: it repeats'}</span></div>
      <div className="vx-wave" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="slider" aria-label="Part of the sound that plays" aria-valuemin={0} aria-valuemax={max} aria-valuenow={start}
        tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowLeft') onStart(Math.max(0, start - 1)); if (e.key === 'ArrowRight') onStart(Math.min(max, start + 1)) }}>
        <div className="vx-wave-bars">
          {(wave || Array.from({ length: 160 }, () => 0.15)).map((v, i, all) => {
            const pos = (i / all.length) * 100
            const on = pos >= left && pos <= left + width
            return <span key={i} className={on ? 'on' : ''} style={{ height: `${Math.max(8, v * 100)}%` }} />
          })}
        </div>
        <div className="vx-wave-part" style={{ left: `${left}%`, width: `${width}%` }} />
        {at != null && <div className="vx-wave-head-line" style={{ left: `${(at / total) * 100}%` }} />}
      </div>
      <div className="vx-wave-foot"><span>0:00</span><span>{mmss(total)}</span></div>
    </div>
  )
}

// What the AI found in the photos, in one line, with a way to ask again.
function AiCheck({ ai, again, toggle, isKept, car }) {
  if (ai.state === 'idle') return null
  return (
    <div className={`vx-ai is-${ai.state}`} role="status">
      {ai.state === 'writing' && <><span className="vx-spin" /><span>AI is looking at the dishes and writing the lunch video from the plan…</span></>}
      {ai.state === 'done' && ai.lunch && (
        <span>
          <b>✨ AI wrote this lunch video.</b> {ai.count} scenes, told as an offer: the problem it solves, the food, and why it is easy to say yes. Every price, time and discount was checked against the plan; nothing made up.
          {ai.late ? ' You had already changed the scenes, so nothing was replaced; tap Write again to use it.' : ''}
        </span>
      )}
      {ai.state === 'checking' && <><span className="vx-spin" /><span>AI is looking at the photos{ai.steps > 1 ? ` (${Math.min(ai.step + 1, ai.steps)} of ${ai.steps} batches)` : ''} to find each feature…</span></>}
      {ai.state === 'done' && !ai.lunch && (
        <span>
          <b>✨ AI checked the photos.</b>{' '}
          {ai.total ? `${ai.found} of ${ai.total} listed ${car ? 'features' : 'points'} are on a photo that shows them.` : 'It picked the best opening photo and put the photos in a good order.'}
          {car && ai.unseen.length ? ` Not seen in any photo: ${ai.unseen.join(', ')}. ${ai.unseen.length > 1 ? 'They are' : 'It is'} listed on an "Also has" card instead of over a wrong photo.` : ''}
          {!car && ai.total > ai.found ? ' The others (like taste or feel) stay as words over a general photo.' : ''}
          {ai.maybe ? ` ${ai.maybe} marked "not sure": have a look in Change scenes.` : ''}
          {ai.late ? ' You had already changed the scenes, so nothing was moved; tap Check again to use it.' : ''}
        </span>
      )}
      {ai.state === 'done' && !ai.lunch && ai.spotted.length > 0 && (
        <div className="vx-ai-seen">
          <small>The AI also saw these in the photos. Tap to leave one out (or put a &ldquo;not sure&rdquo; one in):</small>
          <div>{ai.spotted.map((f) => <button key={f.feature} type="button" className={isKept(f) ? 'on' : ''} onClick={() => toggle(f)}>{isKept(f) ? '✓ ' : '+ '}{f.feature}{f.sure === 'maybe' ? ' (not sure)' : ''}</button>)}</div>
        </div>
      )}
      {ai.state === 'error' && <span>The AI photo check did not work: {ai.note}</span>}
      {ai.state !== 'checking' && ai.state !== 'writing' && <button type="button" className="vx-btn ghost" onClick={again}>{ai.lunch ? 'Write again' : 'Check again'}</button>}
    </div>
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
function SceneEditor({ parts, scenes, left = [], open, setOpen, update, move, remove, add, restart, choosing, setChoosing, busy, close }) {
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
                  <span className="vx-scene-text"><strong>{sc.type === 'specs' ? (sc.kicker === 'Also has' ? `Also has: ${(sc.rows || []).map((r) => r[0]).join(', ')}` : 'Specifications card') : sc.line || (sc.type === 'collage' ? 'Photo grid' : 'Photo only')}</strong><small>{sc.seen ? <em className="vx-scene-ai">✨ AI saw this in the photo</em> : sc.ai === 'yes' && sc.checked ? <em className="vx-scene-ai">✓ AI: this photo shows it</em> : sc.feature && !sc.checked ? <em className="vx-scene-check">{sc.ai === 'maybe' ? 'AI is not sure: check the photo' : 'Check the photo shows it'}</em> : sc.kicker === 'Also has' ? 'Not seen in any photo' : kind}{left.includes(sc.id) && <em className="vx-scene-out"> · Not in the 30-second ad</em>}</small></span>
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

// Read the script and record it in one go. Practise as often as you like,
// listen back, record again; when it sounds right, it goes into the video
// with each scene placed where you start its line. A recording made with
// another app works too.
const TONE_HINT = {
  lunch: 'Warm and smiling, like telling a colleague about a lunch you love.',
  vehicle: 'Calm and confident, like a trusted dealer walking someone round the car.',
  product: 'Friendly and upbeat, like recommending something you really like.',
  market: 'Warm and inviting, like welcoming someone into your shop.',
}
function ReadScript({ script, endSay, kind, busy, onUse, hearAi, hearing, toast, close }) {
  const [phase, setPhase] = useState('ready') // ready | count | rec | done
  const [count, setCount] = useState(0)
  const [take, setTake] = useState(null)
  const [secs, setSecs] = useState(0)
  const rec = useRef(null)
  const lines = [...script.slides.map((x) => [x.kicker || x.line || '', x.say || '']), ['End', endSay || '']].filter(([, s]) => s)
  useEffect(() => () => { rec.current?.stop?.(); if (take?.url) URL.revokeObjectURL(take.url) }, [take])
  useEffect(() => {
    if (phase !== 'rec') return
    const at = performance.now()
    const id = setInterval(() => setSecs((performance.now() - at) / 1000), 250)
    return () => clearInterval(id)
  }, [phase])
  const start = async () => {
    let mic
    try { mic = await openMic() } catch (e) { return toast(/Permission|NotAllowed/i.test(e.name || e.message) ? 'Allow the microphone to record your voice.' : e.message, true) }
    setPhase('count')
    for (const n of [3, 2, 1]) { setCount(n); await sleep(1000) }
    setCount(0)
    const type = pickAudio()
    const r = new MediaRecorder(mic, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined)
    const chunks = []
    r.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    r.onstop = () => {
      mic.getTracks().forEach((x) => x.stop())
      const blob = new Blob(chunks, { type: (r.mimeType || type || 'audio/webm').split(';')[0] })
      setTake({ blob, url: URL.createObjectURL(blob) }); setPhase('done')
    }
    rec.current = r; r.start(500); setSecs(0); setPhase('rec')
  }
  const stop = () => rec.current?.state === 'recording' && rec.current.stop()
  const again = () => { if (take?.url) URL.revokeObjectURL(take.url); setTake(null); setPhase('ready') }
  const upload = (f) => { if (!f) return; if (take?.url) URL.revokeObjectURL(take.url); setTake({ blob: f, url: URL.createObjectURL(f), name: f.name }); setPhase('done') }
  return (
    <section className="vx-card-block vx-read">
      <div className="between"><h3>Read the script</h3><button type="button" className="vx-btn ghost" onClick={close} disabled={phase === 'rec'}>Close</button></div>
      <p className="vx-muted tiny"><b>How to say it:</b> {TONE_HINT[kind] || TONE_HINT.product} Hold the phone a hand’s width from your mouth. <b>Take a breath (about one second) between lines</b>: that is how each scene finds its place.</p>
      <ol className={`vx-read-lines ${phase === 'rec' ? 'live' : ''}`}>
        {lines.map(([label, say], i) => <li key={i}><small>{label}</small><span>{say}</span></li>)}
      </ol>
      {phase === 'count' && <div className="vx-read-count">{count}</div>}
      {phase === 'ready' && (
        <div className="vx-read-actions">
          <button type="button" className="vx-btn primary big" disabled={busy} onClick={start}>● Record</button>
          <button type="button" className="vx-btn ghost" disabled={busy || hearing?.loading} onClick={hearAi}>{hearing?.loading ? 'Reading…' : hearing?.url ? '■ Stop' : '▶ Hear the AI read it first'}</button>
          <label className="vx-btn ghost">Use a recording from my phone<input type="file" hidden accept="audio/*,video/*,.m4a,.mp3,.aac,.wav,.ogg,.opus,.amr" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} /></label>
        </div>
      )}
      {phase === 'rec' && (
        <div className="vx-read-actions">
          <span className="vx-rec-dot">● Recording {Math.floor(secs / 60)}:{String(Math.floor(secs % 60)).padStart(2, '0')}</span>
          <button type="button" className="vx-btn primary big" onClick={stop}>■ Stop</button>
        </div>
      )}
      {phase === 'done' && take && (
        <div className="vx-read-actions">
          <audio controls src={take.url} preload="auto" />
          {take.name && <small className="vx-muted">{take.name}</small>}
          <button type="button" className="vx-btn primary big" disabled={busy} onClick={() => onUse(take.blob)}>Use this recording</button>
          <button type="button" className="vx-btn ghost" disabled={busy} onClick={again}>Record again</button>
        </div>
      )}
    </section>
  )
}
