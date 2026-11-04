import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { Loading, useToast, Field, Input, Select, Textarea } from '../../components/ui'
import { money } from '../../lib/format'

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

      <div className="card stack-sm">
        <h3>Before the first one goes live</h3>
        <ul className="gw-rules">
          <li>
            A Zambian lawyer should read your terms once. The Lotteries Act covers schemes where
            people <strong>pay</strong> for a chance — this does not, which is why entry is free and
            cannot be made otherwise — but a one-off check is cheap next to the risk.
          </li>
          <li>
            Meta does not allow <strong>requiring</strong> a share to someone&rsquo;s timeline or tagging
            friends to enter. Asking people to comment is fine. Everything here is written that way.
          </li>
          <li>
            Every campaign page already carries the line saying the giveaway is not associated with
            Meta, Instagram, TikTok or WhatsApp. Meta requires that.
          </li>
        </ul>
      </div>

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

              <Result slug={c.slug} />

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

function NewGiveaway({ products, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({
    title: '', product_id: '', prize_text: '', winners: 1,
    closes_at: todayPlus(10), description: '', area: 'Zambia', min_age: 18,
    prize_paid_by: 'marketplace', cost_prize: 0, cost_delivery: 0, cost_promotion: 0,
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
