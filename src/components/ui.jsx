import { useEffect, useState, createContext, useContext } from 'react'
import { money, title } from '../lib/format'
import { TONE } from '../lib/statuses'

export function Stat({ label, value, sub, hero, tone }) {
  return (
    <div className={`card stat ${hero ? 'hero' : ''}`}>
      <div className="label">{label}</div>
      <div className={`value ${tone || ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Badge({ status, tone, children }) {
  const t = tone ?? TONE[status] ?? ''
  return <span className={`badge ${t}`}>{children ?? title(status)}</span>
}

export function Light({ tone, label }) {
  return <span className={`light ${tone}`}>{label}</span>
}

export function Field({ label, hint, children, span }) {
  return (
    <div className={`field ${span ? 'span' : ''}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Input({ value, onChange, type = 'text', money: isMoney, ...rest }) {
  return (
    <input
      className={`input ${isMoney ? 'money-in' : ''}`}
      type={isMoney ? 'number' : type}
      inputMode={isMoney || type === 'number' ? 'decimal' : undefined}
      step={isMoney ? '0.01' : rest.step}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  )
}

export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, title(o)]
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
  )
}

export function Textarea({ value, onChange, ...rest }) {
  return <textarea className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function Modal({ title: t, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 860 } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{t}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ title: t, children }) {
  return (
    <div className="card empty">
      <h3>{t}</h3>
      <div>{children}</div>
    </div>
  )
}

export function Table({ cols, rows, onRow, empty = 'Nothing here yet.' }) {
  if (!rows?.length) return <Empty title={empty} />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c.key || c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <td key={c.key || c.label} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Breakdown({ items, total }) {
  return (
    <dl className="kv">
      {items.filter((i) => i).map(([k, v, cls]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd className={cls || ''}>{typeof v === 'number' ? money(v) : v}</dd>
        </div>
      ))}
      {total && (
        <div className="total" style={{ display: 'contents' }}>
          <dt>{total[0]}</dt>
          <dd className={total[2] || ''}>{typeof total[1] === 'number' ? money(total[1]) : total[1]}</dd>
        </div>
      )}
    </dl>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => {
        const [v, l] = Array.isArray(t) ? t : [t, title(t)]
        return <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      })}
    </div>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, title(o)]
        return <button key={v} type="button" className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      })}
    </div>
  )
}

export function Stars({ n }) {
  if (!n) return null
  return <span className="stars" aria-label={`${n} out of 5`}>{'★'.repeat(Math.round(n))}{'☆'.repeat(5 - Math.round(n))}</span>
}

// ---------- Toast ----------
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 3200); return () => clearTimeout(id) }, [t])
  const show = (msg, bad) => setT({ msg, bad })
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast ${t.bad ? 'bad' : ''}`} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function CopyLine({ text }) {
  const toast = useToast()
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied') } catch { toast('Could not copy', true) } }
  return (
    <div className="copy">
      <code>{text}</code>
      <button className="btn sm" type="button" onClick={copy}>Copy</button>
    </div>
  )
}

export function Loading() {
  return <div className="empty muted">Loading…</div>
}
