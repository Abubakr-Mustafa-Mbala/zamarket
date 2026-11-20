// A donut of shares with the total in the middle, plus its list. Shares are
// worked out from the recorded totals only.
//   items: [{ key, label, value, color }]
export default function Donut({ items, total, centre = 'Total', size = 168 }) {
  const sum = items.reduce((a, b) => a + (Number(b.value) || 0), 0)
  const t = total ?? sum
  const r = 62; const c = 2 * Math.PI * r
  let at = 0
  return (
    <div className="donut">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={`${t} ${centre}`}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="22" />
        {sum > 0 && items.map((it) => {
          const part = (Number(it.value) || 0) / sum
          const seg = <circle key={it.key} cx="80" cy="80" r={r} fill="none" stroke={it.color} strokeWidth="22" strokeDasharray={`${Math.max(0, part * c - 2)} ${c}`} strokeDashoffset={-at * c} transform="rotate(-90 80 80)" />
          at += part
          return seg
        })}
        <text x="80" y="78" textAnchor="middle" className="donut-num">{Number(t).toLocaleString('en-ZM')}</text>
        <text x="80" y="98" textAnchor="middle" className="donut-lbl">{centre}</text>
      </svg>
      <ul className="donut-list">
        {items.map((it) => (
          <li key={it.key}><i style={{ background: it.color }} /><span>{it.label}</span><b>{Number(it.value).toLocaleString('en-ZM')}</b><em>{sum ? `${Math.round(((Number(it.value) || 0) / sum) * 100)}%` : '–'}</em></li>
        ))}
      </ul>
    </div>
  )
}
