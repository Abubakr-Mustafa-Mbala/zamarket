import { money, date } from '../lib/format'
import { useAuth } from '../lib/auth'
import QrCode from './QrCode'

// Three different documents, one look. A settlement statement is not a receipt,
// and neither shows anything the reader shouldn't see.
export default function Statement({ kind, who, period, lines, totals, status, reference, note, id }) {
  const { settings } = useAuth()
  const title = kind === 'vendor' ? 'Vendor settlement statement' : 'Affiliate commission statement'
  return (
    <div className="statement">
      <div className="st-head">
        <div>
          <span className="st-brand">ZaMarket</span>
          <span className="tiny muted">{settings.business_name || 'ZaMarket'} · Lusaka</span>
        </div>
        <div className="right">
          <strong>{title}</strong>
          {id && <span className="tiny muted">No. {id}</span>}
        </div>
      </div>

      <div className="st-meta">
        <div><span className="tiny muted">For</span><strong>{who}</strong></div>
        <div><span className="tiny muted">Period</span><strong>{date(period.from)} – {date(period.to)}</strong></div>
        <div><span className="tiny muted">Status</span><strong>{status}</strong></div>
        {reference && <div><span className="tiny muted">Payment reference</span><strong>{reference}</strong></div>}
      </div>

      <table className="st-table">
        <thead><tr><th>Detail</th><th className="right">Amount</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={l.deduct ? 'deduct' : ''}>
              <td>{l.label}{l.sub && <span className="tiny muted"> · {l.sub}</span>}</td>
              <td className="right">{l.deduct ? `−${money(Math.abs(l.amount))}` : money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {totals.map((t, i) => (
            <tr key={i} className={t.strong ? 'strong' : ''}>
              <td>{t.label}</td><td className="right">{money(t.amount)}</td>
            </tr>
          ))}
        </tfoot>
      </table>

      {note && <p className="tiny muted">{note}</p>}

      <div className="st-foot">
        <div>
          <span className="tiny muted">Questions about this statement?</span>
          <strong>{settings.company_phone || settings.business_phone || 'Call the ZaMarket team'}</strong>
        </div>
        {id && <QrCode value={`${window.location.origin}/about`} size={72} />}
      </div>
      <button className="btn sm no-print" onClick={() => window.print()}>Print or save as PDF</button>
    </div>
  )
}
