import { load, qrImage, brandMark } from './posterKit'
import { cleanTiers } from './lunch'
import { finishVideo, videoSeconds } from './videoFinish'
import { money } from './format'
import { vehicleOf, vehicleTitle, priceNote, standoutFeatures, km, vehicleFacts, rankFeatures } from './vehicle'

// Short vertical videos made from what is already on the site: a listing's
// own photos, its name, price and real details, ending on the link and a QR
// code. Made for TikTok, Reels, Facebook and WhatsApp status, faceless.
// Every word on screen comes from the listing; nothing is invented.

export const W = 1080
export const H = 1920

// The story of a listing, as slides: [{ photo, kicker, line, sub }].
export function videoScript(item, kind = 'product', link = '') {
  if (!item) return { slides: [], voice: '', caption: '' }
  if (kind === 'market') return marketScript(item, link)
  const photos = (item.images || []).filter(Boolean)
  const slides = []
  if (kind === 'vehicle') {
    const v = vehicleOf(item)
    const title = vehicleTitle(v, item.name)
    const note = priceNote(v)
    const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
    const facts = [v.year, v.mileage_km && km(v.mileage_km), v.transmission, v.fuel].filter(Boolean)
    const feats = standoutFeatures(v, 4)
    slides.push({ kicker: 'For sale on ZaMarket Motors', line: title, sub: [price, note].filter(Boolean).join(' · '), say: `${title}${v.location ? `, in ${v.location}` : ''}. ${price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : ''}` })
    // The specifications as a clear card, row by row, over a darkened photo.
    const rows = vehicleFacts(v).filter((f) => f.key !== 'location').slice(0, 8).map((f) => [f.label, String(f.value)])
    if (rows.length) slides.push({ type: 'specs', kicker: 'Specifications', rows, line: '', sub: '', say: `${facts.join(', ')}${v.engine ? `, ${v.engine} engine` : ''}.` })
    feats.forEach((f, i) => slides.push({ kicker: i === 0 ? 'Highlights' : '', line: f, sub: '', say: i === 0 ? `It comes with ${f.toLowerCase()}.` : `${f}.` }))
    const voice = [
      `${title}${v.location ? `, in ${v.location}` : ''}.`,
      price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : '',
      facts.length ? `${facts.join(', ')}.` : '',
      feats.length ? `It comes with ${feats.slice(0, 3).join(', ')}.` : '',
      'Photos, details and enquiries on zamarket dot shop. Link in the description.',
    ].filter(Boolean).join(' ')
    return { ...finish(slides, photos, voice, captionFor(title, price, note, feats, link, ['#ZaMarketMotors', '#CarsForSaleZambia', '#Lusaka'])), end: { cta: 'Enquire on ZaMarket Motors', foot: 'Ask about it · viewings arranged' } }
  }
  if (kind === 'lunch') return lunchScript(item, link)
  // A product: everything the listing really says, not only three points:
  // its benefits, the clearest sentences of its description, its options
  // (sizes, colours…), how it is made or sent, real reviews, the seller.
  const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
  const was = Number(item.normal_price) > Number(item.price) ? money(item.normal_price, { whole: true }) : ''
  const points = (item.benefits || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6)
  const lines = sentences(item.description).filter((x) => !points.some((p) => p.toLowerCase() === x.toLowerCase())).slice(0, Math.max(1, 4 - Math.min(points.length, 3)))
  const opts = (Array.isArray(item.options) ? item.options : []).filter((o) => o?.name && o?.choices?.length).slice(0, 2)
  slides.push({ kicker: item.vendor_name || 'On ZaMarket', line: item.name, sub: [price, was ? `was ${was}` : ''].filter(Boolean).join(' · '), say: `${item.name}${item.vendor_name ? ` from ${item.vendor_name}` : ''}.${price ? ` ${price}.` : ''}` })
  points.forEach((x, i) => slides.push({ kicker: i === 0 ? 'Why people love it' : '', line: x, sub: '', say: `${x}.` }))
  lines.forEach((x, i) => slides.push({ kicker: i === 0 ? 'About it' : '', line: x, sub: '', say: `${x}` }))
  opts.forEach((o) => slides.push({ kicker: `Choose your ${String(o.name).toLowerCase()}`, line: o.choices.slice(0, 5).map((c) => (typeof c === 'string' ? c : c?.label || c?.name || '')).filter(Boolean).join(' · '), sub: '', say: `Choose your ${String(o.name).toLowerCase()}.` }))
  if (item.fulfilment === 'made_to_order') slides.push({ kicker: 'Made for you', line: 'Made to order', sub: item.lead_time_days ? `Ready in ${item.lead_time_days} day${item.lead_time_days > 1 ? 's' : ''}` : '', say: `It is made to order${item.lead_time_days ? `, ready in ${item.lead_time_days} day${item.lead_time_days > 1 ? 's' : ''}` : ''}.` })
  if (Number(item.review_count) > 0 && Number(item.rating) > 0) slides.push({ kicker: 'Reviews', line: `Rated ${Number(item.rating).toFixed(1)} out of 5`, sub: `${item.review_count} review${item.review_count > 1 ? 's' : ''} on ZaMarket`, say: `Rated ${Number(item.rating).toFixed(1)} out of 5 by customers on ZaMarket.` })
  slides.push({ kicker: 'Order on ZaMarket', line: 'Delivered in Lusaka', sub: item.vendor_name ? `From ${item.vendor_name}` : '', say: 'Order on zamarket dot shop, delivered in Lusaka.' })
  const voice = slides.map((x) => x.say).filter(Boolean).join(' ')
  return withEnd({ cta: 'See it and order on ZaMarket', foot: 'Delivered in Lusaka' }, finish(slides, photos, voice, captionFor(item.name, price, '', [...points, ...lines].slice(0, 5), link, ['#ZaMarket', '#Lusaka', '#ShopLocal']), 13))
}

// Plain, short sentences from a description (no line over 80 characters).
function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\s*[•\n]\s*/).map((x) => x.trim().replace(/[.!]+$/, '')).filter((x) => x.length >= 12 && x.length <= 80)
}

