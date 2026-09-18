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
  { to: '/admin/deals', label: 'Enquiries' },
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
  { to: '/admin/earnings', label: 'Earnings' },
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
  { to: '/sell/new-sale', label: 'Record a sale' },
  { to: '/sell/earnings', label: 'My earnings' },
  { to: '/sell/commissions', label: 'Commissions' },
]

const VENDOR_NAV = [
  { to: '/vendor', label: 'Overview', end: true },
  { to: '/vendor/products', label: 'My products' },
  { to: '/vendor/orders', label: 'Orders' },
  { to: '/vendor/earnings', label: 'My earnings' },
  { to: '/vendor/payouts', label: 'Payouts' },
  { to: '/vendor/marketing', label: 'Share and advertise' },
]

const MARKETING_NAV = [
  { group: 'Marketing' },
  { to: '/admin/marketing', label: 'Overview', end: true },
  { to: '/admin/marketing/today', label: 'Today' },
  { to: '/admin/marketing/leads', label: 'Leads' },
  { to: '/admin/marketing/campaigns', label: 'Campaigns' },
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
    { to: '/sell/new-sale', label: 'New sale', icon: I.cart },
    { to: '/sell/earnings', label: 'Earnings', icon: I.coins },
  ],
  vendor: [
    { to: '/vendor', label: 'Home', icon: I.home, end: true },
    { to: '/vendor/products', label: 'Products', icon: I.box },
    { to: '/vendor/orders', label: 'Orders', icon: I.cart },
    { to: '/vendor/earnings', label: 'Earnings', icon: I.coins },
  ],
}

export default function Shell({ kind }) {
  const { profile, isFounder, advanced, setAdvanced, signOut } = useAuth()
  const [more, setMore] = useState(false)
  const { role } = useAuth()
  const marketer = kind === 'staff' && role === 'marketing'
  const nav = (marketer ? MARKETING_NAV : kind === 'staff' ? STAFF_NAV : kind === 'reseller' ? RESELLER_NAV : VENDOR_NAV).filter(
    (n) => (!n.founder || isFounder) && (!n.advanced || advanced)
  ).filter((n, i, arr) => !n.group || (arr[i + 1] && arr[i + 1].to))
  const tabs = marketer ? MOBILE_TABS.marketing : MOBILE_TABS[kind]
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
          {kind === 'staff' && !marketer && (
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
