import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11 12 3l9 8v10H3z" /></svg>,
  box: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8" /></svg>,
  cart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h2l2 12h11l2-8H6" /><circle cx="9" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /></svg>,
  coins: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></svg>,
  more: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
}

const STAFF_NAV = [
  { group: 'Daily' },
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/deliveries', label: 'Deliveries' },
  { group: 'Stock' },
  { to: '/admin/add-stock', label: 'I bought goods' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/purchases', label: 'Purchases', advanced: true },
  { to: '/admin/suppliers', label: 'Suppliers', advanced: true },
  { to: '/admin/simulator', label: 'Buy or not?' },
  { group: 'Growth' },
  { to: '/admin/offers', label: 'Offers' },
  { to: '/admin/resellers', label: 'Resellers' },
  { to: '/admin/vendors', label: 'Vendors' },
  { to: '/admin/marketing', label: 'Marketing' },
  { to: '/admin/reviews', label: 'Reviews' },
  { group: 'Money' },
  { to: '/admin/finance', label: 'Finance' },
  { to: '/admin/reports', label: 'Reports' },
  { group: 'Setup', founder: true },
  { to: '/admin/team', label: 'Team', founder: true },
  { to: '/admin/settings', label: 'Settings', founder: true },
  { to: '/admin/audit', label: 'Audit log', founder: true, advanced: true },
]

const RESELLER_NAV = [
  { to: '/sell', label: 'My sales', end: true },
  { to: '/sell/products', label: 'Products to sell' },
  { to: '/sell/new-sale', label: 'Record a sale' },
  { to: '/sell/commissions', label: 'Commissions' },
]

const VENDOR_NAV = [
  { to: '/vendor', label: 'Overview', end: true },
  { to: '/vendor/products', label: 'My products' },
  { to: '/vendor/orders', label: 'Orders' },
  { to: '/vendor/payouts', label: 'Payouts' },
]

const MOBILE_TABS = {
  staff: [
    { to: '/admin', label: 'Home', icon: I.home, end: true },
    { to: '/admin/orders', label: 'Orders', icon: I.cart },
    { to: '/admin/products', label: 'Products', icon: I.box },
    { to: '/admin/finance', label: 'Money', icon: I.coins },
  ],
  reseller: [
    { to: '/sell', label: 'Sales', icon: I.home, end: true },
    { to: '/sell/products', label: 'Products', icon: I.box },
    { to: '/sell/new-sale', label: 'New sale', icon: I.cart },
    { to: '/sell/commissions', label: 'Earnings', icon: I.coins },
  ],
  vendor: [
    { to: '/vendor', label: 'Home', icon: I.home, end: true },
    { to: '/vendor/products', label: 'Products', icon: I.box },
    { to: '/vendor/orders', label: 'Orders', icon: I.cart },
    { to: '/vendor/payouts', label: 'Payouts', icon: I.coins },
  ],
}

export default function Shell({ kind }) {
  const { profile, isFounder, advanced, setAdvanced, signOut } = useAuth()
  const [more, setMore] = useState(false)
  const nav = (kind === 'staff' ? STAFF_NAV : kind === 'reseller' ? RESELLER_NAV : VENDOR_NAV).filter(
    (n) => (!n.founder || isFounder) && (!n.advanced || advanced)
  )
  const tabs = MOBILE_TABS[kind]
  const links = nav.filter((n) => n.to)

  return (
    <div className="shell">
      <aside className="sidenav">
        <div className="brand">Za<span>Market</span></div>
        {nav.map((n, i) => n.group ? <div key={i} className="group">{n.group}</div> : (
          <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
        ))}
        <div className="group">Account</div>
        <Link to="/">Marketplace</Link>
        <a href="#" onClick={(e) => { e.preventDefault(); signOut() }}>Sign out</a>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <div className="brand hide-mobile" style={{ padding: 0, fontSize: '1rem', color: 'var(--ink)' }} />
            <span className="strong">{profile?.full_name || profile?.email}</span>
            <span className="badge">{profile?.role}</span>
          </div>
          {kind === 'staff' && (
            <div className="segmented">
              <button className={!advanced ? 'on' : ''} onClick={() => setAdvanced(false)}>Simple</button>
              <button className={advanced ? 'on' : ''} onClick={() => setAdvanced(true)}>Advanced</button>
            </div>
          )}
        </header>
        <main className="content">
          <Outlet />
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
            <div className="between mb"><h3>Everything</h3><button className="btn ghost sm" onClick={() => setMore(false)}>Close</button></div>
            <div className="sheet-grid">
              {links.map((n) => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMore(false)}>{n.label}</NavLink>)}
              <Link to="/" onClick={() => setMore(false)}>Marketplace</Link>
              <a href="#" onClick={(e) => { e.preventDefault(); signOut() }}>Sign out</a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
