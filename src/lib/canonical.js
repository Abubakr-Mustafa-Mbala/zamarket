// Stable public origin for social previews and Google/Bing canonical URLs.
// Netlify preview domains, localhost and campaign query parameters are never
// canonical destinations. Keep this aligned with the SEO edge function.
export const PUBLIC_SITE = 'https://zamarket.shop'

export function canonicalHref(input = '/') {
  let path = String(input || '/')
  // An absolute route is allowed, but its host is deliberately discarded.
  // Only our public origin may appear in a canonical link.
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname } catch { path = '/' }
  }
  path = path.split(/[?#]/, 1)[0] || '/'
  if (!path.startsWith('/')) path = `/${path}`
  // The root keeps its slash; interior pages use one stable URL form.
  return PUBLIC_SITE + (path === '/' ? '/' : path.replace(/\/+$/, ''))
}
