import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { Loading, useToast, Empty } from '../../components/ui'

// Short, plain lessons. Nothing here promises income.
export const LESSONS = [
  {
    key: 'what', title: 'What you actually do', minutes: 3,
    points: [
      'You share products with people. When someone buys through your link, you earn a commission on that sale.',
      'You never buy stock, hold anything, or deliver. ZaMarket confirms the order, collects the money and delivers.',
      'You are paid after the customer receives the order and the 24-hour check passes.',
      'What you earn depends on what you sell. There is no salary and no guaranteed amount.',
    ],
    doIt: 'Open "Products to sell" and find one product you would happily use yourself.',
  },
  {
    key: 'link', title: 'Your link, and why it matters', minutes: 3,
    points: [
      'Your link is how the system knows a sale was yours. No link, no commission.',
      'Use the product link when you talk about one product, and your main link otherwise.',
      'If someone asks you in person, take their number and send them the link on WhatsApp.',
      'Never buy through your own link. It is not paid, and it is easy to spot.',
    ],
    doIt: 'Copy your link and send it to yourself on WhatsApp, so you know exactly what a customer sees.',
  },
  {
    key: 'who', title: 'Who to talk to first', minutes: 4,
    points: [
      'Start with people who already know you: family, friends, church, work, neighbours, old classmates.',
      'Write a list of 30 names before you message anybody.',
      'One person at a time, with their name in the message. Never a broadcast.',
      'Ask about them first. Then mention what you sell, once.',
    ],
    doIt: 'Write your list of 30. Message the first 10 today.',
  },
  {
    key: 'say', title: 'What to say', minutes: 4,
    points: [
      'Say what the product does for them, not what it is. "It charges your phone when ZESCO is off" beats "10000mAh power bank".',
      'Give the price early. Hiding it wastes everyone\u2019s time.',
      'Say where you deliver and that they pay when they receive it.',
      'Ask one clear question at the end: "Should I put you down for one?"',
    ],
    doIt: 'Open "Find customers" and copy the ready message for a product you like.',
  },
  {
    key: 'no', title: 'When they say no', minutes: 3,
    points: [
      'Most people will say no or not reply. That is normal and not personal.',
      '"Too expensive" often means "I don\u2019t see the value yet". Explain what is included.',
      '"I\u2019ll think about it" — ask what they need to know, then agree a day to check back.',
      'Never argue, never beg, never promise what the product cannot do. Ask if they know someone else who might need it.',
    ],
    doIt: 'Read the objection answers on the Find customers page once, slowly.',
  },
  {
    key: 'followup', title: 'The follow-up is where the money is', minutes: 3,
    points: [
      'Most sales happen on the second or third contact, not the first.',
      'If someone shows interest, agree when you will check back, and do it.',
      'Keep it short: "Hi Bwalya, still want the lamp? I can have it delivered tomorrow."',
      'After two follow-ups with no reply, leave it and move on.',
    ],
    doIt: 'Pick three people you messaged this week and follow up today.',
  },
  {
    key: 'posting', title: 'Posting without annoying people', minutes: 3,
    points: [
      'One good post a day beats ten in one morning.',
      'Real photos of the real product, not designed posters.',
      'Say the price, the area you deliver to, and how to order.',
      'In groups, read the rules first and answer questions before you sell anything.',
    ],
    doIt: 'Post one product on your WhatsApp status today, with your link.',
  },
  {
    key: 'honest', title: 'Staying honest, staying paid', minutes: 3,
    points: [
      'Never promise results a product cannot deliver. One angry customer costs more than one sale.',
      'Do not collect money yourself. ZaMarket collects and pays you.',
      'Do not create fake orders or use your own number. Those are not paid.',
      'If you are unsure about a claim, ask us before you say it.',
    ],
    doIt: 'Read the reseller rules on your account page.',
  },
  {
    key: 'track', title: 'Knowing your own numbers', minutes: 3,
    points: [
      'Your dashboard shows sales, commission earned, what is waiting and what is paid.',
      'Waiting means the order is not complete yet. It is not guaranteed until it clears.',
      'Count how many people you message each week, not just sales. Messages are the part you control.',
      'If 50 messages bring no sales, change the product or the message, not the effort.',
    ],
    doIt: 'Open My earnings and look at this month.',
  },
]

export default function Training() {
  const { user } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(LESSONS[0].key)
  const { data, loading, reload } = useData(() => q(supabase.from('training_progress').select('lesson').eq('user_id', user.id)), [user.id])
  if (loading) return <Loading />
  const done = new Set((data || []).map((r) => r.lesson))
  const pct = Math.round((done.size / LESSONS.length) * 100)

  const toggle = async (key) => {
    if (done.has(key)) {
      const { error } = await supabase.from('training_progress').delete().eq('user_id', user.id).eq('lesson', key)
      if (error) return toast(error.message, true)
    } else {
      const { error } = await supabase.from('training_progress').insert({ user_id: user.id, lesson: key })
      if (error) return toast(error.message, true)
      toast('Marked as done')
    }
    reload()
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Training</h1>
          <p>Nine short lessons. Do one a day and you will know more than most people selling anything in Lusaka.</p>
        </div>
      </div>

      <div className="train-progress">
        <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        <span className="small">{done.size} of {LESSONS.length} done{pct === 100 ? ' — finished' : ''}</span>
      </div>

      <div className="steps-list">
        {LESSONS.map((l, i) => (
          <div key={l.key} className={`sh-step ${open === l.key ? 'open' : ''} ${done.has(l.key) ? 'ticked' : ''}`}>
            <button type="button" className="sh-head" onClick={() => setOpen(open === l.key ? '' : l.key)}>
              <span className="sh-n">{done.has(l.key) ? '✓' : i + 1}</span>
              <span className="grow"><strong>{l.title}</strong><span className="small muted">{l.minutes} min read</span></span>
              <span aria-hidden>{open === l.key ? '−' : '+'}</span>
            </button>
            {open === l.key && (
              <div className="sh-body">
                <ul>{l.points.map((p, k) => <li key={k}>{p}</li>)}</ul>
                <p className="small"><strong>Do this now:</strong> {l.doIt}</p>
                <button className={`btn sm ${done.has(l.key) ? 'ghost' : 'primary'}`} onClick={() => toggle(l.key)}>
                  {done.has(l.key) ? 'Mark as not done' : 'I have done this'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {pct === 100 && (
        <div className="card ok-card">
          <h3>That is the whole course.</h3>
          <p className="small">Now it is just the work: 10 messages a day, one post, and follow up with anyone who replied. Check your numbers every Saturday.</p>
          <Link className="btn primary" to="/sell/find-customers">Go to Find customers</Link>
        </div>
      )}
    </div>
  )
}