// ---- The weekly lunch, told as a story ---------------------------------------
// Who it is for, why it helps, how easy it is, what you get, how to order.
// Everything comes from the plan itself (or what the lunch page promises for
// every plan); a discount, a trial or a guarantee shows only when the plan
// really has it.
function lunchScript(item, link) {
  const dishes = item.dishList || []
  const seller = item.vendor_name || ''
  const from = item.from ? money(item.from, { whole: true }) : ''
  const cutoff = item.cutoff_hour || 18
  const windows = item.delivery_windows || []
  const when = windows.length ? `${windows[0].split('–')[0]}–${windows[windows.length - 1].split('–')[1] || ''}`.replace(/–$/, '') : ''
  const kitchen = (item.proof_images || [])[0]
  const dishPics = dishes.map((d) => d.images?.[0]).filter(Boolean)
  const team = cleanTiers(item.group_discounts)
  const week = cleanTiers(item.day_discounts)
  const slides = []
  slides.push({ kicker: `Weekly lunch${seller ? ` · ${seller}` : ''}`, line: 'Your lunch, sorted for the week', sub: from ? `From ${from} a lunch` : '', photo: item.cover_url, say: 'Busy at work? Your lunch, sorted for the whole week.' })
  slides.push({ kicker: 'Made for', line: 'Busy people at work, and teams', sub: 'Or delivered to your home', photo: dishPics[0], say: 'It is made for people at work who want a proper lunch without leaving the office, and for teams who order together.' })
  slides.push({ kicker: 'Homemade', line: 'Cooked fresh for the day you booked', sub: seller ? `By ${seller}` : '', photo: kitchen || dishPics[1], say: `Every lunch is homemade${seller ? ` by ${seller}` : ''}, cooked for the day you booked, never the day before.` })
  if (dishPics.length > 1) slides.push({ type: 'collage', photos: dishPics.slice(0, 4), kicker: 'On the menu', line: `${dishes.length} homemade dish${dishes.length > 1 ? 'es' : ''}`, sub: '', say: `On the menu: ${dishes.slice(0, 3).map((d) => d.name).join(', ')}.` })
  dishes.slice(0, 3).forEach((d) => slides.push({ kicker: '', line: d.name, sub: d.price ? money(d.price, { whole: true }) : '', photo: d.images?.[0], say: `${d.name}.` }))
  slides.push({ kicker: 'Easy', line: 'Order once for the whole week', sub: 'No ordering every morning', photo: dishPics[2] || item.cover_url, say: 'You order once for the whole week. The full week, Monday to Thursday, two weeks, or just the days you choose.' })
  slides.push({ kicker: 'Delivered', line: 'To your office or your door', sub: when ? `Between ${when}` : '', photo: dishPics[3] || dishPics[0], say: `It comes to your office or your door${when ? `, between ${when}` : ''}.` })
  if (item.in_the_box) slides.push({ kicker: 'In every box', line: String(item.in_the_box).replace(/\s+/g, ' ').slice(0, 70), sub: '', photo: dishPics[1] || item.cover_url, say: `In every box: ${String(item.in_the_box).replace(/\s+/g, ' ').slice(0, 140)}.` })
  if (team.length) slides.push({ kicker: 'For your team', line: `${team[0].min}+ lunches in one delivery: ${team[0].pct}% off`, sub: '', photo: dishPics[0] || item.cover_url, say: `Ordering for your team? ${team[0].min} or more lunches in one delivery get ${team[0].pct} percent off.` })
  if (week.length) slides.push({ kicker: 'Book more days, pay less', line: `${week[week.length - 1].min} days or more: ${week[week.length - 1].pct}% off`, sub: '', photo: dishPics[1] || item.cover_url, say: `Book ${week[week.length - 1].min} days or more and save ${week[week.length - 1].pct} percent.` })
  if (item.trial_first) slides.push({ kicker: 'First time?', line: 'Pay for one lunch, taste it first', sub: 'Then the rest of the week', photo: dishPics[2] || item.cover_url, say: 'Ordering for the first time? Pay for your first lunch, and the other days after you have tasted it.' })
  if (item.guarantee) slides.push({ kicker: 'Our promise', line: 'Late or not as described? That lunch is free', sub: '', photo: item.cover_url, say: 'If your lunch is late or not as described, tell us the same day and that lunch is free.' })
  slides.push({ kicker: 'How to order', line: 'Choose your days on zamarket.shop', sub: `Order by ${cutoff}:00 the day before`, photo: item.cover_url, say: `Open the link, choose your days, and order by ${cutoff} hundred hours the day before. We call you to confirm, and you pay by mobile money.` })
  const voice = slides.map((x) => x.say).filter(Boolean).join(' ')
  const out = slides.map((x) => ({ kicker: '', line: '', sub: '', ...x }))
  return withEnd({ cta: 'Order your weekly lunch', foot: 'Delivered to your office or door' }, finish(out, [item.cover_url, ...dishPics].filter(Boolean), `${voice} Order on zamarket dot shop.`,
    captionFor(item.title || item.name, from ? `From ${from} a lunch` : '', '', ['Homemade, cooked fresh for the day you booked', 'Order once for the whole week', 'Delivered to your office or door', ...(team.length ? [`Team orders: ${team[0].min}+ lunches ${team[0].pct}% off`] : []), ...(item.trial_first ? ['First time? Taste one lunch first'] : [])], link, ['#LusakaLunch', '#OfficeLunch', '#ZaMarket']), 16))
}

const withEnd = (end, script) => ({ ...script, end })

// ---- Videos about ZaMarket itself ------------------------------------------
// For shoppers, for recruiting affiliates, for recruiting sellers. Made from
// photos already on the site; every line is something the site really does
// (the affiliate lines follow the affiliate page word for word in meaning).
export const MARKET_TOPICS = [
  ['shoppers', 'ZaMarket for shoppers', 'Show people what they can find and order', 'https://zamarket.shop'],
  ['affiliates', 'Recruit affiliates', 'Who can join, how they earn, how to apply', 'https://zamarket.shop/affiliates'],
  ['sellers', 'Recruit sellers', 'Why a business should sell on ZaMarket', 'https://zamarket.shop/apply/vendor'],
]

function marketScript(item, link) {
  const cars = item.cars || []; const products = item.products || []; const lunch = item.lunch || []
  const pool = [...new Set([...products, ...cars, ...lunch])]
  const at = (list, i) => list[i] || pool[i % Math.max(1, pool.length)] || null
  const grid = (list, from = 0) => { const g = [...list.slice(from), ...pool].filter(Boolean); return [...new Set(g)].slice(0, 4) }
  const mix = [...new Set([products[0], cars[0], lunch[0], products[1], cars[1], products[2]].filter(Boolean))].slice(0, 4)
  const slides = []
  let end; let caption; let endSay
  if (item.topic === 'affiliates') {
    slides.push({ type: 'collage', photos: mix.length ? mix : grid(pool), kicker: 'Affiliate programme', line: 'Earn with ZaMarket', sub: 'zamarket.shop/affiliates', say: 'Want to earn by sharing products online? This is the ZaMarket affiliate programme.' })
    slides.push({ type: 'collage', photos: grid(products), kicker: 'What you share', line: 'Real products from local sellers', say: 'You promote real products and cars from the ZaMarket marketplace.' })
    slides.push({ photo: at(cars, 0), kicker: 'How you earn', line: 'Commission on completed sales', sub: 'Earnings depend on real sales', say: 'You earn a commission when a sale you brought in is completed. What you earn depends on real sales.' })
    slides.push({ photo: at(products, 1), kicker: 'You are taught', line: 'Training in our academy', sub: 'Plus ready-made posters and captions', say: 'Approved affiliates are trained in our academy, and given ready-made posters and captions to share.' })
    slides.push({ photo: at(products, 2), kicker: 'No shop, no stock', line: 'Start with your phone', say: 'You do not need your own shop or stock. You start with your phone.' })
    slides.push({ photo: at(cars, 1), kicker: 'How to join', line: 'Apply on zamarket.shop/affiliates', sub: 'Every application is reviewed', say: 'Apply on zamarket dot shop slash affiliates. Every application is reviewed.' })
    end = { cta: 'Apply to be an affiliate', foot: 'Applications are reviewed' }
    endSay = 'Apply on zamarket dot shop slash affiliates. The link is in the description.'
    caption = ['Earn with ZaMarket: become an affiliate', '✓ Promote real products and cars from local sellers', '✓ Commission when a sale you brought in is completed', '✓ Training in our academy, ready-made posters and captions', '✓ Start with your phone, no stock needed', 'Earnings depend on completed sales and are not guaranteed. Applications are reviewed.', `Apply: ${link || 'https://zamarket.shop/affiliates'}`, '#ZaMarket #Zambia #Lusaka #EarnOnline'].join('\n')
  } else if (item.topic === 'sellers') {
    slides.push({ type: 'collage', photos: grid(products), kicker: 'For businesses in Zambia', line: 'Sell on ZaMarket', say: 'Do you sell products in Zambia? Put your shop on ZaMarket.' })
    slides.push({ photo: at(products, 0), kicker: 'Your own shop', line: 'Your products on your own shop page', say: 'Your products get their own shop page on ZaMarket, with photos, prices and ordering.' })
    slides.push({ type: 'collage', photos: grid(products, 1), kicker: 'More people see them', line: 'Affiliates can share your products', say: 'Approved affiliates can share your products with their own customers.' })
    slides.push({ photo: at(products, 2), kicker: 'Orders', line: 'You are told when an order comes in', say: 'When an order comes in, you get an alert, so you can prepare it.' })
    slides.push({ photo: at(products, 3), kicker: 'How to join', line: 'Apply on zamarket.shop', sub: 'Every application is reviewed', say: 'Apply on zamarket dot shop. Every application is reviewed.' })
    end = { cta: 'Apply to sell on ZaMarket', foot: 'Applications are reviewed' }
    endSay = 'Apply on zamarket dot shop. The link is in the description.'
    caption = ['Sell on ZaMarket', '✓ Your products on your own shop page', '✓ Approved affiliates can share your products', '✓ An alert when an order comes in', 'Applications are reviewed.', `Apply: ${link || 'https://zamarket.shop/apply/vendor'}`, '#ZaMarket #Lusaka #SmallBusinessZambia #ShopLocal'].join('\n')
  } else {
    slides.push({ type: 'collage', photos: mix.length ? mix : grid(pool), kicker: 'Online marketplace in Zambia', line: 'This is ZaMarket', sub: 'zamarket.shop', say: 'This is ZaMarket, an online marketplace here in Zambia.' })
    if (products.length) slides.push({ type: 'collage', photos: grid(products), kicker: 'Shop', line: 'Products from local sellers', sub: 'Order online · delivered in Lusaka', say: 'Shop products from local sellers and order online, with delivery in Lusaka.' })
    if (cars.length) slides.push({ photo: cars[0], kicker: 'ZaMarket Motors', line: 'Cars for sale', sub: 'Enquire and arrange a viewing', say: 'On ZaMarket Motors you can see cars for sale, ask about them and arrange a viewing.' })
    if (lunch.length) slides.push({ photo: lunch[0], kicker: 'Weekly lunch', line: 'Homemade lunch to your office or door', say: 'And you can order your weekly lunch, delivered to your office or your door.' })
    end = { cta: 'Visit zamarket.shop', foot: [products.length && 'Shop', cars.length && 'Motors', lunch.length && 'Lunch'].filter(Boolean).join(' · ') }
    endSay = 'Visit zamarket dot shop. The link is in the description.'
    caption = ['ZaMarket: an online marketplace in Zambia', products.length ? '✓ Products from local sellers, delivered in Lusaka' : '', cars.length ? '✓ Cars for sale on ZaMarket Motors' : '', lunch.length ? '✓ Weekly lunch to your office or door' : '', link || 'https://zamarket.shop', '#ZaMarket #Lusaka #Zambia #ShopLocal'].filter(Boolean).join('\n')
  }
  const out = slides.map((x) => ({ kicker: '', line: '', sub: '', ...x, photo: x.photo || x.photos?.[0] || null }))
  return { slides: out, voice: [...out.map((x) => x.say), endSay].join(' '), caption, endSay, end }
}

