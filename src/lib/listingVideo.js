import { load, qrImage, brandMark } from './posterKit'
import { cleanTiers } from './lunch'
import { finishVideo, videoSeconds } from './videoFinish'
import { money } from './format'
import { openMic, liveStudio } from './studioVoice'
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
    return { ...finish(slides, photos, voice, captionFor(title, price, note, feats, link, ['#ZaMarketMotors', '#CarsForSaleZambia', '#Lusaka'])), end: { cta: 'Enquire on ZaMarket Motors', foot: 'Ask about it · viewings arranged', title, price: [price, note].filter(Boolean).join(' · ') } }
  }
  if (kind === 'lunch') return lunchScript(item, link)
  // A product: everything the listing really says, not only three points:
  // its benefits, the clearest sentences of its description, its options
  // (sizes, colours…), how it is made or sent, real reviews, the seller.
  const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
  const was = Number(item.normal_price) > Number(item.price) ? money(item.normal_price, { whole: true }) : ''
  const points = (item.benefits || []).map((x) => String(x || '').replace(/^[\s\u2022*\u00b7\u2013\u2014-]+/, '').trim()).filter(Boolean).slice(0, 6)
  const lines = sentences(item.description).filter((x) => !points.some((p) => p.toLowerCase() === x.toLowerCase())).slice(0, Math.max(1, 4 - Math.min(points.length, 3)))
  const opts = (Array.isArray(item.options) ? item.options : []).filter((o) => o?.name && o?.choices?.length).slice(0, 2)
  slides.push({ kicker: item.vendor_name || 'On ZaMarket', line: item.name, sub: [price, was ? `was ${was}` : ''].filter(Boolean).join(' · '), say: `${item.name}${item.vendor_name ? ` from ${item.vendor_name}` : ''}.${price ? ` ${price}.` : ''}` })
  points.forEach((x, i) => slides.push({ kicker: i === 0 ? 'Why people love it' : '', line: shortLine(x), sub: '', say: `${x.replace(/[.!]+$/, '')}.` }))
  lines.forEach((x, i) => slides.push({ kicker: i === 0 ? 'About it' : '', line: shortLine(x), sub: '', say: `${x}.` }))
  opts.forEach((o) => slides.push({ kicker: `Choose your ${String(o.name).toLowerCase()}`, line: o.choices.slice(0, 5).map((c) => (typeof c === 'string' ? c : c?.label || c?.name || '')).filter(Boolean).join(' · '), sub: '', say: `Choose your ${String(o.name).toLowerCase()}.` }))
  if (item.fulfilment === 'made_to_order') slides.push({ kicker: 'Made for you', line: 'Made to order', sub: item.lead_time_days ? `Ready in ${item.lead_time_days} day${item.lead_time_days > 1 ? 's' : ''}` : '', say: `It is made to order${item.lead_time_days ? `, ready in ${item.lead_time_days} day${item.lead_time_days > 1 ? 's' : ''}` : ''}.` })
  if (Number(item.review_count) > 0 && Number(item.rating) > 0) slides.push({ kicker: 'Reviews', line: `Rated ${Number(item.rating).toFixed(1)} out of 5`, sub: `${item.review_count} review${item.review_count > 1 ? 's' : ''} on ZaMarket`, say: `Rated ${Number(item.rating).toFixed(1)} out of 5 by customers on ZaMarket.` })
  slides.push({ kicker: 'Order on ZaMarket', line: 'Delivered in Lusaka', sub: item.vendor_name ? `From ${item.vendor_name}` : '', say: 'Order on zamarket dot shop, delivered in Lusaka.' })
  const voice = slides.map((x) => x.say).filter(Boolean).join(' ')
  return withEnd({ cta: 'See it and order on ZaMarket', foot: 'Delivered in Lusaka', title: item.name, price }, finish(slides, photos, voice, captionFor(item.name, price, '', [...points, ...lines].slice(0, 5), link, ['#ZaMarket', '#Lusaka', '#ShopLocal']), 13))
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
  const fixed = offerScenes(item, dishPics)
  const at = (slot) => fixed.filter((x) => x.slot === slot)
  // 12:30, what's for lunch? Already sorted: the cover rises in.
  slides.push(...at('open'))
  slides.push({ kicker: 'Homemade', line: 'Cooked fresh for the day you booked', sub: seller ? `By ${seller}` : '', photo: kitchen || dishPics[1] || item.cover_url, say: `Every lunch is homemade${seller ? ` by ${seller}` : ''}, cooked for the day you booked, never the day before.` })
  // The food, big: the best dish full screen (the week menu shows the rest).
  const hasMenu = at('after').some((x) => x.type === 'menu')
  const opened = at('open')[0]?.photo
  dishes.filter((d) => d.images?.[0] && d.images[0] !== opened).slice(0, hasMenu ? 1 : 2).forEach((d) => slides.push({ kicker: 'On the menu', line: d.name, sub: d.price ? money(d.price, { whole: true }) : '', photo: d.images[0], say: `${d.name}.` }))
  if (!hasMenu && dishPics.length > 2) slides.push({ type: 'collage', photos: dishPics.slice(0, 4), kicker: 'On the menu', line: `${dishes.length} homemade dishes`, sub: '', say: `On the menu: ${dishes.slice(0, 3).map((d) => d.name).join(', ')}.` })
  // The week, the delivery, the offer.
  slides.push(...at('after'))
  if (item.in_the_box) slides.push({ kicker: 'In every box', line: shortLine(String(item.in_the_box), 60), sub: '', photo: dishPics[1] || item.cover_url, say: `In every box: ${String(item.in_the_box).replace(/\s+/g, ' ').slice(0, 140)}.` })
  // Saving more, in one scene.
  const saves = [team.length ? `${team[0].min}+ lunches in one delivery: ${team[0].pct}% off` : '', week.length ? `${week[week.length - 1].min}+ days booked: ${week[week.length - 1].pct}% off` : ''].filter(Boolean)
  if (saves.length) slides.push({ kicker: 'Pay less', line: saves[0], sub: saves[1] || '', photo: dishPics[0] || item.cover_url, say: [team.length ? `Ordering for your team? ${team[0].min} or more lunches in one delivery get ${team[0].pct} percent off.` : '', week.length ? `Book ${week[week.length - 1].min} days or more and save ${week[week.length - 1].pct} percent.` : ''].filter(Boolean).join(' ') })
  // Nothing to lose, in one scene.
  if (item.trial_first || item.guarantee) slides.push({ kicker: 'Nothing to lose', line: item.trial_first ? 'First time? Taste one lunch first' : 'Late or not as described? That lunch is free', sub: item.trial_first && item.guarantee ? 'Late or not as described? It is free' : '', photo: dishPics[2] || item.cover_url, say: [item.trial_first ? 'Ordering for the first time? Pay for your first lunch, and the other days after you have tasted it.' : '', item.guarantee ? 'And if a lunch is late or not as described, tell us the same day and that lunch is free.' : ''].filter(Boolean).join(' ') })
  slides.push(...at('close'))
  const voice = slides.map((x) => x.say).filter(Boolean).join(' ')
  const out = slides.map((x) => ({ kicker: '', line: '', sub: '', ...x }))
  return withEnd({ cta: 'Order your weekly lunch', foot: 'Delivered to your office or door', title: seller ? `Weekly lunch by ${seller}` : 'Weekly lunch', price: from ? `From ${from} a lunch` : '' }, finish(out, [item.cover_url, ...dishPics].filter(Boolean), `${voice} Order on zamarket dot shop.`,
    captionFor(item.title || item.name, from ? `From ${from} a lunch` : '', '', ['Homemade, cooked fresh for the day you booked', 'Order once for the whole week', 'Delivered to your office or door', ...(team.length ? [`Team orders: ${team[0].min}+ lunches ${team[0].pct}% off`] : []), ...(item.trial_first ? ['First time? Taste one lunch first'] : [])], link, ['#LusakaLunch', '#OfficeLunch', '#ZaMarket']), 24))
}

