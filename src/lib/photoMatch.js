import { askAssist } from './aiAssist'

// Asks the AI which of a listing's photos shows each feature, what else good
// it can see, and a short line about each photo. Photos are checked 16 at a
// time, side by side (a listing with 50 photos takes four quick calls), and
// the answers put together. The result is kept on this phone for that
// listing and its exact photos, so making another video of the same car
// costs nothing and is instant.
const BATCH = 16
const MOST = 64
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const keyFor = (product, features) => `zm-photo-match-v2-${product.id}-${hash(`${(product.images || []).join('|')}#${features.join('|')}`)}`
const rank = { yes: 2, maybe: 1, no: 0 }

export function cachedMatch(product, features) {
  try { return JSON.parse(localStorage.getItem(keyFor(product, features)) || 'null') } catch { return null }
}

// Put the answers for each batch of photos together: for each feature the
// surest photo, every photo's caption, each spotted feature once.
export function mergeMatches(parts, features) {
  const best = new Map(features.map((f) => [f, { feature: f, photo: -1, sure: 'no' }]))
  const spotted = new Map()
  const photos = []
  for (const p of parts) {
    photos.push(...(p.photos || []))
    for (const f of p.features || []) {
      const cur = best.get(f.feature)
      if (cur && f.photo >= 0 && rank[f.sure] > rank[cur.sure]) best.set(f.feature, f)
    }
    for (const f of p.spotted || []) {
      const k = f.feature.toLowerCase()
      if (features.some((x) => x.toLowerCase() === k)) continue
      const cur = spotted.get(k)
      if (!cur || rank[f.sure] > rank[cur.sure]) spotted.set(k, f)
    }
  }
  return { photos, features: [...best.values()], spotted: [...spotted.values()].slice(0, 10), cover: parts[0]?.cover ?? 0 }
}

export async function matchPhotos(product, features, onProgress) {
  const count = Math.min((product.images || []).length, MOST)
  const offsets = []
  for (let o = 0; o < Math.max(count, 1); o += BATCH) offsets.push(o)
  let done = 0
  const parts = await Promise.all(offsets.map((offset) => askAssist({ task: 'photos', product_id: product.id, features, offset })
    .then((r) => { done += 1; onProgress?.(done, offsets.length); return r })))
  if (!parts.every((p) => Array.isArray(p?.features))) throw new Error('The AI gave no answer this time.')
  const merged = mergeMatches(parts, features)
  try { localStorage.setItem(keyFor(product, features), JSON.stringify(merged)) } catch { /* full */ }
  return merged
}
