import { useMemo, useState } from 'react'
import { NavLink, useParams, Navigate, Link } from 'react-router-dom'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { money, num, date, title } from '../../lib/format'
import { Loading, Modal, Field, Input, Select, Textarea, useToast, Empty, Badge, CopyLine, Segmented } from '../../components/ui'
import BarChart from '../../components/BarChart'
import { DateBar, useRange } from '../shared/Earnings'
import { buildIdeas, WEEK_PLAN } from '../../lib/contentIdeas'
import Leads, { CHANNELS, LeadDrawer, StageChip, FollowUp } from './Leads'
import StartHere from './StartHere'
import Funnels from './Funnels'
import Seo from './Seo'
import Coverage from './Coverage'
import Featured from './Featured'
import { Campaigns, AdRequests, SpendAndSources } from '../admin/Growth'

const SECTIONS = [
  ['', 'Overview'], ['start', 'Start here'], ['featured', 'Homepage hero'], ['funnels', 'Funnels'], ['seo', 'Search (SEO)'], ['coverage', 'Product coverage'], ['today', 'Today'], ['leads', 'Leads'], ['campaigns', 'Campaigns'], ['content', 'Content'],
  ['magnets', 'Lead magnets'], ['referrals', 'Referrals'], ['requests', 'Vendor requests'], ['spend', 'Ad spend'],
]

export default function MarketingHub() {
  const { section = '' } = useParams()
  if (!SECTIONS.some(([k]) => k === section)) return <Navigate to="/admin/marketing" replace />
  const Page = { '': Overview, start: StartHere, featured: Featured, funnels: Funnels, seo: Seo, coverage: Coverage, today: Today, leads: Leads, campaigns: Campaigns, content: Content, magnets: Magnets, referrals: Referrals, requests: AdRequests, spend: SpendAndSources }[section]
  const heading = SECTIONS.find(([k]) => k === section)[1]
  return (
    <div className="stack mk">
      <div className="mk-head">
        <div>
          <h1>{section ? heading : 'Marketing'}</h1>
          <p>{{
            '': 'What marketing brought in, and where it came from.',
            start: 'New to this? Start here: what to do, in order, and what every number means.',
            featured: 'Who or what is at the top of the homepage today, and what it brought.',
            coverage: 'Which products affiliates are ignoring, and how to fix it.',
            seo: 'Being found on Google for free, and what each page still needs.',
            funnels: 'One path from first seeing you to buying again, with the weakest step marked.',
            today: 'Your checklist for today. Do the work, watch the numbers move.',
            leads: 'Everyone who showed interest. Call, message, follow up, win.',
            campaigns: 'Every ad, post and message gets a short link so results are counted.',
            content: 'What was posted, where, and what it brought in.',
            magnets: 'Free guides, vouchers and checklists that turn visitors into leads.',
            referrals: 'Customers inviting friends, and the rewards they earn.',
            requests: 'Vendors asking ZaMarket to advertise for them.',
            spend: 'What each channel costs and what it returns.',
          }[section]}</p>
        </div>
      </div>
      <nav className="mk-nav" aria-label="Marketing sections">
        {SECTIONS.map(([k, l]) => <NavLink key={k || 'overview'} end to={`/admin/marketing${k ? `/${k}` : ''}`}>{l}</NavLink>)}
      </nav>
      <Page />
    </div>
  )
}

