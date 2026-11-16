// One shape for every vehicle on ZaMarket.
//
// A vehicle's facts live in product.page.vehicle as plain fields. From them we
// build the title, the specification list (page.specs, which cards, posters and
// search already read) and the WhatsApp message. Older listings that only have
// free-form page.specs are read back into the same shape, so nothing that is
// already listed has to be typed again.
//
// Nothing here invents a fact: a field the seller left empty stays empty and
// is simply not shown.

export const MAKES = ['Toyota', 'Nissan', 'Honda', 'Mazda', 'Mitsubishi', 'Subaru', 'Suzuki', 'Isuzu', 'Ford', 'Volkswagen',
  'Mercedes-Benz', 'BMW', 'Audi', 'Land Rover', 'Lexus', 'Hyundai', 'Kia', 'Jeep', 'Volvo', 'Peugeot', 'Renault',
  'Chevrolet', 'Mahindra', 'Tata', 'Foton', 'Hino', 'FAW', 'Sinotruk', 'Haval', 'GWM', 'Chery']

export const BODY_TYPES = ['Sedan', 'Hatchback', 'SUV', 'Pickup (double cab)', 'Pickup (single cab)', 'Station wagon', 'Van / minibus', 'Bus', 'Truck', 'Coupe / convertible']
export const TRANSMISSIONS = ['Automatic', 'Manual']
export const FUELS = ['Petrol', 'Diesel', 'Hybrid', 'Electric']
export const DRIVES = ['2WD', '4x4', 'AWD']
export const CONDITIONS = ['Foreign used (imported)', 'Locally used', 'New']
export const PAPERS = ['Zambian registered', 'Duty paid, not yet registered', 'Duty not yet paid']
export const SERVICE = ['Full service history', 'Partial service history', 'No service records']
export const TOWNS = ['Lusaka', 'Ndola', 'Kitwe', 'Livingstone', 'Kabwe', 'Chingola', 'Mufulira', 'Luanshya', 'Chipata', 'Solwezi', 'Kasama', 'Mansa', 'Mongu', 'Choma', 'Mazabuka', 'Kafue']
export const FEATURES = ['Air conditioning', 'Reverse camera', 'Parking sensors', 'Bluetooth', 'Touchscreen', 'Navigation', 'Cruise control', 'Push start', 'Keyless entry',
  'Leather seats', 'Electric windows', 'Sunroof', 'Alloy wheels', 'Fog lights', 'Tow bar', 'Canopy', 'Bull bar', 'Roof rails', 'Diff lock', 'Spare key']

// The same order everywhere: the first three are the ones a buyer asks first,
// and they are what a small card shows.
export const FIELDS = [
  ['year', 'Year'],
  ['mileage_km', 'Mileage'],
  ['transmission', 'Transmission'],
  ['fuel', 'Fuel'],
  ['engine', 'Engine'],
  ['drive', 'Drive'],
  ['body', 'Body type'],
  ['colour', 'Colour'],
  ['seats', 'Seats'],
  ['condition', 'Condition'],
  ['papers', 'Papers'],
  ['service', 'Service history'],
  ['make', 'Make'],
  ['model', 'Model'],
  ['variant', 'Version'],
]

export const QUICK_QUESTIONS = [
  'Is it still available?',
  "What's the lowest price you'll accept?",
  'Can I come and see it? When?',
  'Can you send more photos or a video?',
  'Are the papers in order?',
]

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const digits = (v) => String(v ?? '').replace(/[^\d]/g, '')

export function km(v) {
  const d = digits(v)
  return d ? `${Number(d).toLocaleString('en-ZM')} km` : ''
}

// Older listings typed their facts by hand ("Mileage (km)": "98000").
const LEGACY = [
  ['make', /^make\b/i], ['model', /^model\b/i], ['variant', /variant|trim|version/i], ['year', /\byear\b/i],
  ['mileage_km', /mileage|kilomet|odometer/i], ['transmission', /transmission|gearbox/i], ['fuel', /fuel/i],
  ['engine', /engine/i], ['drive', /drive/i], ['body', /body/i], ['colour', /colou?r/i], ['seats', /seat/i],
  ['condition', /condition|defect/i], ['papers', /registration|documentation|papers|duty/i], ['service', /service/i],
]

