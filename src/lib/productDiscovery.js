// Deterministic catalogue matching. No external AI calls, no fabricated product details.
export const normalizeSearch = (value = '') => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

export function productRelevance(product, query) {
  const terms = normalizeSearch(query).split(' ').filter(Boolean)
  if (!terms.length) return 0
  const name = normalizeSearch(product.name)
  const category = normalizeSearch(product.category)
  const vendor = normalizeSearch(product.vendor_name)
  const description = normalizeSearch(product.description)
  const words = `${name} ${category} ${vendor} ${description}`
  if (!terms.every((term) => words.split(' ').some((word) => word.startsWith(term)))) return -1
  let score = 0
  if (name === terms.join(' ')) score += 100
  if (name.includes(terms.join(' '))) score += 40
  for (const term of terms) {
    if (name.split(' ').some((word) => word.startsWith(term))) score += 12
    if (category.split(' ').some((word) => word.startsWith(term))) score += 5
    if (vendor.split(' ').some((word) => word.startsWith(term))) score += 3
    if (description.split(' ').some((word) => word.startsWith(term))) score += 1
  }
  return score
}

export function suggestProductSeo(product) {
  const name = String(product.name || '').trim().replace(/\s+/g, ' ')
  if (!name) return { title: '', description: '' }
  const service = product.fulfilment === 'service'
  const location = String(product.town || 'Lusaka').trim()
  const title = `${name} in ${location} | ZA Market`.slice(0, 70)
  const price = Number(product.price)
  const priceText = Number.isFinite(price) && price > 0 ? ` for K${price.toLocaleString('en-ZM')}` : ''
  const description = `${service ? 'Book' : 'Shop for'} ${name}${priceText} on ZA Market. View product details and contact the seller to confirm availability and delivery.`.slice(0, 160)
  return { title, description }
}
