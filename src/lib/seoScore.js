// Scores a draft against what actually moves a page in search, and says why in
// plain words. It is a coach, not a gate: nothing here blocks publishing.
//
// The rules below follow current practice rather than the habits that used to
// be taught. In particular:
//
//   * Keyword density is NOT a ranking signal. Google's language models read
//     meaning, not repetition. What density is still good for is catching
//     stuffing — so there is a ceiling, no floor, and no "target".
//   * Where the phrase appears matters far more than how often: the title, the
//     first paragraph, one or two subheadings.
//   * Covering the subject properly — the related words a real article about
//     this would naturally contain — beats repeating the exact phrase.
//
// So the worst thing a writer can do is write "best electric bike" eleven
// times. The checker treats that as a fault, not a score.

const words = (t) => (t || '').toLowerCase().match(/[a-z0-9']+/g) || []
const strip = (t) => (t || '')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_`]/g, ' ')

// How many times a phrase occurs, counting the phrase, not its words.
function phraseCount(text, phrase) {
  const p = words(phrase)
  if (!p.length) return 0
  const w = words(text)
  let n = 0
  for (let i = 0; i <= w.length - p.length; i++) {
    let hit = true
    for (let j = 0; j < p.length; j++) if (w[i + j] !== p[j]) { hit = false; break }
    if (hit) n++
  }
  return n
}

const headings = (body, level) => {
  const re = new RegExp(`^#{${level}}\\s+(.+)$`, 'gm')
  const out = []
  let m
  while ((m = re.exec(body || ''))) out.push(m[1].trim())
  return out
}

// Words a real article on this subject would contain anyway. Having them is a
// sign the subject is actually covered; their absence is a nudge, never a fail.
function relatedTerms(keyword) {
  const k = (keyword || '').toLowerCase()
  const base = ['lusaka', 'zambia', 'price', 'delivery', 'order', 'kwacha']
  const by = [
    [/lunch|food|cake|cater|meal|bake/, ['menu', 'fresh', 'same day', 'office', 'portion', 'halal', 'allergy']],
    [/phone|laptop|electronic|charger|tv|speaker/, ['warranty', 'brand', 'battery', 'specs', 'genuine', 'accessories']],
    [/bed|mattress|furniture|sofa|pump|inflatable/, ['size', 'guest', 'storage', 'assembly', 'foam', 'frame']],
    [/dress|tailor|clothes|fashion|shoe|chitenge/, ['size', 'fitting', 'fabric', 'measurements', 'custom', 'style']],
    [/car|vehicle|truck|bike/, ['mileage', 'model', 'year', 'fuel', 'service history', 'inspection']],
    [/service|repair|clean|plumb|install/, ['callout', 'quote', 'experience', 'guarantee', 'booking']],
    [/course|class|training|lesson/, ['certificate', 'schedule', 'beginner', 'duration', 'fees']],
  ]
  const extra = by.find(([re]) => re.test(k))
  return [...base, ...(extra ? extra[1] : [])]
}

const PASS = 'pass'
const WARN = 'warn'
const FAIL = 'fail'

/**
 * @param {object} draft  { title, slug, body, excerpt, metaTitle, metaDescription,
 *                          keyword, secondary[], coverAlt, linkedOfferings }
 * @returns {{score:number, band:string, checks:Array, stats:object}}
 */
export function scoreDraft(draft = {}) {
  const {
    title = '', slug = '', body = '', metaTitle = '', metaDescription = '',
    keyword = '', secondary = [], linkedOfferings = 0,
  } = draft

  const text = strip(body)
  const all = words(text)
  const total = all.length
  const kw = keyword.trim()
  const h2 = headings(body, 2)
  const h3 = headings(body, 3)
  const firstPara = (text.split(/\n\s*\n/).find((p) => p.trim().length > 40) || '').slice(0, 700)
  const count = kw ? phraseCount(text, kw) : 0
  const density = total && kw ? (count * words(kw).length) / total : 0
  const seoTitle = (metaTitle || title).trim()
  const checks = []

  const add = (id, level, label, detail, weight = 1) =>
    checks.push({ id, level, label, detail, weight })

  // ---- the phrase itself -------------------------------------------------
  if (!kw) {
    add('keyword', FAIL, 'No phrase chosen yet',
      'Pick the phrase a customer would actually type. Everything below is measured against it.', 3)
    return finish(checks, { total, count, density, h2: h2.length })
  }

  const kwWords = words(kw).length
  if (kwWords >= 3) {
    add('specific', PASS, 'The phrase is specific',
      `"${kw}" is ${kwWords} words. Long, specific phrases are the ones a new site can actually win.`)
  } else {
    add('specific', WARN, 'The phrase is very broad',
      `"${kw}" is only ${kwWords} word${kwWords === 1 ? '' : 's'}. Big sites own short phrases. Add what makes it yours — a place, a use, a price range — like "${kw} in Lusaka" or "where to buy ${kw} in Lusaka".`, 2)
  }

  // ---- placement: this is what actually matters --------------------------
  const inTitle = phraseCount(title, kw) > 0
  const titlePos = words(title).findIndex((w, i) => phraseCount(words(title).slice(i).join(' '), kw) > 0 && i === 0)
  if (inTitle) {
    add('title', titlePos === 0 ? PASS : PASS, 'The phrase is in the title',
      'The title is the single strongest place to put it. Near the start is better than near the end.', 3)
  } else {
    add('title', FAIL, 'The phrase is missing from the title',
      `Work "${kw}" into the headline naturally. This matters more than anything else on this list.`, 3)
  }

  const inFirst = phraseCount(firstPara, kw) > 0
  add('intro', inFirst ? PASS : WARN,
    inFirst ? 'The phrase appears in the opening' : 'The phrase is not in the opening paragraph',
    inFirst
      ? 'Good. A reader and a search engine both confirm within a sentence that the page is about what they wanted.'
      : 'Mention it once in the first paragraph, as you would say it out loud. Not pasted in — written in.', 2)

  const inH2 = h2.filter((h) => phraseCount(h, kw) > 0).length
  if (inH2 === 0) {
    add('headings', WARN, 'No subheading mentions it',
      'Put it, or a close variation, in one subheading. One is enough.', 1)
  } else if (inH2 <= 2) {
    add('headings', PASS, `${inH2} subheading${inH2 === 1 ? '' : 's'} mention${inH2 === 1 ? 's' : ''} it`,
      'That is the right amount. More starts to look deliberate.')
  } else {
    add('headings', WARN, 'Too many subheadings use the phrase',
      `${inH2} of your subheadings repeat it. Keep one or two and write the rest for the reader.`, 2)
  }

  const inSlug = slug && words(slug.replace(/-/g, ' ')).join(' ').includes(words(kw).join(' '))
  add('slug', inSlug ? PASS : WARN,
    inSlug ? 'The web address contains the phrase' : 'The web address does not contain the phrase',
    inSlug ? 'Short, readable addresses do better and get shared more.'
           : 'The address is made from the title, so fixing the title usually fixes this too.', 1)

  // ---- stuffing: a ceiling, not a target ---------------------------------
  const pct = (density * 100).toFixed(1)
  if (total < 50) {
    add('density', WARN, 'Too short to judge repetition yet', 'Keep writing.', 0)
  } else if (density > 0.04) {
    add('density', FAIL, 'The phrase is overused',
      `It appears ${count} times — ${pct}% of the article. Above about 3% reads as spam to Google and as nonsense to a person. Cut it back to ${Math.max(2, Math.round(total * 0.02 / kwWords))} or so and use ordinary words instead.`, 3)
  } else if (density > 0.025) {
    add('density', WARN, 'The phrase is getting repetitive',
      `${count} mentions, ${pct}% of the article. Not dangerous, but read it aloud — if it sounds odd, it is too many.`, 1)
  } else if (count === 0) {
    add('density', WARN, 'The phrase never appears in the body',
      'Use it once or twice where it fits naturally.', 2)
  } else {
    add('density', PASS, 'Repetition is healthy',
      `${count} mention${count === 1 ? '' : 's'} across ${total} words. There is no magic number — this just confirms you are not stuffing.`)
  }

  // consecutive-paragraph repetition reads worse than raw density
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim().length > 40)
  let run = 0, worstRun = 0
  for (const p of paras) {
    if (phraseCount(p, kw) > 0) { run++; worstRun = Math.max(worstRun, run) } else run = 0
  }
  if (worstRun >= 4) {
    add('cadence', WARN, 'The phrase appears in several paragraphs in a row',
      `${worstRun} consecutive paragraphs contain it. Break the run — say "these", "the lunches", "it" instead.`, 1)
  }

  // ---- covering the subject properly -------------------------------------
  const related = relatedTerms(kw)
  const found = related.filter((t) => text.toLowerCase().includes(t))
  const ratio = found.length / related.length
  if (ratio >= 0.4) {
    add('coverage', PASS, 'The subject is covered properly',
      `The article naturally uses ${found.length} of the words a real piece on this would contain. This is what replaced keyword density.`, 2)
  } else {
    const missing = related.filter((t) => !text.toLowerCase().includes(t)).slice(0, 6)
    add('coverage', WARN, 'The article is thin on the subject',
      `A real article about this would usually touch on: ${missing.join(', ')}. Answer the questions a buyer would actually ask — that is worth more than any amount of repetition.`, 2)
  }

  // ---- length -------------------------------------------------------------
  if (total < 300) {
    add('length', FAIL, 'Too short to rank',
      `${total} words. Under about 300 there is not enough on the page to compete. Aim for 600 to 900.`, 2)
  } else if (total < 600) {
    add('length', WARN, 'On the short side',
      `${total} words. It can work for a very specific question, but 600 to 900 gives you more room to answer properly.`, 1)
  } else {
    add('length', PASS, 'Good length', `${total} words.`)
  }

  // ---- what Google shows in the result ------------------------------------
  const tLen = seoTitle.length
  if (!seoTitle) add('seotitle', FAIL, 'No title for search results', 'Google needs something to show.', 2)
  else if (tLen > 62) add('seotitle', WARN, 'Search title will be cut off',
    `${tLen} characters. Google shows about 60, so the end will be replaced with an ellipsis.`, 1)
  else if (tLen < 25) add('seotitle', WARN, 'Search title is very short',
    `${tLen} characters. You have room to say more about what the page offers.`, 1)
  else add('seotitle', PASS, 'Search title is a good length', `${tLen} characters.`)

  const dLen = metaDescription.trim().length
  if (!dLen) {
    add('metadesc', WARN, 'No search description',
      'This is the sentence under your link in Google. It does not affect ranking, but it decides whether anyone clicks. Write it as an invitation.', 2)
  } else if (dLen > 165) {
    add('metadesc', WARN, 'Search description will be cut off', `${dLen} characters; about 155 is shown.`, 1)
  } else if (dLen < 70) {
    add('metadesc', WARN, 'Search description is short', `${dLen} characters. Use the room — it is free advertising.`, 1)
  } else {
    add('metadesc', PASS, 'Search description is a good length', `${dLen} characters.`)
  }

  // ---- the thing that makes a marketplace blog worth writing --------------
  if (linkedOfferings > 0) {
    add('offerings', PASS, `${linkedOfferings} offering${linkedOfferings === 1 ? '' : 's'} attached`,
      'The reader can buy at the end of the article instead of going somewhere else. This is the whole point of writing it.', 2)
  } else {
    add('offerings', FAIL, 'Nothing to buy at the end',
      'Attach the offerings this post is about. An article that sends a ready buyer away has done the hard part and wasted it.', 3)
  }

  const links = (body.match(/\]\(\s*\//g) || []).length
  add('links', links >= 1 ? PASS : WARN,
    links >= 1 ? `${links} link${links === 1 ? '' : 's'} to other pages on ZaMarket` : 'No links to the rest of ZaMarket',
    links >= 1 ? 'Good — this spreads the value of the post to your shop pages.'
               : 'Link to a department, a shop or a related post. It keeps readers on the site and helps those pages too.', 1)

  // ---- readability --------------------------------------------------------
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 2)
  const longSentences = sentences.filter((s) => words(s).length > 28).length
  if (sentences.length && longSentences / sentences.length > 0.25) {
    add('reading', WARN, 'Many long sentences',
      `${longSentences} of ${sentences.length} run past 28 words. Most people read this on a phone — break them up.`, 1)
  } else if (sentences.length) {
    add('reading', PASS, 'Easy to read on a phone', 'Sentence lengths are sensible.')
  }

  // secondary phrases are a bonus, never a requirement
  const sec = secondary.filter(Boolean)
  if (sec.length) {
    const used = sec.filter((s) => phraseCount(text, s) > 0)
    add('secondary', used.length ? PASS : WARN,
      `${used.length} of ${sec.length} supporting phrases used`,
      used.length ? 'Good. These catch searches your main phrase misses.'
                  : `Work in the ones that fit: ${sec.filter((s) => !used.includes(s)).join(', ')}.`, 1)
  }

  return finish(checks, { total, count, density, h2: h2.length, h3: h3.length, links })
}

function finish(checks, stats) {
  const weighted = checks.filter((c) => c.weight > 0)
  const max = weighted.reduce((t, c) => t + c.weight, 0) || 1
  const got = weighted.reduce((t, c) => t + (c.level === PASS ? c.weight : c.level === WARN ? c.weight * 0.5 : 0), 0)
  const score = Math.round((got / max) * 100)
  // A high score with something broken is worse than a low one, because it
  // tells the writer to publish. Anything still failing holds the band back
  // however well the rest of the draft does.
  const failing = checks.filter((c) => c.level === FAIL && c.weight > 0).length
  const band = failing > 0
    ? (failing === 1 ? 'One thing to fix first' : `${failing} things to fix first`)
    : score >= 80 ? 'Ready to publish'
    : score >= 60 ? 'Nearly there'
    : score >= 35 ? 'Needs work'
    : 'Not ready'
  return { score, band, failing, checks, stats }
}

export const LEVELS = { PASS, WARN, FAIL }