export function vehicleOf(product) {
  const page = product?.page || {}
  const v = { ...(page.vehicle || {}) }
  if (!page.vehicle) {
    for (const s of Array.isArray(page.specs) ? page.specs : []) {
      const label = clean(s?.label)
      const value = clean(s?.value)
      if (!label || !value) continue
      const hit = LEGACY.find(([, re]) => re.test(label))
      if (hit && !v[hit[0]]) v[hit[0]] = hit[0] === 'mileage_km' ? digits(value) : value
    }
  }
  if (!v.location) v.location = clean(page.location_text)
  v.features = Array.isArray(v.features) ? v.features.map(clean).filter(Boolean) : []
  return v
}

export function vehicleTitle(v, fallback = '') {
  const t = [clean(v?.year), clean(v?.make), clean(v?.model), clean(v?.variant)].filter(Boolean).join(' ')
  return t || clean(fallback)
}

const show = (key, v) => (key === 'mileage_km' ? km(v[key]) : key === 'seats' && digits(v[key]) ? `${digits(v[key])} seats` : clean(v[key]))

// Every filled field as { key, label, value }, in the standard order.
export function vehicleFacts(v) {
  return FIELDS.map(([key, label]) => ({ key, label, value: show(key, v || {}) })).filter((f) => f.value)
}

// The page.specs rows other parts of the site read (cards, posters, search).
export function specsFrom(v) {
  return vehicleFacts(v).map(({ label, value }) => ({ label, value }))
}

// "2016 · 98,000 km · Automatic · Diesel"
export function factLine(v, count = 4) {
  return vehicleFacts(v).filter((f) => ['year', 'mileage_km', 'transmission', 'fuel', 'engine', 'drive'].includes(f.key)).slice(0, count).map((f) => f.value).join(' · ')
}

// What a buyer needs before a listing goes up.
export function listingChecks(v, { price, images }) {
  const photos = (images || []).filter(Boolean).length
  return [
    { key: 'photos', label: 'At least one photo', done: photos >= 1, tip: 'Front, back, both sides, inside, the dashboard with the mileage showing, and the engine. Aim for 8 or more.' },
    { key: 'make', label: 'Make and model', done: Boolean(clean(v.make) && clean(v.model)) },
    { key: 'year', label: 'Year', done: /^\d{4}$/.test(clean(v.year)) },
    { key: 'price', label: 'Asking price', done: Number(price) > 0 },
    { key: 'mileage', label: 'Mileage', done: Boolean(digits(v.mileage_km)) },
    { key: 'transmission', label: 'Gearbox', done: Boolean(clean(v.transmission)) },
    { key: 'fuel', label: 'Fuel', done: Boolean(clean(v.fuel)) },
    { key: 'location', label: 'Town where the car is', done: Boolean(clean(v.location)) },
  ]
}

// Tidy the form into what is saved.
export function normaliseVehicle(v) {
  const out = {}
  for (const [key] of FIELDS) {
    const val = key === 'mileage_km' || key === 'seats' ? digits(v?.[key]) : clean(v?.[key])
    if (val) out[key] = val
  }
  for (const key of ['location', 'viewing', 'known_issues']) {
    const val = key === 'known_issues' ? String(v?.[key] ?? '').trim() : clean(v?.[key])
    if (val) out[key] = val
  }
  out.features = [...new Set((v?.features || []).map(clean).filter(Boolean))]
  out.price_note = priceNote(v)
  out.negotiable = out.price_note !== ''
  return out
}

// How the seller describes the price, in their words: "Negotiable",
// "Slightly negotiable", or nothing at all when they said nothing.
// Older listings only have negotiable true/false.
export const PRICE_NOTES = ['Negotiable', 'Slightly negotiable']
export function priceNote(v) {
  if (v && typeof v.price_note === 'string') return clean(v.price_note).slice(0, 40)
  return v?.negotiable === false ? '' : 'Negotiable'
}

// Which group of the showroom a body type belongs to.
export function bodyGroup(body) {
  const b = clean(body).toLowerCase()
  if (!b) return ''
  if (/pickup|double cab|single cab|bakkie/.test(b)) return 'Pickups'
  if (/suv|4x4|crossover/.test(b)) return 'SUVs'
  if (/van|minibus|bus/.test(b)) return 'Vans & buses'
  if (/truck|lorry|tipper/.test(b)) return 'Trucks'
  return 'Cars'
}
export const BODY_GROUPS = ['Cars', 'SUVs', 'Pickups', 'Vans & buses', 'Trucks']

