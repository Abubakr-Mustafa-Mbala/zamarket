// Pure description of Creative Studio exports. Keeping this outside the React
// component makes visual choices testable without a browser or private data.
export const STUDIO_TOOLS = {
  priceList: { name: 'Price list', description: 'A multi-page catalogue with current prices', multi: true },
  collection: { name: 'Collection', description: 'Show up to four items together', multi: false },
  spotlight: { name: 'Business spotlight', description: 'Introduce the business and its products', multi: false },
  arrival: { name: 'New arrival', description: 'Announce something genuinely new', multi: false },
  hero: { name: 'Product advert', description: 'Photography-first product advert', multi: false },
  editorial: { name: 'Editorial advert', description: 'Editorial style product story', multi: false },
  offer: { name: 'Offer advert', description: 'Highlight a documented saving', multi: false },
  price: { name: 'Price-first advert', description: 'Put the current price first', multi: false },
  dark: { name: 'Premium advert', description: 'Dark, photography-led layout', multi: false },
}

export function isRecentProduct(product, now = Date.now()) {
  const created = Date.parse(product?.created_at || '')
  return Number.isFinite(created) && created <= now && now - created <= 21 * 86400000
}

export function isActualOffer(product) {
  const current = Number(product?.price)
  const previous = Number(product?.normal_price)
  return product?.normal_price != null && product.normal_price !== ''
    && product?.price != null && product.price !== ''
    && Number.isFinite(current) && current >= 0
    && Number.isFinite(previous) && previous > current
}

export function studioExportPlan(tool, products, sheet = 'post', now = Date.now()) {
  const definition = STUDIO_TOOLS[tool]
  if (!definition) throw new Error('Unknown studio template')
  if (!Array.isArray(products) || products.length === 0) throw new Error('Choose at least one product')
  const first = products[0]
  if (tool === 'arrival' && !isRecentProduct(first, now)) throw new Error('Choose a product added within the last 21 days')
  if (tool === 'offer' && !isActualOffer(first)) throw new Error('Choose a product with a genuine saving')
  if (tool === 'dark' && !first.images?.[0]) throw new Error('Choose a product with a photograph')
  const format = ['post', 'square', 'story'].includes(sheet) ? (sheet === 'post' ? 'portrait' : sheet) : 'portrait'
  return {
    tool,
    name: definition.name,
    multi: definition.multi,
    format,
    products: tool === 'collection' ? products.slice(0, 4) : tool === 'spotlight' ? products.slice(0, 6) : tool === 'priceList' ? products : [first],
    filenameBase: tool === 'priceList' ? 'price-list' : tool === 'arrival' ? 'new-arrival' : tool === 'spotlight' ? 'business-spotlight' : tool === 'collection' ? 'collection' : `advert-${tool}`,
    mime: ['priceList', 'collection', 'spotlight'].includes(tool) ? 'image/png' : 'image/jpeg',
    extension: ['priceList', 'collection', 'spotlight'].includes(tool) ? 'png' : 'jpg',
  }
}
