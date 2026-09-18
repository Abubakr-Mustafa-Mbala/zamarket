import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money, num } from '../../lib/format'
import { Loading, CopyLine } from '../../components/ui'

// A plain explanation of how to get customers, and how this system counts it.
const STEPS = [
  {
    n: 1, title: 'Tell people who already know you',
    body: 'Before ads, before anything: message people one at a time. Family, friends, old customers, work contacts. Ten a day.',
    how: ['Add each person you message as a lead (Leads → Add lead, channel "Warm outreach")', 'Log what they said with the Call or WhatsApp buttons', 'The system counts how many you contacted, how many replied, and how many bought'],
    counts: 'Leads, engaged and won on the Overview, under Warm outreach.',
  },
  {
    n: 2, title: 'Post something every day',
    body: 'A real photo of a real product beats a designed poster. Show it being used. Say the price and where you deliver.',
    how: ['Create a campaign first (Campaigns → New), which gives you a short link', 'Put that link in the caption or bio', 'Log the post under Content so you can see which posts brought orders'],
    counts: 'Visits, leads and orders per campaign, and per post under Content.',
  },
  {
    n: 3, title: 'Give something useful away',
    body: 'Some people are not ready to buy but will give you their number for something helpful — a buying guide, a price list, a voucher.',
    how: ['Create it under Lead magnets, which gives you a page like /free/phone-guide', 'Share that page instead of a product link', 'Everyone who signs up becomes a lead you can call'],
    counts: 'Views, sign-ups and customers won for each lead magnet.',
  },
  {
    n: 4, title: 'Reach people who do not know you',
    body: 'Shops, offices, salons, groups. Ask a question first, sell second. Small numbers, done daily, beat a big blast once.',
    how: ['Add them as leads with channel "Cold outreach"', 'Log every attempt, even no answer', 'Set a follow-up date — most sales come on the second or third contact'],
    counts: 'Outreach today and responses on the Today page.',
  },
  {
    n: 5, title: 'Pay for ads only once the above works',
    body: 'Ads make a working message reach more people. They cannot fix a message nobody responds to. Start with about K200 and one product.',
    how: ['Create a campaign with platform Meta and its short link', 'Point the ad at that link', 'Log what you spent under Ad spend'],
    counts: 'Spend, orders, sales and cost per customer on the Overview, under Paid ads.',
  },
  {
    n: 6, title: 'Ask happy customers to bring friends',
    body: 'The cheapest customer is one an existing customer brings. After delivery, every customer can get their own invite link.',
    how: ['The link appears on their order confirmation', 'You can also send it to them yourself', 'They earn a reward once their friend\u2019s first order is completed'],
    counts: 'Referrals: invites, friends who ordered, rewards owed.',
  },
]

const NUMBERS = [
  ['Lead', 'Someone who showed interest and gave you a way to contact them. Created when a person starts checkout and stops, claims a lead magnet, asks to be told when something is back in stock, or when you add them yourself.'],
  ['Engaged lead', 'A lead who actually responded — said they are interested or asked you to call back. This is the number that matters most day to day.'],
  ['Won', 'A lead who ordered. It happens automatically when an order is placed with their phone number.'],
  ['Campaign', 'Any ad, post or push you want measured. It gives you a short link like /go/phones. Every visit and every order through it is counted.'],
  ['Visits', 'How many people opened your campaign link.'],
  ['Spend', 'What you logged under Ad spend for that campaign.'],
  ['Cost per customer', 'Spend ÷ leads won. If you spent K200 and won 4 customers, it cost K50 to get each one.'],
  ['Return on spend', 'Sales from marketing ÷ spend. Under 1× means you lost money on the ads.'],
]