export function whatsappNumber(raw) {
  const d = digits(raw)
  if (!d) return ''
  if (d.startsWith('260')) return d
  if (d.startsWith('0')) return `260${d.slice(1)}`
  return d.length === 9 ? `260${d}` : d
}

// The message a buyer sends from the vehicle page. The link carries the
// affiliate code when a tracked affiliate sent the buyer, so the team can
// credit them when the deal closes.
export function whatsappText({ title, price, link, question }) {
  return [
    `Hello ZaMarket, I'm interested in the ${title}${price ? ` (${price})` : ''}.`,
    question ? clean(question) : 'Is it still available?',
    link || '',
  ].filter(Boolean).join('\n')
}

export function whatsappLink(number, text) {
  const n = whatsappNumber(number)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''
}

// Showroom filtering. f = { q, group, make, maxPrice, transmission, fuel, minYear }
export function filterVehicles(list, f = {}) {
  const term = clean(f.q).toLowerCase()
  return (list || []).filter((p) => {
    const v = vehicleOf(p)
    if (term && !`${p.name} ${vehicleTitle(v)} ${v.location || ''} ${v.body || ''} ${p.description || ''}`.toLowerCase().includes(term)) return false
    if (f.group && f.group !== 'All' && bodyGroup(v.body || p.category) !== f.group) return false
    if (f.make && clean(v.make).toLowerCase() !== clean(f.make).toLowerCase()) return false
    if (f.maxPrice && Number(p.price) > Number(f.maxPrice)) return false
    if (f.transmission && clean(v.transmission) !== f.transmission) return false
    if (f.fuel && clean(v.fuel) !== f.fuel) return false
    if (f.minYear && !(Number(v.year) >= Number(f.minYear))) return false
    return true
  })
}

export function sortVehicles(list, sort) {
  const out = [...(list || [])]
  const year = (p) => Number(vehicleOf(p).year) || 0
  const mileage = (p) => { const m = Number(vehicleOf(p).mileage_km); return Number.isFinite(m) && m > 0 ? m : Infinity }
  if (sort === 'price_asc') out.sort((a, b) => a.price - b.price)
  else if (sort === 'price_desc') out.sort((a, b) => b.price - a.price)
  else if (sort === 'year_desc') out.sort((a, b) => year(b) - year(a))
  else if (sort === 'mileage_asc') out.sort((a, b) => mileage(a) - mileage(b))
  else out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return out
}

