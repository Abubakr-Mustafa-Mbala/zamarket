import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Shell from './components/Shell'
import { Loading } from './components/ui'
import { PublicShell, Storefront, ProductPage, ReferralCapture, StorePage, SearchPage, SellersPage, GoLink } from './pages/public/Marketplace'
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
const StudioPage = lazy(() => import('./pages/admin/Products').then((m) => ({ default: m.StudioPage })))
const Inventory = named(adminStock, 'Inventory')
const Purchases = named(adminStock, 'Purchases')
const Suppliers = named(adminStock, 'Suppliers')
const Simulator = lazy(() => import('./pages/admin/Simulator'))
const Offers = lazy(() => import('./pages/admin/Offers'))
const Customers = named(adminPeople, 'Customers')
const Deliveries = named(adminPeople, 'Deliveries')
const Vendors = named(adminPartners, 'Vendors')
const Affiliates = named(adminPartners, 'Resellers')
const MarketingHub = lazy(() => import('./pages/marketing/MarketingHub'))
const growthPages = () => import('./pages/public/GrowthPages')
const MagnetPage = named(growthPages, 'MagnetPage')
const InvitePage = named(growthPages, 'InvitePage')
const RatePage = named(growthPages, 'RatePage')
const About = lazy(() => import('./pages/public/About'))
const HowItWorks = lazy(() => import('./pages/public/HowItWorks'))
const Protection = lazy(() => import('./pages/public/Protection'))
const VendorRefCapture = named(growthPages, 'VendorRefCapture')
const SavedPage = named(growthPages, 'SavedPage')
const CategoriesPage = named(growthPages, 'CategoriesPage')
const Reviews = named(adminGrowth, 'Reviews')
const Finance = lazy(() => import('./pages/admin/Finance'))
const Receipt = lazy(() => import('./pages/admin/Receipt'))
const OfferingBuilder = lazy(() => import('./pages/admin/OfferingBuilder'))
const Deals = lazy(() => import('./pages/admin/Deals'))
const earningsPages = () => import('./pages/shared/EarningsPages')
const AdminEarnings = named(earningsPages, 'AdminEarnings')
const PartnerEarnings = named(earningsPages, 'PartnerEarnings')
const ResellerEarnings = named(earningsPages, 'ResellerEarnings')
const VendorEarnings = named(earningsPages, 'VendorEarnings')
const AddStock = lazy(() => import('./pages/admin/AddStock'))
const StockCount = lazy(() => import('./pages/admin/StockCount'))
const MoneyCheck = lazy(() => import('./pages/admin/MoneyCheck'))
const Reports = named(adminSetup, 'Reports')
const Team = named(adminSetup, 'Team')
const Settings = named(adminSetup, 'Settings')
const Audit = named(adminSetup, 'Audit')
const FindCustomers = lazy(() => import('./pages/reseller/FindCustomers'))
const Training = lazy(() => import('./pages/reseller/Training'))
const ResellerHome = named(resellerPages, 'ResellerHome')
const ResellerProducts = named(resellerPages, 'ResellerProducts')
const ResellerNewSale = named(resellerPages, 'ResellerNewSale')
const ResellerCommissions = named(resellerPages, 'ResellerCommissions')
const VendorHome = named(vendorPages, 'VendorHome')
const VendorProducts = named(vendorPages, 'VendorProducts')
const VendorOrders = named(vendorPages, 'VendorOrders')
const VendorPayouts = named(vendorPages, 'VendorPayouts')
const VendorStore = named(vendorPages, 'VendorStore')
const VendorStudio = named(vendorPages, 'VendorStudio')
const VendorMarketing = named(vendorPages, 'VendorMarketing')

const STAFF = ['founder', 'ops', 'finance', 'delivery', 'marketing']