function finish(slides, photos, voice, caption, most = 9) {
  const pics = photos.length ? photos : [null]
  const out = slides.map((s, i) => ({ ...s, photo: s.photo || pics[i % pics.length] }))
  // Show every photo at least once: extra photos get a slide of their own.
  for (let i = out.length; i < Math.min(pics.length, Math.max(8, most - 1)); i++) out.push({ kicker: '', line: '', sub: '', photo: pics[i], say: '' })
  return { slides: out.slice(0, most), voice, caption, endSay: 'See the photos, details and price on zamarket dot shop. The link is in the description.' }
}

function captionFor(title, price, note, points, link, tags) {
  return [
    `${title}${price ? ` · ${price}` : ''}${note ? ` (${note.toLowerCase()})` : ''}`,
    ...points.slice(0, 4).map((p) => `✓ ${p}`),
    link ? `See it and ask: ${link}` : '',
    tags.join(' '),
  ].filter(Boolean).join('\n')
}

// How long each scene stays on screen (seconds). Chosen in the video maker.
let SLIDE = 4
let END = 5
export const PACES = [3, 4, 5, 6]
export function setPace(seconds) { SLIDE = Math.min(8, Math.max(2.5, Number(seconds) || 4)); END = Math.max(4, SLIDE + 1) }
export const pace = () => SLIDE

// How the photos move. Cars look great zooming in; a product photo is shown
// whole and still, so nothing is cut off or swimming about.
let MOTION = 'zoom'
export const MOTIONS = [['zoom', 'Zoom in'], ['gentle', 'Gentle'], ['still', 'Still']]
export const defaultMotion = (kind) => (kind === 'vehicle' ? 'zoom' : kind === 'lunch' ? 'gentle' : 'still')
export function setMotion(m) { MOTION = MOTIONS.some(([k]) => k === m) ? m : 'zoom' }

export const videoLength = (slides) => slides.length * SLIDE + END

// Draws the video at time t (seconds).
// ---- How a video looks -------------------------------------------------------
// Each scene has a look, so a video is not the same words-over-photo again
// and again: the opening is a full photo with the title; features take turns
// between a framed card, a spotlight and a split layout (with a 03 / 07
// counter); plain photos drift in different directions. Scenes move into each
// other (push, wipe, zoom) instead of fading through black. The logo and the
// progress bar stay still on top.
const TR = 0.45
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
const back = (x) => { const c = 1.7; const v = Math.min(1, Math.max(0, x)) - 1; return 1 + (c + 1) * v * v * v + c * v * v }
const LOOKS = ['classic', 'card', 'spotlight', 'split']
const TRANSITIONS = ['push', 'wipe', 'zoom', 'push']
const isWords = (s) => !!(s && (s.line || s.kicker) && !s.type)

// A photo filling a box (cropped to fit), zoomed and moved a little.
function fill(ctx, img, x, y, w, h, z = 1, px = 0, py = 0) {
  const r = Math.max(w / img.width, h / img.height) * z
  const dw = img.width * r; const dh = img.height * r
  ctx.drawImage(img, x + (w - dw) / 2 + px, y + (h - dh) / 2 + py, dw, dh)
}
// A photo whole inside a box (nothing cut), centred.
function fit(ctx, img, x, y, w, h) {
  const r = Math.min(w / img.width, h / img.height)
  ctx.drawImage(img, x + (w - img.width * r) / 2, y + (h - img.height * r) / 2, img.width * r, img.height * r)
}

function lookOf(slides, i) {
  const s = slides[i]
  if (s.type === 'specs') return 'specs'
  if (s.type === 'collage') return 'collage'
  if (i === 0 && isWords(s)) return 'hero'
  if (!isWords(s)) return 'photo'
  let n = 0
  for (let k = 1; k < i; k += 1) if (isWords(slides[k])) n += 1
  return LOOKS[n % LOOKS.length]
}

