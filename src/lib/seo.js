import { useEffect } from 'react'

const set = (selector, attrs) => {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
    document.head.appendChild(el)
  }
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v)
}

// Keeps the browser tab and share tags right as people move around the app.
// The HTML the crawler first receives is filled in by the Netlify edge function.
export function useSeo({ title, description, image, canonical, noIndex } = {}) {
  useEffect(() => {
    if (title) document.title = title
    if (description) {
      set('meta[name="description"]', { name: 'description', content: description })
      set('meta[property="og:description"]', { property: 'og:description', content: description })
    }
    if (title) set('meta[property="og:title"]', { property: 'og:title', content: title })
    if (image) set('meta[property="og:image"]', { property: 'og:image', content: image })
    const url = canonical || window.location.origin + window.location.pathname
    set('link[rel="canonical"]', { rel: 'canonical', href: url })
    set('meta[property="og:url"]', { property: 'og:url', content: url })
    set('meta[name="robots"]', { name: 'robots', content: noIndex ? 'noindex,follow' : 'index,follow' })
  }, [title, description, image, canonical, noIndex])
}

// What a product page should be called in search results.
export function productSeo(p, shop = 'ZaMarket') {
  if (!p) return {}
  const price = `K${Number(p.price || 0).toLocaleString('en-ZM')}`
  const seo = p.page?.seo || {}
  return {
    title: seo.title || `${p.name} — ${price} | ${shop} Lusaka`,
    description: seo.description || `${p.fulfilment === 'service' ? 'Book' : 'Buy'} ${p.name} in Lusaka for ${price}. ${p.vendor_name ? `Sold by ${p.vendor_name}. ` : ''}Delivery in Lusaka District, other areas arranged. We confirm every order by phone first.`.slice(0, 160),
    image: p.images?.[0],
  }
}
