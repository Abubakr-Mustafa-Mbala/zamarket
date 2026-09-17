import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, n } from '../../lib/format'
import { pricing } from '../../lib/economics'
import { uploadPhoto } from '../../lib/photos'
import { CATEGORY_NAMES as CATEGORIES } from '../../lib/categories'
import { useToast } from '../../components/ui'

const STEPS = ['What', 'How many', 'Costs', 'Price', 'Done']

function Big({ label, hint, children }) {
  return (
    <label className="big-field">
      <span className="big-label">{label}</span>
      {children}
      {hint && <span className="big-hint">{hint}</span>}
    </label>
  )
}

function MoneyBox({ value, onChange, placeholder = '0', autoFocus }) {
  return (
    <div className="big-money">
      <span>K</span>
      <input inputMode="decimal" type="number" min="0" step="any" value={value ?? ''} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function AddStock() {
  const { settings } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const fileRef = useRef(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [search, setSearch] = useState('')
  const { data: products } = useData(() => q(supabase.from('products').select('id,name,price,images,stock_available,packaging_cost,commission_type,commission_value,landed_cost_total,landed_units,cost_override,category').eq('owner_type', 'founder').order('name')), [])

  const [f, setF] = useState({
    product: null, name: '', category: '', images: [],
    quantity: '', payMode: 'each', unit_price: '', total_paid: '', supplier_name: '', damaged: '',
    shipping: '', transport: '', storage: '', other: '',
    per_sale_cost: settings.default_packaging_cost ?? 5,
    commission_type: 'pct', commission_value: settings.default_commission_pct ?? 5,
    price: '', publish: true,
    target: settings.target_markup_pct ?? 50,
  })
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))

  const qty = parseInt(f.quantity) || 0
  const damaged = Math.min(parseInt(f.damaged) || 0, Math.max(0, qty - 1))
  const sellable = Math.max(0, qty - damaged)
  const goods = f.payMode === 'each' ? n(f.unit_price) * qty : n(f.total_paid)
  const extras = n(f.shipping) + n(f.transport) + n(f.storage) + n(f.other)
  const batchCost = sellable ? (goods + extras) / sellable : 0
  // Restocking an existing product: the price should cover the average cost of old + new stock.
  const oldUnits = f.product?.landed_units || 0
  const oldTotal = n(f.product?.landed_cost_total)
  const unitCost = f.product && oldUnits > 0 && f.product.cost_override == null ? (oldTotal + goods + extras) / (oldUnits + sellable) : batchCost

  const pr = useMemo(() => pricing({
    unitCost, perSale: n(f.per_sale_cost),
    commissionType: f.commission_type, commissionValue: n(f.commission_value),
    paymentFeePct: n(settings.payment_fee_pct), targetMarkup: f.target === '' ? 0 : n(f.target),
  }), [unitCost, f.per_sale_cost, f.commission_type, f.commission_value, f.target, settings])
  const price = f.price === '' ? pr.minYou.price : n(f.price)
  const k = pr.keep(price)
  const target = pr.targetMarkup
  const picked = price === pr.minYou.price ? 'you' : price === pr.minReseller.price ? 'reseller' : null

  const pickProduct = (p) => {
    setF((c) => ({
      ...c, product: p, name: p.name, category: p.category || '',
      per_sale_cost: p.packaging_cost ?? c.per_sale_cost,
      commission_type: p.commission_type || 'pct',
      commission_value: p.commission_type ? p.commission_value : settings.default_commission_pct ?? 5,
      price: '',
      current_price: p.price,
    }))
    setStep(1)
  }

  const addPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try { const url = await uploadPhoto(file); setF((c) => ({ ...c, images: [...c.images, url] })) }
    catch (err) { toast(err.message, true) }
    finally { setBusy(false); e.target.value = '' }
  }

  const canNext = [
    Boolean(f.product || f.name.trim()),
    qty > 0 && goods > 0 && damaged < qty,
    true,
    price > 0,
  ][step]

  const save = async () => {
    setBusy(true)
    const payload = {
      product_id: f.product?.id || null, name: f.name, category: f.category, images: f.images,
      supplier_name: f.supplier_name, quantity: qty, damaged,
      ...(f.payMode === 'each' ? { unit_price: n(f.unit_price) } : { total_paid: n(f.total_paid) }),
      shipping: n(f.shipping), transport: n(f.transport), storage: n(f.storage), other: n(f.other),
      per_sale_cost: n(f.per_sale_cost), price,
      commission_type: n(f.commission_value) > 0 ? f.commission_type : null, commission_value: n(f.commission_value),
      publish: f.publish,
    }
    const { data, error } = await supabase.rpc('add_stock', { payload })
    setBusy(false)
    if (error) return toast(error.message, true)
    setDone({ ...data, name: f.name, price, sellable, keepAll: k.you * sellable, keepAllReseller: k.withReseller * sellable })
    setStep(4)
  }

  const shown = (products || []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="wizard">
      <div className="wizard-top">
        <h1>{step === 4 ? 'All done' : 'I bought goods'}</h1>
        {step < 4 && <div className="dots" aria-label={`Step ${step + 1} of 4`}>{STEPS.slice(0, 4).map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>}
      </div>

      {/* STEP 1 — WHAT */}
      {step === 0 && (
        <div className="stack">
          <Big label="What did you buy?">
            <input className="big-input" value={f.product ? '' : f.name} onChange={(e) => setF({ ...f, product: null, name: e.target.value })} placeholder="e.g. Tecno Spark 20 phone" autoFocus />
          </Big>
          {f.name.trim() && !f.product && (
            <>
              <div className="stack-sm">
                <span className="big-label">Photo (optional)</span>
                <div className="row">
                  {f.images.map((src) => <img key={src} src={src} alt="" className="thumb" />)}
                  <button type="button" className="btn big" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Uploading…' : f.images.length ? '+ Another photo' : '📷 Take or choose a photo'}</button>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={addPhoto} />
                </div>
              </div>
              <div className="stack-sm">
                <span className="big-label">Type of product (optional)</span>
                <div className="chips">{CATEGORIES.map((c) => <button type="button" key={c} className={`chip ${f.category === c ? 'on' : ''}`} onClick={() => set('category')(f.category === c ? '' : c)}>{c}</button>)}</div>
              </div>
            </>
          )}
          {(products || []).length > 0 && !f.name.trim() && (
            <div className="stack-sm">
              <span className="big-label">Or add more of something you already sell</span>
              {products.length > 6 && <input className="input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />}
              {shown.slice(0, 12).map((p) => (
                <button key={p.id} type="button" className="pick" onClick={() => pickProduct(p)}>
                  {p.images?.[0] ? <img src={p.images[0]} alt="" /> : <span className="ph" />}
                  <span className="grow"><span className="strong">{p.name}</span><span className="small muted">{p.stock_available} in stock · selling at {money(p.price)}</span></span>
                  <span aria-hidden>›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — HOW MANY */}
      {step === 1 && (
        <div className="stack">
          <p className="lead">{f.product ? `Adding more ${f.name}` : f.name}</p>
          <Big label="How many did you buy?">
            <input className="big-input" inputMode="numeric" type="number" min="1" value={f.quantity} onChange={(e) => set('quantity')(e.target.value)} placeholder="e.g. 50" autoFocus />
          </Big>
          <div className="stack-sm">
            <span className="big-label">What did you pay?</span>
            <div className="toggle2">
              <button type="button" className={f.payMode === 'each' ? 'on' : ''} onClick={() => set('payMode')('each')}>Price for each one</button>
              <button type="button" className={f.payMode === 'total' ? 'on' : ''} onClick={() => set('payMode')('total')}>Total I paid</button>
            </div>
            {f.payMode === 'each'
              ? <MoneyBox value={f.unit_price} onChange={set('unit_price')} placeholder="e.g. 1000" />
              : <MoneyBox value={f.total_paid} onChange={set('total_paid')} placeholder="e.g. 50000" />}
            {qty > 0 && goods > 0 && <span className="big-hint">{f.payMode === 'each' ? `Total: ${money(goods)}` : `That's ${money(goods / qty)} each`}</span>}
          </div>
          <Big label="Any broken or can't be sold? (optional)" hint="We spread the cost over the ones you can sell.">
            <input className="big-input" inputMode="numeric" type="number" min="0" value={f.damaged} onChange={(e) => set('damaged')(e.target.value)} placeholder="0" />
          </Big>
          <Big label="Who did you buy from? (optional)">
            <input className="big-input" value={f.supplier_name} onChange={(e) => set('supplier_name')(e.target.value)} placeholder="e.g. Kamwala wholesaler" />
          </Big>
        </div>
      )}

      {/* STEP 3 — COSTS */}
      {step === 2 && (
        <div className="stack">
          <p className="lead">Other money you spent to get them here. Leave empty if none.</p>
          <div className="grid-2">
            <Big label="Shipping"><MoneyBox value={f.shipping} onChange={set('shipping')} /></Big>
            <Big label="Transport"><MoneyBox value={f.transport} onChange={set('transport')} /></Big>
            <Big label="Storage / rent"><MoneyBox value={f.storage} onChange={set('storage')} /></Big>
            <Big label="Anything else"><MoneyBox value={f.other} onChange={set('other')} /></Big>
          </div>
          <Big label="Each time you sell one, what do you spend?" hint="Bag or box, fuel, airtime — whatever delivery or packing costs you per item.">
            <MoneyBox value={f.per_sale_cost} onChange={set('per_sale_cost')} />
          </Big>
          <div className="cost-total">
            <span>Each one cost you</span>
            <strong>{money(unitCost)}</strong>
            <span className="small">{money(goods + extras)} ÷ {sellable} you can sell{f.product && oldUnits > 0 ? ' (averaged with your old stock)' : ''}</span>
          </div>
        </div>
      )}

      {/* STEP 4 — PRICE */}
      {step === 3 && (
        <div className="stack">
          <div className="cost-total slim"><span>Each one cost you</span><strong>{money(unitCost)}</strong></div>

          <div className="stack-sm">
            <span className="big-label">When a reseller sells one, they earn</span>
            <div className="row">
              <div className="toggle2 small-toggle">
                <button type="button" className={f.commission_type === 'pct' ? 'on' : ''} onClick={() => set('commission_type')('pct')}>%</button>
                <button type="button" className={f.commission_type === 'flat' ? 'on' : ''} onClick={() => set('commission_type')('flat')}>K</button>
              </div>
              <input className="big-input" style={{ width: 110 }} inputMode="decimal" type="number" min="0" value={f.commission_value} onChange={(e) => set('commission_value')(e.target.value)} />
              <span className="small muted">= {money(k.commission)} per sale</span>
            </div>
          </div>

          <Big label="Profit you want on top of cost" hint="Your usual target is in Settings. Change it here just for this product.">
            <div className="big-money"><input inputMode="decimal" type="number" min="0" step="any" value={f.target} onChange={(e) => set('target')(e.target.value)} /><span>%</span></div>
          </Big>

          <span className="big-label">Choose your price</span>
          <div className="tiers two">
            <button type="button" className={`tier ${picked === 'you' ? 'on' : ''}`} onClick={() => set('price')(String(pr.minYou.price))}>
              <span className="tier-name">Minimum price<em>{target}% profit when you sell</em></span>
              <span className="tier-price">{money(pr.minYou.price, { whole: pr.minYou.price % 1 === 0 })}</span>
              <span className="tier-keep">you keep {money(pr.keep(pr.minYou.price).you)} each</span>
            </button>
            <button type="button" className={`tier ${picked === 'reseller' ? 'on' : ''}`} onClick={() => set('price')(String(pr.minReseller.price))}>
              <span className="tier-name">Minimum with resellers<em>still {target}% after their cut</em></span>
              <span className="tier-price">{money(pr.minReseller.price, { whole: pr.minReseller.price % 1 === 0 })}</span>
              <span className="tier-keep">you keep {money(pr.keep(pr.minReseller.price).withReseller)} each</span>
            </button>
          </div>
          {f.product?.current_price > 0 && <p className="small muted">Currently selling at {money(f.product.current_price)}. <button type="button" className="btn sm ghost" onClick={() => set('price')(String(f.product.current_price))}>Keep that price</button></p>}
          <Big label="Or type your own price"><MoneyBox value={picked ? '' : f.price} onChange={set('price')} placeholder={String(pr.minYou.price)} /></Big>

          <div className={`result ${k.withReseller <= 0 ? 'bad' : price < pr.minYou.exact ? 'warn' : ''}`}>
            <div className="result-head">At {money(price, { whole: price % 1 === 0 })} each</div>
            <div className="result-cols">
              <div>
                <div className="rc-title">You sell it</div>
                <div className="rc-keep">{money(k.you)}</div>
                <div className="rc-sub">you keep each · {k.onCostYou}% on cost</div>
                <div className="rc-total">{money(k.you * sellable, { whole: true })} if all {sellable} sell</div>
              </div>
              <div>
                <div className="rc-title">A reseller sells it</div>
                <div className="rc-keep">{money(k.withReseller)}</div>
                <div className="rc-sub">you keep · {k.onCostReseller}% on cost · reseller gets {money(k.commission)}</div>
                <div className="rc-total">{money(k.withReseller * sellable, { whole: true })} if all {sellable} sell</div>
              </div>
            </div>
            <details className="small">
              <summary>How we worked this out</summary>
              <dl className="kv mt">
                <dt>Customer pays</dt><dd>{money(price)}</dd>
                <dt>What it cost you (buy, bring, store)</dt><dd>−{money(unitCost)}</dd>
                <dt>Bag / delivery per sale</dt><dd>−{money(n(f.per_sale_cost))}</dd>
                {k.paymentFee > 0 && <><dt>Payment fee</dt><dd>−{money(k.paymentFee)}</dd></>}
                <dt className="strong">You keep (you sell)</dt><dd className="strong">{money(k.you)}</dd>
                <dt>Reseller's cut</dt><dd>−{money(k.commission)}</dd>
                <dt className="strong">You keep (reseller sells)</dt><dd className="strong">{money(k.withReseller)}</dd>
                <dt>Your target</dt><dd>{target}% on {money(pr.cost)} = {money(pr.cost * target / 100)} each</dd>
              </dl>
            </details>
            {k.you <= 0 && <div className="warn-line bad">This price is below your cost. You lose money on every sale.</div>}
            {k.you > 0 && k.withReseller <= 0 && <div className="warn-line bad">You lose money when a reseller sells at this price.</div>}
            {k.you > 0 && price < pr.minYou.exact && <div className="warn-line warn">Below your {target}% target — you'd make {k.onCostYou}% on cost.</div>}
            {price >= pr.minYou.exact && k.withReseller > 0 && k.onCostReseller < target && <div className="warn-line warn">When a reseller sells, you make {k.onCostReseller}% on cost — under your {target}% target. Use "Minimum with resellers" ({money(pr.minReseller.price)}) to protect it.</div>}
          </div>

          <label className="check big-check">
            <input type="checkbox" checked={f.publish} onChange={(e) => set('publish')(e.target.checked)} />
            <span>Show it in the shop now, so customers and resellers can see it</span>
          </label>
        </div>
      )}

      {/* DONE */}
      {step === 4 && done && (
        <div className="stack">
          <div className="done-card">
            <div className="done-tick">✓</div>
            <div className="strong">{done.sellable} × {done.name} added</div>
            <div>Selling at <strong>{money(done.price)}</strong> each</div>
            <div className="small">If all sell: you keep about <strong>{money(done.keepAll, { whole: true })}</strong> ({money(done.keepAllReseller, { whole: true })} if resellers sell them all)</div>
            <div className="small muted">{done.status === 'published' ? 'Customers and resellers can see it now.' : 'Hidden for now. Publish it from Products when ready.'}</div>
          </div>
          <Link className="btn big copper block" to="/admin/offers">Make a deal for it (like Buy 2 get 1)</Link>
          <button className="btn big block" onClick={() => { setDone(null); setStep(0); setF((c) => ({ ...c, product: null, name: '', images: [], quantity: '', unit_price: '', total_paid: '', damaged: '', shipping: '', transport: '', storage: '', other: '', price: '', supplier_name: '' })) }}>Add something else</button>
          <button className="btn big ghost block" onClick={() => nav('/admin')}>Back to home</button>
        </div>
      )}

      {step < 4 && (
        <div className="wizard-actions">
          {step > 0 ? <button type="button" className="btn big" onClick={() => setStep(step - 1)}>Back</button> : <Link className="btn big ghost" to="/admin">Cancel</Link>}
          {step < 3
            ? <button type="button" className="btn big primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
            : <button type="button" className="btn big primary" disabled={!canNext || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
        </div>
      )}
    </div>
  )
}