function drawScene(ctx, slides, imgs, i, local) {
  const s = slides[i]
  const img = Array.isArray(imgs[i]) ? null : imgs[i]
  const p = Math.min(1, local / SLIDE)
  const look = lookOf(slides, i)
  const still = MOTION === 'still'
  const soft = MOTION === 'gentle'
  ctx.fillStyle = '#0E1013'; ctx.fillRect(0, 0, W, H)
  if (look === 'collage') { const list = imgs[i]; drawCollage(ctx, Array.isArray(list) ? list.filter(Boolean) : [list].filter(Boolean), s, local); return wordsBottom(ctx, s, local, { gradient: false }) }
  if (look === 'specs') { if (img) { ctx.save(); ctx.globalAlpha = 0.55; fill(ctx, img, 0, 0, W, H, 1.08); ctx.restore() } drawSpecs(ctx, s, local); return }
  if (!img) { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#241E45'); g.addColorStop(1, '#0E1013'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }

  if (look === 'hero') {
    if (img) { if (still) drawWhole(ctx, img, s); else fill(ctx, img, 0, 0, W, H, soft ? 1.02 + 0.05 * p : 1.12 - 0.08 * ease(p)) }
    return wordsBottom(ctx, s, local, { bar: true })
  }

  if (look === 'photo') {
    if (!img) return
    if (still) return drawWhole(ctx, img, s)
    // Plain photos drift: in, out, sideways, in turn.
    const way = i % 3
    if (soft) fill(ctx, img, 0, 0, W, H, 1.02 + 0.05 * p)
    else if (way === 0) fill(ctx, img, 0, 0, W, H, 1.02 + 0.3 * p)
    else if (way === 1) fill(ctx, img, 0, 0, W, H, 1.3 - 0.26 * p)
    else fill(ctx, img, 0, 0, W, H, 1.18, (p - 0.5) * -120)
    return
  }

  // Feature scenes. Which number this feature is, for the counter.
  // The counter (03 / 07) is for features only, not every scene with words.
  const feats = slides.filter((x, k) => k > 0 && isWords(x) && x.feature)
  const no = feats.indexOf(s) + 1

  if (look === 'card') {
    // The photo in a tilted card that settles, over a soft blur of itself.
    if (img) { ctx.drawImage(backdrop(img), 0, 0, W, H); ctx.fillStyle = 'rgba(14,16,19,.5)'; ctx.fillRect(0, 0, W, H) }
    const k = ease(local / 0.7)
    const cw = W - 150; const ch = H * 0.5; const cx = 75; const cy = 250
    ctx.save()
    ctx.translate(W / 2, cy + ch / 2 + (1 - k) * 120); ctx.rotate(((1 - k) * -6 - 1.5) * Math.PI / 180); ctx.translate(-W / 2, -(cy + ch / 2))
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24
    ctx.fillStyle = '#fff'; roundRect(ctx, cx - 14, cy - 14, cw + 28, ch + 28, 40); ctx.fill()
    ctx.shadowColor = 'transparent'
    roundRect(ctx, cx, cy, cw, ch, 28); ctx.clip()
    if (img) { if (still) { ctx.fillStyle = '#f4f1ea'; ctx.fillRect(cx, cy, cw, ch); fit(ctx, img, cx, cy, cw, ch) } else fill(ctx, img, cx, cy, cw, ch, soft ? 1.03 : 1.04 + 0.12 * p) }
    ctx.restore()
    return wordsAt(ctx, s, local, cy + ch + 150, { no, total: feats.length })
  }

  if (look === 'spotlight') {
    // Zooming out to reveal, darker edges, the feature in a badge.
    if (img) { if (still) drawWhole(ctx, img, s); else fill(ctx, img, 0, 0, W, H, soft ? 1.06 - 0.04 * p : 1.35 - 0.3 * ease(p * 1.2)) }
    const v = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.25, W / 2, H * 0.5, H * 0.75)
    v.addColorStop(0, 'rgba(14,16,19,0)'); v.addColorStop(1, 'rgba(14,16,19,.85)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    const k = back((local - 0.15) / 0.55)
    if (k <= 0) return
    ctx.save(); ctx.globalAlpha = Math.min(1, k)
    ctx.font = '900 76px Inter, Arial, sans-serif'
    const lines = wrapText(ctx, s.line || s.kicker, W - 260).slice(0, 2)
    const bw = Math.min(W - 100, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 230)
    const bh = 70 + lines.length * 88 + (s.sub ? 70 : 0)
    const bx = (W - bw) / 2; const by = H - 380 - bh
    ctx.translate(W / 2, by + bh / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-W / 2, -(by + bh / 2))
    ctx.fillStyle = 'rgba(14,16,19,.82)'; roundRect(ctx, bx, by, bw, bh, 44); ctx.fill()
    ctx.strokeStyle = '#8A6CFF'; ctx.lineWidth = 4; roundRect(ctx, bx, by, bw, bh, 44); ctx.stroke()
    // Tick in a circle
    ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(bx + 92, by + bh / 2, 46, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(bx + 70, by + bh / 2 + 2); ctx.lineTo(bx + 86, by + bh / 2 + 18); ctx.lineTo(bx + 116, by + bh / 2 - 16); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    const ty = by + 35 + 44
    lines.forEach((l, j) => ctx.fillText(l, bx + 168, ty + j * 88))
    if (s.sub) { ctx.fillStyle = '#C9BCFF'; ctx.font = '800 50px Inter, Arial, sans-serif'; ctx.fillText(s.sub, bx + 168, ty + lines.length * 88 + 6) }
    ctx.restore()
    if (no && feats.length > 1) counter(ctx, no, feats.length, W - 72, 230, local, 'right')
    return
  }

  if (look === 'split') {
    // A slim panel: the photo takes most of the screen, the words sit in a
    // near-black band below with the purple line on top; no empty space.
    const ph = H - 560
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, ph); ctx.clip()
    if (img) { if (still) { ctx.drawImage(backdrop(img), 0, 0, W, ph); fit(ctx, img, 40, 190, W - 80, ph - 220) } else fill(ctx, img, 0, 0, W, ph, soft ? 1.04 : 1.08, (0.5 - p) * 80) }
    ctx.restore()
    ctx.fillStyle = '#15181C'; ctx.fillRect(0, ph, W, H - ph)
    const sweep = ease((local - 0.1) / 0.5)
    ctx.fillStyle = '#8A6CFF'; ctx.fillRect(0, ph - 5, W * sweep, 10)
    let y = ph + 120
    if (no && feats.length > 1) {
      const k = ease((local - 0.05) / 0.5)
      ctx.save(); ctx.globalAlpha = k; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      ctx.font = '900 64px Inter, Arial, sans-serif'; ctx.fillStyle = '#8A6CFF'; ctx.fillText(String(no).padStart(2, '0'), 72, y)
      const nw = ctx.measureText(String(no).padStart(2, '0')).width
      ctx.font = '700 34px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(`/ ${String(feats.length).padStart(2, '0')}`, 72 + nw + 14, y)
      ctx.restore(); y += 110
    }
    wordsAt(ctx, s, local, y, { plain: true })
    return
  }

  // classic: the full photo, the words at the bottom in the brand colours,
  // the counter at the top.
  if (img) { if (still) drawWhole(ctx, img, s); else fill(ctx, img, 0, 0, W, H, soft ? 1.02 + 0.05 * p : 1.04 + 0.1 * p, (i % 2 ? 1 : -1) * 30 * p) }
  if (no && feats.length > 1) counter(ctx, no, feats.length, W - 72, 230, local, 'right')
  wordsBottom(ctx, s, local, { bar: true })
}

// "03 / 07", outlined, sliding in.
function counter(ctx, no, total, x, y, local, align) {
  const k = ease((local - 0.05) / 0.5)
  ctx.save(); ctx.globalAlpha = k; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  ctx.translate(align === 'left' ? (1 - k) * -60 : (1 - k) * 60, 0)
  const pad = (n) => String(n).padStart(2, '0')
  ctx.font = '900 110px Inter, Arial, sans-serif'
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.85)'
  if (align === 'left') { ctx.strokeText(pad(no), x, y); ctx.font = '700 40px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`/ ${pad(total)}`, x + 150, y) } else { ctx.font = '700 40px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`/ ${pad(total)}`, x, y); ctx.font = '900 110px Inter, Arial, sans-serif'; ctx.strokeText(pad(no), x - 90, y) }
  ctx.restore()
}