export default function StartHere() {
  const [open, setOpen] = useState(1)
  const { data, loading } = useData(async () => ({
    campaigns: await q(supabase.from('campaigns').select('id,name,code').limit(3)),
    magnets: await q(supabase.from('lead_magnets').select('id').limit(1)),
    leads: await q(supabase.from('leads').select('id').limit(1)),
  }), [])
  if (loading) return <Loading />
  const has = { campaign: (data.campaigns || []).length > 0, magnet: (data.magnets || []).length > 0, lead: (data.leads || []).length > 0 }

  return (
    <div className="stack">
      <div className="sh-hero">
        <div>
          <h2>How to actually get customers</h2>
          <p>Nobody buys from a shop they have never heard of. Marketing is just telling enough people, every day, and keeping track of what worked. Here is the order to do it in.</p>
        </div>
      </div>

      <div className="sh-check">
        <span className={has.lead ? 'done' : ''}>{has.lead ? '✓' : '1'} Add your first leads</span>
        <span className={has.campaign ? 'done' : ''}>{has.campaign ? '✓' : '2'} Create a campaign link</span>
        <span className={has.magnet ? 'done' : ''}>{has.magnet ? '✓' : '3'} Make one lead magnet</span>
      </div>

      <div className="steps-list">
        {STEPS.map((st) => (
          <div key={st.n} className={`sh-step ${open === st.n ? 'open' : ''}`}>
            <button type="button" className="sh-head" onClick={() => setOpen(open === st.n ? 0 : st.n)}>
              <span className="sh-n">{st.n}</span>
              <span className="grow"><strong>{st.title}</strong><span className="small muted">{st.body}</span></span>
              <span aria-hidden>{open === st.n ? '−' : '+'}</span>
            </button>
            {open === st.n && (
              <div className="sh-body">
                <ol>{st.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
                <p className="small"><strong>Where you see it:</strong> {st.counts}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <section className="card stack-sm">
        <h3>What the words mean</h3>
        <dl className="kv-defs">
          {NUMBERS.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}
        </dl>
      </section>

      <section className="card stack-sm">
        <h3>How tracking works, in one picture</h3>
        <div className="track-flow">
          {['You share a link', 'Someone opens it', 'They leave their number or order', 'You call and log it', 'The sale is counted back to that link'].map((t, i) => (
            <span key={i} className="track-step"><b>{i + 1}</b>{t}</span>
          ))}
        </div>
        <p className="small muted">If you share a plain link instead of a campaign link, the sale still happens — you just won't know which post or ad brought it. That's the only difference.</p>
        {data.campaigns?.length > 0 && (
          <>
            <p className="small strong">Your campaign links:</p>
            {data.campaigns.map((c) => <CopyLine key={c.id} text={`${window.location.origin}/go/${c.code}`} />)}
          </>
        )}
      </section>

      <section className="card stack-sm">
        <h3>What to do this week</h3>
        <ol className="week">
          <li><strong>Monday:</strong> list 30 people you know. Message 10.</li>
          <li><strong>Tuesday:</strong> message the next 10. Post one photo with your campaign link.</li>
          <li><strong>Wednesday:</strong> message the last 10. Follow up with anyone who replied.</li>
          <li><strong>Thursday:</strong> post again. Join two buying-and-selling groups and answer questions there.</li>
          <li><strong>Friday:</strong> call everyone marked "call back". Ask two happy customers for their invite link.</li>
          <li><strong>Saturday:</strong> look at the Overview. Which channel brought leads? Do more of that next week.</li>
        </ol>
        <div className="btn-row">
          <Link className="btn primary" to="/admin/marketing/leads">Add your first leads</Link>
          <Link className="btn" to="/admin/marketing/campaigns">Create a campaign link</Link>
        </div>
      </section>

      <section className="card small muted">
        <p><strong>Honest expectations.</strong> Most people you message will not reply, and that is normal. A handful of sales in the first weeks is a good start, not a failure. What matters is doing it daily and keeping the numbers, so you can tell which effort is worth repeating.</p>
      </section>
    </div>
  )
}
