import { useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { money, pct, num } from '../../lib/format'
import { simulate, priceForTarget } from '../../lib/economics'
import { Field, Input, Segmented, Breakdown, Stat } from '../../components/ui'

const DEFAULTS = (s) => ({
  name: '', quantity: 100, purchasePrice: 60, supplierShipping: 300, inboundTransport: 200, otherInbound: 100,
  sellingPrice: 150, packaging: s.default_packaging_cost ?? 5, delivery: 15, paymentFeePct: s.payment_fee_pct ?? 0,
  commissionPct: s.default_commission_pct ?? 5, marketplaceFeePct: 0, advertising: 10, damagePct: 3, returnPct: 2,
  storage: 200, otherPerUnit: 0, minProfit: s.min_profit_per_unit ?? 5,
})

export default function Simulator() {
  const { settings, advanced } = useAuth()
  const [i, setI] = useState(() => DEFAULTS(settings))
  const [target, setTarget] = useState({ mode: 'markup', value: settings.target_markup_pct ?? 50 })
  const [show, setShow] = useState('expected')
  const set = (k) => (v) => setI((c) => ({ ...c, [k]: v }))
  const r = useMemo(() => simulate(i, settings), [i, settings])
  const u = r.cases[show]
  const t = r.totals[show]
  const suggested = priceForTarget(u.fixedCosts, u.variablePct, target.mode, target.value)

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Should I buy this stock?</h1><p>Before you spend money on stock, check whether it can actually make a profit.</p></div>
      </div>

      <details className="card explain">
        <summary>What is this page for?</summary>
        <div className="stack-sm">
          <p className="small">Say a supplier offers you 50 phone cases at K40 each. Should you buy them? That depends on transport, packaging, what you'll sell them for, what an affiliate takes, and how many get damaged. This page does that arithmetic.</p>
          <ol className="week">
            <li><strong>Fill in what it costs to get them here:</strong> how many, the price each, transport, and anything else you pay once.</li>
            <li><strong>Fill in what it costs to sell one:</strong> your selling price, packaging, delivery, affiliate commission, and any advertising.</li>
            <li><strong>Read the answer at the top right.</strong> BUY means the numbers work. TEST FIRST means they are thin, so buy a small batch. DO NOT BUY means you would lose money.</li>
          </ol>
          <p className="small">It also tells you the lowest price you can sell at, how many you must sell to get your money back, and the most you could pay a supplier and still be fine. The numbers are only as good as your guesses — be honest with them, especially about damage and advertising.</p>
        </div>
      </details>

      <div className="grid-2 tight" style={{ alignItems: 'start' }}>
        <div className="stack">
          <div className="card form-grid">
            <Field label="Product idea" span><Input value={i.name} onChange={set('name')} placeholder="e.g. Solar lamp" /></Field>
            <Field label="Units to buy"><Input type="number" value={i.quantity} onChange={set('quantity')} /></Field>
            <Field label="Purchase price per unit"><Input money value={i.purchasePrice} onChange={set('purchasePrice')} /></Field>
            <Field label="Supplier shipping (total)"><Input money value={i.supplierShipping} onChange={set('supplierShipping')} /></Field>
            <Field label="Transport to us (total)"><Input money value={i.inboundTransport} onChange={set('inboundTransport')} /></Field>
            <Field label="Other inbound (duty, clearing)"><Input money value={i.otherInbound} onChange={set('otherInbound')} /></Field>
            <Field label="Expected damaged / unsellable (%)"><Input type="number" value={i.damagePct} onChange={set('damagePct')} /></Field>
          </div>
          <div className="card form-grid">
            <Field label="Selling price per unit" span>
              <div className="row"><Input money value={i.sellingPrice} onChange={set('sellingPrice')} style={{ flex: 1 }} /></div>
            </Field>
            <Field label="Packaging per unit"><Input money value={i.packaging} onChange={set('packaging')} /></Field>
            <Field label="Delivery cost per order (our cost)"><Input money value={i.delivery} onChange={set('delivery')} /></Field>
            <Field label="Affiliate commission (%)"><Input type="number" value={i.commissionPct} onChange={set('commissionPct')} /></Field>
            <Field label="Advertising per customer"><Input money value={i.advertising} onChange={set('advertising')} /></Field>
            <Field label="Expected returns / refunds (%)"><Input type="number" value={i.returnPct} onChange={set('returnPct')} /></Field>
            <Field label="Storage / rent for this batch (total)"><Input money value={i.storage} onChange={set('storage')} /></Field>
            {advanced && <>
              <Field label="Payment fee (%)"><Input type="number" value={i.paymentFeePct} onChange={set('paymentFeePct')} /></Field>
              <Field label="Other cost per unit"><Input money value={i.otherPerUnit} onChange={set('otherPerUnit')} /></Field>
              <Field label="Minimum profit per unit you'll accept"><Input money value={i.minProfit} onChange={set('minProfit')} /></Field>
            </>}
          </div>
        </div>

        <div className="stack">
          <div className={`card`} style={{ borderColor: `var(--${r.decision.tone})`, background: `var(--${r.decision.tone}-soft)` }}>
            <div className="tiny muted">Decision (expected case)</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }} className={r.decision.tone}>{r.decision.verdict}</div>
            <p className="small">{r.decision.why}</p>
            <p className="tiny muted mt">This is decision support, not a guarantee. Costs and demand in the real world will differ.</p>
          </div>

          <div className="card">
            <div className="between mb"><h3>Landed cost</h3><span className="strong money">{money(r.landed.perUnit)} / sellable unit</span></div>
            <Breakdown items={[['Goods', r.landed.goods], ['Shipping, transport, other', r.landed.extras], ['Sellable units', num(r.sellable)]]} total={['Total to receive the stock', r.landed.total]} />
          </div>

          <div className="card">
            <div className="between mb"><h3>Per unit</h3><Segmented options={[['bad', 'Bad'], ['expected', 'Expected'], ['good', 'Good']]} value={show} onChange={setShow} /></div>
            <p className="tiny muted mb">{r.assumptions[show]}</p>
            <Breakdown
              items={[
                ['Selling price', u.price],
                ['Product (landed)', -u.productCost, 'bad'],
                ['Packaging', -u.packaging, 'bad'],
                ['Delivery', -u.delivery, 'bad'],
                u.paymentFee ? ['Payment fee', -u.paymentFee, 'bad'] : null,
                ['Reseller commission', -u.commission, 'bad'],
                ['Advertising', -u.advertising, 'bad'],
                ['Returns / refunds', -u.returns, 'bad'],
                ['Storage share', -u.storage, 'bad'],
                u.other ? ['Other', -u.other, 'bad'] : null,
              ]}
              total={['Profit per unit', u.netProfit, u.netProfit > 0 ? 'ok' : 'bad']}
            />
            <div className="grid-3 mt">
              <div><div className="tiny muted">Net margin</div><div className="strong">{pct(u.netMargin)}</div></div>
              <div><div className="tiny muted">Markup on true cost</div><div className="strong">{pct(u.markup)}</div></div>
              <div><div className="tiny muted">Contribution before ads</div><div className="strong">{money(u.contributionBeforeAds)}</div></div>
            </div>
          </div>

          <div className="grid-3">
            <Stat label="Revenue (all units)" value={money(t.revenue)} />
            <Stat label="Total profit" value={money(t.profit)} tone={t.profit > 0 ? 'ok' : 'bad'} />
            <Stat label="Break-even units" value={t.breakEvenUnits ?? '—'} sub={t.breakEvenUnits ? `of ${r.sellable} sellable` : 'never at this price'} />
          </div>

          <div className="card">
            <h3 className="mb">Limits at this price ({show} case)</h3>
            <Breakdown items={[
              ['Break-even selling price', u.breakEvenPrice],
              ['Minimum price for your min. profit', u.minPriceForMinProfit],
              ['Max product cost you could pay', u.maxProductCost],
              ['Max advertising per customer', u.maxAdvertising],
              ['Max delivery cost', u.maxDelivery],
              ['Max affiliate commission', pct(u.maxCommissionPct)],
              ['Max marketplace fee', pct(u.maxMarketplaceFeePct)],
            ]} />
          </div>

          <div className="card">
            <div className="between mb"><h3>Price for a target</h3><Segmented options={[['markup', 'On cost'], ['margin', 'Of price']]} value={target.mode} onChange={(m) => setTarget({ ...target, mode: m })} /></div>
            <div className="row">
              <Input type="number" value={target.value} onChange={(v) => setTarget({ ...target, value: v })} style={{ width: 90 }} />
              <span className="small">% {target.mode} on all costs → <span className="strong">{money(suggested)}</span></span>
              <button className="btn sm" onClick={() => set('sellingPrice')(suggested)}>Use it</button>
            </div>
            <p className="tiny muted mt">Margin = profit ÷ price. Markup = profit ÷ cost. "50% profit" is ambiguous, so pick one.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
