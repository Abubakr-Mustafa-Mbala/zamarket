import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, Empty, Tabs, Badge } from '../../components/ui'
import { ActingVendorProvider } from '../../lib/actingVendor'
import { VendorStore, VendorProducts } from '../vendor/Vendor'

// Setting up a seller's shop for them.
//
// Not every seller can do this themselves. Some have no smartphone to hand,
// some are not confident with forms, and plenty have photos that need redoing
// before anything should go live. Talking somebody through it over the phone is
// slow and the result is usually worse than if we had simply done it.
//
// So this page hands a staff member the seller's own screens, pointed at the
// seller's shop. It is deliberately the same components the seller uses rather
// than an admin copy of them: one set of forms, one set of rules, and whatever
// is set up here is exactly what the seller finds when they next sign in.
export default function SellerSetup() {
  const { id } = useParams()
  const nav = useNavigate()
  const [tab, setTab] = useState('shopfront')
  const { data: vendor, loading, error, reload } = useData(
    () => q(supabase.from('vendors').select('*').eq('id', id).single()), [id])

  if (loading) return <Loading />
  if (error || !vendor) {
    return (
      <Empty title="That seller could not be opened">
        {error || 'They may have been removed.'}{' '}
        <Link to="/admin/vendors">Back to sellers</Link>
      </Empty>
    )
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/admin/vendors" className="small">← Sellers</Link>
          <h1>{vendor.business_name}</h1>
          <p>
            You are setting this shop up on the seller's behalf. These are their own
            screens — whatever you save here is what they will see when they sign in.
          </p>
        </div>
        <div className="btn-row">
          <Badge status={vendor.status} />
          {vendor.slug && (
            <a className="btn sm" href={`/${vendor.slug}`} target="_blank" rel="noreferrer">View shop</a>
          )}
        </div>
      </div>

      <div className="note-strip">
        <strong>Tell the seller what you changed.</strong> It is their business, and
        a price or a description they did not write is one they cannot stand behind
        with a customer. Set it up, then walk them through what is there.
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[['shopfront', 'Shopfront'], ['products', 'Products']]}
      />

      {/* The seller's own components, pointed at this shop. */}
      <ActingVendorProvider vendor={vendor} onSaved={reload}>
        {tab === 'shopfront' ? <VendorStore /> : <VendorProducts />}
      </ActingVendorProvider>
    </div>
  )
}