// The offer card (like the poster), how to book step by step on the booking
// page, and how to ask for another day. Marked "fixed": an AI-written lunch
// video keeps them too.
export function offerScenes(item, dishPics = []) {
  const o = item.offer || {}
  const cutoff = item.cutoff_hour || 18
  const team = cleanTiers(item.group_discounts)
  const week = o.week || []
  const from = item.from ? money(item.from, { whole: true }) : ''
  const windows = item.delivery_windows || []
  const when = o.window || (windows.length ? `${windows[0].split('–')[0]}–${windows[windows.length - 1].split('–')[1] || ''}`.replace(/–$/, '') : '')
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((l) => { const w = week.find((x) => x.label === l); return w ? { label: l, dish: w.dish } : { label: l, open: false } })
  const photos = [...new Set([...dishPics, item.cover_url].filter(Boolean))].slice(0, 3)
  const offer = { type: 'offer', fixed: true, slot: 'after', kicker: 'WEEKLY LUNCH OFFER', line: 'Your lunch, sorted for the week', week, pkgs: o.pkgs || [], next: !!o.next, photos, photo: photos[0] || null,
    say: o.pkgs?.length ? `Here is the offer. The full working week is ${money(o.pkgs[0].total, { whole: true })}, or choose your own days.` : 'Here is the offer: pick the full week, or just the days you want.' }
  // The real menu, day by day, each day with its own dish photo.
  const menuDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((l) => { const w = week.find((x) => x.label === l); return w ? { label: l, dish: w.dish || '', photo: w.photo || null } : { label: l, open: false } })
  const menuPhotos = [...new Set(menuDays.map((d) => d.photo).filter(Boolean))]
  const cooking = menuDays.filter((d) => d.open !== false && d.dish)
  const menu = cooking.length >= 2 ? { type: 'menu', fixed: true, slot: 'after', kicker: 'This week’s menu', line: 'Your week, sorted', week: menuDays.map((d) => ({ ...d, pi: d.photo ? menuPhotos.indexOf(d.photo) : -1 })), photos: menuPhotos, photo: null, sub: '',
    say: `Here is the week: ${cooking.slice(0, 3).map((d) => `${({ Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' })[d.label]}, ${d.dish}`).join('; ')}${cooking.length > 3 ? ', and more' : ''}.` } : null
  const route = { type: 'route', fixed: true, slot: 'after', kicker: 'Delivered to you', line: 'To your office or door', when, order: `${cutoff}:00 the day before`, area: String(item.delivery_area || '').replace(/\s+/g, ' ').slice(0, 140), photo: null, sub: '',
    say: `We bring it to your office or your door${when ? `, between ${when}` : ''}. Just order by ${cutoff} hundred hours the day before.` }
  // The opening: the first two seconds decide if people keep watching.
  //   food  (default) the best dish, full screen at once, the headline lands
  //         word by word: "Lunch at work, sorted for the week."
  //   busy  "Meetings. Deadlines. No time for lunch?", then the food rises in
  //   clock 12:30 on a ticking clock, then the food
  const hero = dishPics[0] || item.cover_url || null
  const priceLine = from ? `Homemade · delivered · from ${from}` : 'Homemade · delivered to your office'
  const openings = {
    food: { type: 'hookfood', fixed: true, slot: 'open', kicker: 'Weekly lunch', line: 'Lunch at work,', line2: 'sorted for the week.', sub: priceLine, photo: hero,
      say: 'Lunch at work, sorted for the whole week. Homemade, and brought to your office.' },
    busy: { type: 'hookbusy', fixed: true, slot: 'open', kicker: 'Weekly lunch', punch: ['Meetings.', 'Deadlines.', 'No time for lunch?'], line: 'Homemade lunch, brought to your office', sub: from ? `From ${from} a lunch` : '', photo: hero,
      say: 'Meetings. Deadlines. No time for a proper lunch? We bring a homemade lunch to your office, on the days you choose.' },
  }
  const clock = openings[item.opening] || (item.opening === 'clock' ? null : openings.food) || { type: 'clock', fixed: true, slot: 'open', kicker: 'Weekly lunch', ask: 'What’s for lunch today?', line: 'Your lunch, sorted for the week', sub: from ? `From ${from} a lunch` : '', photo: item.cover_url || dishPics[0] || null,
    say: 'Twelve thirty. What’s for lunch today? With ZaMarket, it is already sorted, for the whole week.' }
  const step = (n, how, line, sub, say, demo = {}) => ({ type: 'howto', fixed: true, slot: 'close', step: n, steps: 3, how, line, sub, say, demo, photo: null, kicker: '' })
  return [
    clock,
    ...(menu ? [menu] : []),
    route,
    offer,
    step(1, 'package', 'Choose your package', 'Full week, Mon to Thu, two weeks or your days', 'Booking takes a minute. Open the link and choose your package.', { pkgs: o.pkgs || [] }),
    step(2, 'days', 'Tap the days you want', team.length ? `Ordering for colleagues? ${team[0].min}+ get ${team[0].pct}% off` : 'Each day shows that day’s dish', 'Tap the days you want; each day shows what is cooking.', { days }),
    step(3, 'pay', 'Choose how you pay, and order', `Order by ${cutoff}:00 the day before`, 'Choose mobile money and place your order. We call you to confirm.', { total: o.pkgs?.[0]?.total || 0 }),
    { fixed: true, slot: 'close', kicker: 'Need another day?', line: 'Saturday or Sunday too? Send a request', sub: 'We reply on WhatsApp', photo: dishPics[0] || item.cover_url, say: 'Need lunch on Saturday, Sunday or another day? Send a request on the shop page, and we reply on WhatsApp.' },
  ]
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
  // Designed scenes, not random photos with words: the shop's real photos are
  // used as moving texture (a wall, the shop on a phone, the three sections),
  // and the message is told in big, bold words in the ZaMarket colours.
  const cars = item.cars || []; const products = item.products || []; const lunch = item.lunch || []
  const pool = [...new Set([...products, ...cars, ...lunch])]
  const wall = [...new Set([...products.slice(0, 6), ...cars.slice(0, 3), ...lunch.slice(0, 2), ...pool])].slice(0, 12)
  const shop = [...new Set([...products, ...pool])].slice(0, 8)
  const tiles = [products[0] && ['Shop', 'Products from local sellers', products[0]], cars[0] && ['Motors', 'Cars for sale · viewings arranged', cars[0]], lunch[0] && ['Weekly lunch', 'Homemade, to your office', lunch[0]]].filter(Boolean)
  const tileScene = (line, say) => ({ type: 'mcats', kicker: 'Everything in one place', line, tiles: tiles.map(([label, sub, photo]) => ({ label, sub, pi: tiles.findIndex((x) => x[2] === photo) })), photos: tiles.map((x) => x[2]), say })
  const slides = []
  let end; let caption; let endSay
  if (item.topic === 'affiliates') {
    slides.push({ type: 'mwall', photos: wall, kicker: 'ZaMarket affiliates', lines: ['Share products.', 'Earn commission.'], sub: 'On sales that complete', say: 'Share products from ZaMarket, and earn a commission on the sales you bring in.' })
    slides.push({ type: 'mbig', kicker: 'You don’t need', lines: ['A shop.', 'Stock.', 'Just your phone.'], say: 'You do not need a shop. You do not need stock. Just your phone.' })
    slides.push({ type: 'mphone', photos: shop, kicker: 'What you share', line: 'Real products from local sellers', say: 'You share real products and cars from sellers on ZaMarket.' })
    slides.push({ type: 'mbig', kicker: 'You are not alone', lines: ['Training', 'in our academy.'], sub: 'Ready-made posters and captions', say: 'Approved affiliates are trained in our academy, and get ready-made posters and captions to share.' })
    slides.push({ type: 'msteps', kicker: 'How it works', line: 'Three steps', items: [['Apply', 'Every application is reviewed'], ['Get trained', 'In the ZaMarket academy'], ['Share and earn', 'Commission when a sale completes']], say: 'Apply. Get trained. Then share, and earn when a sale you brought in is completed.' })
    end = { cta: 'Apply to be an affiliate', foot: 'Earnings depend on completed sales' }
    endSay = 'Apply on zamarket dot shop slash affiliates. The link is in the description.'
    caption = ['Earn with ZaMarket: become an affiliate', '✓ Share real products and cars from local sellers', '✓ Commission when a sale you brought in is completed', '✓ Training in our academy, ready-made posters and captions', '✓ No shop, no stock: just your phone', 'Earnings depend on completed sales and are not guaranteed. Applications are reviewed.', `Apply: ${link || 'https://zamarket.shop/affiliates'}`, '#ZaMarket #Zambia #Lusaka #EarnOnline'].join('\n')
  } else if (item.topic === 'sellers') {
    slides.push({ type: 'mwall', photos: wall, kicker: 'For businesses in Zambia', lines: ['Sell online', 'in Lusaka.'], sub: 'Your shop on ZaMarket', say: 'Run a business in Zambia? Sell online, on ZaMarket.' })
    slides.push({ type: 'mphone', photos: shop, kicker: 'Your own shop', line: 'Your products, on your own shop page', say: 'Your products get their own shop page, with photos, prices and ordering.' })
    slides.push({ type: 'mbig', kicker: 'More people see you', lines: ['Affiliates share', 'your products.'], say: 'Approved affiliates share your products with their own customers.' })
    slides.push({ type: 'mbig', kicker: 'Never miss one', lines: ['An alert for', 'every order.'], say: 'When an order comes in, you get an alert, so you can prepare it.' })
    slides.push({ type: 'msteps', kicker: 'How to start', line: 'Three steps', items: [['Apply', 'Every application is reviewed'], ['Add your products', 'Photos, prices, details'], ['Get orders', 'An alert for each one']], say: 'Apply, add your products, and get orders.' })
    end = { cta: 'Apply to sell on ZaMarket', foot: 'Applications are reviewed' }
    endSay = 'Apply on zamarket dot shop. The link is in the description.'
    caption = ['Sell on ZaMarket', '✓ Your products on your own shop page', '✓ Approved affiliates share your products', '✓ An alert for every order', 'Applications are reviewed.', `Apply: ${link || 'https://zamarket.shop/apply/vendor'}`, '#ZaMarket #Lusaka #SmallBusinessZambia #ShopLocal'].join('\n')
  } else {
    slides.push({ type: 'mwall', photos: wall, kicker: 'Online marketplace', lines: ['Lusaka’s marketplace,', 'in your pocket.'], sub: 'zamarket.shop', say: 'This is ZaMarket: Lusaka’s online marketplace, right in your pocket.' })
    if (tiles.length > 1) slides.push(tileScene('Shop, cars and lunch', `${tiles.map((x) => x[0] === 'Shop' ? 'shop from local sellers' : x[0] === 'Motors' ? 'find a car' : 'order your weekly lunch').join(', ')}, all in one place.`.replace(/^./, (c) => c.toUpperCase())))
    if (shop.length) slides.push({ type: 'mphone', photos: shop, kicker: 'Shop', line: 'Products from local sellers', say: 'Browse products from local sellers, with photos and prices.' })
    slides.push({ type: 'mbig', kicker: 'Simple', lines: ['Order online.', 'Delivered in Lusaka.'], say: 'Order online, and it is delivered in Lusaka.' })
    slides.push({ type: 'msteps', kicker: 'How it works', line: 'Three steps', items: [['Find it', 'On zamarket.shop'], ['Order', 'In a few taps'], ['Get it', 'Delivered in Lusaka']], say: 'Find it, order it, get it.' })
    end = { cta: 'Visit zamarket.shop', foot: [products.length && 'Shop', cars.length && 'Motors', lunch.length && 'Lunch'].filter(Boolean).join(' · ') }
    endSay = 'Visit zamarket dot shop. The link is in the description.'
    caption = ['ZaMarket: Lusaka’s online marketplace', products.length ? '✓ Products from local sellers, delivered in Lusaka' : '', cars.length ? '✓ Cars for sale on ZaMarket Motors' : '', lunch.length ? '✓ Weekly lunch to your office or door' : '', link || 'https://zamarket.shop', '#ZaMarket #Lusaka #Zambia #ShopLocal'].filter(Boolean).join('\n')
  }
  const out = slides.map((x) => ({ kicker: '', line: (x.lines || []).join(' ') || '', sub: '', ...x, photo: x.photo || x.photos?.[0] || null }))
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
  if (s.type === 'offer') return 'offer'
  if (['clock', 'menu', 'route', 'hookfood', 'hookbusy', 'mwall', 'mbig', 'mphone', 'mcats', 'msteps'].includes(s.type)) return s.type
  if (s.type === 'howto') return 'howto'
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
  if (look === 'offer') return drawOffer(ctx, s, Array.isArray(imgs[i]) ? imgs[i].filter(Boolean) : [], local)
  if (look === 'howto') return drawHowto(ctx, s, local)
  if (look === 'clock') return drawClock(ctx, s, img, local)
  if (look === 'hookfood') return drawHookFood(ctx, s, img, local)
  if (look === 'hookbusy') return drawHookBusy(ctx, s, img, local)
  if (look === 'mwall') return drawWall(ctx, s, Array.isArray(imgs[i]) ? imgs[i] : [], local)
  if (look === 'mbig') return drawBig(ctx, s, local)
  if (look === 'mphone') return drawShopPhone(ctx, s, Array.isArray(imgs[i]) ? imgs[i] : [], local)
  if (look === 'mcats') return drawTiles(ctx, s, Array.isArray(imgs[i]) ? imgs[i] : [], local)
  if (look === 'msteps') return drawSteps(ctx, s, local)
  if (look === 'menu') return drawMenu(ctx, s, Array.isArray(imgs[i]) ? imgs[i] : [], local)
  if (look === 'route') return drawRoute(ctx, s, local)
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
    const { lines, size } = fitText(ctx, s.line || s.kicker, W - 100 - 168 - 50, { from: (s.line || '').length > 26 ? 64 : 76, to: 42, lines: 3 })
    const lh = Math.round(size * 1.16)
    const bw = Math.min(W - 100, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 230)
    const bh = 70 + lines.length * lh + (s.sub ? 70 : 0)
    const bx = (W - bw) / 2; const by = H - 380 - bh
    ctx.translate(W / 2, by + bh / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-W / 2, -(by + bh / 2))
    ctx.fillStyle = 'rgba(14,16,19,.82)'; roundRect(ctx, bx, by, bw, bh, 44); ctx.fill()
    ctx.strokeStyle = '#8A6CFF'; ctx.lineWidth = 4; roundRect(ctx, bx, by, bw, bh, 44); ctx.stroke()
    // Tick in a circle
    ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(bx + 92, by + bh / 2, 46, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(bx + 70, by + bh / 2 + 2); ctx.lineTo(bx + 86, by + bh / 2 + 18); ctx.lineTo(bx + 116, by + bh / 2 - 16); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    const ty = by + 35 + lh / 2
    lines.forEach((l, j) => ctx.fillText(l, bx + 168, ty + j * lh))
    if (s.sub) { ctx.fillStyle = '#C9BCFF'; ctx.font = '800 46px Inter, Arial, sans-serif'; ctx.fillText(wrapText(ctx, s.sub, bw - 200)[0] || '', bx + 168, ty + lines.length * lh + 6) }
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

// ---- Marketplace videos: designed scenes in the ZaMarket colours ----------
// Words that land one by one with a little "pop", each line its own colour.
function popLines(ctx, rows, { x = 72, y, local, start = 0.25, from = 110, to = 64, align = 'left', gap = 0.11, lineGap = 0.14 }) {
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  let delay = start; let yy = y
  const lands = []
  for (const [text, colour] of rows) {
    const f = fitText(ctx, text, W - 144, { from, to, lines: 1 })
    for (const line of f.lines) {
      const width = ctx.measureText(line).width
      let xx = align === 'center' ? (W - width) / 2 : x
      lands.push(delay)
      for (const word of line.split(' ')) {
        const k = (local - delay) / 0.22
        const w = ctx.measureText(`${word} `).width
        if (k > 0) {
          const sc = 1 + 0.35 * Math.max(0, 1 - k) ** 2
          ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.translate(xx, yy); ctx.scale(sc, sc)
          ctx.fillStyle = colour; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20
          ctx.fillText(word, 0, 0); ctx.restore()
        }
        xx += w; delay += gap
      }
      yy += Math.round(f.size * 1.14)
    }
    delay += lineGap
  }
  ctx.restore()
  return { y: yy, done: delay, lands }
}

// A moving wall of the shop's real photos, three columns drifting in
// opposite directions, the headline big in the middle.
function drawWall(ctx, s, imgs, local) {
  ctx.fillStyle = '#0E1013'; ctx.fillRect(0, 0, W, H)
  const colW = 360; const tileH = 460; const g = 18
  if (imgs.length) {
    for (let c = 0; c < 3; c += 1) {
      const dir = c === 1 ? 1 : -1
      const off = ((local * 70 * dir) % (tileH + g) + (tileH + g)) % (tileH + g) - (c === 1 ? tileH * 0.5 : 0)
      for (let r = -1; r < 6; r += 1) {
        const img = imgs[(c * 5 + r + 7) % imgs.length]
        const x = -30 + c * (colW + g); const y = r * (tileH + g) + off
        ctx.save(); roundRect(ctx, x, y, colW, tileH, 30); ctx.clip(); fill(ctx, img, x, y, colW, tileH); ctx.restore()
      }
    }
  }
  const veil = ctx.createLinearGradient(0, 0, 0, H)
  veil.addColorStop(0, 'rgba(14,16,19,.55)'); veil.addColorStop(0.42, 'rgba(14,16,19,.86)'); veil.addColorStop(0.62, 'rgba(14,16,19,.9)'); veil.addColorStop(1, 'rgba(14,16,19,.6)')
  ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 900, 40, W / 2, 900, 700)
  glow.addColorStop(0, 'rgba(138,108,255,.35)'); glow.addColorStop(1, 'rgba(138,108,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  if (local < 0.18) { ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - local / 0.18)})`; ctx.fillRect(0, 0, W, H) }
  // The logo, big, popping in.
  const k = back(local / 0.45)
  if (k > 0) { ctx.save(); ctx.translate(W / 2, 560); ctx.scale(k, k); brandMark(ctx, -80, -80, 160); ctx.restore() }
  ctx.save(); ctx.globalAlpha = ease((local - 0.15) / 0.35); ctx.textAlign = 'center'; ctx.fillStyle = '#A892FF'; ctx.font = '800 40px Inter, Arial, sans-serif'
  ctx.fillText(String(s.kicker || '').toUpperCase(), W / 2, 760); ctx.restore()
  const lines = s.lines?.length ? s.lines : [s.line || '']
  const r = popLines(ctx, lines.map((t, i) => [t, i === lines.length - 1 ? '#A892FF' : '#fff']), { y: 900, local, start: 0.35, from: 104, to: 60, align: 'center' })
  if (s.sub) {
    const kk = back((local - r.done - 0.05) / 0.35)
    if (kk > 0) {
      ctx.save(); ctx.font = '700 40px Inter, Arial, sans-serif'
      const w = ctx.measureText(s.sub).width + 64
      ctx.translate(W / 2, r.y + 40); ctx.scale(kk, kk)
      ctx.fillStyle = 'rgba(14,16,19,.85)'; roundRect(ctx, -w / 2, 0, w, 84, 42); ctx.fill()
      ctx.strokeStyle = '#8A6CFF'; ctx.lineWidth = 4; roundRect(ctx, -w / 2, 0, w, 84, 42); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.sub, 0, 44)
      ctx.restore()
    }
  }
}

// Big statement: short lines landing one after another, the last in violet.
function drawBig(ctx, s, local) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#241E45'); g.addColorStop(0.55, '#15181C'); g.addColorStop(1, '#0E1013')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  // A slow violet light moving behind.
  const lx = W * (0.3 + 0.4 * Math.sin(local * 0.6)); const glow = ctx.createRadialGradient(lx, 760, 30, lx, 760, 640)
  glow.addColorStop(0, 'rgba(138,108,255,.28)'); glow.addColorStop(1, 'rgba(138,108,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = ease((local - 0.05) / 0.35); ctx.fillStyle = '#A892FF'; ctx.font = '800 42px Inter, Arial, sans-serif'; ctx.textAlign = 'left'
  ctx.fillText(String(s.kicker || '').toUpperCase(), 72, 660); ctx.restore()
  // A violet bar that grows under the kicker.
  ctx.fillStyle = '#8A6CFF'; roundRect(ctx, 72, 690, 140 * ease((local - 0.1) / 0.5), 10, 5); ctx.fill()
  const lines = s.lines?.length ? s.lines : [s.line || '']
  const r = popLines(ctx, lines.map((t, i) => [t, i === lines.length - 1 ? '#A892FF' : '#fff']), { y: 860, local, start: 0.25, from: 120, to: 64, gap: 0.08, lineGap: 0.32 })
  if (s.sub) { ctx.save(); ctx.globalAlpha = ease((local - r.done - 0.1) / 0.4); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '600 44px Inter, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(s.sub, 72, r.y + 50, W - 144); ctx.restore() }
}

// The shop on a phone: real product photos in a scrolling grid, a finger
// taps one.
function drawShopPhone(ctx, s, imgs, local) {
  scene(ctx)
  heading(ctx, s, local, 270)
  const P = { x: 150, y: 470, w: 780, h: 1330, r: 70 }
  const rise = ease(local / 0.5)
  ctx.save(); ctx.translate(0, (1 - rise) * 200); ctx.globalAlpha = rise
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50
  ctx.fillStyle = '#05060a'; roundRect(ctx, P.x, P.y, P.w, P.h, P.r); ctx.fill(); ctx.shadowColor = 'transparent'
  const sx = P.x + 22; const sy = P.y + 22; const sw = P.w - 44; const sh = P.h - 44
  ctx.save(); roundRect(ctx, sx, sy, sw, sh, P.r - 20); ctx.clip()
  ctx.fillStyle = '#0E1013'; ctx.fillRect(sx, sy, sw, sh)
  // The grid, scrolling up.
  const cw = (sw - 60) / 2; const ch = cw + 110
  const scroll = Math.max(0, local - 0.6) * 90
  for (let i = 0; i < 12; i += 1) {
    const col = i % 2; const row = Math.floor(i / 2)
    const x = sx + 20 + col * (cw + 20); const y = sy + 150 + row * (ch + 20) - scroll
    if (y > sy + sh || y + ch < sy) continue
    ctx.fillStyle = '#15181C'; roundRect(ctx, x, y, cw, ch, 22); ctx.fill()
    const img = imgs.length ? imgs[i % imgs.length] : null
    if (img) { ctx.save(); roundRect(ctx, x, y, cw, cw, 22); ctx.clip(); fill(ctx, img, x, y, cw, cw); ctx.restore() }
    ctx.fillStyle = 'rgba(255,255,255,.22)'; roundRect(ctx, x + 18, y + cw + 26, cw * 0.7, 18, 9); ctx.fill()
    ctx.fillStyle = 'rgba(168,146,255,.55)'; roundRect(ctx, x + 18, y + cw + 62, cw * 0.38, 18, 9); ctx.fill()
  }
  // The shop's bar on top.
  ctx.fillStyle = '#15181C'; ctx.fillRect(sx, sy, sw, 130)
  brandMark(ctx, sx + 30, sy + 40, 54)
  ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillStyle = '#A892FF'; ctx.fillText('Za', sx + 100, sy + 68); ctx.fillStyle = '#fff'; ctx.fillText('Market', sx + 100 + ctx.measureText('Za').width, sy + 68)
  ctx.restore()
  // A finger taps the first product.
  const tap = (local - 2.3) / 0.5
  if (tap > 0) {
    const fx = sx + 20 + cw * 0.55; const fy = sy + sh * 0.5
    const ring = Math.min(1, tap)
    ctx.strokeStyle = `rgba(168,146,255,${1 - ring})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(fx, fy, 30 + 70 * ring, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(fx, fy, 30, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// The sections of the marketplace as big photo cards sliding in.
function drawTiles(ctx, s, imgs, local) {
  scene(ctx)
  heading(ctx, s, local, 270)
  const tiles = (s.tiles || []).slice(0, 3)
  const top = 470; const h = Math.min(420, (1760 - top - (tiles.length - 1) * 30) / Math.max(1, tiles.length))
  tiles.forEach((t, j) => {
    const k = ease((local - 0.3 - j * 0.3) / 0.5)
    if (k <= 0) return
    const y = top + j * (h + 30)
    ctx.save(); ctx.globalAlpha = k; ctx.translate((1 - k) * (j % 2 ? -160 : 160), 0)
    ctx.save(); roundRect(ctx, 56, y, W - 112, h, 36); ctx.clip()
    const img = t.pi >= 0 ? imgs[t.pi] : null
    if (img) fill(ctx, img, 56, y, W - 112, h, 1.05 + 0.04 * Math.min(1, local / SLIDE)); else { ctx.fillStyle = '#241E45'; ctx.fillRect(56, y, W - 112, h) }
    const gr = ctx.createLinearGradient(0, y + h * 0.35, 0, y + h)
    gr.addColorStop(0, 'rgba(14,16,19,0)'); gr.addColorStop(1, 'rgba(14,16,19,.92)')
    ctx.fillStyle = gr; ctx.fillRect(56, y, W - 112, h)
    ctx.restore()
    ctx.strokeStyle = 'rgba(138,108,255,.6)'; ctx.lineWidth = 3; roundRect(ctx, 56, y, W - 112, h, 36); ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#fff'; ctx.font = '900 72px Inter, Arial, sans-serif'; ctx.fillText(t.label, 96, y + h - 92)
    ctx.fillStyle = '#C9BCFF'; ctx.font = '600 38px Inter, Arial, sans-serif'; ctx.fillText(t.sub, 96, y + h - 40, W - 192)
    ctx.restore()
  })
}

// Three steps, ticked off one by one down a violet line.
function drawSteps(ctx, s, local) {
  scene(ctx)
  heading(ctx, s, local, 330)
  const items = (s.items || []).slice(0, 3)
  const top = 640; const gapY = 330
  const lineK = ease((local - 0.4) / (0.5 + items.length * 0.35))
  ctx.strokeStyle = 'rgba(138,108,255,.5)'; ctx.lineWidth = 8
  ctx.beginPath(); ctx.moveTo(150, top + 70); ctx.lineTo(150, top + 70 + (items.length - 1) * gapY * lineK); ctx.stroke()
  items.forEach(([title, sub], j) => {
    const k = back((local - 0.35 - j * 0.45) / 0.4)
    if (k <= 0) return
    const y = top + j * gapY
    ctx.save(); ctx.translate(150, y + 70); ctx.scale(k, k)
    ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = '900 64px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(j + 1), 0, 4)
    ctx.restore()
    const t = ease((local - 0.45 - j * 0.45) / 0.4)
    ctx.save(); ctx.globalAlpha = t; ctx.translate((1 - t) * 60, 0); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    const f = fitText(ctx, title, W - 300, { from: 76, to: 48, lines: 1 })
    ctx.fillStyle = '#fff'; ctx.fillText(f.lines[0] || '', 260, y + 70)
    ctx.fillStyle = '#C9BCFF'; ctx.font = '600 40px Inter, Arial, sans-serif'; ctx.fillText(sub || '', 260, y + 135, W - 320)
    ctx.restore()
  })
}

// ---- Lunch: the 12:30 opening, the week menu, the delivery --------------------
function scene(ctx, top = '#241E45') {
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H)
  g.addColorStop(0, top); g.addColorStop(1, '#0E1013')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
}
function heading(ctx, s, local, y = 300) {
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  const k = ease((local - 0.05) / 0.45)
  ctx.globalAlpha = k
  ctx.fillStyle = '#A892FF'; ctx.font = '800 40px Inter, Arial, sans-serif'; ctx.fillText(String(s.kicker || '').toUpperCase(), 72 + (1 - k) * 40, y)
  const f = fitText(ctx, s.line || '', W - 144, { from: 76, to: 52, lines: 2 })
  ctx.fillStyle = '#fff'
  f.lines.forEach((l, j) => ctx.fillText(l, 72, y + 92 + j * Math.round(f.size * 1.18)))
  ctx.restore()
  return y + 92 + (f.lines.length - 1) * Math.round(f.size * 1.18)
}

// "12:30. What's for lunch today?" on a clock whose hands run to lunchtime,
// then the cover photo rises in: already sorted, for the week.
// Food first: the dish fills the screen from the first frame with a quick
// push-in, a flash of light, and the headline landing word by word, the
// second line in ZaMarket violet; then "homemade · delivered · from K…".
function drawHookFood(ctx, s, img, local) {
  const pop = (x) => { const k = Math.max(0, Math.min(1, x)); return 1 + 0.35 * (1 - k) * (1 - k) }
  if (img) {
    const z = local < 0.9 ? 1.2 - 0.14 * ease(local / 0.9) : 1.06 + 0.03 * Math.min(1, (local - 0.9) / SLIDE)
    fill(ctx, img, 0, 0, W, H, z)
  } else scene(ctx)
  const g = ctx.createLinearGradient(0, H * 0.38, 0, H)
  g.addColorStop(0, 'rgba(14,16,19,0)'); g.addColorStop(0.55, 'rgba(14,16,19,.78)'); g.addColorStop(1, 'rgba(14,16,19,.95)')
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.38, W, H * 0.62)
  if (local < 0.18) { ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - local / 0.18)})`; ctx.fillRect(0, 0, W, H) }
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  const k0 = ease((local - 0.15) / 0.35)
  ctx.globalAlpha = k0; ctx.fillStyle = '#A892FF'; ctx.font = '800 42px Inter, Arial, sans-serif'
  ctx.fillText(String(s.kicker || '').toUpperCase(), 72, 1150)
  ctx.globalAlpha = 1
  // The two headline lines, word by word.
  let delay = 0.3
  const rows = [[s.line || '', '#fff'], [s.line2 || '', '#A892FF']].filter(([t]) => t)
  let y = 1270
  for (const [text, colour] of rows) {
    const f = fitText(ctx, text, W - 144, { from: 104, to: 70, lines: 1 })
    for (const line of f.lines) {
      let x = 72
      for (const word of line.split(' ')) {
        const k = (local - delay) / 0.22
        const w = ctx.measureText(`${word} `).width
        if (k > 0) {
          const sc = pop(k)
          ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.translate(x, y); ctx.scale(sc, sc)
          ctx.fillStyle = colour; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18
          ctx.fillText(word, 0, 0); ctx.restore()
        }
        x += w; delay += 0.11
      }
      y += Math.round(f.size * 1.12)
    }
    delay += 0.12
  }
  // The pill: homemade · delivered · from K…
  if (s.sub) {
    const k = back((local - delay - 0.1) / 0.35)
    if (k > 0) {
      ctx.font = '700 40px Inter, Arial, sans-serif'
      const w = Math.min(W - 144, ctx.measureText(s.sub).width + 64)
      ctx.save(); ctx.translate(72, y + 20); ctx.scale(k, k)
      ctx.fillStyle = 'rgba(14,16,19,.82)'; roundRect(ctx, 0, 0, w, 84, 42); ctx.fill()
      ctx.strokeStyle = '#8A6CFF'; ctx.lineWidth = 4; roundRect(ctx, 0, 0, w, 84, 42); ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(s.sub, 32, 44, w - 64)
      ctx.restore()
    }
  }
  ctx.restore()
}

// Busy day: three short punches land one after another on a dark screen,
// then the food rises in with the answer.
function drawHookBusy(ctx, s, img, local) {
  scene(ctx)
  if (img) { ctx.save(); ctx.globalAlpha = 0.18; ctx.drawImage(backdrop(img), 0, 0, W, H); ctx.restore() }
  const T = clockSwitch()
  const punch = (s.punch || []).slice(0, 3)
  const gap = Math.min(0.55, (T - 0.4) / Math.max(1, punch.length))
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  punch.forEach((p, j) => {
    const at = 0.1 + j * gap
    const k = (local - at) / 0.2
    if (k <= 0) return
    const lastOne = j === punch.length - 1
    const newest = j === punch.filter((_, x) => local >= 0.1 + x * gap).length - 1
    const f = fitText(ctx, p, W - 140, { from: lastOne ? 96 : 120, to: 56, lines: 2 })
    const sc = 1 + 0.5 * Math.max(0, 1 - k) ** 2
    ctx.save(); ctx.translate(W / 2, 760 + j * 220); ctx.scale(sc, sc)
    ctx.globalAlpha = Math.min(1, k * 1.8) * (newest ? 1 : 0.45)
    ctx.fillStyle = lastOne ? '#A892FF' : '#fff'
    f.lines.forEach((l, i) => ctx.fillText(l, 0, i * Math.round(f.size * 1.1)))
    ctx.restore()
  })
  ctx.restore()
  if (local <= T) return
  const k = ease((local - T) / 0.5)
  ctx.save(); ctx.translate(0, (1 - k) * H)
  if (img) fill(ctx, img, 0, 0, W, H, 1.04 + 0.05 * Math.min(1, (local - T) / SLIDE))
  else scene(ctx, '#15181C')
  ctx.restore()
  if (k > 0.6) wordsBottom(ctx, s, local - T - 0.2, { bar: true })
}

function drawClock(ctx, s, img, local) {
  scene(ctx)
  if (img) { ctx.save(); ctx.globalAlpha = 0.2; ctx.drawImage(backdrop(img), 0, 0, W, H); ctx.restore() }
  const T = clockSwitch()
  const cx = W / 2; const cy = 760; const R = 270
  const run = ease(Math.min(1, local / (T * 0.75)))
  const mins = 40 + 50 * run // 11:40 → 12:30
  ctx.save()
  ctx.globalAlpha = ease(local / 0.3)
  ctx.fillStyle = 'rgba(21,24,28,.92)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#8A6CFF'; ctx.lineWidth = 12; ctx.stroke()
  for (let h = 0; h < 12; h += 1) {
    const a = h / 12 * Math.PI * 2; const r1 = h % 3 ? R - 40 : R - 58
    ctx.strokeStyle = h % 3 ? 'rgba(255,255,255,.45)' : '#fff'; ctx.lineWidth = h % 3 ? 6 : 10; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); ctx.lineTo(cx + Math.sin(a) * (R - 22), cy - Math.cos(a) * (R - 22)); ctx.stroke()
  }
  const hand = (turn, len, width, colour) => { const a = turn * Math.PI * 2; ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); ctx.stroke() }
  hand(((11 + mins / 60) % 12) / 12, R * 0.52, 18, '#fff')
  hand((mins % 60) / 60, R * 0.8, 10, '#A892FF')
  ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill()
  // The time, and the question.
  const hh = mins >= 60 ? 12 : 11; const mm = String(Math.floor(mins % 60)).padStart(2, '0')
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'; ctx.font = '900 150px Inter, Arial, sans-serif'; ctx.fillText(`${hh}:${mm}`, cx, cy + R + 200)
  const q = ease((local - T * 0.55) / 0.4)
  ctx.globalAlpha = q
  const f = fitText(ctx, s.ask || 'What’s for lunch today?', W - 160, { weight: 800, from: 68, to: 48, lines: 2 })
  ctx.fillStyle = '#C9BCFF'
  f.lines.forEach((l, j) => ctx.fillText(l, cx, cy + R + 320 + j * Math.round(f.size * 1.2)))
  ctx.restore()
  if (local <= T) return
  // Already sorted: the photo rises over the clock.
  const k = ease((local - T) / 0.55)
  ctx.save(); ctx.translate(0, (1 - k) * H)
  if (img) fill(ctx, img, 0, 0, W, H, 1.04 + 0.05 * Math.min(1, (local - T) / SLIDE))
  else scene(ctx, '#15181C')
  ctx.restore()
  if (k > 0.6) wordsBottom(ctx, s, local - T - 0.25, { bar: true })
}

// The week, day by day: each day's own dish, ticked in one after another.
function drawMenu(ctx, s, imgs, local) {
  scene(ctx)
  heading(ctx, s, local)
  const rows = (s.week || []).slice(0, 5)
  const top = 500; const rowH = 228; const gap = 20
  rows.forEach((d, j) => {
    const k = ease((local - 0.35 - j * 0.2) / 0.45)
    if (k <= 0) return
    const y = top + j * (rowH + gap)
    const open = d.open !== false && d.dish
    ctx.save(); ctx.globalAlpha = k * (open ? 1 : 0.42); ctx.translate((1 - k) * 90, 0)
    ctx.fillStyle = 'rgba(255,255,255,.06)'; roundRect(ctx, 56, y, W - 112, rowH, 34); ctx.fill()
    ctx.strokeStyle = open ? 'rgba(138,108,255,.45)' : 'rgba(255,255,255,.12)'; ctx.lineWidth = 3; roundRect(ctx, 56, y, W - 112, rowH, 34); ctx.stroke()
    // Day
    ctx.fillStyle = open ? '#8A6CFF' : 'rgba(255,255,255,.15)'; roundRect(ctx, 86, y + rowH / 2 - 40, 132, 80, 40); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = '900 38px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(String(d.label || '').toUpperCase(), 152, y + rowH / 2 + 2)
    // Dish photo
    const img = d.pi >= 0 ? imgs[d.pi] : null
    const px = 244; const ps = rowH - 40
    if (img) { ctx.save(); roundRect(ctx, px, y + 20, ps, ps, 26); ctx.clip(); fill(ctx, img, px, y + 20, ps, ps); ctx.restore() }
    else if (open) { ctx.fillStyle = 'rgba(138,108,255,.18)'; roundRect(ctx, px, y + 20, ps, ps, 26); ctx.fill() }
    // Dish name, whole
    const tx = img || open ? px + ps + 34 : px
    const tw = W - 56 - 40 - tx - (open ? 90 : 0)
    ctx.textAlign = 'left'
    const f = fitText(ctx, open ? d.dish : 'No lunch this day', tw, { weight: open ? 800 : 600, from: 44, to: 30, lines: 3 })
    ctx.fillStyle = open ? '#fff' : 'rgba(255,255,255,.75)'
    const lh = Math.round(f.size * 1.18)
    f.lines.forEach((l, i) => ctx.fillText(l, tx, y + rowH / 2 - ((f.lines.length - 1) * lh) / 2 + i * lh))
    // Tick
    if (open) {
      const t = back((local - 0.6 - j * 0.2) / 0.35)
      if (t > 0) {
        const cx = W - 56 - 70; const cy = y + rowH / 2
        ctx.save(); ctx.translate(cx, cy); ctx.scale(t, t)
        ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.beginPath(); ctx.moveTo(-14, 1); ctx.lineTo(-3, 12); ctx.lineTo(16, -10); ctx.stroke()
        ctx.restore()
      }
    }
    ctx.restore()
  })
}

// From the kitchen to your office: a lunch box travels the route, then the
// delivery time and the order-by time.
function drawRoute(ctx, s, local) {
  scene(ctx)
  heading(ctx, s, local)
  const y0 = 1010
  const A = { x: 220, y: y0 }; const B = { x: W - 220, y: y0 }; const C = { x: W / 2, y: y0 - 300 }
  const appear = ease((local - 0.2) / 0.4)
  ctx.save(); ctx.globalAlpha = appear
  // The road
  ctx.setLineDash([22, 22]); ctx.lineDashOffset = -local * 60
  ctx.strokeStyle = 'rgba(168,146,255,.65)'; ctx.lineWidth = 8; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(A.x + 60, A.y - 40); ctx.quadraticCurveTo(C.x, C.y, B.x - 60, B.y - 60); ctx.stroke()
  ctx.setLineDash([])
  // The kitchen: a small house
  ctx.fillStyle = '#15181C'; ctx.strokeStyle = '#A892FF'; ctx.lineWidth = 7; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(A.x - 110, A.y - 60); ctx.lineTo(A.x, A.y - 160); ctx.lineTo(A.x + 110, A.y - 60); ctx.lineTo(A.x + 110, A.y + 90); ctx.lineTo(A.x - 110, A.y + 90); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#8A6CFF'; roundRect(ctx, A.x - 32, A.y + 6, 64, 84, 10); ctx.fill()
  // The office: a tall building with windows
  const arrived = ease((local - 2.2) / 0.4)
  ctx.fillStyle = '#15181C'; roundRect(ctx, B.x - 110, B.y - 260, 220, 350, 14); ctx.fill(); ctx.stroke()
  for (let r = 0; r < 5; r += 1) for (let c = 0; c < 3; c += 1) {
    ctx.fillStyle = `rgba(168,146,255,${0.25 + 0.55 * arrived})`
    roundRect(ctx, B.x - 80 + c * 58, B.y - 230 + r * 60, 42, 38, 6); ctx.fill()
  }
  ctx.fillStyle = '#fff'; ctx.font = '700 36px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('Our kitchen', A.x, A.y + 150); ctx.fillText('Your office', B.x, B.y + 150)
  ctx.restore()
  // The lunch box on its way
  const m = ease((local - 0.5) / 1.7)
  if (m > 0) {
    const t = m; const x = (1 - t) * (1 - t) * (A.x + 60) + 2 * (1 - t) * t * C.x + t * t * (B.x - 60)
    const y = (1 - t) * (1 - t) * (A.y - 40) + 2 * (1 - t) * t * C.y + t * t * (B.y - 60)
    const bob = Math.sin(local * 9) * 6 * (1 - arrived)
    ctx.save(); ctx.translate(x, y - 50 + bob)
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10
    ctx.fillStyle = '#8A6CFF'; roundRect(ctx, -70, -48, 140, 96, 20); ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#A892FF'; roundRect(ctx, -76, -56, 152, 26, 12); ctx.fill()
    brandMark(ctx, -24, -20, 48)
    ctx.restore()
  }
  // When it comes, and when to order.
  const cards = [['Delivered', s.when || 'At lunchtime'], ['Order by', s.order || '18:00 the day before']]
  cards.forEach(([label, value], j) => {
    const k = ease((local - 1.2 - j * 0.25) / 0.45)
    if (k <= 0) return
    const x = 56 + j * ((W - 112) / 2 + 10); const w = (W - 112) / 2 - 10; const y = 1300
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 40)
    ctx.fillStyle = 'rgba(255,255,255,.07)'; roundRect(ctx, x, y, w, 200, 30); ctx.fill()
    ctx.strokeStyle = 'rgba(138,108,255,.45)'; ctx.lineWidth = 3; roundRect(ctx, x, y, w, 200, 30); ctx.stroke()
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#A892FF'; ctx.font = '800 32px Inter, Arial, sans-serif'; ctx.fillText(label.toUpperCase(), x + 34, y + 62)
    const f = fitText(ctx, value, w - 68, { from: 54, to: 32, lines: 2 })
    ctx.fillStyle = '#fff'
    f.lines.forEach((l, i) => ctx.fillText(l, x + 34, y + 128 + i * Math.round(f.size * 1.15)))
    ctx.restore()
  })
  if (s.area) {
    const k = ease((local - 1.8) / 0.5)
    ctx.save(); ctx.globalAlpha = k * 0.85; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    const f = fitText(ctx, s.area, W - 144, { weight: 600, from: 38, to: 28, lines: 3 })
    ctx.fillStyle = '#fff'
    f.lines.forEach((l, i) => ctx.fillText(l, 72, 1590 + i * Math.round(f.size * 1.3)))
    ctx.restore()
  }
}

// ---- The weekly lunch offer card (like the poster) ---------------------------
function drawOffer(ctx, s, photos, local) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H)
  g.addColorStop(0, '#15181C'); g.addColorStop(1, '#241E45')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 10, W * 0.85, H * 0.1, W * 0.8)
  glow.addColorStop(0, 'rgba(138,108,255,.35)'); glow.addColorStop(1, 'rgba(138,108,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  const pad = 64
  const t = (d) => ease((local - d) / 0.45)
  // Tag
  ctx.save(); ctx.globalAlpha = t(0.05); ctx.font = '800 30px Inter, Arial, sans-serif'; ctx.textBaseline = 'middle'
  const tag = s.kicker || 'WEEKLY LUNCH OFFER'
  const tw = ctx.measureText(tag).width + 44
  ctx.fillStyle = '#8A6CFF'; roundRect(ctx, W - pad - tw, 196, tw, 56, 28); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(tag, W - pad - tw + 22, 225); ctx.restore()
  // Dish photos
  let y = 290
  const ph = 520
  if (photos.length) {
    const gap = 14; const W2 = W - pad * 2; const n = Math.min(photos.length, 3)
    const cells = n === 1 ? [[0, 0, 1, 1]] : n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]
    cells.forEach(([cx, cy, cw, chh], k) => {
      const a = t(0.1 + k * 0.12); if (!a) return
      const x = pad + cx * W2 + (cx ? gap / 2 : 0); const yy = y + cy * ph + (cy ? gap / 2 : 0)
      const w = cw * W2 - (cw < 1 ? gap / 2 : 0); const h = chh * ph - (chh < 1 ? gap / 2 : 0)
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 40); roundRect(ctx, x, yy, w, h, 28); ctx.clip()
      fill(ctx, photos[k], x, yy, w, h, 1.04 + 0.05 * (local / SLIDE)); ctx.restore()
    })
    y += ph + 50
  }
  // Headline
  ctx.save(); ctx.globalAlpha = t(0.3); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'
  ctx.font = '900 74px Inter, Arial, sans-serif'
  wrapText(ctx, s.line || 'Your lunch, sorted for the week', W - pad * 2).slice(0, 2).forEach((l, k) => ctx.fillText(l, pad, y + 60 + k * 84))
  ctx.restore()
  y += 220
  // This week's menu
  const rows = (s.week || []).slice(0, 3)
  if (rows.length) {
    const a = t(0.5)
    const boxH = 70 + rows.length * 66
    ctx.save(); ctx.globalAlpha = a
    ctx.fillStyle = 'rgba(255,255,255,.07)'; roundRect(ctx, pad, y, W - pad * 2, boxH, 28); ctx.fill()
    ctx.font = '800 28px Inter, Arial, sans-serif'; ctx.fillStyle = '#A892FF'; ctx.fillText(s.next ? 'NEXT WEEK’S MENU' : 'THIS WEEK’S MENU', pad + 30, y + 48)
    rows.forEach((r, k) => {
      const ry = y + 104 + k * 66
      ctx.font = '800 36px Inter, Arial, sans-serif'; ctx.fillStyle = '#A892FF'; ctx.fillText(r.label, pad + 30, ry)
      ctx.font = '600 36px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'
      ctx.fillText(wrapText(ctx, r.dish, W - pad * 2 - 190)[0] || '', pad + 130, ry)
    })
    ctx.restore()
    y += boxH + 30
  }
  // Packages
  const pk = (s.pkgs || []).slice(0, 3)
  if (pk.length) {
    const gap = 14; const cw = (W - pad * 2 - gap * (pk.length - 1)) / pk.length; const chH = 160
    pk.forEach((p, k) => {
      const a = back((local - 0.7 - k * 0.12) / 0.5); if (a <= 0) return
      const x = pad + k * (cw + gap)
      ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.translate(x + cw / 2, y + chH / 2); ctx.scale(0.85 + 0.15 * a, 0.85 + 0.15 * a); ctx.translate(-(x + cw / 2), -(y + chH / 2))
      ctx.fillStyle = k === 0 ? 'rgba(138,108,255,.22)' : 'rgba(255,255,255,.07)'; roundRect(ctx, x, y, cw, chH, 26); ctx.fill()
      ctx.strokeStyle = k === 0 ? '#8A6CFF' : 'rgba(255,255,255,.16)'; ctx.lineWidth = 3; roundRect(ctx, x, y, cw, chH, 26); ctx.stroke()
      ctx.textAlign = 'left'; ctx.font = '700 28px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(p.title, x + 22, y + 46)
      ctx.font = '900 50px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(money(p.total, { whole: true }), x + 22, y + 106)
      ctx.font = '700 24px Inter, Arial, sans-serif'; ctx.fillStyle = p.saving ? '#A892FF' : 'rgba(255,255,255,.6)'
      ctx.fillText(p.saving ? `Save ${money(p.saving, { whole: true })}` : `${p.days} lunch${p.days === 1 ? '' : 'es'}`, x + 22, y + 142)
      ctx.restore()
    })
    y += chH + 40
    ctx.save(); ctx.globalAlpha = t(1.1); ctx.font = '600 36px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.textAlign = 'left'; ctx.fillText('Or choose your own days.', pad, y + 10); ctx.restore()
  }
}

