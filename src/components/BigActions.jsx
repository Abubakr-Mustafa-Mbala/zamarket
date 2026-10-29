import { Link } from 'react-router-dom'
import Icon from '../lib/icons'

// The three or four things a seller or an affiliate actually came here to do,
// made large enough to hit with a thumb and obvious enough to not need reading.
//
// A partner is not an analyst. They open this on a phone, between other work,
// to answer one of a very small number of questions: is there anything waiting
// for me, how much am I owed, and how do I get more sales. Everything else on
// the page can be below these.
//
// A tile carries a number only when that number means something right now —
// "3 to prepare" is worth a tap, "0 to prepare" is just noise, so it says
// "Nothing waiting" instead and stops competing for attention.
export default function BigActions({ items = [] }) {
  const live = items.filter(Boolean)
  if (!live.length) return null
  return (
    <div className="big-actions">
      {live.map((a) => (
        <Link key={a.to + a.label} to={a.to} className={`ba-tile ${a.tone || ''} ${a.urgent ? 'urgent' : ''}`}>
          <span className="ba-icon" aria-hidden>{a.icon}</span>
          <span className="ba-text">
            <strong>{a.label}</strong>
            <em>{a.note}</em>
          </span>
          {a.value != null && <span className="ba-value">{a.value}</span>}
          <span className="ba-go" aria-hidden><Icon.arrow /></span>
        </Link>
      ))}
    </div>
  )
}
