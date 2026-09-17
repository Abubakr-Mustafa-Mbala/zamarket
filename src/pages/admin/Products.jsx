import { useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, pct, slugify, n, title } from '../../lib/format'
import { margin, markup, priceFromMargin, priceFromMarkup, unitEconomics, light } from '../../lib/economics'
import { CATEGORIES } from '../../lib/statuses'
import { uploadPhoto } from '../../lib/photos'
import { Badge, Table, Loading, Modal, Field, Input, Select, Textarea, Segmented, Breakdown, Light, useToast, Tabs } from '../../components/ui'

export const effectiveCost = (p) => (p.cost_override != null ? n(p.cost_override) : p.landed_units > 0 ? n(p.landed_cost_total) / p.landed_units : 0)

export default function Products() {
  const { advanced, settings, isStaff } = useAuth()
  const [edit, setEdit] = useState(null)
  const [tab, setTab] = useState('founder')
  const { data, loading, reload } = useData(() => q(supabase.from('products').select('*,vendor:vendors(business_name)').order('created_at', { ascending: false })), [])
  const rows = (data || []).filter((p) => (tab === 'founder' ? p.owner_type === 'founder' : tab === 'vendor' ? p.owner_type === 'vendor' && p.status !== 'submitted' : p.status === 'submitted'))
  const submitted = (data || []).filter((p) => p.status === 'submitted').length

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Products</h1><p>What we sell, what it really costs, and what's left.</p></div>
        <button className="btn primary" onClick={() => setEdit({ owner_type: 'founder', status: 'draft', benefits: [], images: [], faqs: [] })}>Add product</button>
      </div>
      <Tabs tabs={[['founder', 'Our products'], ['vendor', 'Vendor products'], ['review', `To review${submitted ? ` (${submitted})` : ''}`]]} value={tab} onChange={setTab} />
      {loading ? <Loading /> : (
        <Table
          rows={rows}
          onRow={setEdit}
          empty={tab === 'review' ? 'No vendor products waiting for review' : 'No products yet'}
          cols={[
            { key: 'name', label: 'Product', render: (p) => <div><div className="strong">{p.name}</div><div className="tiny muted">{p.vendor?.business_name || p.category || ''}</div></div> },
            { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
            { key: 'price', label: 'Price', num: true, render: (p) => money(p.price) },
            ...(tab === 'founder' ? [
              { key: 'cost', label: 'Cost', num: true, render: (p) => money(effectiveCost(p)) },
              { key: 'margin', label: 'Margin', num: true, render: (p) => { const m = margin(p.price, effectiveCost(p)); return <span className={m < n(settings.target_margin_pct) ? 'warn' : 'ok'}>{pct(m)}</span> } },
              { key: 'stock', label: 'Stock', num: true, render: (p) => <span className={p.stock_available <= 3 ? 'warn' : ''}>{p.stock_available}</span> },
            ] : []),
          ]}
        />
      )}
      {edit && <ProductEditor product={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

export function ProductEditor({ product, onClose, onDone, vendorMode }) {
  const toast = useToast()
  const { settings, advanced, user, isStaff } = useAuth()
  const [p, setP] = useState({ ...product, benefits_text: (product.benefits || []).join('\n'), images_text: (product.images || []).join('\n'), faqs_text: (product.faqs || []).map((f) => `${f.q} | ${f.a}`).join('\n') })
  const [calc, setCalc] = useState({ mode: 'markup', value: settings.target_markup_pct ?? 50 })
  const [uploading, setUploading] = useState(false)
  const set = (k) => (v) => setP((c) => ({ ...c, [k]: v }))
  const cost = effectiveCost(p)
  const isNew = !p.id

  const econ = useMemo(() => unitEconomics({
    price: p.price, productCost: cost, packaging: p.packaging_cost ?? settings.default_packaging_cost, paymentFeePct: settings.payment_fee_pct,
    commissionPct: p.commission_type === 'pct' ? p.commission_value : p.commission_type === 'flat' ? 0 : settings.default_commission_pct,
    commissionFlat: p.commission_type === 'flat' ? p.commission_value : null,
    marketplaceFeePct: p.owner_type === 'vendor' ? settings.marketplace_fee_pct : 0, minProfit: settings.min_profit_per_unit,
  }), [p.price, cost, p.packaging_cost, p.commission_type, p.commission_value, p.owner_type, settings])
  const lt = light(econ.netMargin, econ.netProfit, settings)
  const suggested = calc.mode === 'margin' ? priceFromMargin(cost, calc.value) : priceFromMarkup(cost, calc.value)

  const save = async (status) => {
    const row = {
      name: p.name, slug: p.slug || slugify(p.name), category: p.category || null, description: p.description || null,
      benefits: p.benefits_text.split('\n').map((s) => s.trim()).filter(Boolean),
      images: p.images_text.split('\n').map((s) => s.trim()).filter(Boolean),
      faqs: p.faqs_text.split('\n').filter((l) => l.includes('|')).map((l) => { const [qq, a] = l.split('|'); return { q: qq.trim(), a: (a || '').trim() } }),
      price: n(p.price), normal_price: p.normal_price === '' || p.normal_price == null ? null : n(p.normal_price),
      cost_override: p.cost_override === '' || p.cost_override == null ? null : n(p.cost_override),
      packaging_cost: p.packaging_cost === '' || p.packaging_cost == null ? null : n(p.packaging_cost),
      commission_type: p.commission_type || null, commission_value: p.commission_type ? n(p.commission_value) : null,
      status: status || p.status, rejection_reason: p.rejection_reason || null,
    }
    if (isNew) { row.owner_type = vendorMode ? 'vendor' : 'founder'; row.created_by = user.id; if (vendorMode) row.vendor_id = vendorMode }
    const res = isNew ? await supabase.from('products').insert(row) : await supabase.from('products').update(row).eq('id', p.id)
    if (res.error) return toast(res.error.message, true)
    toast(status === 'published' ? 'Published' : status === 'submitted' ? 'Sent for review' : 'Saved')
    onDone()
  }

  return (
    <Modal title={isNew ? 'New product' : p.name} onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="stack">
        <div className="form-grid">
          <Field label="Name" span><Input value={p.name} onChange={set('name')} required /></Field>
          <Field label="Category"><Select value={p.category} onChange={set('category')} options={CATEGORIES} placeholder="Choose" /></Field>
          <Field label="Status">{vendorMode ? <Badge status={p.status} /> : <Select value={p.status} onChange={set('status')} options={['draft', 'submitted', 'approved', 'published', 'rejected', 'out_of_stock', 'suspended']} />}</Field>
          <Field label="Selling price"><Input money value={p.price} onChange={set('price')} required /></Field>
          <Field label="Normal price (to show savings)"><Input money value={p.normal_price} onChange={set('normal_price')} /></Field>
          <Field label="Description" span><Textarea value={p.description} onChange={set('description')} rows={4} /></Field>
          <Field label="Benefits (one per line)" span><Textarea value={p.benefits_text} onChange={set('benefits_text')} rows={3} /></Field>
          <Field label="Photos" span>
            <div className="row">
              {p.images_text.split('\n').filter(Boolean).map((src) => (
                <div key={src} style={{ position: 'relative' }}>
                  <img src={src} alt="" className="thumb" />
                  <button type="button" className="btn sm" style={{ position: 'absolute', top: -6, right: -6, padding: '0 6px' }} aria-label="Remove photo" onClick={() => set('images_text')(p.images_text.split('\n').filter((x) => x && x !== src).join('\n'))}>✕</button>
                </div>
              ))}
              <label className="btn">
                {uploading ? 'Uploading…' : '📷 Add photo'}
                <input type="file" accept="image/*" hidden disabled={uploading} onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return
                  setUploading(true)
                  try { const url = await uploadPhoto(file); set('images_text')([...p.images_text.split('\n').filter(Boolean), url].join('\n')) }
                  catch (err) { toast(err.message, true) } finally { setUploading(false); e.target.value = '' }
                }} />
              </label>
            </div>
          </Field>
          <Field label="FAQs (one per line: question | answer)" span><Textarea value={p.faqs_text} onChange={set('faqs_text')} rows={2} /></Field>
        </div>

        {!vendorMode && (
          <div className="card flat">
            <div className="between mb"><h3>Economics</h3><Light tone={lt.tone} label={lt.label} /></div>
            <div className="grid-2 tight">
              <div>
                <Breakdown
                  items={[
                    ['Selling price', econ.price],
                    [`Product cost ${p.landed_units > 0 && p.cost_override == null ? '(from purchases)' : ''}`, -econ.productCost, 'bad'],
                    ['Packaging', -econ.packaging, 'bad'],
                    econ.commission ? ['Reseller commission', -econ.commission, 'bad'] : null,
                    econ.marketplaceFee ? ['Marketplace fee', -econ.marketplaceFee, 'bad'] : null,
                    econ.paymentFee ? ['Payment fee', -econ.paymentFee, 'bad'] : null,
                  ]}
                  total={['Profit per unit', econ.netProfit, econ.netProfit > 0 ? 'ok' : 'bad']}
                />
                <p className="tiny muted mt">Margin {pct(econ.netMargin)} · Markup {pct(econ.markup)} · Break-even price {money(econ.breakEvenPrice)}</p>
                {p.landed_units > 0 && advanced && (
                  <p className="tiny muted">Landed cost total {money(p.landed_cost_total)} across {p.landed_units} sellable units → {money(cost)} each. Open Purchases for the full breakdown.</p>
                )}
              </div>
              <div className="stack-sm">
                <div className="between"><span className="small strong">Price for a target</span><Segmented options={[['markup', 'On cost'], ['margin', 'Of price']]} value={calc.mode} onChange={(m) => setCalc({ ...calc, mode: m })} /></div>
                <div className="row">
                  <Input type="number" value={calc.value} onChange={(v) => setCalc({ ...calc, value: v })} style={{ width: 90 }} /><span className="small">% {calc.mode} → <span className="strong">{money(suggested)}</span></span>
                  <button type="button" className="btn sm" onClick={() => set('price')(suggested)}>Use it</button>
                </div>
                <p className="tiny muted">Margin is profit ÷ price. Markup is profit ÷ cost. 50% markup on K10 is K15; 50% margin on K10 is K20.</p>
                <div className="form-grid">
                  <Field label="Cost override" hint="Leave empty to use landed cost"><Input money value={p.cost_override} onChange={set('cost_override')} /></Field>
                  <Field label="Packaging per unit"><Input money value={p.packaging_cost} onChange={set('packaging_cost')} placeholder={String(settings.default_packaging_cost ?? 0)} /></Field>
                  <Field label="Reseller commission"><Select value={p.commission_type || ''} onChange={(v) => set('commission_type')(v || null)} options={[['', `Default (${settings.default_commission_pct}%)`], ['pct', 'Percentage'], ['flat', 'Flat amount']]} /></Field>
                  {p.commission_type && <Field label={p.commission_type === 'pct' ? 'Commission %' : 'Commission K'}><Input money value={p.commission_value} onChange={set('commission_value')} /></Field>}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isNew && !vendorMode && p.owner_type === 'founder' && (
          <div className="card flat">
            <h3 className="mb">Stock</h3>
            <div className="grid-3">
              <div><div className="tiny muted">Available</div><div className="strong">{p.stock_available}</div></div>
              <div><div className="tiny muted">Reserved</div><div className="strong">{p.stock_reserved}</div></div>
              <div><div className="tiny muted">Sold</div><div className="strong">{p.stock_sold}</div></div>
              <div><div className="tiny muted">Returned</div><div className="strong">{p.stock_returned}</div></div>
              <div><div className="tiny muted">Damaged</div><div className="strong">{p.stock_damaged}</div></div>
              <div><div className="tiny muted">Lost</div><div className="strong">{p.stock_lost}</div></div>
            </div>
            <p className="tiny muted mt">Stock comes in through Purchases. Use Inventory for adjustments.</p>
          </div>
        )}

        {p.status === 'submitted' && isStaff && !vendorMode && (
          <div className="card flat stack-sm">
            <h3>Vendor product review</h3>
            <Field label="Reason (if rejecting)"><Input value={p.rejection_reason} onChange={set('rejection_reason')} /></Field>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => save('published')}>Approve and publish</button>
              <button type="button" className="btn danger" onClick={() => save('rejected')}>Reject</button>
            </div>
          </div>
        )}

        <div className="btn-row">
          <button className="btn primary">{isNew ? 'Create' : 'Save changes'}</button>
          {vendorMode && p.status !== 'published' && <button type="button" className="btn" onClick={() => save('submitted')}>Save and send for review</button>}
          {!vendorMode && p.status !== 'published' && p.status !== 'submitted' && <button type="button" className="btn copper" onClick={() => save('published')}>Save and publish</button>}
        </div>
      </form>
    </Modal>
  )
}
