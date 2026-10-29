import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { chime, soundOn, setSound } from '../lib/chime'

const ago = (iso) => {
  if (!iso) return null
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(1, mins)} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''}`
  const days = Math.round(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''}`
}

// One bell for everything waiting: orders, money, applications, requests.
export default function ActionBell() {
  const [groups, setGroups] = useState([])
  const [open, setOpen] = useState(false)
  const [sound, setSoundOn] = useState(soundOn())
  const box = useRef(null)
  // The badge counts what has arrived SINCE YOU LAST LOOKED, not everything
  // outstanding. The list underneath still shows all the work until it is
  // actually done — so opening the bell clears the red dot without hiding a
  // pending order, which is the thing that must never disappear quietly.
  const [seen, setSeenCount] = useState(() => {
    try { return Number(localStorage.getItem('zamarket-bell-seen') || 0) } catch { return 0 }
  })
  // What the count was last time, so a sound only plays when something NEW
  // arrives rather than every time the list is refreshed.
  const lastCount = useRef(null)

  const load = async () => {
    const { data, error } = await supabase.rpc('action_center')
    if (error) return
    const next = data || []
    const total = next.reduce((t, g) => t + Number(g.count || 0), 0)
    const was = lastCount.current
    setGroups(next)
    lastCount.current = total
    setSeenCount((prev) => {
      if (prev <= total) return prev
      try { localStorage.setItem('zamarket-bell-seen', String(total)) } catch { /* ignore */ }
      return total
    })
    // Only on a genuine increase, and never on the first load — otherwise
    // opening the dashboard would chime at whatever was already waiting.
    if (was != null && total > was) {
      chime({ urgent: next.some((g) => g.tone === 'urgent') })
    }
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    const wake = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', wake)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', wake) }
  }, [])
  useEffect(() => {
    const away = (e) => { if (open && box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const total = groups.reduce((t, g) => t + Number(g.count || 0), 0)
  const fresh = Math.max(0, total - seen)
  const urgent = groups.some((g) => g.tone === 'urgent')

  const markSeen = () => {
    setSeenCount(total)
    try { localStorage.setItem('zamarket-bell-seen', String(total)) } catch { /* private window */ }
  }

  return (
    <div className="bell-wrap" ref={box}>
      <button className={`bell ${urgent && fresh > 0 ? 'urgent' : ''}`}
        onClick={() => { const next = !open; setOpen(next); if (next) { load(); markSeen() } }}
        aria-label={fresh > 0 ? `${fresh} new, ${total} things need you` : `${total} things need you`}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {fresh > 0 && <span className="bell-count">{fresh > 99 ? '99+' : fresh}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <span className="bell-title">
              <strong>What needs you</strong>
              <em>{total > 0 ? `${total} still to do` : 'All clear'}</em>
            </span>
            <span className="btn-row">
              <button className="btn sm ghost" title={sound ? 'Sound is on' : 'Sound is off'}
                aria-pressed={sound}
                onClick={() => { const v = !sound; setSound(v); setSoundOn(v); if (v) chime() }}>
                {sound ? '🔔 Sound on' : '🔕 Sound off'}
              </button>
              <button className="btn sm ghost" onClick={load}>Refresh</button>
            </span>
          </div>
          {groups.length === 0 ? (
            <div className="bell-clear">
              <span aria-hidden>✓</span>
              <p>Nothing waiting. Everything is handled.</p>
            </div>
          ) : (
            <ul className="bell-list">
              {groups.map((g) => (
                <li key={g.key}>
                  <Link to={g.link} onClick={() => setOpen(false)} className={`bell-item ${g.tone}`}>
                    <span className="bell-n">{g.count}</span>
                    <span className="bell-text">
                      <strong>{g.label}</strong>
                      <span className="tiny muted">
                        {g.amount != null && Number(g.amount) > 0 ? money(g.amount) : ''}
                        {g.amount != null && Number(g.amount) > 0 && g.oldest ? ' · ' : ''}
                        {g.oldest ? `oldest waiting ${ago(g.oldest)}` : ''}
                      </span>
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
