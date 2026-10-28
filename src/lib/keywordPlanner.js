// Suggests phrases to write about, built from what ZaMarket actually sells.
//
// BE CLEAR ABOUT WHAT THIS IS. It does not know search volume. Nobody can know
// that for free — Ahrefs and Semrush charge for it, and the numbers they sell
// are estimates anyway. What this does instead is take each real offering and
// build the phrases a Lusaka buyer plausibly types, then rank them by how
// WINNABLE they look for a brand-new site:
//
//   * specific beats broad — a new site cannot outrank Jumia for "cake"
//   * buying language beats browsing language — "where to buy" over "about"
//   * local beats national — "in Lusaka" narrows the field to almost nobody
//   * something we can actually sell beats something we cannot
//
// The score is a judgement about competition, not a measurement of demand.
// Verify the ones you like using the free checks in verifySteps() below before
// spending an afternoon writing.

const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim()

// "Food & drink" must not become "food drink", which nobody types. A category
// with an ampersand or a slash is really two names; the first one is the noun
// people search.
const categoryWord = (c) => clean(String(c || '').split(/[&/,]/)[0])

// Intent templates. Each carries how strongly it signals someone about to buy,
// and whether it pins the search to a place.
const SHAPES = [
  { t: (n, p) => `where to buy ${n} in ${p}`, intent: 3, local: true, kind: 'Ready to buy' },
  { t: (n, p) => `${n} delivered in ${p}`, intent: 3, local: true, kind: 'Ready to buy' },
  { t: (n, p) => `buy ${n} online in ${p}`, intent: 3, local: true, kind: 'Ready to buy' },
  { t: (n, p) => `${n} price in ${p}`, intent: 3, local: true, kind: 'Comparing price' },
  { t: (n, p) => `${n} for sale in ${p}`, intent: 3, local: true, kind: 'Ready to buy' },
  { t: (n, p) => `order ${n} online ${p}`, intent: 3, local: true, kind: 'Ready to buy' },
  { t: (n, p) => `best ${n} in ${p}`, intent: 2, local: true, kind: 'Choosing between options' },
  { t: (n, p) => `affordable ${n} in ${p}`, intent: 2, local: true, kind: 'Choosing between options' },
  { t: (n, p) => `${n} near me ${p}`, intent: 3, local: true, kind: 'Ready to buy' },
  { t: (n) => `how much does ${n} cost`, intent: 2, local: false, kind: 'Comparing price' },
  { t: (n) => `${n} same day delivery`, intent: 3, local: false, kind: 'Ready to buy' },
]

// Shapes that suit a service or a booking rather than a thing in a box.
const SERVICE_SHAPES = [
  { t: (n, p) => `${n} in ${p}`, intent: 3, local: true, kind: 'Ready to book' },
  { t: (n, p) => `book ${n} in ${p}`, intent: 3, local: true, kind: 'Ready to book' },
  { t: (n, p) => `${n} prices in ${p}`, intent: 3, local: true, kind: 'Comparing price' },
  { t: (n, p) => `best ${n} in ${p}`, intent: 2, local: true, kind: 'Choosing between options' },
  { t: (n) => `how much is ${n}`, intent: 2, local: false, kind: 'Comparing price' },
]

// Words that make a phrase broad, and therefore contested by big sites.
const BROAD = new Set(['phone', 'laptop', 'cake', 'food', 'shoes', 'clothes', 'car', 'bed',
  'tv', 'fridge', 'furniture', 'dress', 'bag', 'watch', 'computer'])

/**
 * @param {Array} products  rows from public_products
 * @param {object} opts     { place = 'Lusaka', limit = 40 }
 */
