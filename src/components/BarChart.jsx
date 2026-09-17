import { useEffect, useState } from 'react'

// points: [{ key, label, long, value }]
export default function BarChart({ points, format = (v) => v, height = 220, tone = 'green' }) {
  const [sel, setSel] = useState(null)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 600)
  useEffect(() => { setSel(null) }, [points])
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 600)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // On phones the drawing is narrower so text and bars stay readable.
  const W = narrow ? 380 : 900
  const H = narrow ? 240 : height + 20
  const fs = narrow ? 13 : 15
  const padL = narrow ? 50 : 64, padR = 6, padT = 12, padB = 28
  const values = points.map((p) => Number(p.value) || 0)
  const nice = (v) => { if (v <= 0) return 0; const e = 10 ** Math.floor(Math.log10(v)); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e }
  const max = nice(Math.max(0, ...values))
  const min = -nice(-Math.min(0, ...values))
  const span = max - min || 1
  const y = (v) => padT + ((max - v) / span) * (H - padT - padB)
  const zero = y(0)
  const n = Math.max(points.length, 1)
  const slot = (W - padL - padR) / n
  const barW = Math.max(2, Math.min(38, slot * 0.72))
  const ticks = (min < 0 ? [max, 0, min] : [max, max / 2, 0]).filter((v, i, a) => a.indexOf(v) === i)
  const every = Math.ceil(n / (narrow ? 5 : 8))
  const active = sel != null ? points[sel] : null
  const total = values.reduce((a, b) => a + b, 0)
  const colour = tone === 'copper' ? 'var(--copper)' : 'var(--green)'

  return (
    <div className="chart">
      <div className="chart-readout">
        {active ? <><span className="muted">{active.long || active.label}</span><strong className={active.value < 0 ? 'bad' : ''}>{format(active.value)}</strong></>
                : <><span className="muted">Tap a bar to see that {points.length ? 'period' : 'day'}</span><strong className={total < 0 ? 'bad' : ''}>{format(total)} total</strong></>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Earnings chart" style={{ display: 'block', touchAction: 'manipulation' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? '' : '4 4'} />
            <text x={padL - 8} y={y(t) + 5} textAnchor="end" fontSize={fs} fill="var(--muted)">{format(t, true)}</text>
          </g>
        ))}
        {min < 0 && <line x1={padL} x2={W - padR} y1={zero} y2={zero} stroke="var(--line-strong)" />}
        {points.map((p, i) => {
          const v = Number(p.value) || 0
          const x = padL + slot * i + (slot - barW) / 2
          const top = Math.min(y(v), zero)
          const h = Math.max(v === 0 ? 0 : 2, Math.abs(zero - y(v)))
          return (
            <g key={p.key} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              <rect x={x} y={top} width={barW} height={h} rx={Math.min(4, barW / 3)}
                fill={v < 0 ? 'var(--bad)' : colour} opacity={sel == null || sel === i ? 1 : 0.35} />
              {(i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2)) && (
                <text x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={fs - 1} fill="var(--muted)">{p.label}</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
