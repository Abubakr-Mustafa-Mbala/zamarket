import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { THEMES, themeVars } from '../../lib/storeTheme'
import './VendorStorefront.css'

// The public face of a seller's shop, from the approved storefront design.
//
// This file only lays things out. It loads nothing and decides nothing about
// money: StorePage works out the products, sections and featured list, and
// hands in the existing product card and share button, so buying, sharing
// and affiliate links behave exactly as before.
//
// Everything shown comes from the seller's own data. No badge, claim or
// collection appears unless the data behind it exists.

const firstImage = (p) => (Array.isArray(p?.images) ? p.images.find((x) => typeof x === 'string' && x) : null) || null
const text = (v) => (typeof v === 'string' ? v.trim() : '')
export const anchorFor = (name) => `zsv-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'items'}`

// The approved design is violet. A seller who has chosen their own colours in
// "My shop" keeps them: the same layout is drawn in their palette.
export function storefrontVars(store) {
  const chosen = store?.theme?.colour && THEMES.some((t) => t.key === store.theme.colour)
  if (!chosen) return {}
  const v = themeVars(store)
  return {
    '--zsv-bg': v['--store-bg'],
    '--zsv-panel': v['--store-card'],
    '--zsv-panel-2': v['--store-raised'],
    '--zsv-ink': v['--store-ink'],
    '--zsv-muted': v['--store-muted'],
    '--zsv-line': v['--store-line'],
    '--zsv-accent': v['--brand'],
    '--zsv-accent-text': v['--brand-text'],
    '--zsv-on-accent': v['--brand-on'],
    '--zsv-hero-a': v['--brand-soft'],
    '--zsv-hero-b': v['--store-raised'],
    '--zsv-hero-c': v['--store-card'],
    '--zsv-on-hero': v['--store-ink'],
    // "Bold" and "Tinted" shops colour the whole page, as they always have.
    ...(store.theme?.style && store.theme.style !== 'clean' ? { '--zsv-page': v['--store-bg'] } : {}),
  }
}

