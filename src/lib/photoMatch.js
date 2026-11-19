import { askAssist } from './aiAssist'

// Asks the AI which of a listing's photos shows each feature. The answer is
// kept on this phone for that listing (and its exact photos), so making
// another video of the same car costs nothing and is instant.
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const keyFor = (product, features) => `zm-photo-match-v1-${product.id}-${hash(`${(product.images || []).join('|')}#${features.join('|')}`)}`

export function cachedMatch(product, features) {
  try { return JSON.parse(localStorage.getItem(keyFor(product, features)) || 'null') } catch { return null }
}

export async function matchPhotos(product, features) {
  const answer = await askAssist({ task: 'photos', product_id: product.id, features })
  if (!Array.isArray(answer?.features)) throw new Error('The AI gave no answer this time.')
  try { localStorage.setItem(keyFor(product, features), JSON.stringify(answer)) } catch { /* full */ }
  return answer
}