// ---------------- Overview ----------------
function Overview() {
  const [range, setRange] = useRange('30d')
  const [metric, setMetric] = useState('leads')
  const { data, loading, error } = useData(() => q(supabase.rpc('marketing_overview', { p_from: range.from, p_to: range.to })), [range.from, range.to])
  if (error) return <Empty title="Couldn't load marketing">{error}</Empty>
  const d = data && data.channels ? {
    ...data,
    referrals: data.referrals || { invites: 0, orders: 0, owed: 0 },
    resellers: data.resellers || { applied: 0, approved: 0, first_sale: 0, active: 0 },
    magnets: data.magnets || [], series: data.series || [],
  } : data ? { leads: 0, engaged: 0, won: 0, due: 0, untouched: 0, requests: 0, spend: 0, marketing_sales: 0, marketing_orders: 0, all_sales: 0, channels: [], series: [], magnets: [], referrals: { invites: 0, orders: 0, owed: 0 }, resellers: { applied: 0, approved: 0, first_sale: 0, active: 0 } } : null
  const cpc = d && d.won + d.referrals.orders > 0 && d.spend > 0 ? d.spend / (d.won + d.referrals.orders) : null
  const roas = d && d.spend > 0 ? d.marketing_sales / d.spend : null
  const channels = (d?.channels || []).filter((c) => c.leads || c.orders || c.spend || ['warm', 'content', 'cold', 'paid'].includes(c.channel))
  const maxLeads = Math.max(1, ...channels.map((c) => Math.max(c.leads, c.orders)))
  const points = (d?.series || []).map((r) => ({ key: r.day, value: r[metric], label: new Date(`${r.day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), long: new Date(`${r.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }))

  return (
    <div className="stack">
      <div className="card"><DateBar range={range} setRange={setRange} /></div>
      {loading || !d ? <Loading /> : (
        <>
          <div className="mk-kpis">
            <div className="kpi lead"><span>Leads</span><strong>{num(d.leads)}</strong><em>{num(d.engaged)} engaged</em></div>
            <div className="kpi"><span>Customers won</span><strong>{num(d.won)}</strong><em>{d.leads ? `${Math.round((d.won / d.leads) * 100)}% of leads` : 'from leads'}</em></div>
            <div className="kpi"><span>Sales from marketing</span><strong>{money(d.marketing_sales)}</strong><em>{d.all_sales ? `${Math.round((d.marketing_sales / d.all_sales) * 100)}% of all sales` : `${num(d.marketing_orders)} orders`}</em></div>
            <div className="kpi"><span>Ad spend</span><strong>{money(d.spend)}</strong><em>{roas ? `${roas.toFixed(1)}× back in sales` : 'Log spend to see returns'}</em></div>
            <div className="kpi"><span>Cost per customer</span><strong>{cpc ? money(cpc) : '—'}</strong><em>spend ÷ customers won</em></div>
          </div>

          <div className="mk-attention">
            <Link to="/admin/marketing/today" className={`att ${d.due ? 'hot' : ''}`}><strong>{num(d.due)}</strong><span>follow-ups due</span></Link>
            <Link to="/admin/marketing/leads" className={`att ${d.untouched ? 'hot' : ''}`}><strong>{num(d.untouched)}</strong><span>new leads not contacted</span></Link>
            <Link to="/admin/marketing/requests" className={`att ${d.requests ? 'hot' : ''}`}><strong>{num(d.requests)}</strong><span>vendor ad requests</span></Link>
            <Link to="/admin/marketing/referrals" className="att"><strong>{money(d.referrals.owed)}</strong><span>referral rewards to pay</span></Link>
          </div>

          <div className="card">
            <div className="between mb">
              <h3>{metric === 'leads' ? 'New leads' : 'Customers won'} by day</h3>
              <Segmented options={[['leads', 'Leads'], ['won', 'Won']]} value={metric} onChange={setMetric} />
            </div>
            <BarChart points={points} format={(v) => num(Math.round(v))} tone="copper" />
          </div>

          <div className="card">
            <h3 className="mb">Where customers come from</h3>
            <div className="channels">
              <div className="ch-row ch-headrow"><span>Channel</span><span>Leads</span><span>Engaged</span><span>Won</span><span>Orders</span><span>Sales</span><span>Spend</span></div>
              {channels.map((c) => (
                <div key={c.channel} className="ch-row">
                  <span className="ch-name">
                    <strong>{CHANNELS[c.channel]?.label || title(c.channel)}</strong>
                    <em>{CHANNELS[c.channel]?.hint}</em>
                    <i className="ch-bar"><b style={{ width: `${(Math.max(c.leads, c.orders) / maxLeads) * 100}%` }} /></i>
                  </span>
                  <span data-l="Leads">{num(c.leads)}</span>
                  <span data-l="Engaged">{num(c.engaged)}</span>
                  <span data-l="Won">{num(c.won)}</span>
                  <span data-l="Orders">{num(c.orders)}</span>
                  <span data-l="Sales">{money(c.sales)}</span>
                  <span data-l="Spend">{c.spend ? money(c.spend) : '—'}</span>
                </div>
              ))}
            </div>
            <p className="tiny muted mt">Warm outreach, content, cold outreach and paid ads are the four ways to get customers. Doing more of what works is how you grow.</p>
          </div>

          <div className="grid-2 tight">
            <div className="card">
              <h3 className="mb">Lead funnel</h3>
              <Funnel steps={[['Leads', d.leads], ['Engaged', d.engaged], ['Won', d.won]]} />
            </div>
            <div className="card">
              <h3 className="mb">Affiliate recruitment</h3>
              <Funnel steps={[['Applied', d.resellers.applied], ['Approved', d.resellers.approved], ['Made a first sale', d.resellers.first_sale], ['Active in 30 days', d.resellers.active]]} />
            </div>
          </div>

          {d.magnets.length > 0 && (
            <div className="card">
              <div className="between mb"><h3>Lead magnets working now</h3><Link to="/admin/marketing/magnets" className="small">All magnets</Link></div>
              <div className="mini-table">
                {d.magnets.map((m) => (
                  <div key={m.id} className="between small">
                    <span className="strong">{m.name}</span>
                    <span className="muted">{num(m.views)} views · {num(m.leads)} leads · {num(m.won)} won{m.views ? ` · ${Math.round((m.leads / m.views) * 100)}% sign up` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Funnel({ steps }) {
  const top = Math.max(1, steps[0][1])
  return (
    <div className="funnel">
      {steps.map(([label, value], i) => (
        <div key={label} className="fn-step">
          <div className="fn-bar" style={{ width: `${Math.max(8, (value / top) * 100)}%` }}><strong>{num(value)}</strong></div>
          <span className="fn-label">{label}{i > 0 && steps[i - 1][1] ? <em> · {Math.round((value / steps[i - 1][1]) * 100)}%</em> : ''}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------- Today ----------------
function Ring({ value, goal, label, sub }) {
  const pct = goal ? Math.min(1, value / goal) : 0
  const r = 34, c = 2 * Math.PI * r
  return (
    <div className={`ring ${pct >= 1 ? 'done' : ''}`}>
      <svg viewBox="0 0 84 84" aria-hidden><circle cx="42" cy="42" r={r} className="ring-bg" /><circle cx="42" cy="42" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} /></svg>
      <div className="ring-num"><strong>{value}</strong><span>of {goal}</span></div>
      <div className="ring-label">{label}<em>{sub}</em></div>
    </div>
  )
}

function Today() {
  const { profile, role } = useAuth()
  const [open, setOpen] = useState(null)
  const [goals, setGoals] = useState(false)
  const { data, loading, reload } = useData(() => q(supabase.rpc('marketing_today')), [])
  if (loading || !data) return <Loading />
  if (!data.goals) return <Empty title="Nothing to show yet" />
  const g = data.goals
  const hour = new Date().getHours()
  return (
    <div className="stack">
      <div className="today-hero">
        <div>
          <h2>{hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, {(profile?.full_name || '').split(' ')[0] || 'there'}</h2>
          <p>{data.outreach_today >= g.outreach_daily ? "Today's outreach is done. Anything more is a bonus." : `${g.outreach_daily - data.outreach_today} more conversations to hit today's goal.`}</p>
        </div>
        {['founder', 'ops'].includes(role) && <button className="btn sm" onClick={() => setGoals(true)}>Team targets</button>}
      </div>

      <div className="rings">
        <Ring value={data.outreach_today} goal={g.outreach_daily} label="Conversations" sub="today" />
        <Ring value={data.content_week} goal={g.content_weekly} label="Posts" sub="this week" />
        <Ring value={data.engaged_week} goal={g.engaged_weekly} label="Engaged leads" sub="this week" />
        <div className="ring stat-ring"><div className="ring-num"><strong>{data.won_week}</strong><span>won</span></div><div className="ring-label">Customers<em>this week</em></div></div>
      </div>

      <div className="card">
        <div className="between mb">
          <h3>Contact these people</h3>
          <Link to="/admin/marketing/leads" className="small">All leads</Link>
        </div>
        {data.due.length === 0 ? <p className="muted small">No follow-ups due. Add leads from people you know, or post something new.</p> : (
          <div className="lead-list">
            {data.due.map((l) => (
              <button key={l.id} type="button" className="lead-row" onClick={() => setOpen(l)}>
                <span className="lr-main">
                  <span className="lr-name">{l.name || 'No name'} <StageChip stage={l.stage} /></span>
                  <span className="lr-interest">{l.interest || '—'}</span>
                  <span className="lr-meta"><span>{CHANNELS[l.channel]?.label}</span></span>
                </span>
                <span className="lr-side"><span className="lr-phone">{l.phone}</span>{l.next_follow_up ? <FollowUp date={l.next_follow_up} /> : <span className="follow now">Not contacted</span>}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card checklist">
        <h3 className="mb">The daily list</h3>
        <ol>
          <li><strong>Reach out to people who know us.</strong> Friends, past customers, vendors' audiences. Ask if they, or someone they know, need something we sell.</li>
          <li><strong>Post something useful.</strong> A product in use, an offer, a customer review, a how-to. Put a campaign link on it.</li>
          <li><strong>Contact new people.</strong> A few good, personal messages beat a hundred copies. No mass blasting.</li>
          <li><strong>Check the ads.</strong> Log today's spend so the cost per customer stays honest.</li>
          <li><strong>Follow up.</strong> Everyone above with a date today. Most sales happen on the second or third contact.</li>
        </ol>
      </div>

      {open && <LeadDrawer lead={open} onClose={() => { setOpen(null); reload() }} onChanged={reload} />}
      {goals && <GoalsModal onClose={() => setGoals(false)} onDone={() => { setGoals(false); reload() }} />}
    </div>
  )
}

function GoalsModal({ onClose, onDone }) {
  const toast = useToast()
  const { data } = useData(async () => ({
    team: await q(supabase.from('profiles').select('id,full_name,role').in('role', ['founder', 'ops', 'marketing']).order('full_name')),
    goals: await q(supabase.from('marketing_goals').select('*')),
  }), [])
  const [edits, setEdits] = useState({})
  if (!data) return <Modal title="Team targets" onClose={onClose}><Loading /></Modal>
  const row = (id) => ({ outreach_daily: 20, content_weekly: 5, engaged_weekly: 10, ...(data.goals.find((g) => g.user_id === id) || {}), ...(edits[id] || {}) })
  const set = (id, k, v) => setEdits({ ...edits, [id]: { ...(edits[id] || {}), [k]: v } })
  const save = async () => {
    const rows = Object.keys(edits).map((id) => { const r = row(id); return { user_id: id, outreach_daily: Number(r.outreach_daily) || 0, content_weekly: Number(r.content_weekly) || 0, engaged_weekly: Number(r.engaged_weekly) || 0, updated_at: new Date().toISOString() } })
    if (rows.length) { const { error } = await supabase.from('marketing_goals').upsert(rows); if (error) return toast(error.message, true) }
    toast('Targets saved'); onDone()
  }
  return (
    <Modal title="Team targets" onClose={onClose}>
      <div className="stack">
        <p className="small muted">Set targets per person. Start small, raise them once they're met every week.</p>
        {data.team.map((t) => (
          <div key={t.id} className="card flat stack-sm">
            <strong>{t.full_name || t.role} <span className="tiny muted">{t.role}</span></strong>
            <div className="grid-3">
              <Field label="Conversations a day"><Input type="number" value={row(t.id).outreach_daily} onChange={(v) => set(t.id, 'outreach_daily', v)} /></Field>
              <Field label="Posts a week"><Input type="number" value={row(t.id).content_weekly} onChange={(v) => set(t.id, 'content_weekly', v)} /></Field>
              <Field label="Engaged leads a week"><Input type="number" value={row(t.id).engaged_weekly} onChange={(v) => set(t.id, 'engaged_weekly', v)} /></Field>
            </div>
          </div>
        ))}
        <button className="btn primary block" onClick={save}>Save targets</button>
      </div>
    </Modal>
  )
}

// ---------------- Content ----------------
const CONTENT_PLATFORMS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['whatsapp', 'WhatsApp status'], ['youtube', 'YouTube'], ['website', 'Website / blog'], ['other', 'Other']]
const FORMATS = [['post', 'Post'], ['reel', 'Reel'], ['video', 'Video'], ['story', 'Story'], ['status', 'Status'], ['article', 'Article'], ['live', 'Live'], ['other', 'Other']]

function Content() {
  const [edit, setEdit] = useState(null)
  const [view, setView] = useState('ideas')
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
  const { data, loading, reload } = useData(async () => {
    const [posts, stats] = await Promise.all([
      q(supabase.from('content_posts').select('*,campaign:campaigns(name,code)').order('posted_on', { ascending: false }).limit(300)),
      q(supabase.rpc('campaign_stats', { p_from: from, p_to: today })),
    ])
    return posts.map((p) => ({ ...p, stats: stats.find((s) => s.id === p.campaign_id) || null }))
  }, [])
  const week = useMemo(() => {
    const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    return (data || []).filter((p) => p.posted_on >= monday.toISOString().slice(0, 10)).length
  }, [data])
  return (
    <div className="stack">
      <div className="between">
        <p className="small muted"><strong className="ink">{week}</strong> posted this week. Link each post to a campaign to see the visits, leads and sales it brings.</p>
        <div className="row">
          <Segmented options={[['ideas', 'What to post'], ['log', 'What we posted']]} value={view} onChange={setView} />
          <button className="btn primary" onClick={() => setEdit({ platform: 'instagram', format: 'post', posted_on: today })}>Log a post</button>
        </div>
      </div>

      {view === 'ideas' && <Ideas onUse={(idea) => setEdit({ platform: idea.platform.toLowerCase().includes('whatsapp') ? 'whatsapp' : idea.platform.toLowerCase(), format: idea.kind.toLowerCase().includes('video') ? 'video' : 'post', posted_on: today, title: idea.title, product_id: idea.product.id, notes: idea.caption })} />}
      {view === 'log' && (<>
      {loading ? <Loading /> : (data || []).length === 0 ? <Empty title="No content logged yet">Log what you post, and link it to a campaign to measure it.</Empty> : (
        <div className="content-grid">
          {data.map((p) => (
            <button key={p.id} type="button" className="content-card" onClick={() => setEdit(p)}>
              <span className="cc-top"><span className={`plat plat-${p.platform}`}>{(CONTENT_PLATFORMS.find((x) => x[0] === p.platform) || [0, p.platform])[1]}</span><span className="tiny muted">{title(p.format)} · {date(p.posted_on)}</span></span>
              <span className="cc-title">{p.title}</span>
              <span className="cc-stats">
                <span><strong>{num(p.views)}</strong> views</span>
                <span><strong>{num(p.engagement)}</strong> reactions</span>
                {p.stats && <><span><strong>{num(p.stats.visits)}</strong> visits</span><span><strong>{num(p.stats.leads)}</strong> leads</span><span><strong>{num(p.stats.orders)}</strong> orders</span></>}
              </span>
              {p.campaign ? <span className="tiny muted">/go/{p.campaign.code}</span> : <span className="tiny warn">Not linked to a campaign</span>}
            </button>
          ))}
        </div>
      )}
      </>)}
      {edit && <ContentEditor post={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

// Thirty things to post, built from the products that are actually published.
function Ideas({ onUse }) {
  const toast = useToast()
  const [shown, setShown] = useState(9)
  const { data, loading } = useData(async () => ({
    products: await q(supabase.from('public_products').select('id,name,slug,price,benefits,faqs,vendor_name,vendor_slug').order('created_at', { ascending: false }).limit(30)),
    campaigns: await q(supabase.from('campaigns').select('id,name,code,status').eq('status', 'active').limit(1)),
  }), [])
  const ideas = useMemo(() => (data ? buildIdeas(data.products, data.campaigns?.[0], window.location.origin) : []), [data])
  if (loading) return <Loading />
  if (!ideas.length) return <Empty title="Publish a product first">The ideas are built from what you actually sell, so there is nothing to suggest yet.</Empty>
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Caption copied') } catch { toast('Could not copy', true) } }

  return (
    <div className="stack">
      <section className="card stack-sm">
        <h3>A week of posting</h3>
        <div className="week-plan">
          {WEEK_PLAN.map(([day, what]) => <div key={day}><strong>{day}</strong><span>{what}</span></div>)}
        </div>
        <p className="tiny muted">One post a day beats seven in one morning. Post for thirty days before judging whether it works.</p>
        {!data.campaigns?.length && <p className="tiny warn">No active campaign yet, so the links below go straight to the product. Create a campaign to measure what each post brings.</p>}
      </section>

      <div className="idea-list">
        {ideas.slice(0, shown).map((idea) => (
          <article key={idea.id} className="post-idea">
            <div className="between">
              <span className="pi-head"><strong>{idea.title}</strong><span className="tiny muted">{idea.platform} · {idea.kind}</span></span>
              <button className="btn sm" onClick={() => onUse(idea)}>Log it when posted</button>
            </div>
            <p className="pi-hook">{idea.hook}</p>
            <ol className="pi-shots">{idea.shots.map((sh, i) => <li key={i}>{sh}</li>)}</ol>
            <div className="share-box">{idea.caption}</div>
            <button className="btn sm ghost" onClick={() => copy(idea.caption)}>Copy caption</button>
          </article>
        ))}
      </div>
      {shown < ideas.length && <button className="btn" onClick={() => setShown(shown + 9)}>Show more ideas ({ideas.length - shown} left)</button>}
    </div>
  )
}

function ContentEditor({ post, onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const [p, setP] = useState({ ...post })
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }))
  const { data: refs } = useData(async () => ({
    campaigns: await q(supabase.from('campaigns').select('id,name').order('created_at', { ascending: false })),
    vendors: await q(supabase.from('public_vendors').select('id,business_name').order('business_name')),
  }), [])
  const save = async (e) => {
    e.preventDefault()
    const row = { title: p.title, platform: p.platform, format: p.format, url: p.url || null, posted_on: p.posted_on, campaign_id: p.campaign_id || null, vendor_id: p.vendor_id || null, views: Number(p.views) || 0, engagement: Number(p.engagement) || 0, notes: p.notes || null }
    const res = p.id ? await supabase.from('content_posts').update(row).eq('id', p.id) : await supabase.from('content_posts').insert({ ...row, owner_id: user.id })
    if (res.error) return toast(res.error.message, true)
    toast('Saved'); onDone()
  }
  const remove = async () => {
    if (!window.confirm('Delete this post from the log?')) return
    const { error } = await supabase.from('content_posts').delete().eq('id', p.id)
    if (error) return toast(error.message, true)
    onDone()
  }
  return (
    <Modal title={p.id ? 'Edit post' : 'Log a post'} onClose={onClose}>
      <form onSubmit={save} className="form-grid">
        <Field label="What was it?" span><Input value={p.title} onChange={set('title')} placeholder="e.g. Reel: unboxing the Tecno Spark 20" required /></Field>
        <Field label="Where"><Select value={p.platform} onChange={set('platform')} options={CONTENT_PLATFORMS} /></Field>
        <Field label="Type"><Select value={p.format} onChange={set('format')} options={FORMATS} /></Field>
        <Field label="Posted on"><Input type="date" value={p.posted_on} onChange={set('posted_on')} /></Field>
        <Field label="Link to the post (optional)"><Input value={p.url} onChange={set('url')} placeholder="https://" /></Field>
        <Field label="Campaign link used" hint="Create a campaign first to measure visits and sales" span><Select value={p.campaign_id} onChange={set('campaign_id')} options={(refs?.campaigns || []).map((c) => [c.id, c.name])} placeholder="None" /></Field>
        <Field label="For a vendor (optional)"><Select value={p.vendor_id} onChange={set('vendor_id')} options={(refs?.vendors || []).map((v) => [v.id, v.business_name])} placeholder="ZaMarket" /></Field>
        <div />
        <Field label="Views"><Input type="number" value={p.views} onChange={set('views')} /></Field>
        <Field label="Likes, comments, shares"><Input type="number" value={p.engagement} onChange={set('engagement')} /></Field>
        <Field label="Notes" span><Textarea value={p.notes} onChange={set('notes')} rows={2} placeholder="Hook used, what worked, what to try next" /></Field>
        <div className="span btn-row"><button className="btn primary">Save</button>{p.id && <button type="button" className="btn danger" onClick={remove}>Delete</button>}</div>
      </form>
    </Modal>
  )
}

// ---------------- Lead magnets ----------------
const MAGNET_FORMATS = [['guide', 'Guide'], ['checklist', 'Checklist'], ['voucher', 'Voucher'], ['quiz', 'Quiz'], ['sample', 'Free sample'], ['calculator', 'Calculator'], ['video', 'Video'], ['other', 'Other']]
const slugify = (v) => String(v || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function Magnets() {
  const [edit, setEdit] = useState(null)
  const { data, loading, reload } = useData(async () => {
    const today = new Date().toISOString().slice(0, 10)
    const [magnets, overview] = await Promise.all([
      q(supabase.from('lead_magnets').select('*').order('created_at', { ascending: false })),
      q(supabase.rpc('marketing_overview', { p_from: '2020-01-01', p_to: today })),
    ])
    return magnets.map((m) => ({ ...m, stats: overview.magnets.find((x) => x.id === m.id) || null }))
  }, [])
  const host = window.location.host
  return (
    <div className="stack">
      <div className="between">
        <p className="small muted">A lead magnet gives something useful for free in exchange for a name and phone number. Each one gets a page like <strong className="ink">{host}/free/phone-buying-guide</strong>.</p>
        <button className="btn primary" onClick={() => setEdit({ format: 'guide', delivery_type: 'link', status: 'draft', cta_text: 'Send it to me', bullets: [] })}>New lead magnet</button>
      </div>
      {loading ? <Loading /> : (data || []).length === 0 ? <Empty title="No lead magnets yet">Ideas: a phone buying guide, a cake ordering checklist, a first-order voucher, a "which product is right for you" quiz.</Empty> : (
        <div className="magnet-grid">
          {data.map((m) => (
            <button key={m.id} type="button" className="magnet-card" onClick={() => setEdit(m)}>
              <span className="between"><Badge status={m.status === 'live' ? 'active' : m.status === 'paused' ? 'paused' : 'draft'}>{title(m.status)}</Badge><span className="tiny muted">{title(m.format)}</span></span>
              <span className="mc-name">{m.name}</span>
              <span className="mc-headline">{m.headline}</span>
              <span className="mc-link">/free/{m.slug}</span>
              <span className="mc-stats">
                <span><strong>{num(m.views)}</strong> views</span>
                <span><strong>{num(m.stats?.leads || 0)}</strong> leads</span>
                <span><strong>{m.views ? `${Math.round(((m.stats?.leads || 0) / m.views) * 100)}%` : '—'}</strong> sign up</span>
                <span><strong>{num(m.stats?.won || 0)}</strong> won</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {edit && <MagnetEditor magnet={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function MagnetEditor({ magnet, onClose, onDone }) {
  const toast = useToast()
  const { user } = useAuth()
  const [m, setM] = useState({ ...magnet, bullets_text: (magnet.bullets || []).join('\n') })
  const set = (k) => (v) => setM((x) => ({ ...x, [k]: v }))
  const { data: refs } = useData(async () => ({
    campaigns: await q(supabase.from('campaigns').select('id,name').order('created_at', { ascending: false })),
    vendors: await q(supabase.from('public_vendors').select('id,business_name').order('business_name')),
    products: await q(supabase.from('public_products').select('id,name,vendor_id').order('name')),
  }), [])
  const save = async (status) => {
    const row = {
      name: m.name, slug: slugify(m.slug || m.name), format: m.format, audience: m.audience || null, problem: m.problem || null,
      headline: m.headline, description: m.description || null, bullets: (m.bullets_text || '').split('\n').map((b) => b.trim()).filter(Boolean),
      cta_text: m.cta_text || 'Send it to me', delivery_type: m.delivery_type, delivery_value: m.delivery_value || null,
      product_id: m.product_id || null, vendor_id: m.vendor_id || null, campaign_id: m.campaign_id || null, status: status || m.status,
    }
    if (!row.name || !row.headline) return toast('Add a name and a headline', true)
    if (row.status === 'live' && !row.delivery_value) return toast(m.delivery_type === 'link' ? 'Add the link to the guide before going live' : 'Add what people receive before going live', true)
    const res = m.id ? await supabase.from('lead_magnets').update(row).eq('id', m.id) : await supabase.from('lead_magnets').insert({ ...row, created_by: user.id })
    if (res.error) return toast(res.error.message.includes('lead_magnets_slug_key') ? 'That page name is taken. Try another.' : res.error.message, true)
    toast(row.status === 'live' ? 'Lead magnet is live' : 'Saved'); onDone()
  }
  const link = `${window.location.origin}/free/${slugify(m.slug || m.name || '')}`
  return (
    <Modal title={m.id ? m.name : 'New lead magnet'} onClose={onClose} wide>
      <div className="magnet-editor">
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Field label="Name" span><Input value={m.name} onChange={set('name')} placeholder="Phone buying guide" required /></Field>
          <Field label="Page name" hint={link} span><Input value={m.slug} onChange={set('slug')} placeholder={slugify(m.name || 'phone-buying-guide')} /></Field>
          <Field label="Type"><Select value={m.format} onChange={set('format')} options={MAGNET_FORMATS} /></Field>
          <Field label="Who is it for?"><Input value={m.audience} onChange={set('audience')} placeholder="Parents buying a first phone" /></Field>
          <Field label="What problem does it solve?" span><Input value={m.problem} onChange={set('problem')} placeholder="Not knowing which phone is worth the money" /></Field>
          <Field label="Headline on the page" span><Input value={m.headline} onChange={set('headline')} placeholder="Buy the right phone for your budget" required /></Field>
          <Field label="Short description" span><Textarea value={m.description} onChange={set('description')} rows={2} /></Field>
          <Field label="What's inside (one per line)" span><Textarea value={m.bullets_text} onChange={set('bullets_text')} rows={3} placeholder={'The 5 specs that actually matter\nBest phones under K2,000\nHow to avoid fakes'} /></Field>
          <Field label="Button text"><Input value={m.cta_text} onChange={set('cta_text')} /></Field>
          <Field label="What they receive"><Segmented options={[['link', 'A link'], ['voucher', 'A voucher code'], ['message', 'A message']]} value={m.delivery_type} onChange={set('delivery_type')} /></Field>
          <Field label={m.delivery_type === 'link' ? 'Link to the file or page' : m.delivery_type === 'voucher' ? 'Voucher code' : 'Message shown after signing up'} span>
            {m.delivery_type === 'message' ? <Textarea value={m.delivery_value} onChange={set('delivery_value')} rows={2} /> : <Input value={m.delivery_value} onChange={set('delivery_value')} placeholder={m.delivery_type === 'link' ? 'https://…' : 'FIRST50'} />}
          </Field>
          <Field label="For a vendor (optional)"><Select value={m.vendor_id} onChange={set('vendor_id')} options={(refs?.vendors || []).map((v) => [v.id, v.business_name])} placeholder="ZaMarket" /></Field>
          <Field label="Related product (optional)"><Select value={m.product_id} onChange={set('product_id')} options={(refs?.products || []).filter((p) => !m.vendor_id || p.vendor_id === m.vendor_id).map((p) => [p.id, p.name])} placeholder="None" /></Field>
          <Field label="Campaign (optional)" span><Select value={m.campaign_id} onChange={set('campaign_id')} options={(refs?.campaigns || []).map((c) => [c.id, c.name])} placeholder="None" /></Field>
          <div className="span btn-row">
            <button className="btn">Save draft</button>
            {m.status !== 'live' && <button type="button" className="btn buy" onClick={() => save('live')}>Go live</button>}
            {m.status === 'live' && <button type="button" className="btn" onClick={() => save('paused')}>Pause</button>}
          </div>
          {m.id && m.status === 'live' && <div className="span"><CopyLine text={link} /></div>}
        </form>
        <div className="magnet-preview" aria-label="Preview">
          <span className="magnet-kind">{title(m.format)}</span>
          <h3>{m.headline || 'Your headline'}</h3>
          {m.description && <p>{m.description}</p>}
          <ul>{(m.bullets_text || '').split('\n').filter((b) => b.trim()).map((b, i) => <li key={i}>{b}</li>)}</ul>
          <div className="mp-form"><span /><span /><button type="button" className="btn buy block" tabIndex={-1}>{m.cta_text || 'Send it to me'}</button></div>
        </div>
      </div>
    </Modal>
  )
}

// ---------------- Referrals ----------------
function Referrals() {
  const toast = useToast()
  const { role } = useAuth()
  const canPay = ['founder', 'ops'].includes(role)
  const { data, loading, reload } = useData(async () => ({
    rows: await q(supabase.from('referrals').select('*,order:orders(order_number,status,subtotal)').order('created_at', { ascending: false }).limit(500)),
    reward: (await q(supabase.from('settings').select('value').eq('key', 'referral_reward').maybeSingle()))?.value,
  }), [])
  const pay = async (r) => {
    const { error } = await supabase.from('referrals').update({ status: 'paid' }).eq('id', r.id)
    if (error) return toast(error.message, true)
    toast('Marked paid'); reload()
  }
  if (loading || !data) return <Loading />
  const links = data.rows.filter((r) => !r.order_id)
  const orders = data.rows.filter((r) => r.order_id)
  const top = Object.values(orders.filter((r) => r.status !== 'void').reduce((m, r) => { const k = r.referrer_phone; m[k] = m[k] || { name: r.referrer_name, phone: k, count: 0, earned: 0 }; m[k].count++; m[k].earned += Number(r.reward); return m }, {})).sort((a, b) => b.count - a.count)
  return (
    <div className="stack">
      <div className="mk-kpis">
        <div className="kpi lead"><span>Customers with invite links</span><strong>{num(links.length)}</strong><em>they get one after ordering</em></div>
        <div className="kpi"><span>Friends who ordered</span><strong>{num(orders.filter((r) => r.status !== 'void').length)}</strong><em>first orders only</em></div>
        <div className="kpi"><span>Rewards to pay</span><strong>{money(orders.filter((r) => r.status === 'eligible').reduce((t, r) => t + Number(r.reward), 0))}</strong><em>after the friend's order completes</em></div>
        <div className="kpi"><span>Reward per friend</span><strong>{money(data.reward)}</strong><em>change in Settings</em></div>
      </div>
      <div className="grid-2 tight">
        <div className="card">
          <h3 className="mb">Top referrers</h3>
          {top.length === 0 ? <p className="small muted">No referred orders yet. Customers get their link on the order confirmation page.</p> : top.slice(0, 10).map((t) => (
            <div key={t.phone} className="between small"><span className="strong">{t.name}</span><span className="muted">{t.count} friend{t.count > 1 ? 's' : ''} · {money(t.earned)}</span></div>
          ))}
        </div>
        <div className="card">
          <h3 className="mb">How it works</h3>
          <ol className="small steps-list">
            <li>A customer places an order, then gets a link like <strong>/invite/chanda</strong>.</li>
            <li>A friend opens it and places their first order.</li>
            <li>When that order is completed, the reward becomes payable.</li>
            <li>Pay the customer, then mark it paid here.</li>
          </ol>
        </div>
      </div>
      <div className="card">
        <h3 className="mb">Referred orders</h3>
        {orders.length === 0 ? <p className="small muted">Nothing yet.</p> : (
          <div className="lead-list">
            {orders.map((r) => (
              <div key={r.id} className="lead-row static">
                <span className="lr-main">
                  <span className="lr-name">{r.referrer_name} invited {r.referred_phone}</span>
                  <span className="lr-meta"><span>Order #{r.order?.order_number}</span><span>{title(r.order?.status || '')}</span><span>{money(r.order?.subtotal)}</span></span>
                </span>
                <span className="lr-side">
                  <span className="strong">{money(r.reward)}</span>
                  <Badge status={{ purchased: 'pending', eligible: 'eligible', paid: 'paid', void: 'cancelled' }[r.status] || r.status}>{title(r.status === 'purchased' ? 'waiting for delivery' : r.status)}</Badge>
                  {r.status === 'eligible' && canPay && <button className="btn sm buy" onClick={() => pay(r)}>Mark paid</button>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