// Two initials from the shop's name. A stand-in only, styled so it is never
// mistaken for the seller's own logo.
export function initialsOf(name) {
  const all = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (!all.length) return 'S'
  // "God is Faithful Enterprises" is GF, not GI.
  const small = new Set(['is', 'of', 'and', 'the', 'a', 'an', 'to', 'for', 'by', 'in', 'on', 'at'])
  const words = all.filter((w, i) => i === 0 || !small.has(w.toLowerCase()))
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

function Hero({ store, products, verified, share }) {
  const [open, setOpen] = useState(false)
  const photos = useMemo(() => [...new Set(products.map(firstImage).filter(Boolean))].slice(0, 3), [products])
  const line = text(store.tagline) || text(store.description) || [store.category, store.town].filter(Boolean).join(' · ')
  const count = products.length
  // Real catalogue photos compose the hero. A vendor cover is a subtle background
  // rather than an extra fake 'product' tile. Missing photos stay missing.
  // The seller's own cover photo is their banner, shown properly. Without one,
  // their real product photos are layered on the right instead.
  const cover = text(store.cover_url)
  const art = cover ? [] : photos
  return (
    <section className={`zsv-hero ${art.length ? '' : 'no-art'} ${cover ? 'has-cover' : ''}`} aria-labelledby="zsv-store-name">
      {cover && <img className="zsv-hero-cover" src={cover} alt="" aria-hidden />}
      <div className="zsv-hero-glow" aria-hidden />
      <div className="zsv-hero-id">
        {store.logo_url
          ? <img className="zsv-logo" src={store.logo_url} alt={`${store.business_name} logo`} />
          : <span className="zsv-monogram" aria-hidden>{initialsOf(store.business_name)}</span>}
        <div className="zsv-brand-text">
          <h1 id="zsv-store-name">{store.business_name}</h1>
          <div className="zsv-facts">
            {verified && <span className="zsv-verified" title="Someone from ZaMarket has met this seller and seen their ID or PACRA registration">✓ Verified</span>}
            {store.town && <span><PinIcon /> {store.town}</span>}
            <span><BoxIcon /> {count} {count === 1 ? 'item' : 'items'}</span>
            {Number(store.rating) > 0 && <span>★ {store.rating} ({store.review_count || 0})</span>}
          </div>
          {text(store.store_delivery_message) && <p className="zsv-delivery"><DeliveryIcon /> {text(store.store_delivery_message)}</p>}
        </div>
      </div>
      {art.length > 0 && (
        <div className={`zsv-hero-art n${art.length}`} aria-hidden>
          {art.map((src, i) => (
            <span key={`${src}-${i}`} className={`zsv-shot s${i + 1}`}>
              <img src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
            </span>
          ))}
        </div>
      )}
      <div className="zsv-hero-copy">
        {line && (
          <>
            <p className={`zsv-line ${open ? 'open' : ''}`}>{line}</p>
            {line.length > 110 && (
              <button type="button" className="zsv-link-button" onClick={() => setOpen((x) => !x)}>{open ? 'Read less' : 'Read more'}</button>
            )}
          </>
        )}
        <div className="zsv-actions">
          <a className="zsv-btn primary" href="#shop"><CartIcon /> Shop this store</a>
          <div className="zsv-share">{share}</div>
        </div>
      </div>
    </section>
  )
}

function About({ store }) {
  const [open, setOpen] = useState(false)
  const about = text(store.about) || (text(store.tagline) ? text(store.description) : '')
  const highlights = (Array.isArray(store.highlights) ? store.highlights : []).map(text).filter(Boolean).slice(0, 3)
  const hours = (Array.isArray(store.opening_hours) ? store.opening_hours : []).filter((o) => o?.label && o?.hours).slice(0, 3)
  if (!about && !highlights.length && !hours.length) return null
  const long = about.length > 220
  return (
    <section className="zsv-about" id="about" aria-labelledby="zsv-about-title">
      <div className="zsv-about-copy">
        <h2 id="zsv-about-title">About this store</h2>
        {about && <p>{open || !long ? about : `${about.slice(0, 200).replace(/\s+\S*$/, '')}…`}</p>}
        {long && <button type="button" className="zsv-link-button" onClick={() => setOpen((x) => !x)}>{open ? 'Show less' : 'Read more'}</button>}
      </div>
      {(highlights.length > 0 || hours.length > 0) && (
        <ul className="zsv-points">
          {highlights.map((h, i) => <li key={`h${i}`}><span aria-hidden>✦</span>{h}</li>)}
          {hours.map((o, i) => <li key={`o${i}`}><span aria-hidden>◷</span>{o.label}: {o.hours}</li>)}
        </ul>
      )}
    </section>
  )
}

function ShopCategories({ groups, order, selected, onChoose, total }) {
  const filled = order.filter((name) => groups[name]?.length)
  if (!filled.length) return null
  return (
    <section className="zsv-section zsv-category-section" aria-labelledby="zsv-categories-title">
      <div className="zsv-title"><h2 id="zsv-categories-title">Shop by category</h2><button type="button" className="zsv-view-all" onClick={() => onChoose(null)}>View all <span aria-hidden>→</span></button></div>
      <div className="zsv-category-grid" role="group" aria-label="Choose a category">
        <button type="button" className={`zsv-category-tile zsv-category-all ${selected === null ? 'active' : ''}`}
          aria-pressed={selected === null} onClick={() => onChoose(null)}>
          <span className="zsv-category-all-symbol" aria-hidden>▦</span>
          <strong>All products</strong><small>{total} {total === 1 ? 'item' : 'items'}</small>
        </button>
        {filled.map((name) => {
          const items = groups[name]
          const image = items.map(firstImage).find(Boolean)
          return (
            <button type="button" key={name} className={`zsv-category-tile ${selected === name ? 'active' : ''}`}
              aria-pressed={selected === name} onClick={() => onChoose(name)}>
              <span className="zsv-category-photo">
                {image ? <img src={image} alt="" loading="lazy" /> : <span className="zsv-category-no-image" aria-hidden>▧</span>}
              </span>
              <strong>{name}</strong><small>{items.length} {items.length === 1 ? 'item' : 'items'}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function VendorStorefront({
  store, products = [], featured = [], groups = {}, groupOrder = [], verified = false,
  share, renderProduct, special = null,
}) {
  useCompactHeader()
  const [selectedCategory, setSelectedCategory] = useState(null)
  const filled = groupOrder.filter((name) => groups[name]?.length)
  const productList = filled.flatMap((name) => groups[name])
  const priority = new Set(featured.map((p) => p.id))
  const allProducts = [...productList].sort((a, b) => Number(priority.has(b.id)) - Number(priority.has(a.id)))
  const shown = selectedCategory && groups[selectedCategory]?.length ? groups[selectedCategory] : allProducts
  const categoryName = selectedCategory && groups[selectedCategory]?.length ? selectedCategory : null
  const chooseCategory = (name) => {
    setSelectedCategory(name)
    requestAnimationFrame(() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  if (!store || typeof renderProduct !== 'function') return null
  return (
    <div className="zsv" style={storefrontVars(store)} data-testid="vendor-storefront">
      <nav className="zsv-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden>›</span><Link to="/sellers">Stores</Link><span aria-hidden>›</span>
        <span aria-current="page">{store.business_name}</span>
      </nav>

      <Hero store={store} products={products} verified={verified} share={share} />

      <ShopCategories groups={groups} order={groupOrder} total={productList.length}
        selected={categoryName} onChoose={chooseCategory} />

      <About store={store} />

      <div id="shop" className="zsv-anchor" />
      {productList.length > 0 && (
        <section className="zsv-section zsv-products-section" aria-labelledby="zsv-products-title">
          <div className="zsv-title">
            <h2 id="zsv-products-title">{categoryName || 'Featured products'}</h2>
            <span className="zsv-count">View {shown.length} {shown.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="zsv-grid">{shown.map((p) => <Fragment key={p.id}>{renderProduct(p)}</Fragment>)}</div>
        </section>
      )}

      {special}

      {products.length === 0 && (
        <div className="zsv-empty">
          <h2>No products here yet</h2>
          <p>This seller is still adding their listings.</p>
          <Link className="zsv-btn secondary" to="/sellers">Browse other stores →</Link>
        </div>
      )}

      <footer className="zsv-footer">
        <strong>Discover more local sellers on ZaMarket</strong>
        <Link className="zsv-btn secondary" to="/sellers">Explore stores →</Link>
      </footer>
    </div>
  )
}

// On a phone the site header is three rows tall. While a shopper scrolls down
// a store it folds to the search box and cart, and comes back when they
// scroll up. Store pages only; it is undone when they leave.
function useCompactHeader() {
  useEffect(() => {
    let last = window.scrollY
    let ticking = false
    const update = () => {
      ticking = false
      const y = window.scrollY
      if (y < 140) document.body.classList.remove('zsv-compact')
      else if (y > last + 6) document.body.classList.add('zsv-compact')
      else if (y < last - 6) document.body.classList.remove('zsv-compact')
      last = y
    }
    const onScroll = () => { if (!ticking) { ticking = true; window.requestAnimationFrame(update) } }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); document.body.classList.remove('zsv-compact') }
  }, [])
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
}
function BoxIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
}
function CartIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h2l2.4 11h11L21 7H6.2" /><circle cx="9" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></svg>
}

function DeliveryIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>
}
