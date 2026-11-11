import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, useToast, Field, Input, Select, Textarea } from '../../components/ui'
import { money } from '../../lib/format'
import { prettyPhone, waNumber } from '../../lib/phone'

// Running a giveaway.
//
// The two rules this screen exists to enforce, because a screen is where
// good intentions get overridden:
//
//   · Entry is free. There is no price field here, and the database will
//     refuse a campaign that has one. Under the Zambian Lotteries Act a
//     lottery is a scheme with chances "acquired by prior payment", so free
//     entry is what keeps this out of that definition entirely.
//   · You cannot pick the winner. The draw button asks the database, which
//     chooses at random and records the answer once. Press it twice and you
//     get the same names back.

const todayPlus = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(18, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

const slugify = (s) => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export default function Giveaways() {
  const toast = useToast()
  const [making, setMaking] = useState(false)

  const { data, loading, reload } = useData(async () => {
    const [campaigns, products] = await Promise.all([
      q(supabase.from('giveaway_campaigns').select('*').order('created_at', { ascending: false })),
      q(supabase.from('public_products').select('id,name,price,images,vendor_name')
        .eq('status', 'published').order('name').limit(300)),
    ])
    const draws = campaigns.length
      ? await q(supabase.from('giveaway_draws').select('*').in('campaign_id', campaigns.map((c) => c.id)))
      : []
    const counts = campaigns.length
      ? await q(supabase.from('giveaway_entries').select('campaign_id').in('campaign_id', campaigns.map((c) => c.id)))
      : []
    return { campaigns, products, draws, counts }
  }, [])

  if (loading) return <Loading shape="page" />
  const { campaigns = [], products = [], draws = [], counts = [] } = data || {}
  const entriesFor = (id) => counts.filter((c) => c.campaign_id === id).length
  const drawFor = (id) => draws.find((d) => d.campaign_id === id)

  const setStatus = async (c, status) => {
    const { error } = await supabase.from('giveaway_campaigns').update({ status }).eq('id', c.id)
    if (error) return toast(error.message, true)

    // Opening a giveaway takes the prize off sale; ending or cancelling it
    // puts it back. Checking that a second one exists is not the same as
    // holding one — between the check and the draw, ordinary checkout could
    // sell both and leave you with nothing to hand the winner.
    if (status === 'live') {
      const { data: held } = await supabase.rpc('reserve_giveaway_prize', { p_slug: c.slug, p_hold: true })
      if (held?.short > 0) {
        toast(`Open — but only ${held.held} of ${held.wanted} could be held back. Check the stock.`, true)
      } else if (held?.held > 0) {
        toast(`The giveaway is open. ${held.held} held back for the winner.`)
      } else {
        toast('The giveaway is open.')
      }
    } else {
      if (['cancelled', 'fulfilled'].includes(status)) {
        await supabase.rpc('reserve_giveaway_prize', { p_slug: c.slug, p_hold: false })
      }
      toast(`Marked ${status}`)
    }
    reload()
  }

  const draw = async (c) => {
    const { data: res, error } = await supabase.rpc('draw_giveaway', { p_slug: c.slug })
    if (error) return toast(error.message, true)
    toast(res?.repeat ? 'Already drawn — same winners' : 'Winners drawn')
    reload()
  }

  return (
    <div className="stack">
      <div className="between">
        <p className="small muted">
          Free-to-enter giveaways. Entry happens on ZaMarket; social sharing is encouraged, never required.
        </p>
        <button className="btn primary" onClick={() => setMaking((v) => !v)}>
          {making ? 'Close' : 'New giveaway'}
        </button>
      </div>

      {making && <NewGiveaway products={products} onDone={() => { setMaking(false); reload() }} />}


      {campaigns.length === 0
        ? <p className="muted small">No giveaways yet.</p>
        : campaigns.map((c) => {
          const d = drawFor(c.id)
          const closed = new Date(c.closes_at) < new Date()
          return (
            <div key={c.id} className="card stack-sm">
              <div className="between">
                <div>
                  <h3>{c.title}</h3>
                  <p className="tiny muted">
                    /giveaways/{c.slug} · closes {new Date(c.closes_at).toLocaleString('en-ZM')}
                    {c.prize_value > 0 && ` · ${money(c.prize_value)} prize`}
                  </p>
                </div>
                <span className={`badge ${c.status === 'live' ? 'ok' : ''}`}>{c.status}</span>
              </div>

              <div className="mini-stats">
                <div><b>{entriesFor(c.id)}</b><span>entered</span></div>
                <div><b>{c.winners}</b><span>winner{c.winners === 1 ? '' : 's'}</span></div>
                <div><b>{closed ? 'Yes' : 'No'}</b><span>entries closed</span></div>
                <div><b>{d ? 'Drawn' : 'Not yet'}</b><span>result</span></div>
              </div>

              {!d && <PrizeList campaign={c} products={products} onChange={reload} />}

              <Result slug={c.slug} />

              {d && <ReferralPanel campaign={c} products={products} />}

              {c.vendor_id && c.status === 'draft' && (
                <p className="small">
                  <span className="badge">Proposed by a seller</span>{' '}
                  {c.proposal_note ? `“${c.proposal_note}”` : 'No note was left.'}{' '}
                  Check the prize and the closing date, then open it or cancel it. The seller provides the prize.
                </p>
              )}

              {d && <WinnerContacts slug={c.slug} title={c.title} />}

              {d && (
                <p className="small">
                  <strong>Winners:</strong>{' '}
                  {(d.winners || []).map((w) => w.name).join(', ')} — drawn{' '}
                  {new Date(d.drawn_at).toLocaleString('en-ZM')} from {d.entry_count} entries.
                </p>
              )}

              <div className="btn-row">
                <Link className="btn sm" to={`/giveaways/${c.slug}`} target="_blank" rel="noreferrer">View page</Link>
                {c.status === 'draft' && <button className="btn sm primary" onClick={() => setStatus(c, 'live')}>Open it</button>}
                {c.status === 'live' && <button className="btn sm" onClick={() => setStatus(c, 'closed')}>Close entries</button>}
                {!d && closed && entriesFor(c.id) > 0 && (
                  <button className="btn sm buy" onClick={() => draw(c)}>Draw the winners</button>
                )}
                {d && c.status !== 'fulfilled' && (
                  <button className="btn sm" onClick={() => setStatus(c, 'fulfilled')}>Mark prize delivered</button>
                )}
                {c.status !== 'cancelled' && !d && (
                  <button className="btn sm ghost" onClick={() => setStatus(c, 'cancelled')}>Cancel</button>
                )}
              </div>
              {!d && closed && entriesFor(c.id) > 0 && (
                <p className="tiny muted">
                  The draw is made by the database, not by you, and only once — pressing it again
                  returns the same names.
                </p>
              )}
            </div>
          )
        })}
    </div>
  )
}

// After the draw: who won, how to reach them, and where things stand.
// A winner's number comes from what they gave when entering, or from their
// profile. Somebody with neither still has an email address.
const CLAIM_STEPS = [
  ['notified', 'Not contacted yet'],
  ['contacted', 'Contacted'],
  ['confirmed', 'Confirmed, arranging prize'],
  ['delivered', 'Prize handed over'],
  ['forfeited', 'Could not be reached'],
]

function WinnerContacts({ slug, title }) {
  const toast = useToast()
  const { data: winners, loading, reload } = useData(
    () => q(supabase.rpc('giveaway_winner_contacts', { p_slug: slug })), [slug])
  const [notes, setNotes] = useState({})
  if (loading) return <p className="tiny muted">Loading winner contacts…</p>
  if (!winners?.length) return null

  const save = async (w, status) => {
    const { error } = await supabase.rpc('set_giveaway_claim', {
      p_slug: slug, p_entry: w.entry_id, p_status: status, p_note: notes[w.entry_id] ?? w.note ?? '',
    })
    if (error) return toast(error.message, true)
    toast('Saved'); reload()
  }
  const message = (w) => `Hello ${String(w.name || '').split(' ')[0]}, this is ZaMarket. Congratulations, you won ${w.prize || 'the prize'} in "${title}". When is a good time to arrange it? There is nothing to pay.`

  return (
    <div className="card flat stack-sm winner-contacts">
      <strong>Contact the winner{winners.length > 1 ? 's' : ''}</strong>
      {winners.map((w) => (
        <div key={w.entry_id} className="winner-row stack-sm">
          <div className="between">
            <div>
              <div className="strong">{w.name}</div>
              <div className="tiny muted">{w.prize || 'Prize'}{w.prize_rank ? ` · prize ${w.prize_rank}` : ''}</div>
            </div>
            <span className={`badge ${w.status === 'delivered' ? 'ok' : w.status === 'forfeited' ? 'bad' : ''}`}>
              {CLAIM_STEPS.find(([k]) => k === w.status)?.[1] || w.status}
            </span>
          </div>
          {w.phone ? (
            <div className="btn-row">
              <a className="btn sm primary" href={`tel:${w.phone}`}>Call {prettyPhone(w.phone)}</a>
              <a className="btn sm buy" target="_blank" rel="noreferrer"
                href={`https://wa.me/${waNumber(w.phone)}?text=${encodeURIComponent(message(w))}`}>WhatsApp</a>
            </div>
          ) : (
            <p className="small warn-text">This winner left no phone number.</p>
          )}
          {w.email && <a className="small" href={`mailto:${w.email}?subject=${encodeURIComponent('You won on ZaMarket')}&body=${encodeURIComponent(message(w))}`}>Email {w.email}</a>}
          <Field label="Note (who you spoke to, when they collect)">
            <Input value={notes[w.entry_id] ?? w.note ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [w.entry_id]: v }))} />
          </Field>
          <div className="btn-row">
            {CLAIM_STEPS.filter(([k]) => k !== 'notified' && k !== w.status).map(([k, label]) => (
              <button key={k} className={`btn sm ${k === 'forfeited' ? 'ghost' : ''}`} onClick={() => save(w, k)}>{label}</button>
            ))}
          </div>
        </div>
      ))}
      <p className="tiny muted">Only staff see these details. A winner is never asked to pay to receive a prize.</p>
    </div>
  )
}

