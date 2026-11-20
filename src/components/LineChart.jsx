import { useEffect, useMemo, useRef, useState } from 'react'

// A clean, responsive line chart for daily numbers. Real values only: it
// draws what it is given and nothing else.
//   points: [{ key, label, long, values: { [seriesKey]: number } }]
//   series: [{ key, name, color }]
// Tap or hover anywhere to read the day's values. The busiest point of the
// first series can be marked.
export default function LineChart({ points, series, height = 240, format = (v) => v, markPeak = false, empty = 'No data for this period yet.' }) {
  const box = useRef(null)
  const [w, setW] = useState(640)
  const [sel, setSel] = useState(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { setSel(null) }, [points])
  const narrow = w < 520
  const H = narrow ? Math.min(height, 210) : height
  const padL = narrow ? 34 : 44; const padR = 12; const padT = 16; const padB = 30
  const n = points.length
  const all = points.flatMap((p) => series.map((s) => Number(p.values?.[s.key]) || 0))
  const nice = (v) => { if (v <= 4) return 4; const e = 10 ** Math.floor(Math.log10(v)); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e }
  const max = nice(Math.max(0, ...all))
  const x = (i) => padL + (n <= 1 ? (w - padL - padR) / 2 : (i / (n - 1)) * (w - padL - padR))
  const y = (v) => padT + (1 - v / max) * (H - padT - padB)
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]
  const every = Math.max(1, Math.ceil(n / (narrow ? 4 : 7)))
  const peak = useMemo(() => {
    if (!markPeak || !n) return null
    let bi = 0; const k = series[0].key
    points.forEach((p, i) => { if ((Number(p.values?.[k]) || 0) > (Number(points[bi].values?.[k]) || 0)) bi = i })
    return (Number(points[bi].values?.[k]) || 0) > 0 ? bi : null
  }, [points, series, markPeak, n])
  if (!n || all.every((v) => !v)) return <div className="lc-empty"><span className="lc-empty-ico" aria-hidden="true">▁▃▅</span><p>{empty}</p></div>
  const path = (k) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(p.values?.[k]) || 0).toFixed(1)}`).join(' ')
  const pick = (clientX) => {
    const r = box.current.getBoundingClientRect()
    const px = clientX - r.left
    let best = 0; let d = Infinity
    for (let i = 0; i < n; i += 1) { const dd = Math.abs(x(i) - px); if (dd < d) { d = dd; best = i } }
    setSel(best)
  }
  const active = sel != null ? points[sel] : null
  return (
    <div className="lc" ref={box}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={series.map((s) => s.name).join(' and ')}
        onMouseMove={(e) => pick(e.clientX)} onMouseLeave={() => setSel(null)} onTouchStart={(e) => pick(e.touches[0].clientX)} onTouchMove={(e) => pick(e.touches[0].clientX)}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`lcg-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity=".32" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="lc-grid" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="lc-axis">{format(Math.round(t))}</text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === n - 1) && (
          <text key={p.key} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="lc-axis">{p.label}</text>
        ))}
        {series.map((s, si) => (
          <g key={s.key}>
            {si === 0 && <path d={`${path(s.key)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#lcg-${s.key})`} />}
            <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth={narrow ? 2.2 : 2.6} strokeLinejoin="round" strokeLinecap="round" />
            {n <= 45 && points.map((p, i) => <circle key={p.key} cx={x(i)} cy={y(Number(p.values?.[s.key]) || 0)} r={narrow ? 2.4 : 3} fill={s.color} />)}
          </g>
        ))}
        {peak != null && sel == null && (
          <g className="lc-peak">
            <circle cx={x(peak)} cy={y(points[peak].values[series[0].key])} r="6" fill="none" stroke="#fff" strokeWidth="2" />
          </g>
        )}
        {active && (
          <g>
            <line x1={x(sel)} x2={x(sel)} y1={padT} y2={H - padB} className="lc-cursor" />
            {series.map((s) => <circle key={s.key} cx={x(sel)} cy={y(Number(active.values?.[s.key]) || 0)} r="5" fill={s.color} stroke="#0E1013" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {active ? (
        <div className="lc-tip" style={{ left: Math.min(Math.max(x(sel), 115), w - 115) }}>
          <b>{active.long || active.label}</b>
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}: <strong>{format(Number(active.values?.[s.key]) || 0)}</strong></span>)}
        </div>
      ) : peak != null ? (
        <div className="lc-tip lc-tip-peak" style={{ left: Math.min(Math.max(x(peak), 115), w - 115) }}>
          <b>Busiest: {points[peak].long || points[peak].label}</b>
          <span><strong>{format(points[peak].values[series[0].key])}</strong> {series[0].name.toLowerCase()}</span>
        </div>
      ) : null}
    </div>
  )
}
