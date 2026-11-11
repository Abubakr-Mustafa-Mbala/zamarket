// A product name is what a shopper reads on the card and what Google shows
// in a search result. The good ones say what the thing is, then one detail:
// "Chocolate birthday cake, 2 kg". This file says what is wrong with a name
// in plain words and tidies the obvious faults, with no AI and no cost.

const SELLING = ['best', 'cheap', 'cheapest', 'affordable', 'original', 'genuine', 'quality', 'high quality',
  'top quality', 'premium quality', 'promo', 'promotion', 'hot', 'hot deal', 'new arrival', 'brand new', 'sale',
  'on sale', 'discount', 'free delivery', 'limited', 'limited offer', 'amazing', 'super', 'wow', 'order now', 'buy now']
const SELLING_RE = new RegExp(`\\b(${SELLING.sort((a, b) => b.length - a.length).map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi')
// Emoji, dingbats and the decorations people paste from WhatsApp.
const DECORATION_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}*#~^|<>{}[\]_=+!?]+/gu
const PRICE_RE = /\b(k|zmw|kwacha)\s?\d[\d,.]*\b|\b\d[\d,.]*\s?(k|zmw|kwacha)\b/gi
// "SM-A155F/DS", "XJ-9000B": a maker's code, not something a shopper types.
const isCode = (word) => word.length >= 6 && /[a-z]/i.test(word) && /\d/.test(word) && /[-/]/.test(word)

// Words that dress a name up without saying what the thing is.
const FILLER = ['premium', 'deluxe', 'luxury', 'luxurious', 'artisanal', 'handcrafted', 'signature', 'gourmet',
  'exclusive', 'elegant', 'exquisite', 'ultimate', 'experience', 'collection', 'edition', 'classic', 'superior',
  'professional', 'executive', 'supreme', 'finest', 'stylish', 'trendy', 'beautiful', 'gorgeous', 'perfect']
const isFiller = (word) => FILLER.includes(word.toLowerCase().replace(/[^a-z]/g, ''))
// Short words that are really initials and must stay in capitals.
const INITIALS = new Set(['tv', 'led', 'lcd', 'oled', 'usb', 'hd', 'uhd', 'dvd', 'cd', 'pc', 'ac', 'dc', 'ssd', 'hdd',
  'ram', 'gps', 'sim', 'uv', 'xl', 'xxl', 'bbq', 'pvc', 'lg', 'hp', 'diy', 'abs', 'suv'])

// The patterns above carry the g flag for match(); test() on those keeps a
// position between calls, so checks use a fresh copy without it.
const has = (re, text) => new RegExp(re.source, re.flags.replace('g', '')).test(text)
const letters = (s) => s.replace(/[^a-z]/gi, '')
const shouting = (s) => { const l = letters(s); return l.length >= 6 && l.replace(/[^A-Z]/g, '').length / l.length > 0.7 }

export const NAME_MAX = 60

// What is hard about this name, as short sentences a seller can act on.
export function nameAdvice(raw) {
  const name = String(raw || '').trim()
  if (!name) return []
  const out = []
  const words = name.split(/\s+/)
  if (name.length > NAME_MAX) out.push(`It is long (${name.length} letters). Aim for ${NAME_MAX} or fewer, so it is not cut off on a phone.`)
  else if (words.length > 9) out.push('It has many words. Say what it is, then one detail.')
  if (shouting(name)) out.push('It is written in capital letters, which is harder to read.')
  if (has(DECORATION_RE, name)) out.push('It has symbols or emoji. Plain words are easier to search for.')
  const selling = [...new Set((name.match(SELLING_RE) || []).map((w) => w.toLowerCase().replace(/\s+/g, ' ')))]
  if (selling.length) out.push(`It has selling words (${selling.slice(0, 3).join(', ')}). Say what the product is. The price and any offer already show beside it.`)
  if (has(PRICE_RE, name)) out.push('It has a price in it. The price shows separately and may change.')
  if (words.filter(isFiller).length >= 3) out.push('It has several dressing-up words (' + words.filter(isFiller).slice(0, 3).join(', ').toLowerCase() + '). Shoppers search for what the thing is.')
  if (words.filter(isCode).length) out.push('It has a maker’s code. Keep it in the description, where it will not crowd the name.')
  const seen = new Set(); let repeated = false
  for (const w of words.map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((x) => x.length > 3)) {
    if (seen.has(w)) repeated = true
    seen.add(w)
  }
  if (repeated) out.push('A word is repeated.')
  return out
}

const SMALL = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'kg', 'g', 'ml', 'l', 'cm', 'mm', 'm'])

// The tidy-up a careful person would do by hand. It only ever removes or
// re-cases what the seller wrote. It never adds a word, and it does not
// chop a long name off mid-thought: shortening properly needs judgement.
export function tidyName(raw) {
  let s = String(raw || '')
  s = s.replace(DECORATION_RE, ' ').replace(PRICE_RE, ' ').replace(SELLING_RE, ' ')
  const kept = []; const seen = new Set()
  const all = s.split(/\s+/).filter(Boolean)
  const dropFiller = all.filter(isFiller).length >= 3
  for (const word of all) {
    if (isCode(word)) continue
    if (dropFiller && isFiller(word)) continue
    const key = word.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (key.length > 3 && seen.has(key)) continue
    seen.add(key); kept.push(word)
  }
  s = kept.join(' ')
  if (shouting(s)) {
    s = s.split(' ').map((w, i) => {
      const bare = w.toLowerCase().replace(/[^a-z0-9]/g, '')
      // "A15", "128GB", "2KG": anything with a number in it stays as written.
      if (/\d/.test(w)) return w
      if (INITIALS.has(bare)) return w.toUpperCase()
      if (i > 0 && SMALL.has(bare)) return w.toLowerCase()
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    }).join(' ')
  }
  s = s.replace(/\s+([,.;:])/g, '$1').replace(/^[\s,.;:\-–—]+|[\s,.;:\-–—]+$/g, '').replace(/\s{2,}/g, ' ')
  return s
}

// A suggestion from the AI is only offered if it invents nothing that can be
// checked: every number in it must already be in what the seller wrote, and
// it must not smuggle in a selling word or a price.
export function safeSuggestion(suggested, source) {
  const s = String(suggested || '').replace(/^["'“”]+|["'“”.]+$/g, '').replace(/\s+/g, ' ').trim()
  if (s.length < 3 || s.length > 70) return null
  const numbers = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'))
  const allowed = new Set(numbers(source))
  if (numbers(s).some((n) => !allowed.has(n))) return null
  if (has(SELLING_RE, s) || has(PRICE_RE, s) || has(DECORATION_RE, s)) return null
  return s
}
