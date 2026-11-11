// An approved affiliate should never lose credit merely because they shared a
// product from the normal marketplace instead of their dashboard.
export function productShareUrl(origin, product, role, code) {
  const base = String(origin || '').replace(/\/$/, '')
  const slug = product?.slug || product?.id
  if (!base || !slug) return ''
  if (role === 'reseller' && /^[a-z0-9_-]{2,80}$/i.test(String(code || ''))) {
    return `${base}/r/${encodeURIComponent(code.toLowerCase())}/${encodeURIComponent(slug)}`
  }
  return `${base}/p/${encodeURIComponent(slug)}`
}

export function storeShareUrl(origin, slug, role, code) {
  const base = String(origin || '').replace(/\/$/, '')
  if (role === 'reseller' && /^[a-z0-9_-]{2,80}$/i.test(String(code || ''))) return `${base}/r/${encodeURIComponent(code.toLowerCase())}`
  return `${base}/${encodeURIComponent(slug || '')}`
}