// A ready-to-paste post for WhatsApp, Facebook or Instagram. Only the
// seller's own facts, the asking price and the link.
export function vehiclePostText(p, v, link) {
  const title = vehicleTitle(v, p?.name)
  const note = priceNote(v)
  const price = Number(p?.price) > 0 ? `K${Math.round(Number(p.price)).toLocaleString('en-ZM')}${note ? ` (${note.toLowerCase()})` : ''}` : ''
  const lines = [
    `🚗 ${title} for sale`,
    price && `💰 ${price}`,
    factLine(v, 4) && `📋 ${factLine(v, 4)}`,
    [v?.engine, v?.drive, v?.body].filter(Boolean).join(' · ') && `⚙️ ${[v?.engine, v?.drive, v?.body].filter(Boolean).join(' · ')}`,
    standoutFeatures(v, 5).length ? `✅ ${standoutFeatures(v, 5).join(', ')}` : '',
    v?.location && `📍 ${v.location}`,
    '',
    'All the photos and details, and ask on WhatsApp:',
    link || '',
  ]
  return lines.filter((l) => l !== false && l !== undefined && l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------------------
// Standout features, for captions and posters.
//
// Only features saved on the listing are ever used: nothing is added because
// of the make, model or version. Equivalent names are merged ("Push start" and
// "Push-button start"), features that repeat a spec already shown (Automatic,
// Diesel, 4x4) are left out, and the pick is spread across kinds of feature
// before falling back to plain priority.
const FEATURE_RULES = [
  // [pattern, label, priority (1 best), group]
  [/adaptive cruise/, 'Adaptive cruise control', 1, 'safety'],
  [/panoram/, 'Panoramic sunroof', 1, 'comfort'],
  [/(full )?leather/, null, 1, 'comfort'],
  [/heated seat|seat heat/, 'Heated seats', 1, 'comfort'],
  [/ventilated seat|cooled seat/, 'Ventilated seats', 1, 'comfort'],
  [/memory seat/, 'Memory seats', 1, 'comfort'],
  [/360|surround view|bird.?s.?eye/, '360° camera', 1, 'safety'],
  [/power(ed)? (rear )?tail ?gate|electric tail ?gate|power boot/, 'Power tailgate', 1, 'convenience'],
  [/keyless|smart key/, 'Keyless entry', 1, 'convenience'],
  [/push.?(button )?start|start.?stop button|engine start button/, 'Push-button start', 1, 'convenience'],
  [/paddle/, 'Paddle shifters', 1, 'driving'],
  [/lane (departure|keep|assist)/, null, 1, 'safety'],
  [/blind.?spot/, 'Blind-spot monitoring', 1, 'safety'],
  [/head.?up/, 'Head-up display', 1, 'tech'],
  [/collision|autonomous emergency|pre.?crash|driver assist/, null, 1, 'safety'],
  [/premium (sound|audio)|harman|bose|jbl|meridian/, null, 1, 'tech'],
  [/sun ?roof|moon ?roof/, 'Sunroof', 2, 'comfort'],
  [/revers(e|ing) cam|rear (view )?cam|back.?up cam/, 'Reverse camera', 2, 'safety'],
  [/^cruise|cruise control/, 'Cruise control', 2, 'driving'],
  [/park(ing)? (sensor|assist)|pdc/, 'Parking sensors', 2, 'safety'],
  [/navigation|gps|sat ?nav/, 'Navigation', 2, 'tech'],
  [/touch ?screen|infotainment|carplay|android auto/, null, 2, 'tech'],
  [/climate control|dual.?zone/, 'Climate control', 2, 'comfort'],
  [/bluetooth/, 'Bluetooth', 2, 'tech'],
  [/alloy/, 'Alloy wheels', 2, 'exterior'],
  [/tow ?bar|tow hitch/, 'Tow bar', 2, 'driving'],
  [/side ?steps|running boards/, 'Side steps', 2, 'exterior'],
  [/diff(erential)? lock/, 'Diff lock', 2, 'driving'],
  [/roof rails/, 'Roof rails', 2, 'exterior'],
  [/canopy/, 'Canopy', 2, 'exterior'],
  [/bull ?bar|nudge bar/, 'Bull bar', 2, 'exterior'],
  [/fog/, 'Fog lights', 2, 'exterior'],
  [/led|xenon|hid/, null, 2, 'exterior'],
  [/new tyres|new tires/, null, 2, 'exterior'],
  [/spare key/, 'Spare key', 3, 'convenience'],
  [/air ?con|a\/c|aircon/, 'Air conditioning', 3, 'comfort'],
  [/electric windows|power windows/, 'Electric windows', 3, 'comfort'],
  [/power steering/, 'Power steering', 3, 'driving'],
  [/central lock/, 'Central locking', 3, 'convenience'],
  [/airbag|abs/, null, 3, 'safety'],
]
const REPEATS_SPEC = /^(automatic|manual|diesel|petrol|hybrid|electric|4x4|4wd|awd|2wd)$/i

export function rankFeatures(features) {
  const seen = new Set()
  const out = []
  for (const raw of features || []) {
    const name = clean(raw)
    if (!name || REPEATS_SPEC.test(name)) continue
    const low = name.toLowerCase()
    const rule = FEATURE_RULES.find(([re]) => re.test(low))
    const label = rule?.[1] || name
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, priority: rule ? rule[2] : 2.5, group: rule ? rule[3] : 'other', order: out.length })
  }
  return out.sort((a, b) => a.priority - b.priority || a.order - b.order)
}

// Up to `want` features, best first. Within each level (premium, desirable,
// common) one of each kind comes before a second of the same kind.
export function standoutFeatures(v, want = 5) {
  const ranked = rankFeatures(v?.features)
  const picked = []
  const groups = new Set()
  for (const level of [...new Set(ranked.map((f) => f.priority))]) {
    const tier = ranked.filter((f) => f.priority === level)
    const fresh = tier.filter((f) => !groups.has(f.group))
    const firstOfKind = fresh.filter((f, i) => fresh.findIndex((x) => x.group === f.group) === i)
    for (const f of [...firstOfKind, ...tier.filter((f) => !firstOfKind.includes(f))]) {
      if (picked.length >= want) break
      picked.push(f); groups.add(f.group)
    }
  }
  return picked.map((f) => f.label)
}