// Waits for the session AND profile before deciding. Redirecting while either is still
// loading is what causes "signed in, then thrown back to the login page".
function Guard({ roles, children }) {
  const { user, role, loading, signOut, expired } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="auth-wrap"><Loading /></div>
  if (user && !role) return (
    <div className="auth-wrap"><div className="card auth-card stack">
      <h2>{expired ? 'Please sign in again' : 'Account not set up'}</h2>
      <p className="small">{expired
        ? 'Your sign-in expired while this tab was left open. Signing in again takes a second and nothing is lost.'
        : "You're signed in, but there's no profile for this account. Ask a founder to invite your email address, then sign up again."}</p>
      <button className="btn primary" onClick={signOut}>{expired ? 'Sign in again' : 'Sign out'}</button>
    </div></div>
  )
  if (!roles.includes(role)) return <Navigate to={homeFor(role)} replace />
  return children
}

function StaffHome() {
  const { role } = useAuth()
  return role === 'marketing' ? <Navigate to="/admin/marketing" replace /> : <Dashboard />
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
        <Route path="/store/:id" element={<StorePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/sellers" element={<SellersPage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:number" element={<OrderConfirmed />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/account" element={<Account />} />
        <Route path="/apply/:kind" element={<Apply />} />
        <Route path="/free/:slug" element={<MagnetPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/rate/:link" element={<RatePage />} />
        <Route path="/about" element={<About />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/protection" element={<Protection />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
      </Route>
      <Route path="/v/:code" element={<VendorRefCapture />} />
      <Route element={<PublicShell />}>
      </Route>
      <Route path="/r/:code" element={<ReferralCapture />} />
      <Route path="/r/:code/:product" element={<ReferralCapture />} />
      <Route path="/go/:code" element={<GoLink />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin/orders/:id/receipt" element={<Guard roles={STAFF}><Receipt /></Guard>} />
      <Route path="/admin" element={<Guard roles={STAFF}><Shell kind="staff" /></Guard>}>
        <Route index element={<StaffHome />} />
        <Route path="add-stock" element={<AddStock />} />
        <Route path="stock-count" element={<StockCount />} />
        <Route path="money-check" element={<MoneyCheck />} />
        <Route path="orders" element={<OrdersList />} />
        <Route path="deals" element={<Deals />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="products/:id/page" element={<OfferingBuilder />} />
        <Route path="customers" element={<Customers />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="simulator" element={<Simulator />} />
        <Route path="offers" element={<Offers />} />
        <Route path="resellers" element={<Affiliates />} />
        <Route path="vendors" element={<Vendors />} />
        <Route path="marketing" element={<MarketingHub />} />
        <Route path="marketing/:section" element={<MarketingHub />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="finance" element={<Finance />} />
        <Route path="earnings" element={<AdminEarnings />} />
        <Route path="earnings/:scope/:id" element={<PartnerEarnings />} />
        <Route path="reports" element={<Reports />} />
        <Route path="team" element={<Founder><Team /></Founder>} />
        <Route path="settings" element={<Founder><Settings /></Founder>} />
        <Route path="audit" element={<Founder><Audit /></Founder>} />
      </Route>

      <Route path="/sell" element={<Guard roles={['reseller']}><Shell kind="reseller" /></Guard>}>
        <Route index element={<ResellerHome />} />
        <Route path="products" element={<ResellerProducts />} />
        <Route path="find-customers" element={<FindCustomers />} />
        <Route path="training" element={<Training />} />
        <Route path="new-sale" element={<ResellerNewSale />} />
        <Route path="commissions" element={<ResellerCommissions />} />
        <Route path="earnings" element={<ResellerEarnings />} />
      </Route>

      <Route path="/vendor" element={<Guard roles={['vendor']}><Shell kind="vendor" /></Guard>}>
        <Route index element={<VendorHome />} />
        <Route path="products" element={<VendorProducts />} />
        <Route path="shopfront" element={<VendorStore />} />
        <Route path="studio" element={<VendorStudio />} />
        <Route path="orders" element={<VendorOrders />} />
        <Route path="payouts" element={<VendorPayouts />} />
        <Route path="products/:id/page" element={<OfferingBuilder />} />
        <Route path="earnings" element={<VendorEarnings />} />
        <Route path="marketing" element={<VendorMarketing />} />
      </Route>

      <Route element={<PublicShell />}>
        <Route path="/:store" element={<StorePage />} />
        <Route path="/:store/:product" element={<ProductPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
