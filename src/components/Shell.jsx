import { useState, useEffect, useRef, Suspense } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Loading } from './ui'
import ErrorBoundary from './ErrorBoundary'
import ActionBell from './ActionBell'
import Icon from '../lib/icons'

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11 12 3l9 8v10H3z" /></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8" /></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h2l2 12h11l2-8H6" /><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /></svg>,
  coins: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>,
  more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
}

// Simple mode keeps the menu to daily work. Nothing is lost — Advanced brings it back.
const SIMPLE_HIDES = ['/admin/simulator', '/admin/suppliers', '/admin/reports', '/admin/deals']

const STAFF_NAV = [
  { group: 'Daily' },
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/deals', label: 'Enquiries' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/studio', label: 'Creative Studio' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/deliveries', label: 'Deliveries' },
  { group: 'Stock' },
  { to: '/admin/add-stock', label: 'I bought goods' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/stock-count', label: 'Count the stock' },
  { to: '/admin/purchases', label: 'Purchases', advanced: true },
  { to: '/admin/suppliers', label: 'Suppliers', advanced: true },
  { to: '/admin/simulator', label: 'Should I buy?' },
  { group: 'Growth' },
  { to: '/admin/offers', label: 'Offers' },
  { to: '/admin/resellers', label: 'Affiliates' },
  { to: '/admin/affiliate-recruiting', label: 'Affiliate recruitment' },
  { to: '/admin/vendors', label: 'Vendors' },
  { to: '/admin/marketing', label: 'Marketing' },
  { to: '/admin/reviews', label: 'Reviews' },
  { group: 'Money' },
  { to: '/admin/earnings', label: 'Earnings' },
  { to: '/admin/money-check', label: 'Check the money' },
  { to: '/admin/finance', label: 'Finance' },
  { to: '/admin/reports', label: 'Reports' },
  { group: 'Setup', founder: true },
  { to: '/admin/team', label: 'Team', founder: true },
  { to: '/admin/settings', label: 'Settings', founder: true },
  { to: '/admin/audit', label: 'Audit log', founder: true, advanced: true },
]

const RESELLER_NAV = [
  { to: '/sell', label: 'My sales', end: true },
  { to: '/sell/find-customers', label: 'Find customers' },
  { to: '/sell/training', label: 'Training' },
  { to: '/sell/products', label: 'Products to sell' },
  { to: '/sell/earnings', label: 'My earnings' },
  { to: '/sell/commissions', label: 'Commissions' },
]

const VENDOR_NAV = [
  { to: '/vendor', label: 'Overview', end: true },
  { to: '/vendor/shopfront', label: 'My shopfront' },
  { to: '/vendor/products', label: 'My products' },
  { to: '/vendor/studio', label: 'Creative Studio' },
  { to: '/vendor/orders', label: 'Orders' },
  { to: '/vendor/earnings', label: 'My earnings' },
  { to: '/vendor/payouts', label: 'Payouts' },
  { to: '/vendor/coupons', label: 'Coupons' },
  { to: '/vendor/marketing', label: 'Share and advertise' },
]

const MARKETING_NAV = [
  { group: 'Marketing' },
  { to: '/admin/marketing', label: 'Overview', end: true },
  { to: '/admin/marketing/growth', label: 'Growth' },
  { to: '/admin/marketing/giveaways', label: 'Giveaways' },
  { to: '/admin/marketing/today', label: 'Today' },
  { to: '/admin/marketing/leads', label: 'Leads' },
  { to: '/admin/marketing/campaigns', label: 'Campaigns' },
  { to: '/admin/marketing/launch', label: 'Campaign Launchpad' },
  { to: '/admin/affiliate-recruiting', label: 'Affiliate recruitment' },
  { to: '/admin/marketing/seo', label: 'Search (SEO)' },
  { to: '/admin/marketing/blog', label: 'Blog & guides' },
  { to: '/admin/marketing/content', label: 'Content' },
  { to: '/admin/marketing/magnets', label: 'Lead magnets' },
  { to: '/admin/marketing/referrals', label: 'Referrals' },
  { to: '/admin/marketing/requests', label: 'Vendor requests' },
  { to: '/admin/marketing/spend', label: 'Ad spend' },
]

const MOBILE_TABS = {
  marketing: [
    { to: '/admin/marketing', label: 'Overview', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>, end: true },
    { to: '/admin/marketing/today', label: 'Today', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg> },
    { to: '/admin/marketing/leads', label: 'Leads', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.6 3 5.2" /></svg> },
    { to: '/admin/marketing/campaigns', label: 'Campaigns', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11v3l12 5V6L3 11ZM15 9c2 0 4 1.3 4 3.5S17 16 15 16M6 15l1.5 5h3L9 16" /></svg> },
  ],
  staff: [
    { to: '/admin', label: 'Home', icon: I.home, end: true },
    { to: '/admin/orders', label: 'Orders', icon: I.cart },
    { to: '/admin/products', label: 'Products', icon: I.box },
    { to: '/admin/earnings', label: 'Earnings', icon: I.coins },
  ],
  reseller: [
    { to: '/sell', label: 'Sales', icon: I.home, end: true },
    { to: '/sell/find-customers', label: 'Sell', icon: I.box },
    { to: '/sell/products', label: 'Promote', icon: I.cart },
    { to: '/sell/earnings', label: 'Earnings', icon: I.coins },
  ],
  vendor: [
    { to: '/vendor', label: 'Home', icon: I.home, end: true },
    { to: '/vendor/products', label: 'Products', icon: I.box },
    { to: '/vendor/orders', label: 'Orders', icon: I.cart },
    { to: '/vendor/earnings', label: 'Earnings', icon: I.coins },
  ],
}

// The avatar in the top bar used to be a plain <span> — it looked like a
// button on every dashboard and did nothing on any of them. It is a real
// account menu now, and it is the same menu for the founder, a vendor and an
// affiliate: who you are signed in as, the settings page that role actually
// has, the way back to the marketplace, and sign out.
//
// A vendor's "settings" is their shopfront and their payout details; an
// affiliate has no settings of their own, so they simply get fewer items
// rather than a link to a page they cannot open.
const ACCOUNT_LINKS = {
  staff: [
    { to: '/admin/settings', label: 'Settings', founder: true },
    { to: '/admin/team', label: 'Team', founder: true },
  ],
  vendor: [
    { to: '/vendor/shopfront', label: 'My shopfront' },
    { to: '/vendor/payouts', label: 'Payout details' },
  ],
  reseller: [],
}

function AccountMenu({ kind, profile, roleName, isFounder, signOut }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  // Close on a click anywhere else, or on Escape. Both listeners are removed
  // when the menu closes, so nothing is left attached to the document.
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const name = profile?.full_name || profile?.email || 'Signed in'
  const initial = String(profile?.full_name || profile?.email || 'Z').slice(0, 1).toUpperCase()
  const links = (ACCOUNT_LINKS[kind] || []).filter((l) => !l.founder || isFounder)

  return (
    <div className="account-menu" ref={box}>
      <button type="button" className="workspace-avatar" aria-haspopup="menu"
        aria-expanded={open} aria-label="Your account"
        onClick={() => setOpen((v) => !v)}>{initial}</button>
      {open && (
        <div className="account-pop" role="menu">
          <div className="account-who">
            <strong>{name}</strong>
            <span>{roleName}</span>
          </div>
          {links.map((l) => (
            <Link key={l.to} to={l.to} role="menuitem" onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)}>Your account</Link>
          <Link to="/" role="menuitem" onClick={() => setOpen(false)}>View the marketplace</Link>
          <button type="button" role="menuitem" className="account-signout"
            onClick={() => { setOpen(false); signOut() }}>Sign out</button>
        </div>
      )}
    </div>
  )
}

export default function Shell({ kind }) {
  const { profile, isFounder, advanced, setAdvanced, signOut } = useAuth()
  const [more, setMore] = useState(false)
  const { role } = useAuth()
  const { pathname } = useLocation()
  const roleName = marketerRole(role)
  const navTitle = (kind === 'staff' && role === 'marketing' ? MARKETING_NAV : kind === 'staff' ? STAFF_NAV : kind === 'reseller' ? RESELLER_NAV : VENDOR_NAV)
    .filter(item => item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`)))
    .sort((a,b) => b.to.length - a.to.length)[0]?.label || 'Overview'
  const marketer = kind === 'staff' && role === 'marketing'
  const nav = (marketer ? MARKETING_NAV : kind === 'staff' ? STAFF_NAV : kind === 'reseller' ? RESELLER_NAV : VENDOR_NAV).filter(
    (n) => (!n.founder || isFounder) && (!n.advanced || advanced) && (advanced || marketer || !SIMPLE_HIDES.includes(n.to))
  ).filter((n, i, arr) => !n.group || (arr[i + 1] && arr[i + 1].to))
  const tabs = marketer ? MOBILE_TABS.marketing : MOBILE_TABS[kind]
  // The "More" sheet used to be one grid of unrelated links. The nav array
  // already carries { group: 'Money' } markers for the sidebar, so the same
  // markers are reused to section the sheet by job. Access rules are
  // unchanged: this groups the links that `nav` already allowed through.
  const moreGroups = nav.reduce((groups, item) => {
    if (item.group) { groups.push({ title: item.group, links: [] }); return groups }
    if (!groups.length) groups.push({ title: 'Navigation', links: [] })
    if (item.to) groups[groups.length - 1].links.push(item)
    return groups
  }, []).filter((g) => g.links.length)

  return (
    <div className="shell">
      <aside className="sidenav">
        <Link to="/" className="workspace-brand" aria-label="ZaMarket marketplace"><span className="workspace-mark">Z</span><span><strong>ZaMarket</strong><small>BUSINESS WORKSPACE</small></span></Link>
        <div className="workspace-sidenav-label">{roleName} workspace</div>
        <nav className="sidenav-links" aria-label="Workspace navigation">
          {nav.map((n, i) => n.group ? <div key={i} className="group">{n.group}</div> : (
            <NavLink key={n.to} to={n.to} end={n.end}><span className="nav-icon" aria-hidden>{navIcon(n.label)}</span><span>{n.label}</span></NavLink>
          ))}
        </nav>
        <div className="workspace-sidenav-footer">
          <Link to="/"><Icon.house /> View marketplace <Icon.arrow /></Link>
          <button onClick={signOut}><Icon.user /> Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="workspace-current"><span className="workspace-top-kicker">ZA MARKET / {roleName.toUpperCase()}</span><strong>{navTitle}</strong></div>
          <div className="workspace-top-actions"><Link className="workspace-store-link" to="/"><Icon.house /> <span>View store</span></Link><ActionBell /><AccountMenu kind={kind} profile={profile} roleName={roleName} isFounder={isFounder} signOut={signOut} /></div>
          {kind === 'staff' && !marketer && (
            <div className="mode-switch">
              <div className="segmented">
                <button className={!advanced ? 'on' : ''} onClick={() => setAdvanced(false)} title="Only what you need for daily work">Simple</button>
                <button className={advanced ? 'on' : ''} onClick={() => setAdvanced(true)} title="Adds costs, margins, marketing and the history of every change">Advanced</button>
              </div>
              <span className="mode-note hide-mobile">{advanced ? 'Advanced tools enabled' : 'Focused workspace'}</span>
            </div>
          )}
        </header>
        <main className="content">
          <ErrorBoundary home={kind === 'vendor' ? '/vendor' : kind === 'reseller' ? '/sell' : '/admin'}>
            <Suspense fallback={<Loading shape="page" />}><Outlet /></Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <nav className="bottomnav">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>{t.icon}<span>{t.label}</span></NavLink>
        ))}
        <button onClick={() => setMore(true)}>{I.more}<span>More</span></button>
      </nav>

      {more && (
        <>
          <div className="sheet-backdrop" onClick={() => setMore(false)} />
          <div className="sheet">
            <div className="between mb"><h3>Menu</h3><button type="button" className="btn ghost sm" onClick={() => setMore(false)}>Close</button></div>
            <div className="sheet-sections">
              {moreGroups.map((group) => (
                <section key={group.title} className="sheet-section">
                  <h4>{group.title}</h4>
                  <div className="sheet-grid">
                    {group.links.map((n) => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMore(false)}>{n.label}</NavLink>)}
                  </div>
                </section>
              ))}
              <div className="sheet-grid"><Link to="/" onClick={() => setMore(false)}>Marketplace</Link><button type="button" onClick={() => { setMore(false); signOut() }}>Sign out</button></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function marketerRole(role) {
  return ({ founder: 'Founder', ops: 'Operations', finance: 'Finance', delivery: 'Delivery', marketing: 'Marketing', vendor: 'Vendor', reseller: 'Affiliate' })[role] || 'Business'
}
function navIcon(label) {
  if (/marketing|campaign|advert|studio|creative/i.test(label)) return <Icon.sparkles />
  if (/product|inventory|stock|supplie|purchases/i.test(label)) return <Icon.box />
  if (/orders|sale|checkout|deliver/i.test(label)) return <Icon.cart />
  if (/earnings|finance|payout|commission|money/i.test(label)) return <Icon.tag />
  if (/customer|vendor|affiliate|people|team|lead/i.test(label)) return <Icon.user />
  if (/reports|audit|review/i.test(label)) return <Icon.grid />
  if (/setting|shopfront|shop|store/i.test(label)) return <Icon.house />
  return <Icon.arrow />
}