// Words at a height: kicker, the line (revealed upwards), the extra line.
// ZaMarket colours: the purple accent on near-black, white words.
function wordsAt(ctx, s, local, y, { plain = false } = {}) {
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  const k = ease((local - 0.15) / 0.5)
  if (s.kicker) { ctx.globalAlpha = k; ctx.fillStyle = '#A892FF'; ctx.font = '800 40px Inter, Arial, sans-serif'; ctx.fillText(s.kicker.toUpperCase(), 72 + (1 - k) * 40, y); y += 84 }
  ctx.globalAlpha = 1
  ctx.font = `900 ${plain ? 84 : 80}px Inter, Arial, sans-serif`
  const lines = wrapText(ctx, s.line || '', W - 144).slice(0, 3)
  lines.forEach((l, j) => {
    const r = ease((local - 0.2 - j * 0.1) / 0.5)
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - 90, W, 112); ctx.clip()
    ctx.fillStyle = '#fff'; ctx.fillText(l, 72, y + (1 - r) * 110)
    ctx.restore(); y += 98
  })
  if (s.sub) { const r = ease((local - 0.45) / 0.5); ctx.globalAlpha = r; ctx.fillStyle = '#C9BCFF'; ctx.font = '800 56px Inter, Arial, sans-serif'; ctx.fillText(s.sub, 72, y + 10) }
  ctx.restore()
}

// Words at the bottom over a photo (title, photo grid).
function wordsBottom(ctx, s, local, { gradient = true, bar = false } = {}) {
  if (!(s.line || s.kicker)) return
  if (gradient) {
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H)
    g.addColorStop(0, 'rgba(14,16,19,0)'); g.addColorStop(0.45, 'rgba(14,16,19,.72)'); g.addColorStop(1, 'rgba(14,16,19,.96)')
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55)
  }
  ctx.font = '900 82px Inter, Arial, sans-serif'
  const n = Math.min(3, wrapText(ctx, s.line || '', W - 144).length)
  const y = H - 300 - n * 98 - (s.sub ? 70 : 0)
  if (bar) { const k = ease((local - 0.05) / 0.6); ctx.fillStyle = '#8A6CFF'; ctx.fillRect(72, y - (s.kicker ? 150 : 115), 140 * k, 10) }
  wordsAt(ctx, s, local, y)
}

function drawChrome(ctx, t, total) {
  // The ZaMarket logo and name, top.
  ctx.save(); ctx.textAlign = 'left'
  ctx.font = '800 44px Inter, Arial, sans-serif'; ctx.textBaseline = 'middle'
  const za = ctx.measureText('Za').width; const bw = ctx.measureText('ZaMarket').width
  ctx.fillStyle = 'rgba(14,16,19,.6)'; roundRect(ctx, 48, 70, bw + 160, 84, 42); ctx.fill()
  brandMark(ctx, 70, 82, 60)
  ctx.fillStyle = '#A892FF'; ctx.fillText('Za', 146, 113)
  ctx.fillStyle = '#fff'; ctx.fillText('Market', 146 + za, 113)
  // Progress bar.
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(72, H - 90, W - 144, 8)
  ctx.fillStyle = '#8A6CFF'; ctx.fillRect(72, H - 90, (W - 144) * Math.min(1, t / (total + END)), 8)
  ctx.restore()
}

export function drawFrame(ctx, t, slides, imgs, end) {
  const total = slides.length * SLIDE
  ctx.fillStyle = '#0E1013'; ctx.fillRect(0, 0, W, H)
  if (t >= total) {
    drawEnd(ctx, t - total, end)
    // The last scene zooms away into the end card.
    const lt = t - total
    if (lt < TR && slides.length) {
      const k = ease(lt / TR)
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(W / 2, H / 2); ctx.scale(1 + 0.25 * k, 1 + 0.25 * k); ctx.translate(-W / 2, -H / 2)
      drawScene(ctx, slides, imgs, slides.length - 1, SLIDE + lt); ctx.restore()
    }
    return
  }
  const i = Math.min(slides.length - 1, Math.floor(t / SLIDE))
  const local = t - i * SLIDE
  if (i > 0 && local < TR) {
    // Moving from the scene before into this one.
    const k = ease(local / TR)
    const how = TRANSITIONS[i % TRANSITIONS.length]
    if (how === 'push') {
      ctx.save(); ctx.translate(-W * k, 0); drawScene(ctx, slides, imgs, i - 1, SLIDE + local); ctx.restore()
      ctx.save(); ctx.translate(W * (1 - k), 0); drawScene(ctx, slides, imgs, i, local); ctx.restore()
    } else if (how === 'wipe') {
      drawScene(ctx, slides, imgs, i, local)
      ctx.save(); ctx.beginPath(); ctx.rect(0, H * k, W, H); ctx.clip(); drawScene(ctx, slides, imgs, i - 1, SLIDE + local); ctx.restore()
      ctx.fillStyle = '#8A6CFF'; ctx.fillRect(0, H * k - 6, W, 12)
    } else {
      drawScene(ctx, slides, imgs, i, local)
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(W / 2, H / 2); ctx.scale(1 + 0.3 * k, 1 + 0.3 * k); ctx.translate(-W / 2, -H / 2)
      drawScene(ctx, slides, imgs, i - 1, SLIDE + local); ctx.restore()
    }
  } else drawScene(ctx, slides, imgs, i, local)
  drawChrome(ctx, t, total)
}

// Up to four photos in a grid, each arriving in turn and drifting gently.
function drawCollage(ctx, imgs, s, local) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#241E45'); g.addColorStop(1, '#0E1013')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  if (!imgs.length) return
  const words = s.line || s.kicker
  const top = 200; const bottom = words ? H - 610 : H - 160; const gap = 18; const side = 48
  const n = Math.min(4, imgs.length)
  const cells = n === 1 ? [[0, 0, 1, 1]] : n === 2 ? [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] : n === 3 ? [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]
  const bw = W - side * 2; const bh = bottom - top
  cells.forEach(([cx, cy, cw, ch], k) => {
    const img = imgs[k]
    const appear = Math.min(1, Math.max(0, (local - k * 0.18) / 0.45))
    if (!appear || !img) return
    const x = side + cx * bw + (cx ? gap / 2 : 0); const y = top + cy * bh + (cy ? gap / 2 : 0)
    const w = cw * bw - (cw < 1 ? gap / 2 : 0); const h = ch * bh - (ch < 1 ? gap / 2 : 0)
    const z = 1.04 + 0.05 * (local / SLIDE)
    const r = Math.max(w / img.width, h / img.height) * z
    const dw = img.width * r; const dh = img.height * r
    ctx.save(); ctx.globalAlpha = appear
    ctx.translate(0, (1 - appear) * 30)
    roundRect(ctx, x, y, w, h, 26); ctx.clip()
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    ctx.restore()
  })
}

// The whole photo, uncropped and still, over a soft darkened copy of itself.
// The blurred backdrop is made once per photo (small, then stretched), not on
// every frame: blurring a full frame 30 times a second is slow on a phone.
const backdrops = new WeakMap()
function backdrop(img) {
  let c = backdrops.get(img)
  if (c) return c
  c = document.createElement('canvas'); c.width = W / 4; c.height = H / 4
  const x = c.getContext('2d')
  const r = Math.max(c.width / img.width, c.height / img.height) * 1.1
  try { x.filter = 'blur(9px)' } catch { /* no filters */ }
  x.drawImage(img, (c.width - img.width * r) / 2, (c.height - img.height * r) / 2, img.width * r, img.height * r)
  backdrops.set(img, c)
  return c
}

function drawWhole(ctx, img, s) {
  ctx.drawImage(backdrop(img), 0, 0, W, H)
  ctx.fillStyle = 'rgba(14,16,19,.55)'; ctx.fillRect(0, 0, W, H)
  const words = s.line || s.kicker || s.type
  const top = 200; const bottom = words ? H - 600 : H - 200
  const k = Math.min((W - 96) / img.width, (bottom - top) / img.height)
  const dw = img.width * k; const dh = img.height * k
  const x = (W - dw) / 2; const y = top + (bottom - top - dh) / 2
  ctx.save(); roundRect(ctx, x, y, dw, dh, 28); ctx.clip(); ctx.drawImage(img, x, y, dw, dh); ctx.restore()
}

