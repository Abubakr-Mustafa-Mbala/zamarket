import { useEffect } from 'react'
import { canonicalHref, PUBLIC_SITE } from './canonical'

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
    // Netlify includes structured data for the initial URL. Remove it when
    // React Router navigates to a different page, so stale product/article
    // JSON-LD does not describe the new page.
    const initialSchema = document.head.querySelector('script[data-zm-edge-jsonld]')
    if (initialSchema && initialSchema.getAttribute('data-zm-edge-path') !== window.location.pathname) initialSchema.remove()
    const activeTitle = title || 'ZA Market — Shop online in Lusaka, Zambia'
    const activeDescription = description || 'Discover products and services from local sellers in Lusaka, Zambia on ZA Market.'
    document.title = activeTitle
    set('meta[name="description"]', { name: 'description', content: activeDescription })
    set('meta[property="og:description"]', { property: 'og:description', content: activeDescription })
    set('meta[property="og:title"]', { property: 'og:title', content: activeTitle })
    // Reset on every navigation so a former product photo does not bleed
    // into a later article or category preview.
    set('meta[property="og:image"]', { property: 'og:image', content: image || `${PUBLIC_SITE}/social.png` })
    const url = canonicalHref(canonical || window.location.pathname)
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