function NewGiveaway({ products, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({
    title: '', product_id: '', prize_text: '', winners: 1,
    closes_at: todayPlus(10), description: '', area: 'Zambia', min_age: 18,
    prize_paid_by: 'marketplace', cost_prize: 0, cost_delivery: 0, cost_promotion: 0,
    referral_reward: 15, referral_days: 7, referral_budget: 0,
    referral_max_per_person: 0, referral_funded_by: 'zamarket',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((c) => ({ ...c, [k]: v }))
  const chosen = products.find((p) => p.id === f.product_id)

  const save = async () => {
    if (!f.title.trim()) return toast('Give it a title', true)
    if (!f.product_id && !f.prize_text.trim()) return toast('Pick a product or describe the prize', true)
    setBusy(true)
    const { error } = await supabase.from('giveaway_campaigns').insert({
      slug: slugify(f.title),
      title: f.title.trim(),
      description: f.description.trim(),
      product_id: f.product_id || null,
      prize_text: f.prize_text.trim() || (chosen?.name || ''),
      prize_value: chosen?.price ?? null,
      winners: Number(f.winners) || 1,
      closes_at: new Date(f.closes_at).toISOString(),
      area: f.area.trim() || 'Zambia',
      min_age: Number(f.min_age) || 18,
      prize_paid_by: f.prize_paid_by,
      cost_prize: Number(f.cost_prize) || 0,
      cost_delivery: Number(f.cost_delivery) || 0,
      cost_promotion: Number(f.cost_promotion) || 0,
      referral_reward: Number(f.referral_reward) || 0,
      referral_days: Number(f.referral_days) || 7,
      referral_budget: Number(f.referral_budget) || 0,
      referral_max_per_person: Number(f.referral_max_per_person) || 0,
      referral_funded_by: f.referral_funded_by,
      status: 'draft',
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast('Saved as a draft. Open it when you are ready.')
    onDone()
  }

  return (
    <div className="card stack-sm">
      <h3>New giveaway</h3>
      <div className="form-grid">
        <Field label="Title" span>
          <Input value={f.title} onChange={set('title')} placeholder="Win a 2kg chocolate celebration cake" />
        </Field>
        <Field label="Prize — a real product" hint="The photo and value come from the live listing" span>
          <Select value={f.product_id} onChange={set('product_id')} placeholder="Choose a product"
            options={products.map((p) => [p.id, `${p.name}${p.vendor_name ? ` — ${p.vendor_name}` : ''}`])} />
        </Field>
        <Field label="Or describe the prize" hint="Only if it is not a listing" span>
          <Input value={f.prize_text} onChange={set('prize_text')} />
        </Field>
        <Field label="Winners"><Input type="number" value={f.winners} onChange={set('winners')} /></Field>
        <Field label="Entries close" hint="Ten days is a good length">
          <Input type="datetime-local" value={f.closes_at} onChange={set('closes_at')} />
        </Field>
        <Field label="Open to"><Input value={f.area} onChange={set('area')} /></Field>
        <Field label="Minimum age"><Input type="number" value={f.min_age} onChange={set('min_age')} /></Field>
        <Field label="Who pays for the prize">
          <Select value={f.prize_paid_by} onChange={set('prize_paid_by')}
            options={[['marketplace', 'ZaMarket'], ['vendor', 'The seller'], ['shared', 'Shared']]} />
        </Field>
        <Field label="Prize cost to you (K)" hint="What it really costs, not the shelf price. 0 if the seller is funding it.">
          <Input type="number" value={f.cost_prize} onChange={set('cost_prize')} />
        </Field>
        <Field label="Delivery cost (K)"><Input type="number" value={f.cost_delivery} onChange={set('cost_delivery')} /></Field>
        <Field label="Promotion cost (K)" hint="Any money spent advertising it. Usually 0.">
          <Input type="number" value={f.cost_promotion} onChange={set('cost_promotion')} />
        </Field>
        <Field label="Reward per qualifying sale (K)" hint="What someone who did not win earns for each new customer they bring. A flat amount.">
          <Input type="number" min="0" value={f.referral_reward} onChange={set('referral_reward')} />
        </Field>
        <Field label="Earning period (days)" hint="How long after the draw they can earn. Starts when you open it.">
          <Input type="number" min="1" max="90" value={f.referral_days} onChange={set('referral_days')} />
        </Field>
        <Field label="Total reward budget (K)" hint="The most this campaign can ever pay out. 0 means no limit — set a figure.">
          <Input type="number" min="0" value={f.referral_budget} onChange={set('referral_budget')} />
        </Field>
        <Field label="Most one person can earn (K)" hint="0 means no limit.">
          <Input type="number" min="0" value={f.referral_max_per_person} onChange={set('referral_max_per_person')} />
        </Field>
        <Field label="Who pays the rewards" hint="Vendor-funded rewards do not come out of your commission.">
          <Select value={f.referral_funded_by} onChange={set('referral_funded_by')}
            options={[['zamarket', 'ZaMarket'], ['vendor', 'The seller'], ['shared', 'Shared']]} />
        </Field>
        <Field label="Description" span>
          <Textarea value={f.description} onChange={set('description')} rows={4}
            placeholder="What it is, and anything a person entering should know." />
        </Field>
      </div>
      <p className="tiny muted">
        Entry is always free — there is no price field, and the database refuses a campaign that has one.
      </p>
      <div className="btn-row">
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save as draft'}</button>
      </div>
    </div>
  )
}

// What the campaign actually produced, against what it cost.
//
// Entries are not a result. A giveaway with 400 entries and no orders cost
// money and bought attention; one with 40 entries and six sales paid for
// itself. This shows both so the difference is impossible to miss.
function Result({ slug }) {
  const [open, setOpen] = useState(false)
  const { data, loading } = useData(async () => {
    if (!open) return null
    const { data: r, error } = await supabase.rpc('giveaway_report', { p_slug: slug, p_days: 90 })
    if (error) throw error
    return r
  }, [open, slug])

  if (!open) {
    return <button className="btn sm ghost" onClick={() => setOpen(true)}>Did it pay for itself?</button>
  }
  if (loading || !data) return <p className="small muted">Working it out…</p>

  const spend = Number(data.spend) || 0
  const earned = Number(data.commission) || 0
  const net = earned - spend
  // What the campaign still has to sell to get the money back, at the fee
  // actually being earned rather than an assumed rate.
  const rate = Number(data.sales) > 0 ? earned / Number(data.sales) : 0
  const toBreakEven = net >= 0 || rate <= 0 ? 0 : (spend - earned) / rate

  return (
    <div className="stack-sm">
      <div className="mini-stats">
        <div><b>{data.entries}</b><span>entered</span></div>
        <div><b>{data.opted_in}</b><span>agreed to hear from you</span></div>
        <div><b>{data.completed}</b><span>orders from its link</span></div>
        <div><b>{data.entrants_who_bought}</b><span>entrants who bought</span></div>
        <div><b>{money(data.sales)}</b><span>sales</span></div>
        <div><b>{money(earned)}</b><span>your commission</span></div>
        <div><b>{money(spend)}</b><span>it cost you</span></div>
        <div><b className={net >= 0 ? 'ok' : 'bad'}>{money(net)}</b><span>{net >= 0 ? 'ahead' : 'behind'}</span></div>
      </div>
      {net < 0 && (
        <p className="tiny muted">
          {toBreakEven > 0
            ? <>Another <strong>{money(toBreakEven)}</strong> of sales through this campaign gets the money back. </>
            : <>No sales through it yet, so there is no rate to work from. </>}
          Over 90 days. Entrants who buy later through a different route are counted in
          &ldquo;entrants who bought&rdquo; rather than here.
        </p>
      )}
    </div>
  )
}

// Rewarding the people who did not win.
//
// After the draw, everyone who entered and lost can earn a fixed amount of
// kwacha for every new customer they bring. It is the same money an affiliate
// earns and it lands in the same ledger — the difference is that it is a flat
// figure, it expires, and it is capped.
//
// The screen's job is to stop a well-meant promotion from losing money. At a
// 10% fee a K15 reward needs a K150 order to break even, so the product
// picker refuses anything that cannot pay for itself and says what would fix
// it. That check lives in the database too; this is only where it is read.
function ReferralPanel({ campaign, products }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reward, setReward] = useState(String(campaign.referral_reward || 15))
  const [pick, setPick] = useState('')

  const { data: report, reload } = useData(
    () => q(supabase.rpc('giveaway_referral_report', { p_slug: campaign.slug })),
    [campaign.slug, open],
  )

  const started = !!campaign.referral_opens_at
  const chosen = report?.products || []

  const addProduct = async () => {
    if (!pick) return toast('Choose a product first', true)
    setBusy(true)
    const { error } = await supabase.rpc('set_reward_product', {
      p_slug: campaign.slug, p_product: pick, p_reward: Number(reward) || 0,
    })
    setBusy(false)
    // The database refuses a reward the sale cannot pay for, and the message
    // it sends back says what to change. Show it as written.
    if (error) return toast(error.message, true)
    setPick('')
    toast('Added')
    reload()
  }

  const removeProduct = async (name) => {
    const row = products.find((p) => p.name === name)
    if (!row) return
    await supabase.rpc('remove_reward_product', { p_slug: campaign.slug, p_product: row.id })
    reload()
  }

  const start = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('open_giveaway_referrals', { p_slug: campaign.slug })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(`${data.invited} people who did not win can now earn`)
    reload()
  }

  if (!open) {
    return (
      <button className="btn sm ghost" onClick={() => setOpen(true)}>
        {started ? 'Referral rewards' : 'Reward the people who did not win'}
      </button>
    )
  }

  return (
    <div className="card stack-sm gw-referral">
      <div className="page-head">
        <div>
          <h3>Rewards for the people who did not win</h3>
          <p className="small muted">
            A fixed amount for every new customer they bring, for a limited period.
            Same money an affiliate earns, paid the same way.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Close</button>
      </div>

      {!started && (
        <>
          <div className="field-row">
            <Field label="Reward for each qualifying sale" hint="A flat amount, not a percentage.">
              <Input type="number" min="1" value={reward} onChange={(e) => setReward(e.target.value)} />
            </Field>
            <Field label="Product they may promote" hint="Only products you approve here can earn.">
              <Select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a product…</option>
                {products.filter((p) => p.status === 'published').map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {money(p.price, { whole: true })}</option>
                ))}
              </Select>
            </Field>
            <button className="btn" disabled={busy} onClick={addProduct}>Add</button>
          </div>
          <p className="tiny muted">
            A reward has to come out of what the sale earns. At a {10}% fee a K15 reward needs
            roughly a K150 order — anything smaller is refused, and it will tell you the price it
            would need.
          </p>
        </>
      )}

      {chosen.length > 0 && (
        <table className="mini-table">
          <thead><tr><th>Product</th><th>Price</th><th>Reward</th><th>You keep</th><th /></tr></thead>
          <tbody>
            {chosen.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{money(row.price, { whole: true })}</td>
                <td>{money(row.reward, { whole: true })}</td>
                <td className={Number(row.check?.margin) > 0 ? 'ok' : 'bad'}>
                  {money(row.check?.margin || 0, { whole: true })}
                </td>
                <td>{!started && <button className="btn sm ghost" onClick={() => removeProduct(row.name)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!started ? (
        <>
          <button className="btn primary" disabled={busy || !chosen.length} onClick={start}>
            Open the earning period
          </button>
          <p className="tiny muted">
            Everyone who entered and did not win gets a link and {campaign.referral_days || 7} days.
            Set the budget and the per-person cap on the campaign before you press this — they
            cannot be raised afterwards without a new campaign.
          </p>
        </>
      ) : report && (
        <>
          <div className="mini-stats">
            <div><b>{report.referrers}</b><span>can earn</span></div>
            <div><b>{report.referrers_earning}</b><span>have earned</span></div>
            <div><b>{report.orders}</b><span>orders brought</span></div>
            <div><b>{money(report.sales, { whole: true })}</b><span>in sales</span></div>
            <div><b>{money(report.commission, { whole: true })}</b><span>your commission</span></div>
            <div><b>{money(Number(report.rewards_pending) + Number(report.rewards_owed), { whole: true })}</b><span>rewards owed</span></div>
            <div><b>{money(report.budget_left, { whole: true })}</b><span>budget left</span></div>
            <div><b>{report.open ? 'Open' : 'Closed'}</b><span>{report.closes_at ? new Date(report.closes_at).toLocaleDateString('en-ZM') : ''}</span></div>
          </div>
          <p className="small">
            <strong>
              {Number(report.commission) - Number(report.rewards_pending) - Number(report.rewards_owed) - Number(report.rewards_paid) >= 0
                ? 'Ahead' : 'Behind'} by {money(Math.abs(
                  Number(report.commission) - Number(report.rewards_pending)
                  - Number(report.rewards_owed) - Number(report.rewards_paid)), { whole: true })}
            </strong>{' '}
            — your commission on these orders, less every reward owed or already paid.
          </p>
          {Number(report.rewards_reversed) > 0 && (
            <p className="tiny muted">{money(report.rewards_reversed, { whole: true })} was reversed by refunds or cancellations.</p>
          )}
          {(report.rejected || []).length > 0 && (
            <details className="small">
              <summary>{report.rejected.length} referral{report.rejected.length === 1 ? '' : 's'} earned nothing</summary>
              <ul className="gw-rules">
                {report.rejected.slice(0, 20).map((r, i) => <li key={i}>{r.order || 'Order'} — {r.why}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}


// The prize list.
//
// A campaign used to have one prize and a number of winners. It can now have
// several: first prize to two people, second to one, third to one. Winners
// are drawn in order, so first prize goes to the first name out.
//
// Locked once the draw has happened — changing what was won after the fact
// is not something a giveaway should ever be able to do.
function PrizeList({ campaign, products, onChange }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')
  const [count, setCount] = useState('1')

  const { data: prizes, reload } = useData(
    () => q(supabase.from('giveaway_prizes')
      .select('rank,winners,prize_text,product_id,prize_value')
      .eq('campaign_id', campaign.id).order('rank')),
    [campaign.id, open],
  )
  const rows = prizes || []
  const totalWinners = rows.reduce((n, r) => n + Number(r.winners || 0), 0)
  const nameOf = (row) => products.find((x) => x.id === row.product_id)?.name || row.prize_text || '—'

  const add = async () => {
    if (!pick) return toast('Choose a product for this prize', true)
    setBusy(true)
    const { error } = await supabase.rpc('set_giveaway_prize', {
      p_slug: campaign.slug,
      p_rank: (rows[rows.length - 1]?.rank || 0) + 1,
      p_product: pick,
      p_text: null,
      p_winners: Math.max(1, Number(count) || 1),
    })
    setBusy(false)
    if (error) return toast(error.message, true)
    setPick(''); setCount('1'); reload(); onChange?.()
  }

  const drop = async (rank) => {
    const { error } = await supabase.rpc('remove_giveaway_prize', { p_slug: campaign.slug, p_rank: rank })
    if (error) return toast(error.message, true)
    reload(); onChange?.()
  }

  if (!open) {
    return (
      <button className="btn sm ghost" onClick={() => setOpen(true)}>
        {rows.length > 1 ? `Prizes (${rows.length})` : 'Add more prizes'}
      </button>
    )
  }

  return (
    <div className="card stack-sm gw-prizes">
      <div className="page-head">
        <div>
          <h3>Prizes</h3>
          <p className="small muted">
            Drawn in order: the first name out takes the first prize. Leave it empty to use the
            single prize on the campaign itself.
          </p>
        </div>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Close</button>
      </div>

      {rows.length > 0 && (
        <table className="mini-table">
          <thead><tr><th>Prize</th><th>What</th><th>Winners</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rank}>
                <td>{row.rank}</td>
                <td>{nameOf(row)}</td>
                <td>{row.winners}</td>
                <td><button className="btn sm ghost" onClick={() => drop(row.rank)}>Remove</button></td>
              </tr>
            ))}
            <tr><td /><td><strong>Total</strong></td><td><strong>{totalWinners}</strong></td><td /></tr>
          </tbody>
        </table>
      )}

      <div className="field-row">
        <Field label="Add a prize">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a product…</option>
            {products.filter((x) => x.status === 'published').map((x) => (
              <option key={x.id} value={x.id}>{x.name} — {money(x.price, { whole: true })}</option>
            ))}
          </Select>
        </Field>
        <Field label="How many winners get it">
          <Input type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <button className="btn" disabled={busy} onClick={add}>Add</button>
      </div>
      <p className="tiny muted">
        Stock for every prize is held back when you open the giveaway, so a prize cannot be sold
        out from under a winner.
      </p>
    </div>
  )
}
