import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { Loading, Segmented } from '../../components/ui'
import { money, num } from '../../lib/format'
import { CHANNEL_LABEL } from '../../lib/channel'
import { analyticsId } from '../../lib/analytics'

// Where the business is actually coming from.
//
// Every number on this page is a completed-order figure out of our own
// database. There are no estimates, no sampled analytics, and no numbers
// borrowed from an outside service and presented as fact. If a source is not
// connected, the page says so instead of showing a plausible figure.
//
// The two questions it exists to answer, which nothing else here answers:
//
//   1. Which platform is producing orders — WhatsApp statuses, Facebook,
//      TikTok, a printed QR code. Google Analytics cannot tell you this for
//      WhatsApp, because WhatsApp sends no referrer; it all lands in
//      "Direct". We tag our own links instead, so the answer is exact.
//   2. Which products people open and then do not buy. In the first weeks
//      that list is the most useful thing on the screen: it is where a
//      photograph, a price or a description is losing the sale.

const RANGES = { 7: 'This week', 30: '30 days', 90: '90 days', 365: 'This year' }

const ago = (days) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

export default function Growth() {
  const { settings } = useAuth()
  const [days, setDays] = useState(30)
  const { data, loading, error } = useData(
    () => supabase.rpc('growth_report', { p_from: ago(days), p_to: today() }).then(({ data: d, error: e }) => {
      if (e) throw e
      return d
    }),
    [days],
  )

  if (loading) return <Loading shape="page" />
  if (error) {
    return (
      <div className="card stack-sm">
        <h2>Growth figures are not available</h2>
        <p className="small muted">
          The growth report has not been installed on the database yet. Run the
          latest SQL in Supabase and this page will fill itself in. No figures
          have been estimated in the meantime.
        </p>
      </div>
    )
  }

  const g = data || {}
  const ga = analyticsId(settings)
  const verified = String(settings?.search_console_verified) === 'true'
  const views = Number(g.product_views) || 0
  const completed = Number(g.completed) || 0
  const orders = Number(g.orders) || 0
  // Views to orders. Honest about small numbers: below a hundred views a
  // percentage is noise, so it is not shown as one.
  const rate = views >= 100 ? `${((orders / views) * 100).toFixed(1)}%` : '—'

  return (
    <div className="stack">
      <div className="between">
        <p className="small muted">
          Completed orders and revenue, straight from the order records. Not sampled, not estimated.
        </p>
        <Segmented options={Object.entries(RANGES)} value={String(days)} onChange={(v) => setDays(Number(v))} />
      </div>

      <div className="grid-4">
        <div className="card stat"><div className="label">Orders placed</div><div className="value">{num(orders)}</div><div className="sub">{num(completed)} completed</div></div>
        <div className="card stat"><div className="label">Revenue (completed)</div><div className="value">{money(g.revenue)}</div><div className="sub">{RANGES[days]}</div></div>
        <div className="card stat"><div className="label">Product pages opened</div><div className="value">{num(views)}</div><div className="sub">{num(g.store_views)} shop pages</div></div>
        <div className="card stat"><div className="label">Opened, then ordered</div><div className="value">{rate}</div><div className="sub">{views < 100 ? 'Too few views to be meaningful yet' : 'Of everyone who opened a product'}</div></div>
      </div>

      <div className="grid-2 tight">
        <div className="card stack-sm">
          <div className="card-title">
            <h3>Which platform the orders came from</h3>
            <span className="small muted">Tagged in our own links</span>
          </div>
          {(g.by_channel || []).length === 0
            ? <p className="muted small">No orders in this period yet.</p>
            : (
              <div className="finance-visual">
                {(g.by_channel || []).map((row) => {
                  const top = Math.max(1, ...(g.by_channel || []).map((r) => Number(r.orders) || 0))
                  return (
                    <div key={row.channel} className="finance-visual-line">
                      <div className="finance-visual-label">
                        <span>{CHANNEL_LABEL[row.channel] || row.channel}</span>
                        <strong>{num(row.completed)} sold · {money(row.revenue)}</strong>
                      </div>
                      <div className="finance-visual-track">
                        <span style={{ width: `${Math.min(100, ((Number(row.orders) || 0) / top) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          <p className="tiny muted">
            Set by the <strong>Posting to</strong> choice when you make a poster. Pick it
            honestly and this list stays true; leave everything on one setting and it
            tells you nothing.
          </p>
        </div>

        <div className="card stack-sm">
          <div className="card-title"><h3>Who brought them</h3><span className="small muted">Credit for the sale</span></div>
          {(g.by_source || []).length === 0
            ? <p className="muted small">No orders in this period yet.</p>
            : (
              <div className="finance-visual">
                {(g.by_source || []).map((row) => {
                  const top = Math.max(1, ...(g.by_source || []).map((r) => Number(r.orders) || 0))
                  return (
                    <div key={row.source} className="finance-visual-line">
                      <div className="finance-visual-label">
                        <span>{{ reseller: 'An affiliate', vendor: 'A seller’s own link', campaign: 'A campaign', referral: 'A customer referral', organic: 'Came to us directly' }[row.source] || row.source}</span>
                        <strong>{num(row.completed)} sold · {money(row.revenue)}</strong>
                      </div>
                      <div className="finance-visual-track">
                        <span style={{ width: `${Math.min(100, ((Number(row.orders) || 0) / top) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          <p className="tiny muted">
            An affiliate link posted on WhatsApp counts in both lists — one answers
            who earns the commission, the other answers where to post next.
          </p>
        </div>
      </div>

      <div className="card stack-sm">
        <div className="card-title">
          <h3>Looked at, but nobody bought</h3>
          <span className="small muted">Five or more opens, no orders</span>
        </div>
        {(g.looked_not_bought || []).length === 0
          ? <p className="muted small">Nothing is being ignored at the moment. Either everything that gets opened sells, or there is not enough traffic yet to tell.</p>
          : (
            <>
              <div className="mini-table">
                {(g.looked_not_bought || []).slice(0, 12).map((p) => (
                  <Link key={p.id} to={`/admin/products/${p.id}`} className="mini-row">
                    <span className="grow">{p.name}</span>
                    <span><b>{num(p.views)}</b> opened · 0 sold</span>
                  </Link>
                ))}
              </div>
              <p className="tiny muted">
                People are finding these and leaving. Usually it is the photograph, the
                price next to what else is on the page, or a description that does not
                answer the obvious question. Fix one at a time and watch this list.
              </p>
            </>
          )}
      </div>

      <div className="card stack-sm">
        <div className="card-title"><h3>Outside sources</h3></div>
        <div className="mini-table">
          <div className="mini-row">
            <span className="grow">
              <strong>Google Analytics</strong>
              <small className="muted">How people move around the site, and which pages they leave from</small>
            </span>
            <span className={ga ? 'ok strong' : 'muted'}>{ga ? `On · ${ga}` : 'Not connected'}</span>
          </div>
          <div className="mini-row">
            <span className="grow">
              <strong>Google Search Console</strong>
              <small className="muted">What people searched before they found you, and which pages Google has indexed</small>
            </span>
            <span className={verified ? 'ok strong' : 'muted'}>{verified ? 'Verified' : 'Not verified'}</span>
          </div>
        </div>
        <p className="tiny muted">
          Neither of these feeds figures into this page — their numbers live in their own
          dashboards, and Analytics misses anyone using an ad blocker. The figures above
          come from the order records, which miss nobody. Switch Analytics on by pasting
          your measurement ID in <Link to="/admin/settings">Settings</Link>; with it empty,
          no Google script is loaded at all.
        </p>
      </div>
    </div>
  )
}