// A specifications card that grows into view, the rows arriving one by one.
function drawSpecs(ctx, s, local) {
  ctx.fillStyle = 'rgba(14,16,19,.62)'; ctx.fillRect(0, 0, W, H)
  const grow = Math.min(1, local / 0.6)
  const scale = 0.9 + 0.1 * (1 - Math.pow(1 - grow, 3))
  const rows = s.rows || []
  const rowH = 118
  const cardH = 190 + rows.length * rowH
  const top = Math.max(230, (H - cardH) / 2)
  ctx.save()
  ctx.translate(W / 2, top + cardH / 2); ctx.scale(scale, scale); ctx.translate(-W / 2, -(top + cardH / 2))
  ctx.globalAlpha = grow
  ctx.fillStyle = 'rgba(21,24,28,.94)'; roundRect(ctx, 56, top, W - 112, cardH, 40); ctx.fill()
  ctx.strokeStyle = 'rgba(138,108,255,.6)'; ctx.lineWidth = 3; roundRect(ctx, 56, top, W - 112, cardH, 40); ctx.stroke()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#A892FF'; ctx.font = '800 44px Inter, Arial, sans-serif'; ctx.fillText((s.kicker || 'Specifications').toUpperCase(), 110, top + 90)
  rows.forEach(([label, value], i) => {
    const appear = Math.min(1, Math.max(0, (local - 0.35 - i * 0.22) / 0.3))
    if (!appear) return
    const y = top + 190 + i * rowH + rowH / 2 - 20
    ctx.globalAlpha = grow * appear
    if (i) { ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(110, y - rowH / 2, W - 220, 2) }
    ctx.fillStyle = '#C2C8D0'; ctx.font = '600 42px Inter, Arial, sans-serif'; ctx.fillText(label, 110, y)
    ctx.fillStyle = '#fff'; ctx.font = '800 50px Inter, Arial, sans-serif'
    ctx.textAlign = 'right'
    let v = value
    while (v.length > 3 && ctx.measureText(v).width > W - 220 - 320) v = v.slice(0, -2)
    ctx.fillText(v === value ? v : `${v.trim()}…`, W - 110, y)
    ctx.textAlign = 'left'
  })
  ctx.restore()
}

function drawEnd(ctx, t, end) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#241E45'); g.addColorStop(1, '#0E1013')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const a = Math.min(1, t / 0.4)
  ctx.save(); ctx.globalAlpha = a
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  // Logo and name
  brandMark(ctx, W / 2 - 90, 190, 180)
  ctx.fillStyle = '#fff'; ctx.font = '900 92px Inter, Arial, sans-serif'; ctx.fillText('ZaMarket', W / 2, 450)
  ctx.fillStyle = '#A892FF'; ctx.font = '700 48px Inter, Arial, sans-serif'
  wrapText(ctx, end.cta || 'See it on ZaMarket', W - 140).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 550 + i * 60))
  if (end.qr) { ctx.fillStyle = '#fff'; roundRect(ctx, W / 2 - 250, 680, 500, 500, 40); ctx.fill(); ctx.drawImage(end.qr, W / 2 - 215, 715, 430, 430) }
  // The link, big enough to read and type: the address on its own line, the
  // rest broken at / and - so it never runs off the screen.
  const link = end.link || 'zamarket.shop'
  const cut = link.indexOf('/')
  const site = cut > 0 ? link.slice(0, cut) : link
  const rest = cut > 0 ? link.slice(cut) : ''
  ctx.fillStyle = '#C9BCFF'; ctx.font = '900 76px Inter, Arial, sans-serif'; ctx.fillText(site, W / 2, 1290)
  if (rest) {
    const lines = fitLink(ctx, rest, W - 120)
    ctx.fillStyle = '#fff'
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 1385 + i * (lines.size + 14)))
  }
  ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = '600 42px Inter, Arial, sans-serif'; ctx.fillText(end.foot || 'Delivered in Lusaka', W / 2, rest ? 1590 : 1420)
  if (end.qr) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 34px Inter, Arial, sans-serif'; ctx.fillText('Scan the code or type the link', W / 2, rest ? 1660 : 1490) }
  ctx.restore(); ctx.textAlign = 'left'
}