// ---- How to book: the booking page on a phone, a finger showing each tap ----
// Drawn like the real page (same choices, same words, the plan's real prices
// and days), one step per scene.
const PHONE = { x: 60, y: 450, w: 960, h: 1290, r: 76 }
const ZOOM = 1.3
function tapAt(ctx, x, y, local, at, from) {
  // The finger glides to (x, y), presses at `at` seconds, ripples.
  const k = ease((local - (at - 0.55)) / 0.5)
  const fx = from[0] + (x - from[0]) * k; const fy = from[1] + (y - from[1]) * k
  const press = local >= at && local < at + 0.18
  const ripple = (local - at) / 0.6
  if (ripple > 0 && ripple < 1) {
    ctx.save(); ctx.globalAlpha = 1 - ripple; ctx.strokeStyle = '#A892FF'; ctx.lineWidth = 6
    ctx.beginPath(); ctx.arc(x, y, 30 + ripple * 70, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(fx, fy, press ? 30 : 38, 0, Math.PI * 2); ctx.fill()
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#8A6CFF'; ctx.lineWidth = 6; ctx.stroke()
  ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(fx, fy, 10, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  return local >= at
}
function chip(ctx, x, y, w, h, on, r = 22) {
  ctx.fillStyle = on ? 'rgba(138,108,255,.28)' : 'rgba(255,255,255,.06)'; roundRect(ctx, x, y, w, h, r); ctx.fill()
  ctx.strokeStyle = on ? '#8A6CFF' : 'rgba(255,255,255,.16)'; ctx.lineWidth = on ? 4 : 2; roundRect(ctx, x, y, w, h, r); ctx.stroke()
}
function drawHowto(ctx, s, local) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#241E45'); g.addColorStop(1, '#0E1013')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const steps = s.steps || 5
  // Step heading above the phone
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  const a = ease(local / 0.4)
  ctx.globalAlpha = a
  ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(110, 300, 46, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = '900 52px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(s.step), 110, 318)
  ctx.textAlign = 'left'; ctx.font = '800 30px Inter, Arial, sans-serif'; ctx.fillStyle = '#A892FF'; ctx.fillText(`HOW TO BOOK · STEP ${s.step} OF ${steps}`, 180, 282)
  { const f = fitText(ctx, s.line || '', W - 240, { from: 58, to: 36, lines: 1 }); ctx.fillStyle = '#fff'; ctx.fillText(f.lines[0] || '', 180, 345) }
  if (s.sub) { ctx.font = '600 34px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(wrapText(ctx, s.sub, W - 240)[0] || '', 180, 400) }
  ctx.restore()
  // The phone
  const P = PHONE
  const rise = ease((local - 0.05) / 0.5)
  ctx.save(); ctx.translate(0, (1 - rise) * 160); ctx.globalAlpha = rise
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30
  ctx.fillStyle = '#05060a'; roundRect(ctx, P.x, P.y, P.w, P.h + 200, P.r); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.save(); roundRect(ctx, P.x + 22, P.y + 22, P.w - 44, P.h + 200, P.r - 20); ctx.clip()
  ctx.fillStyle = '#0E1013'; ctx.fillRect(P.x + 22, P.y + 22, P.w - 44, P.h + 200)
  // The screen is drawn larger than life, so every word reads on a phone.
  ctx.translate(P.x + 22, P.y + 22); ctx.scale(ZOOM, ZOOM)
  const sx = 0; const sy = 0; const sw = (P.w - 44) / ZOOM
  // Site bar
  ctx.fillStyle = '#15181C'; ctx.fillRect(sx, sy, sw, 110)
  brandMark(ctx, sx + 30, sy + 30, 50)
  ctx.font = '800 36px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText('ZaMarket', sx + 92, sy + 56)
  ctx.font = '600 24px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText('Weekly lunch', sx + sw - 180, sy + 56)
  ctx.textBaseline = 'alphabetic'
  const cx = sx + 34; const cw = sw - 68; let y = sy + 170
  const d = s.demo || {}
  const T1 = SLIDE * 0.42; const T2 = SLIDE * 0.68
  const start = [sx + sw * 0.8, sy + P.h / ZOOM]
  if (s.how === 'package') {
    ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Choose your lunch package', cx, y); y += 50
    const list = [
      ['Full working week', 'Monday to Friday', d.pkgs?.[0]],
      ['Monday to Thursday', 'Four days, Friday off', d.pkgs?.find((p) => /Thu/.test(p.title))],
      ['Two weeks', 'Monday to Friday, both weeks', d.pkgs?.find((p) => /Two/.test(p.title))],
      ['Choose my days', 'Any days you like', null],
    ]
    let target = null
    list.forEach(([t1, t2, p], k) => {
      const yy = y + k * 150
      const on = k === 0 && local >= T1
      chip(ctx, cx, yy, cw, 128, on, 26)
      ctx.strokeStyle = on ? '#8A6CFF' : 'rgba(255,255,255,.4)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx + 50, yy + 64, 18, 0, Math.PI * 2); ctx.stroke()
      if (on) { ctx.fillStyle = '#8A6CFF'; ctx.beginPath(); ctx.arc(cx + 50, yy + 64, 10, 0, Math.PI * 2); ctx.fill() }
      ctx.font = '800 36px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(t1, cx + 96, yy + 56)
      ctx.font = '600 26px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(t2, cx + 96, yy + 96)
      if (p) { ctx.textAlign = 'right'; ctx.font = '900 38px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(money(p.total, { whole: true }), cx + cw - 30, yy + 76); ctx.textAlign = 'left' }
      if (k === 0) target = [cx + cw * 0.45, yy + 64]
    })
    tapAt(ctx, target[0], target[1], local, T1, start)
  } else if (s.how === 'days') {
    ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Tap a day to add or remove it', cx, y); y += 40
    const days = (d.days && d.days.length ? d.days : [{ label: 'Mon' }, { label: 'Tue' }, { label: 'Wed' }, { label: 'Thu' }, { label: 'Fri' }]).slice(0, 5)
    const gw = 14; const dw = (cw - gw * 4) / 5; const dh = 270
    const tapA = days.findIndex((x) => x.open !== false)
    days.forEach((x, k) => {
      const xx = cx + k * (dw + gw)
      const open = x.open !== false
      // All open days start ticked; the finger takes one off, then puts it back.
      const on = open && !(k === tapA && local >= T1 && local < T2)
      chip(ctx, xx, y, dw, dh, on, 22)
      ctx.globalAlpha = open ? 1 : 0.35
      ctx.textAlign = 'center'; ctx.font = '800 26px Inter, Arial, sans-serif'; ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,.7)'; ctx.fillText(x.label.toUpperCase(), xx + dw / 2, y + 50)
      ctx.font = '900 34px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(open ? (on ? '✓' : 'Add') : 'Closed', xx + dw / 2, y + 120)
      if (open && x.dish) { ctx.font = '600 20px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)'; wrapText(ctx, x.dish, dw - 16).slice(0, 3).forEach((l, j) => ctx.fillText(l, xx + dw / 2, y + 175 + j * 26)) }
      ctx.globalAlpha = 1; ctx.textAlign = 'left'
    })
    if (tapA >= 0) { const tx = cx + tapA * (dw + gw) + dw / 2; tapAt(ctx, tx, y + 130, local, T1, start); if (local >= T1 + 0.2) tapAt(ctx, tx, y + 130, local, T2, [tx, y + 130]) }
    y += dh + 70
    ctx.font = '600 30px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; wrapText(ctx, 'Each day shows that day’s dish. Closed days cannot be booked here.', cw).slice(0, 2).forEach((l, j) => ctx.fillText(l, cx, y + j * 40))
  } else if (s.how === 'count') {
    ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('How many lunches each day?', cx, y); y += 50
    const n = local >= T2 ? 3 : local >= T1 ? 2 : 1
    chip(ctx, cx, y, cw, 170, false, 26)
    ctx.font = '800 36px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Lunches each day', cx + 30, y + 70)
    ctx.font = '600 26px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText('For colleagues too?', cx + 30, y + 112)
    const bx = cx + cw - 300
    ;[['−', bx], ['+', bx + 200]].forEach(([c, x]) => { ctx.fillStyle = 'rgba(255,255,255,.1)'; roundRect(ctx, x, y + 45, 90, 80, 20); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '800 44px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(c, x + 45, y + 100); ctx.textAlign = 'left' })
    ctx.font = '900 48px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(String(n), bx + 145, y + 102); ctx.textAlign = 'left'
    tapAt(ctx, bx + 245, y + 85, local, T1, start); if (local >= T1 + 0.2) tapAt(ctx, bx + 245, y + 85, local, T2, [bx + 245, y + 85])
    y += 220
    if (d.team) {
      const k = ease((local - T2) / 0.4)
      if (k > 0) { ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = 'rgba(52,211,153,.12)'; roundRect(ctx, cx, y, cw, 150, 24); ctx.fill(); ctx.font = '800 34px Inter, Arial, sans-serif'; ctx.fillStyle = '#34d399'; ctx.fillText('Ordering for your team?', cx + 30, y + 62); ctx.font = '600 30px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(d.team, cx + 30, y + 110); ctx.restore() }
    }
  } else if (s.how === 'details') {
    ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Where should we bring it?', cx, y); y += 40
    const half = (cw - 14) / 2
    chip(ctx, cx, y, half, 96, local >= T1 * 0.7, 20); chip(ctx, cx + half + 14, y, half, 96, false, 20)
    ctx.textAlign = 'center'; ctx.font = '800 34px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('Office', cx + half / 2, y + 60); ctx.fillText('Home', cx + half * 1.5 + 14, y + 60); ctx.textAlign = 'left'
    tapAt(ctx, cx + half / 2, y + 48, local, T1 * 0.7, start)
    y += 140
    const fields = [['Company or building', d.place || 'Your office building'], ['Landmark', d.landmark || 'Next to the main gate'], ['Your phone', '097• ••• •••']]
    fields.forEach(([label, value], k) => {
      const yy = y + k * 150
      ctx.font = '700 26px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(label, cx, yy)
      chip(ctx, cx, yy + 16, cw, 86, false, 18)
      const typed = Math.max(0, Math.min(1, (local - T1 - k * 0.35) / 0.6))
      ctx.font = '600 32px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(value.slice(0, Math.round(value.length * typed)), cx + 24, yy + 70)
    })
  } else {
    ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('How will you pay?', cx, y); y += 40
    const m = ['MTN MoMo', 'Airtel Money', 'Zamtel Kwacha']
    const third = (cw - 28) / 3
    m.forEach((l, k) => { chip(ctx, cx + k * (third + 14), y, third, 96, k === 0 && local >= T1 * 0.8, 20); ctx.textAlign = 'center'; ctx.font = '800 26px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(l, cx + k * (third + 14) + third / 2, y + 58); ctx.textAlign = 'left' })
    tapAt(ctx, cx + third / 2, y + 48, local, T1 * 0.8, start)
    y += 150
    if (d.total) { ctx.font = '700 32px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('Total for the week', cx, y + 30); ctx.textAlign = 'right'; ctx.font = '900 44px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(money(d.total, { whole: true }), cx + cw, y + 34); ctx.textAlign = 'left'; y += 80 }
    const done = local >= T2 + 0.2
    ctx.fillStyle = done ? '#34d399' : '#8A6CFF'; roundRect(ctx, cx, y, cw, 110, 55); ctx.fill()
    ctx.textAlign = 'center'; ctx.font = '900 40px Inter, Arial, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(done ? '✓ Order placed' : 'Place my order', cx + cw / 2, y + 70); ctx.textAlign = 'left'
    tapAt(ctx, cx + cw / 2, y + 55, local, T2, [cx + third / 2, y - 100])
    if (done) { const k = ease((local - T2 - 0.2) / 0.4); ctx.save(); ctx.globalAlpha = k; ctx.font = '600 32px Inter, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; wrapText(ctx, 'We call you to confirm. Your lunch arrives on each day you chose.', cw).slice(0, 2).forEach((l, j) => ctx.fillText(l, cx, y + 170 + j * 42)); ctx.restore() }
  }
  ctx.restore()
  ctx.restore()
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
  const { lines, size } = fitText(ctx, s.line || '', W - 144, { from: plain ? 84 : 80, to: 50, lines: 3 })
  const lh = Math.round(size * 1.22)
  lines.forEach((l, j) => {
    const r = ease((local - 0.2 - j * 0.1) / 0.5)
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - size * 1.12, W, lh + 14); ctx.clip()
    ctx.fillStyle = '#fff'; ctx.fillText(l, 72, y + (1 - r) * lh)
    ctx.restore(); y += lh
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
  const fitted = fitText(ctx, s.line || '', W - 144, { from: 80, to: 50, lines: 3 })
  const y = H - 300 - fitted.lines.length * Math.round(fitted.size * 1.22) - (s.sub ? 70 : 0)
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
    const first = imgs?.[0]
    drawEnd(ctx, t - total, end, Array.isArray(first) ? first[0] || null : first || null)
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
  if (s.note) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 32px Inter, Arial, sans-serif'; ctx.fillText(s.note, 110, top + 140) }
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

function drawEnd(ctx, t, end, hero = null) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#241E45'); g.addColorStop(1, '#0E1013')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const a = Math.min(1, t / 0.4)
  ctx.save(); ctx.globalAlpha = a
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const link = end.link || 'zamarket.shop'
  const cut = link.indexOf('/')
  const site = cut > 0 ? link.slice(0, cut) : link
  const rest = cut > 0 ? link.slice(cut) : ''
  if (hero) {
    // The closing shot: the best photo once more, fading into the dark, with
    // the name and the price on it, then where to find it.
    const PH = 1000
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, PH); ctx.clip()
    fill(ctx, hero, 0, 0, W, PH, 1.03 + 0.04 * Math.min(1, t / 6))
    ctx.restore()
    const fade = ctx.createLinearGradient(0, 420, 0, PH)
    fade.addColorStop(0, 'rgba(14,16,19,0)'); fade.addColorStop(0.7, 'rgba(14,16,19,.82)'); fade.addColorStop(1, '#0E1013')
    ctx.fillStyle = fade; ctx.fillRect(0, 420, W, PH - 420)
    ctx.fillStyle = '#0E1013'; ctx.fillRect(0, PH, W, H - PH)
    const top = ctx.createLinearGradient(0, 0, 0, 260)
    top.addColorStop(0, 'rgba(14,16,19,.55)'); top.addColorStop(1, 'rgba(14,16,19,0)')
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, 260)
    // Logo and name, as on every scene.
    ctx.textAlign = 'left'; ctx.font = '900 52px Inter, Arial, sans-serif'
    const za = ctx.measureText('Za').width; const bw = ctx.measureText('ZaMarket').width
    ctx.fillStyle = 'rgba(14,16,19,.6)'; roundRect(ctx, 48, 70, bw + 160, 84, 42); ctx.fill()
    brandMark(ctx, 70, 82, 60)
    ctx.fillStyle = '#A892FF'; ctx.fillText('Za', 146, 113)
    ctx.fillStyle = '#fff'; ctx.fillText('Market', 146 + za, 113)
    ctx.textAlign = 'center'
    if (end.title) {
      let size = 66
      do { ctx.font = `900 ${size}px Inter, Arial, sans-serif`; size -= 2 } while (size > 44 && ctx.measureText(end.title).width > W - 120)
      const tl = wrapText(ctx, end.title, W - 120).slice(0, 2)
      tl.forEach((l, i) => { ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, (end.price ? 790 : 860) - (tl.length - 1 - i) * (size + 12)) })
    }
    if (end.price) {
      let size = 96
      do { ctx.font = `900 ${size}px Inter, Arial, sans-serif`; size -= 4 } while (size > 52 && ctx.measureText(end.price).width > W - 120)
      ctx.fillStyle = '#A892FF'; ctx.fillText(end.price, W / 2, 900)
    }
    ctx.fillStyle = '#C9BCFF'; ctx.font = '700 46px Inter, Arial, sans-serif'
    ctx.fillText(wrapText(ctx, end.cta || 'See it on ZaMarket', W - 140)[0], W / 2, 1010)
    if (end.qr) { ctx.fillStyle = '#fff'; roundRect(ctx, W / 2 - 190, 1075, 380, 380, 34); ctx.fill(); ctx.drawImage(end.qr, W / 2 - 162, 1103, 324, 324) }
    const y0 = end.qr ? 1540 : 1180
    ctx.fillStyle = '#fff'; ctx.font = '900 68px Inter, Arial, sans-serif'; ctx.fillText(site, W / 2, y0)
    let y = y0 + 78
    if (rest) {
      const lines = fitLink(ctx, rest, W - 120)
      ctx.fillStyle = '#C9BCFF'
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * (lines.size + 12)))
      y += lines.length * (lines.size + 12) + 20
    }
    ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '600 38px Inter, Arial, sans-serif'
    ctx.fillText(end.foot || 'Delivered in Lusaka', W / 2, Math.min(y + 10, 1800))
    ctx.restore(); ctx.textAlign = 'left'
    return
  }
  // Logo and name
  brandMark(ctx, W / 2 - 90, 190, 180)
  ctx.fillStyle = '#fff'; ctx.font = '900 92px Inter, Arial, sans-serif'; ctx.fillText('ZaMarket', W / 2, 450)
  ctx.fillStyle = '#A892FF'; ctx.font = '700 48px Inter, Arial, sans-serif'
  wrapText(ctx, end.cta || 'See it on ZaMarket', W - 140).slice(0, end.price ? 1 : 2).forEach((l, i) => ctx.fillText(l, W / 2, 550 + i * 60))
  if (end.price) { ctx.fillStyle = '#fff'; ctx.font = '900 54px Inter, Arial, sans-serif'; ctx.fillText(end.price, W / 2, 620) }
  if (end.qr) { ctx.fillStyle = '#fff'; roundRect(ctx, W / 2 - 250, 680, 500, 500, 40); ctx.fill(); ctx.drawImage(end.qr, W / 2 - 215, 715, 430, 430) }
  // The link, big enough to read and type: the address on its own line, the
  // rest broken at / and - so it never runs off the screen.
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

// The words of a scene at the largest size that shows ALL of them in the
// lines given; never cut off mid-sentence.
function fitText(ctx, text, maxW, { weight = 900, from = 80, to = 48, lines: most = 3 } = {}) {
  let size = from; let lines = []
  for (; size >= to; size -= 4) {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`
    lines = wrapText(ctx, text, maxW)
    if (lines.length <= most) return { lines, size }
  }
  size = to; ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`
  return { lines: wrapText(ctx, text, maxW), size }
}

// A selling point short enough to read in a glance, and always a complete
// phrase: a long one is cut where its first part ends (before "and", a dash,
// a comma…), never in the middle ("…and adds extra").
export function shortLine(x, max = 70) {
  const t = String(x || '').replace(/^[\s\u2022*\u00b7\u2013\u2014-]+/, '').replace(/\s+/g, ' ').trim().replace(/[\s.!;:,]+$/, '')
  if (t.length <= max) return t
  const cuts = [/\s+[–—-]\s+/g, /:\s+/g, /;\s+/g, /\s+\(/g, /,\s+(?=(?:and|which|so|while|making|perfect|ideal|great|so that)\b)/gi, /\s+(?=(?:and|which|that|so|while|making|so that|with|for)\s)/gi, /,\s+/g]
  // The longest complete first part that fits.
  let best = -1
  for (const re of cuts) for (const m of t.matchAll(re)) if (m.index >= 18 && m.index <= max && m.index > best) best = m.index
  return best > 0 ? t.slice(0, best).replace(/[\s,;:]+$/, '') : t
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

// The picture(s) a scene draws: one photo, or a list (grid, offer card, the
// week menu, which keeps its places so each day keeps its own dish).
export function sceneImages(x, get) {
  if (x.type === 'menu' || x.type === 'mcats') return (x.photos || []).map((u) => get(u) || null)
  if (x.type === 'mwall' || x.type === 'mphone') return (x.photos || []).map(get).filter(Boolean)
  if (x.type === 'collage' || x.type === 'offer') return (x.photos || []).map(get).filter(Boolean)
  return get(x.photo) || null
}

export async function prepare(script, link) {
  const cache = new Map()
  await loadPhotos(script.slides.flatMap((x) => [x.photo, ...(x.photos || [])]), cache)
  const imgs = script.slides.map((x) => sceneImages(x, (u) => cache.get(u)))
  const qr = link ? await qrImage(link, '#0E1013', '#ffffff') : null
  return { imgs, end: { qr, ...endText(script, link) } }
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
// When the clock opening hands over to the photo, and the scene length now.
export const clockSwitch = () => Math.min(2, SLIDE * 0.5)
export const sceneSeconds = () => SLIDE

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
  let mic = null; let raw = null; let shaped = null
  if (voice) { raw = await openMic(); shaped = liveStudio(raw); mic = shaped.stream }
  // 3, 2, 1 before anything is recorded, with the first scene on screen.
  if (countdown) {
    show((() => { const c = document.createElement('canvas'); c.width = W; c.height = H; drawFrame(c.getContext('2d'), 0.6, script.slides, assets.imgs, assets.end); return c })())
    try { await countdown() } catch (e) { raw?.getTracks().forEach((t) => t.stop()); shaped?.stop(); throw e }
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
    raw?.getTracks().forEach((t) => t.stop()); shaped?.stop()
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
    for (const p of (item.benefits || []).filter(Boolean)) blocks.push({ id: `b-${p}`, label: shortLine(p), feature: true, scene: { kicker: '', line: shortLine(p), say: `${String(p).replace(/^[\s\u2022*\u00b7\u2013\u2014-]+/, '').replace(/[.!]+$/, '')}.` } })
  }
  blocks.push({ id: 'words', label: 'My own words', scene: { kicker: '', line: '', sub: '', say: '' } })
  // The starting point is the full automatic video. A feature scene is marked
  // so you can check its photo really shows it.
  const feats = new Set(blocks.filter((b) => b.feature).map((b) => b.scene.line))
  const starter = base.slides.map((sc) => ({ id: sceneId(), photo: sc.photo || null, ...clean(sc), ...(feats.has(sc.line) ? { feature: true } : {}) }))
  return { photos, blocks, starter, end: base.end, caption: base.caption, endSay: base.endSay }
}

const KEEP = ['lines', 'tiles', 'items', 'line2', 'punch', 'slot', 'ask', 'when', 'order', 'area', 'note', 'rows', 'photos', 'week', 'pkgs', 'next', 'demo', 'how', 'step', 'steps', 'fixed']
const clean = (sc) => ({ type: sc.type || '', kicker: sc.kicker || '', line: sc.line || '', sub: sc.sub || '', say: sc.say || '', ...Object.fromEntries(KEEP.filter((k) => sc[k] != null).map((k) => [k, sc[k]])) })

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
  return { qr, ...endText(script, link) }
}
const endText = (script, link) => ({ link: String(link || '').replace(/^https?:\/\//, ''), cta: script.end?.cta || 'See it on ZaMarket', foot: script.end?.foot || '', title: script.end?.title || '', price: script.end?.price || '' })

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
    const card = { id: sceneId(), type: 'specs', kicker: 'Also has', note: 'Features listed by the seller', rows: unseen.slice(0, 6).map((f) => [f, '✓']), line: '', sub: '', say: `It also has ${listOf(unseen)}.`, photo: cover || images[0] || null }
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

// ---- The short ad ------------------------------------------------------------
// A 20–35 second cut for paid adverts and Reels: the opening, the offer or the
// specifications, the strongest features and a photo or two, in the same order
// as the full video, then the end card with the price. Nothing new is added:
// it only leaves scenes out.
export function adCut(scenes, secs = 4, target = 32) {
  if (!Array.isArray(scenes) || !scenes.length) return scenes || []
  const end = Math.max(4, secs + 1)
  const room = Math.max(3, Math.floor((target - end) / secs))
  if (scenes.length <= room) return scenes
  const score = (s, i) => {
    if (i === 0) return 100
    if (s.type === 'offer') return 90
    if (s.type === 'clock' || s.type === 'hookfood' || s.type === 'hookbusy') return 100
    if (s.type === 'menu') return 72
    if (s.type === 'route') return 50
    if (s.type === 'specs') return s.kicker === 'Also has' ? 48 : 80
    if (s.type === 'howto') return s.step === 1 ? 46 : 5
    if (s.type === 'collage') return 58
    if (s.kicker === 'Need another day?') return 44
    if (isWords(s)) return (s.feature || s.seen ? 66 : 56) - i * 0.2
    return 40 - i * 0.2
  }
  const keep = new Set(scenes.map((s, i) => [score(s, i), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, room).map((x) => x[1]))
  return scenes.filter((_, i) => keep.has(i))
}

// ---- "Explain it": an educational video about a product or a car ------------
// Opens with a question in big words, then teaches: what it is, why people use
// it, the questions buyers ask, and where to get it. Without the AI it is
// built from the listing alone (its description, benefits and questions).
export function explainScenes(item, kind, written = null) {
  const photos = (item.images || []).filter(Boolean)
  const pic = (i) => photos[i % Math.max(1, photos.length)] || null
  const v = kind === 'vehicle' ? vehicleOf(item) : null
  const name = kind === 'vehicle' ? vehicleTitle(v, item.name) : item.name
  const price = Number(item.price) > 0 ? money(item.price, { whole: true }) : ''
  const q = written?.question || (kind === 'vehicle' ? `Is the ${name} right for you?` : `What is a ${String(item.name || '').replace(/^(a|an|the)\s+/i, '').toLowerCase()}?`)
  const out = [{ type: 'mbig', kicker: kind === 'vehicle' ? 'Before you buy' : 'Did you know?', lines: [shortLine(q, 60)], line: shortLine(q, 60), sub: '', say: q, photo: null }]
  if (written?.scenes?.length) {
    written.scenes.forEach((x, i) => out.push({ kicker: x.kicker || '', line: shortLine(x.line, 70), sub: '', say: x.say || `${x.line}.`, photo: x.photo >= 0 ? photos[x.photo] || pic(i) : pic(i + 1) }))
  } else {
    const desc = sentences(item.description || item.short_description || '').slice(0, 1)
    if (desc[0]) out.push({ kicker: 'What it is', line: shortLine(desc[0], 70), sub: '', say: `${desc[0]}.`, photo: pic(0) })
    const pts = (item.benefits || []).map((x) => String(x || '').replace(/^[\s•*·–—-]+/, '').trim()).filter(Boolean).slice(0, 3)
    pts.forEach((x, i) => out.push({ kicker: i === 0 ? 'Why people use it' : '', line: shortLine(x), sub: '', say: `${x.replace(/[.!]+$/, '')}.`, photo: pic(i + 1) }))
    ;(item.faqs || []).slice(0, 2).forEach((f, i) => { const qq = f.q || f.question; const a = f.a || f.answer; if (qq && a) out.push({ kicker: 'You asked', line: shortLine(qq, 70), sub: shortLine(a, 70), say: `${qq} ${a}`, photo: pic(i + 4) }) })
    if (kind === 'vehicle') out.push({ kicker: 'Tip', line: 'Ask for the service records and take a test drive', sub: '', say: 'Whatever car you buy, ask for the service records, check the tyres, and take a test drive.', photo: pic(2) })
  }
  out.push({ kicker: kind === 'vehicle' ? 'On ZaMarket Motors' : 'Get it on ZaMarket', line: name, sub: price, say: `${kind === 'vehicle' ? 'This one is' : 'You can get it'} on ZaMarket${price ? `, for ${price}` : ''}.`, photo: pic(0) })
  return out.map((x) => ({ id: sceneId(), photo: x.photo || null, ...clean({ kicker: '', line: '', sub: '', ...x }) }))
}
