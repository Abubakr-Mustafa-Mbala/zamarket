import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Shell from './components/Shell'
import { Loading } from './components/ui'
import { PublicShell, Storefront, ProductPage, ReferralCapture } from './pages/public/Marketplace'
import { Cart, Checkout, OrderConfirmed, ReviewPage } from './pages/public/Checkout'
import { Login, Account, Apply, homeFor } from './pages/public/Auth'
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })))
const adminOrders = () => import('./pages/admin/Orders')
const adminStock = () => import('./pages/admin/Stock')
const adminPeople = () => import('./pages/admin/Customers')
const adminPartners = () => import('./pages/admin/Partners')
const adminGrowth = () => import('./pages/admin/Growth')
const adminSetup = () => import('./pages/admin/Setup')
const resellerPages = () => import('./pages/reseller/Reseller')
const vendorPages = () => import('./pages/vendor/Vendor')

const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const OrdersList = named(adminOrders, 'OrdersList')
const OrderDetail = named(adminOrders, 'OrderDetail')
const Products = lazy(() => import('./pages/admin/Products'))
const Inventory = named(adminStock, 'Inventory')
const Purchases = named(adminStock, 'Purchases')
const Suppliers = named(adminStock, 'Suppliers')
const Simulator = lazy(() => import('./pages/admin/Simulator'))
const Offers = lazy(() => import('./pages/admin/Offers'))
const Customers = named(adminPeople, 'Customers')
const Deliveries = named(adminPeople, 'Deliveries')
const Vendors = named(adminPartners, 'Vendors')
const Resellers = named(adminPartners, 'Resellers')
const Marketing = named(adminGrowth, 'Marketing')
const Reviews = named(adminGrowth, 'Reviews')
const Finance = lazy(() => import('./pages/admin/Finance'))
const Receipt = lazy(() => import('./pages/admin/Receipt'))
const AddStock = lazy(() => import('./pages/admin/AddStock'))
const Reports = named(adminSetup, 'Reports')
const Team = named(adminSetup, 'Team')
const Settings = named(adminSetup, 'Settings')
const Audit = named(adminSetup, 'Audit')
const ResellerHome = named(resellerPages, 'ResellerHome')
const ResellerProducts = named(resellerPages, 'ResellerProducts')
const ResellerNewSale = named(resellerPages, 'ResellerNewSale')
const ResellerCommissions = named(resellerPages, 'ResellerCommissions')
const VendorHome = named(vendorPages, 'VendorHome')
const VendorProducts = named(vendorPages, 'VendorProducts')
const VendorOrders = named(vendorPages, 'VendorOrders')
const VendorPayouts = named(vendorPages, 'VendorPayouts')

const STAFF = ['founder', 'ops', 'finance', 'delivery']

// Waits for the session AND profile before deciding. Redirecting while either is still
// loading is what causes "signed in, then thrown back to the login page".
function Guard({ roles, children }) {
  const { user, role, loading, signOut } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="auth-wrap"><Loading /></div>
  if (user && !role) return (
    <div className="auth-wrap"><div className="card auth-card stack">
      <h2>Account not set up</h2>
      <p className="small">You're signed in, but there's no profile for this account. Make sure supabase/schema.sql was run before you created the account, then sign up again.</p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </div></div>
  )
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!roles.includes(role)) return <Navigate to={homeFor(role)} replace />
  return children
}

function Founder({ children }) {
  const { isFounder } = useAuth()
  return isFounder ? children : <Navigate to="/admin" replace />
}

export default function App() {
  if (!configured) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card stack">
          <h2>Almost there</h2>
          <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Netlify → Site configuration → Environment variables, then redeploy.</p>
        </div>
      </div>
    )
  }
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<PublicShell />}>
        <Route path="/" element={<Storefront />} />
        <Route path="/p/:id" element={<ProductPage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:number" element={<OrderConfirmed />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/account" element={<Account />} />
        <Route path="/apply/:kind" element={<Apply />} />
      </Route>
      <Route path="/r/:code" element={<ReferralCapture />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin/orders/:id/receipt" element={<Guard roles={STAFF}><Receipt /></Guard>} />
      <Route path="/admin" element={<Guard roles={STAFF}><Shell kind="staff" /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="add-stock" element={<AddStock />} />
        <Route path="orders" element={<OrdersList />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="customers" element={<Customers />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="simulator" element={<Simulator />} />
        <Route path="offers" element={<Offers />} />
        <Route path="resellers" element={<Resellers />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="finance" element={<Finance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="team" element={<Founder><Team /></Founder>} />
        <Route path="settings" element={<Founder><Settings /></Founder>} />
        <Route path="audit" element={<Founder><Audit /></Founder>} />
      </Route>

      <Route path="/sell" element={<Guard roles={['reseller']}><Shell kind="reseller" /></Guard>}>
        <Route index element={<ResellerHome />} />
        <Route path="products" element={<ResellerProducts />} />
        <Route path="new-sale" element={<ResellerNewSale />} />
        <Route path="commissions" element={<ResellerCommissions />} />
      </Route>

      <Route path="/vendor" element={<Guard roles={['vendor']}><Shell kind="vendor" /></Guard>}>
        <Route index element={<VendorHome />} />
        <Route path="products" element={<VendorProducts />} />
        <Route path="orders" element={<VendorOrders />} />
        <Route path="payouts" element={<VendorPayouts />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
