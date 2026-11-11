import { Fragment, useMemo, useState } from 'react'
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
  }
}

function Hero({ store, products, verified, share }) {
  const [open, setOpen] = useState(false)
  const photos = useMemo(() => products.map(firstImage).filter(Boolean).slice(0, 3), [products])
  const line = text(store.tagline) || text(store.description) || [store.category, store.town].filter(Boolean).join(' · ')
  const count = products.length
  return (
    <section className={`zsv-hero ${store.cover_url || photos.length ? '' : 'no-art'}`} aria-labelledby="zsv-store-name">
      <div className="zsv-hero-content">
        <div className="zsv-brand">
          {store.logo_url
            ? <img className="zsv-logo" src={store.logo_url} alt={`${store.business_name} logo`} />
            : <span className="zsv-logo zsv-logo-letter" aria-hidden>{text(store.business_name).charAt(0).toUpperCase() || 'S'}</span>}
          <div className="zsv-brand-text">
            <h1 id="zsv-store-name">{store.business_name}</h1>
            {verified && (
              <span className="zsv-verified" title="Someone from ZaMarket has met this seller and seen their ID or PACRA registration">✓ Verified seller</span>
            )}
          </div>
        </div>
        {line && (
          <>
            <p className={`zsv-line ${open ? 'open' : ''}`}>{line}</p>
            {line.length > 140 && (
              <button type="button" className="zsv-link-button" onClick={() => setOpen((x) => !x)}>{open ? 'Read less' : 'Read more'}</button>
            )}
          </>
        )}
        <div className="zsv-facts">
          {store.town && <span><PinIcon /> {store.town}</span>}
          <span><BoxIcon /> {count} {count === 1 ? 'item' : 'items'}</span>
          {Number(store.rating) > 0 && <span>★ {store.rating} ({store.review_count || 0})</span>}
        </div>
        <div className="zsv-actions">
          <a className="zsv-btn primary" href="#shop"><CartIcon /> Shop this store</a>
          <div className="zsv-share">{share}</div>
        </div>
      </div>
      {(store.cover_url || photos.length > 0) && (
        <div className={`zsv-hero-art ${store.cover_url ? 'has-cover' : ''}`}>
          {store.cover_url
            ? <img className="zsv-cover" src={store.cover_url} alt="" />
            : (
              <div className={`zsv-collage n${photos.length}`}>
                {photos.map((src, i) => <span key={`${src}-${i}`}><img src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} /></span>)}
              </div>
            )}
        </div>
      )}
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

function Collections({ groups, order }) {
  const filled = order.filter((name) => groups[name]?.length)
  if (filled.length < 2) return null
  return (
    <section className="zsv-section" aria-labelledby="zsv-coll-title">
      <div className="zsv-title"><h2 id="zsv-coll-title">Shop by collection</h2></div>
      <div className="zsv-collections">
        {filled.map((name) => {
          const list = groups[name]
          const img = list.map(firstImage).find(Boolean)
          return (
            <a key={name} href={`#${anchorFor(name)}`} className={`zsv-collection ${img ? '' : 'no-photo'}`}>
              {img && <img src={img} alt="" loading="lazy" />}
              <span className="zsv-collection-shade" />
              <span className="zsv-collection-copy">
                <strong>{name}</strong>
                <small>{list.length} {list.length === 1 ? 'item' : 'items'}</small>
                <span className="zsv-collection-go" aria-hidden>→</span>
              </span>
            </a>
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
  if (!store || typeof renderProduct !== 'function') return null
  const filled = groupOrder.filter((name) => groups[name]?.length)
  return (
    <div className="zsv" style={storefrontVars(store)} data-testid="vendor-storefront">
      <nav className="zsv-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden>›</span><Link to="/sellers">Stores</Link><span aria-hidden>›</span>
        <span aria-current="page">{store.business_name}</span>
      </nav>

      <Hero store={store} products={products} verified={verified} share={share} />

      {filled.length > 1 && (
        <nav className="zsv-chips" aria-label="In this store">
          <a className="on" href="#shop">All products</a>
          {filled.map((name) => <a key={name} href={`#${anchorFor(name)}`}>{name}</a>)}
        </nav>
      )}

      <About store={store} />
      <Collections groups={groups} order={groupOrder} />

      <div id="shop" className="zsv-anchor" />
      {featured.length > 0 && (
        <section className="zsv-section" aria-labelledby="zsv-featured-title">
          <div className="zsv-title">
            <h2 id="zsv-featured-title">Featured products</h2>
            {products.length > featured.length && <a href="#zsv-all">View all ({products.length}) →</a>}
          </div>
          <div className="zsv-grid">{featured.map((p) => <Fragment key={p.id}>{renderProduct(p)}</Fragment>)}</div>
        </section>
      )}

      {special}

      <div id="zsv-all" className="zsv-anchor" />
      {filled.map((name) => (
        <section key={name} className="zsv-section" id={anchorFor(name)} aria-label={name}>
          <div className="zsv-title">
            <h2>{name}</h2>
            <span className="zsv-count">{groups[name].length} {groups[name].length === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="zsv-grid">{groups[name].map((p) => <Fragment key={p.id}>{renderProduct(p)}</Fragment>)}</div>
        </section>
      ))}

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

function PinIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
}
function BoxIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
}
function CartIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h2l2.4 11h11L21 7H6.2" /><circle cx="9" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></svg>
}
