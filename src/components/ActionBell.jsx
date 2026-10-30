import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { chime, soundOn, setSound } from '../lib/chime'

// Remembering what you have seen, kept out of the component so a private
// window or blocked storage cannot take the bell down with it.
const save = (map) => {
  try { localStorage.setItem('zamarket-bell-seen-v2', JSON.stringify(map)) } catch { /* ignore */ }
}

// A notification the operating system shows, so an order that arrives while
// ZaMarket is in another tab still reaches you. The browser only allows this
// after you have granted permission, and only while the site is open
// somewhere — it is not a replacement for a phone alert when everything is
// closed, and it never pretends to be.
export const canNotify = () => typeof Notification !== 'undefined'
export const notifyState = () => (canNotify() ? Notification.permission : 'unsupported')

export async function askToNotify() {
  if (!canNotify()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

function notify(groups, urgent) {
  if (!canNotify() || Notification.permission !== 'granted') return
  const lead = groups[0]
  const rest = groups.length - 1
  const title = urgent ? 'ZaMarket — needs you now' : 'ZaMarket'
  const body = `${lead.label}${rest > 0 ? ` and ${rest} other thing${rest > 1 ? 's' : ''}` : ''}`
  try {
    const n = new Notification(title, { body, tag: 'zamarket-action', renotify: true })
    n.onclick = () => { try { window.focus() } catch { /* ignore */ } n.close() }
  } catch { /* some browsers refuse outside a service worker; the chime still plays */ }
}

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
  const [perm, setPerm] = useState(notifyState())
  const box = useRef(null)
  // The badge counts what has arrived SINCE YOU LAST LOOKED, not everything
  // outstanding. The list underneath still shows all the work until it is
  // actually done — so opening the bell clears the red dot without hiding a
  // pending order, which is the thing that must never disappear quietly.
  //
  // This is remembered per KIND of work, not as one running total. A single
  // total hid real arrivals: with three orders already waiting, a fourth
  // arriving while one was handled left the total at three and showed no
  // badge at all. Counting each kind against what you last saw of that kind
  // cannot go quiet like that.
  const [seen, setSeen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zamarket-bell-seen-v2') || '{}') } catch { return {} }
  })
  // What each kind stood at last time, so a sound plays when something NEW
  // arrives rather than every time the list is refreshed.
  const lastCounts = useRef(null)

  const load = async () => {
    const { data, error } = await supabase.rpc('action_center')
    if (error) return
    const next = data || []
    const counts = Object.fromEntries(next.map((g) => [g.key, Number(g.count || 0)]))
    const was = lastCounts.current
    setGroups(next)
    lastCounts.current = counts

    // When work is handled elsewhere, what you have "seen" of that kind drops
    // with it, so the badge never owes you a number for something already done.
    setSeen((prev) => {
      const merged = { ...prev }
      let changed = false
      for (const [k, v] of Object.entries(counts)) {
        if (merged[k] != null && merged[k] > v) { merged[k] = v; changed = true }
      }
      for (const k of Object.keys(merged)) {
        if (counts[k] == null) { delete merged[k]; changed = true }
      }
      if (changed) save(merged)
      return changed ? merged : prev
    })

    // Only on a genuine arrival, and never on the first load — otherwise
    // opening the dashboard would chime at whatever was already waiting.
    if (was) {
      const arrived = next.filter((g) => Number(g.count || 0) > Number(was[g.key] || 0))
      if (arrived.length) {
        const urgentNow = arrived.some((g) => g.tone === 'urgent')
        chime({ urgent: urgentNow })
        notify(arrived, urgentNow)
      }
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
  // New work, counted per kind: what is waiting now minus what you last saw.
  const fresh = groups.reduce(
    (t, g) => t + Math.max(0, Number(g.count || 0) - Number(seen[g.key] || 0)), 0)
  const urgent = groups.some((g) => g.tone === 'urgent')

  const markSeen = () => {
    const now = Object.fromEntries(groups.map((g) => [g.key, Number(g.count || 0)]))
    setSeen(now)
    save(now)
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
              {canNotify() && perm !== 'granted' && (
                <button className="btn sm ghost" onClick={async () => setPerm(await askToNotify())}>
                  {perm === 'denied' ? '🔕 Blocked' : '🔔 Alert me'}
                </button>
              )}
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