// A link path in at most two lines, largest type that fits, broken after
// a / or a - (a web address has no spaces to break at).
function fitLink(ctx, text, maxW) {
  const parts = String(text).split(/(?<=[/-])/)
  for (let size = 52; size >= 30; size -= 2) {
    ctx.font = `700 ${size}px Inter, Arial, sans-serif`
    const lines = []; let cur = ''
    for (const p of parts) {
      if (ctx.measureText(cur + p).width > maxW && cur) { lines.push(cur); cur = p } else cur += p
    }
    if (cur) lines.push(cur)
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) return Object.assign(lines, { size })
  }
  ctx.font = '700 30px Inter, Arial, sans-serif'
  const t = String(text)
  const lines = [t.slice(0, Math.ceil(t.length / 2)), t.slice(Math.ceil(t.length / 2))]
  return Object.assign(lines, { size: 30 })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function wrapText(ctx, text, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []; let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

export async function prepare(script, link) {
  const imgs = await Promise.all(script.slides.map((s) => (s.type === 'collage' ? Promise.all((s.photos || []).map(load)) : s.photo ? load(s.photo) : Promise.resolve(null))))
  const qr = link ? await qrImage(link, '#0E1013', '#ffffff') : null
  return { imgs, end: { qr, link: String(link || '').replace(/^https?:\/\//, ''), cta: script.end?.cta || 'See it on ZaMarket', foot: script.end?.foot || '' } }
}

// Which recorder this phone can really use. Some phones say they can record
// MP4 but hand back an empty or broken file, especially at full 1080×1920
// in portrait. So each option is tried for about a second and the result is
// checked (it must have data and play) before the real recording starts.
// The first one that works is remembered on this device.
const CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', w: 720, h: 1280 },
  { mime: 'video/mp4;codecs=avc1.42E01F', w: 720, h: 1280 },
  { mime: 'video/mp4;codecs=avc1', w: 720, h: 1280 },
  { mime: 'video/webm;codecs=vp8', w: 720, h: 1280 },
  { mime: 'video/webm;codecs=vp9', w: 720, h: 1280 },
  { mime: 'video/webm', w: 720, h: 1280 },
  { mime: 'video/mp4', w: 720, h: 1280 },
]
const REMEMBER = 'zm-video-recorder-v2'

const supported = (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)

export function bestMime() {
  try { const r = JSON.parse(localStorage.getItem(REMEMBER) || 'null'); if (r?.mime && supported(r.mime)) return r.mime } catch { /* ignore */ }
  return CANDIDATES.find((c) => supported(c.mime))?.mime || ''
}

// True when the file has data and a video element can open it.
export function playable(blob, timeout = 5000) {
  return new Promise((res) => {
    if (!blob || blob.size < 1500) return res(false)
    const v = document.createElement('video')
    const url = URL.createObjectURL(blob)
    const end = (ok) => { clearTimeout(t); v.removeAttribute('src'); v.load?.(); URL.revokeObjectURL(url); res(ok) }
    const t = setTimeout(() => end(false), timeout)
    v.muted = true; v.preload = 'metadata'
    v.onloadedmetadata = () => end(v.videoWidth > 0 || v.duration > 0)
    v.onerror = () => end(false)
    v.src = url
  })
}

// Records `seconds` of drawing into a canvas of the given size.
function capture(cfg, seconds, paint, { audio = null, onProgress, until = null } = {}) {
  return new Promise((resolve, reject) => {
    const c = document.createElement('canvas')
    c.width = cfg.w; c.height = cfg.h
    const ctx = c.getContext('2d')
    if (!c.captureStream) return reject(new Error('This browser cannot record video. Use Chrome.'))
    const stream = c.captureStream(30)
    audio?.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    let rec
    try { rec = new MediaRecorder(stream, { mimeType: cfg.mime, videoBitsPerSecond: 4_000_000 }) } catch (e) { return reject(e) }
    const chunks = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
    rec.onerror = (e) => reject(e.error || new Error('The recorder stopped'))
    rec.onstop = () => { stream.getVideoTracks().forEach((tr) => tr.stop()); resolve(new Blob(chunks, { type: cfg.mime.split(';')[0] })) }
    const scale = cfg.w / W
    rec.start(500)
    const start = performance.now()
    const step = () => {
      const t = (performance.now() - start) / 1000
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      paint(ctx, until ? t : Math.min(t, seconds), c)
      if (!until) onProgress?.(Math.min(1, t / seconds))
      if (until ? !until() : t < seconds) requestAnimationFrame(step)
      else setTimeout(() => { try { rec.requestData?.() } catch { /* ignore */ } rec.stop() }, 150)
    }
    requestAnimationFrame(step)
  })
}

async function pickRecorder(probePaint) {
  try {
    const r = JSON.parse(localStorage.getItem(REMEMBER) || 'null')
    if (r?.mime && supported(r.mime)) return r
  } catch { /* ignore */ }
  for (const cfg of CANDIDATES.filter((c) => supported(c.mime))) {
    try {
      const blob = await capture(cfg, 1.2, probePaint)
      if (await playable(blob)) {
        try { localStorage.setItem(REMEMBER, JSON.stringify(cfg)) } catch { /* ignore */ }
        return cfg
      }
    } catch { /* try the next one */ }
  }
  return null
}

// Records the video in real time (the length of the video), showing it on
// the preview canvas as it goes. With voice on, the microphone is recorded
// at the same time, so you can talk over it.
// With voice, you set the pace: each scene stays on screen until you tap
// Next, and the recording ends only when you tap Finish. A scene keeps a
// slow, gentle zoom however long you talk over it.
export function voiceController(scenes, onScene) {
  const c = { i: 0, at: 0, done: false, scenes }
  c.next = () => { if (c.i < scenes) { c.i += 1; c.at = performance.now(); onScene?.(c.i) } }
  c.back = () => { if (c.i > 0) { c.i -= 1; c.at = performance.now(); onScene?.(c.i) } }
  c.finish = () => { c.done = true }
  return c
}

// Time on the video's timeline for a scene held open for `held` seconds:
// moves quickly through the entrance, then slows right down, never stopping
// dead and never running into the next scene.
export function heldTime(scene, held, slides) {
  const total = slides.length * SLIDE
  if (scene >= slides.length) return total + Math.min(held, END - 0.05)
  const local = (SLIDE - 0.05) * (1 - Math.exp(-held / (SLIDE * 1.2)))
  return scene * SLIDE + local
}

export async function recordVideo(preview, script, assets, { voice = false, onProgress, onStage, controller = null, countdown = null } = {}) {
  if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video. Use Chrome on your phone or computer.')
  const pctx = preview.getContext('2d')
  const show = (c) => { pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.drawImage(c, 0, 0, preview.width, preview.height) }
  onStage?.('Getting ready…')
  const cfg = await pickRecorder((ctx, t, c) => { drawFrame(ctx, t, script.slides, assets.imgs, assets.end); show(c) })
  if (!cfg) throw new Error('This phone could not record a working video. Try Chrome, or make it on a computer.')
  let mic = null
  if (voice) mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  // 3, 2, 1 before anything is recorded, with the first scene on screen.
  if (countdown) {
    show((() => { const c = document.createElement('canvas'); c.width = W; c.height = H; drawFrame(c.getContext('2d'), 0.6, script.slides, assets.imgs, assets.end); return c })())
    try { await countdown() } catch (e) { mic?.getTracks().forEach((t) => t.stop()); throw e }
  }
  const length = videoLength(script.slides)
  onStage?.('Recording')
  let blob
  try {
    if (controller) {
      controller.at = performance.now()
      blob = await capture(cfg, 0, (ctx, _t, c) => {
        const held = (performance.now() - controller.at) / 1000
        drawFrame(ctx, heldTime(controller.i, held, script.slides), script.slides, assets.imgs, assets.end)
        show(c)
      }, { audio: mic, until: () => controller.done })
    } else {
      blob = await capture(cfg, length, (ctx, t, c) => { drawFrame(ctx, t, script.slides, assets.imgs, assets.end); show(c) }, { audio: mic, onProgress })
    }
  } finally {
    mic?.getTracks().forEach((t) => t.stop())
  }
  onStage?.('Checking the video…')
  if (!(await playable(blob, 8000))) {
    try { localStorage.removeItem(REMEMBER) } catch { /* ignore */ }
    throw new Error('The video did not come out right. Tap Make video again; it will try another way.')
  }
  // Rewrite it as a finished MP4 that WhatsApp, Status and the gallery accept.
  onStage?.('Finishing the video…')
  try {
    const done = await finishVideo(blob)
    if (done.size > 1500 && (await videoSeconds(done)) > 0.5) return { blob: done, ext: 'mp4', width: cfg.w, height: cfg.h, finished: true }
  } catch (e) { console.warn('[video] finishing failed, keeping the recording', e) }
  return { blob, ext: cfg.mime.includes('mp4') ? 'mp4' : 'webm', width: cfg.w, height: cfg.h, finished: false }
}

// ---- A video you arrange yourself ------------------------------------------
// The pieces a listing offers: its photos, and blocks you can turn into a
// scene (title and price, the specifications card, each recorded feature,
// where it is, your own words). Nothing is placed for you except a plain
// starting point: the title over the first photo, then each photo on its
// own. You choose what goes on which photo.
let nextId = 1
export const sceneId = () => `s${Date.now().toString(36)}${(nextId++).toString(36)}`

export function videoParts(item, kind = 'product', link = '') {
  const base = videoScript(item, kind, link)
  if (kind === 'market') {
    const photos = [...new Set([...(item.products || []), ...(item.cars || []), ...(item.lunch || [])])].slice(0, 20)
    const blocks = base.slides.map((sc, i) => ({ id: `m${i}`, label: sc.line, scene: sc, photo: sc.photo }))
    blocks.push({ id: 'words', label: 'My own words', scene: { kicker: '', line: '', sub: '', say: '' } })
    const starter = base.slides.map((sc) => ({ id: sceneId(), photo: sc.photo || null, ...clean(sc) }))
    return { photos, blocks, starter, end: base.end, caption: base.caption, endSay: base.endSay }
  }
  const photos = [...new Set((kind === 'lunch'
    ? [item.cover_url, ...(item.dishList || []).flatMap((d) => d.images || [])]
    : item.images || []).filter(Boolean))].slice(0, 20)
  const blocks = []
  if (kind === 'vehicle') {
    const v = vehicleOf(item)
    const title = vehicleTitle(v, item.name)
    const note = priceNote(v)
    const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
    blocks.push({ id: 'title', label: 'Title and price', scene: { kicker: 'For sale on ZaMarket Motors', line: title, sub: [price, note].filter(Boolean).join(' · '), say: `${title}. ${price ? `Asking ${price}${note ? `, ${note.toLowerCase()}` : ''}.` : ''}` } })
    const rows = vehicleFacts(v).filter((f) => f.key !== 'location').map((f) => [f.label, String(f.value)])
    if (rows.length) blocks.push({ id: 'specs', label: 'Specifications card', allRows: rows, scene: { type: 'specs', kicker: 'Specifications', rows: rows.slice(0, 6), say: '' } })
    if (v.location) blocks.push({ id: 'where', label: `Where: ${v.location}`, scene: { kicker: 'Where', line: v.location, say: `It is in ${v.location}.` } })
    for (const f of rankFeatures(v.features || [])) blocks.push({ id: `f-${f.label}`, label: f.label, feature: true, scene: { kicker: '', line: f.label, say: `${f.label}.` } })
  } else if (kind === 'lunch') {
    blocks.push({ id: 'title', label: 'Title and price', scene: base.slides[0] })
    for (const d of item.dishList || []) blocks.push({ id: `d-${d.id}`, label: d.name, feature: true, scene: { kicker: 'On the menu', line: d.name, sub: d.price ? money(d.price, { whole: true }) : '', say: `${d.name}.` }, photo: d.images?.[0] })
    blocks.push({ id: 'how', label: 'How it works', scene: base.slides.find((x) => x.kicker === 'How it works') })
  } else {
    blocks.push({ id: 'title', label: 'Name and price', scene: base.slides[0] })
    for (const p of (item.benefits || []).filter(Boolean)) blocks.push({ id: `b-${p}`, label: p, feature: true, scene: { kicker: '', line: p, say: `${p}.` } })
  }
  blocks.push({ id: 'words', label: 'My own words', scene: { kicker: '', line: '', sub: '', say: '' } })
  // The starting point is the full automatic video. A feature scene is marked
  // so you can check its photo really shows it.
  const feats = new Set(blocks.filter((b) => b.feature).map((b) => b.scene.line))
  const starter = base.slides.map((sc) => ({ id: sceneId(), photo: sc.photo || null, ...clean(sc), ...(feats.has(sc.line) ? { feature: true } : {}) }))
  return { photos, blocks, starter, end: base.end, caption: base.caption, endSay: base.endSay }
}

const clean = (sc) => ({ type: sc.type || '', kicker: sc.kicker || '', line: sc.line || '', sub: sc.sub || '', say: sc.say || '', ...(sc.rows ? { rows: sc.rows } : {}), ...(sc.photos ? { photos: sc.photos } : {}) })

// A new scene from a block, on a chosen photo.
export const sceneFrom = (block, photo) => ({ id: sceneId(), photo: photo ?? block.photo ?? null, ...clean(block.scene) })

// What you will say, scene by scene, then the ending.
export const voiceFor = (scenes, endSay) => [...scenes.map((x) => x.say).filter(Boolean), endSay].filter(Boolean).join(' ')

// Photos loaded once and reused while you edit.
export async function loadPhotos(urls, cache) {
  await Promise.all([...new Set(urls.filter(Boolean))].filter((u) => !cache.has(u)).map(async (u) => { cache.set(u, await load(u)) }))
  return cache
}
export async function endCard(script, link) {
  const qr = link ? await qrImage(link, '#0E1013', '#ffffff') : null
  return { qr, link: String(link || '').replace(/^https?:\/\//, ''), cta: script.end?.cta || 'See it on ZaMarket', foot: script.end?.foot || '' }
}

// ---- AI photo check ---------------------------------------------------------
// After the AI has looked at the listing's photos (see netlify/functions/
// ai-assist.js, task "photos"): each feature scene gets the photo that really
// shows it; a feature no photo shows is never put over an unrelated picture,
// it goes on one honest "Also has" card instead; the title sits on the best
// first picture; the plain photo scenes run outside first, then inside.
const KIND_ORDER = ['exterior_front', 'product', 'exterior_side', 'in_use', 'exterior_rear', 'wheel', 'close_up', 'interior_front', 'dashboard', 'seats', 'interior_rear', 'boot', 'engine', 'detail', 'packaging', 'other', 'document']
const listOf = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '').toLowerCase()

export function applyPhotoMatch(scenes, match, images, { extra = [], most = 10, keepUnseen = false } = {}) {
  if (!match || !Array.isArray(scenes)) return scenes
  const url = (i) => (Number.isInteger(i) && i >= 0 ? images[i] || null : null)
  const byFeature = new Map((match.features || []).map((f) => [f.feature, f]))
  const captionOf = new Map((match.photos || []).filter((p) => p.caption).map((p) => [images[p.index], p.caption]))
  const unseen = []
  let out = []
  for (const sc of scenes) {
    if (sc.feature && byFeature.has(sc.line)) {
      const m = byFeature.get(sc.line)
      if (m.photo >= 0 && url(m.photo)) out.push({ ...sc, photo: url(m.photo), checked: m.sure === 'yes', ai: m.sure })
      // A car feature no photo shows goes on the "Also has" card; a product
      // point no photo can show ("soft and moist") keeps its own scene.
      else if (keepUnseen) out.push(sc)
      else unseen.push(sc.line)
      continue
    }
    out.push(sc)
  }
  // More features: every listed feature a photo shows (not only the top few),
  // then the ones the AI saw that you kept. Each over the photo that shows it.
  const have = new Set(out.filter((s) => s.feature).map((s) => s.line.toLowerCase()))
  const more = [
    ...(match.features || []).filter((f) => f.photo >= 0 && f.sure === 'yes').map((f) => ({ ...f, from: 'listing' })),
    ...extra.map((f) => ({ ...f, sure: 'yes', from: 'seen' })),
  ].filter((f) => url(f.photo) && !have.has(f.feature.toLowerCase()))
  const room = Math.max(0, most - have.size)
  let lastFeature = out.reduce((n, s, i) => (s.feature ? i : n), -1)
  if (lastFeature < 0) lastFeature = Math.max(0, out.findIndex((s) => s.type === 'specs'))
  const added = more.slice(0, room).map((f) => ({ id: sceneId(), kicker: '', line: f.feature, sub: '', say: `${f.feature}.`, photo: url(f.photo), feature: true, checked: true, ai: 'yes', ...(f.from === 'seen' ? { seen: true } : {}) }))
  out.splice(lastFeature + 1, 0, ...added)
  lastFeature += added.length
  // "Highlights" stays on the first feature scene.
  const firstFeature = out.findIndex((s) => s.feature)
  if (firstFeature >= 0 && scenes.some((s) => s.feature && s.kicker === 'Highlights')) out = out.map((s, i) => (s.feature ? { ...s, kicker: i === firstFeature ? 'Highlights' : (s.kicker === 'Highlights' ? '' : s.kicker) } : s))
  const cover = url(match.cover)
  if (cover && out[0] && !out[0].type) out[0] = { ...out[0], photo: cover }
  if (unseen.length) {
    const card = { id: sceneId(), type: 'specs', kicker: 'Also has', rows: unseen.slice(0, 6).map((f) => [f, '✓']), line: '', sub: '', say: `It also has ${listOf(unseen)}.`, photo: cover || images[0] || null }
    out.splice(lastFeature + 1, 0, card)
  }
  // Plain photo scenes: photos not used above, outside first, papers last,
  // with the AI's short line about each for the voice-over.
  const plain = (s) => !s.type && !s.line && !s.kicker
  const used = new Set(out.filter((s) => !plain(s)).map((s) => s.photo))
  const kindOf = new Map((match.photos || []).map((p) => [p.index, p.kind]))
  const rankOf = (i) => { const k = KIND_ORDER.indexOf(kindOf.get(i) || 'other'); return k < 0 ? 99 : k }
  const rest = images.map((u, i) => ({ u, i })).filter((x) => x.u && !used.has(x.u) && kindOf.get(x.i) !== 'document').sort((a, b) => rankOf(a.i) - rankOf(b.i)).map((x) => x.u)
  let k = 0
  out = out.map((s) => {
    if (!plain(s)) return s
    const photo = rest[k] ? rest[k++] : s.photo
    const line = captionOf.get(photo)
    return { ...s, photo, say: s.say || (line ? `${line.replace(/[.!]+$/, '')}.` : '') }
  })
  return out
}
