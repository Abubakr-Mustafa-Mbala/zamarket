import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { money, n } from '../lib/format'
import { Field, Input, Segmented } from './ui'

// What a vendor actually keeps, and what to charge to keep what they want.
export default function VendorMath({ price, onUsePrice, vendor, compact }) {
  const { settings } = useAuth()
  const [mode, setMode] = useState('keep')
  const [target, setTarget] = useState('')
  const fullFee = n(vendor?.fee_pct_override ?? settings.marketplace_fee_pct)
  const ownFee = Math.min(fullFee, n(settings.own_audience_fee_pct))
  const p = n(price)

  const keeps = (fee) => ({ fee: (p * fee) / 100, keep: p - (p * fee) / 100 })
  const market = keeps(fullFee)
  const own = keeps(ownFee)
  const priceFor = (want, fee) => (fee >= 100 ? 0 : want / (1 - fee / 100))
  const wanted = n(target)

  return (
    <div className={`vm ${compact ? 'compact' : ''}`}>
      <div className="between">
        <h3>What you keep</h3>
        <Segmented options={[['keep', 'From this price'], ['target', 'To keep an amount']]} value={mode} onChange={setMode} />
      </div>

      {mode === 'keep' ? (
        <>
          <div className="vm-rows">
            <div className="vm-row">
              <span><strong>A customer from the marketplace</strong><span className="tiny muted">We found them for you</span></span>
              <span className="right"><b>{money(market.keep)}</b><span className="tiny muted">we keep {money(market.fee)} ({fullFee}%)</span></span>
            </div>
            <div className="vm-row good">
              <span><strong>A customer you brought</strong><span className="tiny muted">They came through your store link</span></span>
              <span className="right"><b>{money(own.keep)}</b><span className="tiny muted">we keep {money(own.fee)} ({ownFee}%)</span></span>
            </div>
          </div>
          <p className="tiny muted">Delivery and payment collection are ours, not yours. An affiliate's commission also comes out of our share, so what you keep does not change when an affiliate sells it.</p>
        </>
      ) : (
        <>
          <Field label="I want to keep, per sale" hint="What you would normally get selling it yourself">
            <Input money value={target} onChange={setTarget} placeholder="100" />
          </Field>
          {wanted > 0 && (
            <div className="vm-rows">
              <div className="vm-row">
                <span><strong>Price it at</strong><span className="tiny muted">so you keep {money(wanted)} on a marketplace customer</span></span>
                <span className="right"><b>{money(priceFor(wanted, fullFee))}</b>
                  {onUsePrice && <button type="button" className="btn sm" onClick={() => onUsePrice(Math.ceil(priceFor(wanted, fullFee)))}>Use it</button>}</span>
              </div>
              <div className="vm-row good">
                <span><strong>Or, for your own customers</strong><span className="tiny muted">through your store link, our fee is smaller</span></span>
                <span className="right"><b>{money(priceFor(wanted, ownFee))}</b></span>
              </div>
            </div>
          )}
          <p className="tiny muted">Charging more here than you charge at home is normal — we bring the customer, take the orders, collect the money and deliver. What matters is whether the extra sales are worth it to you.</p>
        </>
      )}
    </div>
  )
}