export function planKeywords(products = [], opts = {}) {
  const place = opts.place || 'Lusaka'
  const limit = opts.limit || 40
  const out = new Map()

  for (const p of products) {
    const name = clean(p.name)
    if (!name) continue
    const isService = p.fulfilment === 'service' || ['course', 'class', 'event'].includes(p.offering_type)
    const shapes = isService ? SERVICE_SHAPES : SHAPES

    // The product's own name, and a shortened version of it. A long product
    // name makes an unsearchable phrase; the first few words usually do not.
    const names = new Set([name])
    const short = name.split(' ').slice(0, 3).join(' ')
    if (short !== name && short.split(' ').length >= 2) names.add(short)
    const cat = categoryWord(p.category)
    if (cat && cat.split(' ').length <= 2) names.add(cat)

    for (const n of names) {
      for (const s of shapes) {
        const phrase = clean(s.t(n, place))
        if (!phrase || phrase.length > 70) continue
        const prev = out.get(phrase)
        const row = {
          phrase,
          kind: s.kind,
          intent: s.intent,
          local: s.local,
          words: phrase.split(' ').length,
          offerings: prev ? prev.offerings.concat(p) : [p],
          category: p.category || null,
        }
        out.set(phrase, row)
      }
    }
  }

  const rows = [...out.values()].map((r) => ({ ...r, ...judge(r) }))
  rows.sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase))
  return rows.slice(0, limit)
}

// How winnable this looks. Transparent on purpose: every point is explainable,
// because a score nobody can argue with is a score nobody can correct.
function judge(r) {
  const reasons = []
  let score = 0

  if (r.words >= 5) { score += 35; reasons.push('Long and specific, so few sites target it') }
  else if (r.words === 4) { score += 28; reasons.push('Specific enough to be winnable') }
  else if (r.words === 3) { score += 16; reasons.push('Reasonably specific') }
  else { score += 4; reasons.push('Short phrases are dominated by big sites') }

  score += r.intent * 10
  if (r.intent >= 3) reasons.push('The wording says they are ready to buy')
  else if (r.intent === 2) reasons.push('They are still comparing, but close')

  if (r.local) { score += 20; reasons.push('Tied to a place, which cuts out national competitors') }

  // A contested noun stays contested however many words surround it: adding
  // "in Lusaka" to "food" narrows it, but every restaurant in town wants it too.
  const hasBroad = r.phrase.split(' ').some((w) => BROAD.has(w))
  if (hasBroad) {
    score -= r.words <= 4 ? 18 : 12
    reasons.push('Built on a very contested word, so expect more competition')
  }

  const n = r.offerings.length
  if (n > 1) { score += Math.min(10, n * 2); reasons.push(`${n} of your offerings fit this one post`) }

  const difficulty = score >= 70 ? 'Winnable' : score >= 50 ? 'Worth trying' : 'Hard for a new site'
  return { score: Math.max(0, Math.min(100, score)), reasons, difficulty }
}

// The free way to check a phrase before writing. There is no paid tool here, so
// this is the honest substitute: three checks, ten minutes, no subscription.
export function verifySteps(phrase) {
  return [
    {
      what: 'Does anyone actually search it?',
      how: `Open Google in a private window and start typing "${phrase}" slowly. If Google finishes the phrase for you, real people type it. If nothing comes up, nobody is searching it — pick another.`,
    },
    {
      what: 'Who are you up against?',
      how: `Search "${phrase}" and look at the first page. Big names like Jumia, Facebook Marketplace or Alibaba on every result means leave it. Classified ads, old forum posts and thin pages mean you can beat them.`,
    },
    {
      what: 'What else do they want to know?',
      how: 'Scroll to "People also ask" on that results page. Every question there is a subheading for your article, in the words your customer actually used.',
    },
    {
      what: 'Afterwards, let Google tell you',
      how: 'Once the site has been live a few weeks, Search Console shows the phrases you are already appearing for. Anything sitting at position 8 to 20 is one good edit away from the first page. That becomes your best source, and it is free.',
    },
  ]
}

// A post needs more than a phrase; this turns one into an outline worth writing.
export function outlineFor(row, place = 'Lusaka') {
  const n = row.offerings?.length || 0
  return [
    `Open by answering the question in the first two sentences. Someone searching "${row.phrase}" wants the answer, not a welcome.`,
    'Say what it costs, honestly, including delivery. Price is usually why they searched.',
    `Explain how ordering works on ZaMarket: confirmed by phone, delivered in ${place}, and we carry the problem if something goes wrong.`,
    'Answer the two or three questions from "People also ask" as subheadings.',
    n ? `Finish with the ${n} offering${n === 1 ? '' : 's'} attached to this post, so a ready buyer can act.`
      : 'Attach the offerings this post is about before publishing.',
  ]
}
