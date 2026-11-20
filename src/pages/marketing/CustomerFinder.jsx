import { useEffect, useMemo, useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { useAuth } from '../../lib/auth'
import { Loading, Field, Input, Textarea, Select, useToast, Empty, Tabs } from '../../components/ui'
import { usablePhone, prettyPhone } from '../../lib/phone'
import { StageChip, FollowUp } from './Leads'

// Find customers: one place for the daily work of bringing buyers in.
//   Today          what to do right now, and how far you are towards the day's target
//   Offices        offices to bring the weekly lunch to, worked one by one
//   People I know  personal messages to people you know, one at a time
//   Referrals      customers who brought someone, and the reward they are owed
//   Seller reports each seller's numbers for the week, ready to send them
// Everything is a lead in the same leads list (with its history and
// follow-up dates), so nothing is kept twice and a new helper sees it all.

const pad = (x) => String(x).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const inDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d) }
const todayStr = () => ymd(new Date())
const wa = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '260')}?text=${encodeURIComponent(text)}`
const first = (n) => String(n || '').trim().split(/\s+/)[0] || ''

// What happened, and what it means for the next step.
const OUTCOMES = [
  { key: 'no_answer', label: 'No answer', stage: 'contacted', next: 2 },
  { key: 'follow_up', label: 'Call back later', stage: 'contacted', next: 3 },
  { key: 'interested', label: 'Interested', stage: 'engaged', next: 2 },
  { key: 'ordered', label: 'Ordered / booked', stage: 'won', next: null },
  { key: 'not_interested', label: 'Not now', stage: 'lost', next: null },
  { key: 'wrong_number', label: 'Wrong number', stage: 'lost', next: null },
]

// Ready messages. Edit them on this phone; {name}, {office}, {link} are filled in.
const DEFAULT_MESSAGES = {
  office: 'Hello {name}, I\'m {me} from ZaMarket. We deliver homemade lunches to offices in Lusaka, ordered once for the whole week and brought to your office at lunchtime. Would your team like to see this week\'s menu? {link}',
  warm_lunch: 'Hi {name}! Hope you\'re well. I\'ve started ZaMarket, and one thing we do is homemade lunch delivered to your office for the week. If you or your colleagues are tired of hunting for lunch, here is the menu: {link}',
  warm_shop: 'Hi {name}! Hope you\'re well. I\'ve started ZaMarket, an online marketplace here in Lusaka with products from local sellers, delivered. Have a look, and tell me if there\'s anything you\'re looking for: https://zamarket.shop',
  warm_sell: 'Hi {name}! I\'ve started ZaMarket, an online marketplace in Lusaka. If you (or someone you know) sell anything, we can put it online and bring you customers, with no joining or monthly fee. Here is how it works: https://zamarket.shop/grow',
  warm_earn: 'Hi {name}! I\'ve started ZaMarket. People can earn a commission by sharing our products online when a sale completes. Would you like to hear how it works? https://zamarket.shop/affiliates',
  referral: 'Hi! I order my weekly lunch from ZaMarket: homemade food delivered to the office. Have a look at this week\'s menu: {link}',
}
const MSG_LABELS = { office: 'Office: first message', warm_lunch: 'People I know: weekly lunch', warm_shop: 'People I know: the shop', warm_sell: 'People I know: sell with us', warm_earn: 'People I know: earn with us', referral: 'For customers to forward' }
const MSG_KEY = 'zm-find-messages'
const loadMessages = () => { try { return { ...DEFAULT_MESSAGES, ...JSON.parse(localStorage.getItem(MSG_KEY) || '{}') } } catch { return { ...DEFAULT_MESSAGES } } }

const TABS = [['today', 'Today'], ['results', 'Real numbers'], ['offices', 'Offices'], ['people', 'People I know'], ['referrals', 'Referrals'], ['sellers', 'Seller reports']]

export default function CustomerFinder() {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('zm-find-tab') || 'today' } catch { return 'today' } })
  const choose = (t) => { setTab(t); try { sessionStorage.setItem('zm-find-tab', t) } catch { /* ignore */ } }
  const [messages, setMessages] = useState(loadMessages)
  const { data: lunch } = useData(async () => (await q(supabase.from('meal_deals').select('slug,title').eq('status', 'published').order('created_at', { ascending: false }).limit(1)))?.[0] || null, [])
  const lunchLink = lunch ? `https://zamarket.shop/lunch/${lunch.slug}` : 'https://zamarket.shop'
  const saveMessages = (m) => { setMessages(m); try { localStorage.setItem(MSG_KEY, JSON.stringify(m)) } catch { /* full */ } }
  const ctx = { messages, lunchLink }
  return (
    <div className="stack find">
      <div className="page-head">
        <div>
          <h1>Find customers</h1>
          <p className="muted">The daily work of bringing buyers in: offices for lunch, people you know, referrals, and showing sellers what we did for them. Personal messages, one at a time. Never a blast.</p>
        </div>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={choose} />
      {tab === 'today' && <TodayTab ctx={ctx} go={choose} />}
      {tab === 'results' && <ResultsTab />}
      {tab === 'offices' && <ListTab list="office" ctx={ctx} />}
      {tab === 'people' && <ListTab list="warm" ctx={ctx} />}
      {tab === 'referrals' && <ReferralsTab ctx={ctx} />}
      {tab === 'sellers' && <SellersTab />}
      {tab !== 'sellers' && tab !== 'results' && <Messages messages={messages} save={saveMessages} />}
    </div>
  )
}

const LEAD_COLS = 'id,name,phone,company,contact_name,area,list,stage,channel,interest,notes,next_follow_up,last_contact_at,referred_by,reward_given_at,created_at'
const notReady = (e) => /column .*(list|company|contact_name|referred_by)|leads_list/i.test(String(e?.message || e || ''))

// ---------------- Today ----------------
function TodayTab({ ctx, go }) {
  const { user } = useAuth()
  const { data, loading, error, reload } = useData(async () => {
    const t = todayStr()
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const [due, offices, people, done, goal] = await Promise.all([
      q(supabase.from('leads').select(LEAD_COLS).in('list', ['office', 'warm', 'referral']).in('stage', ['new', 'contacted', 'engaged']).lte('next_follow_up', t).order('next_follow_up').limit(30)),
      q(supabase.from('leads').select(LEAD_COLS).eq('list', 'office').eq('stage', 'new').is('last_contact_at', null).order('created_at').limit(5)),
      q(supabase.from('leads').select(LEAD_COLS).eq('list', 'warm').eq('stage', 'new').is('last_contact_at', null).order('created_at').limit(5)),
      supabase.from('lead_activities').select('id', { count: 'exact', head: true }).eq('user_id', user?.id).in('kind', ['call', 'whatsapp', 'in_person', 'sms', 'dm']).gte('created_at', start.toISOString()).then((r) => r, () => null),
      q(supabase.from('marketing_goals').select('outreach_daily').eq('user_id', user?.id).maybeSingle()).catch(() => null),
    ])
    return { due, offices, people, done: done?.count ?? 0, goal: goal?.outreach_daily || 20 }
  }, [user?.id])
  if (loading) return <Loading />
  if (error) return <SetupNeeded error={error} />
  const { due, offices, people } = data
  const done = data.done || 0
  const pct = Math.min(100, Math.round((done / data.goal) * 100))
  const empty = !due.length && !offices.length && !people.length
  return (
    <div className="stack">
      <div className="card find-goal">
        <div className="between">
          <div><b>{done} of {data.goal} conversations today</b><p className="muted small">{done >= data.goal ? 'Today’s target is done. Anything more is a bonus.' : `${data.goal - done} more to go. A call or a personal WhatsApp both count once you log them.`}</p></div>
          <strong className="find-pct">{pct}%</strong>
        </div>
        <div className="find-bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      {empty && (
        <Empty title="Nothing to do yet">
          Add the offices you want to bring lunch to, and the people you know. Each day this page tells you who to contact next.
          <div className="row mt"><button className="btn primary" onClick={() => go('offices')}>Add offices</button><button className="btn" onClick={() => go('people')}>Add people I know</button></div>
        </Empty>
      )}
      {due.length > 0 && <Group title="Follow up today" hint="You said you would get back to them today (or it is overdue)." leads={due} ctx={ctx} reload={reload} />}
      {offices.length > 0 && <Group title="Next offices to contact" hint="New offices, oldest first." leads={offices} ctx={ctx} reload={reload} />}
      {people.length > 0 && <Group title="Next people to message" hint="One personal message each." leads={people} ctx={ctx} reload={reload} />}
    </div>
  )
}

function Group({ title: t, hint, leads, ctx, reload }) {
  return (
    <div className="card">
      <h3>{t}</h3>
      {hint && <p className="muted small mb">{hint}</p>}
      <div className="find-list">{leads.map((l) => <LeadCard key={l.id} lead={l} ctx={ctx} reload={reload} />)}</div>
    </div>
  )
}

// ---------------- One person or office ----------------
function messageFor(lead, ctx, key) {
  const { profile } = ctx
  const tpl = ctx.messages[key] || ''
  return tpl
    .replace(/\{name\}/g, first(lead.contact_name || lead.name) || 'there')
    .replace(/\{office\}/g, lead.company || lead.name || '')
    .replace(/\{link\}/g, ctx.lunchLink)
    .replace(/\{me\}/g, first(profile?.full_name) || 'Abubakr')
}

function LeadCard({ lead, ctx, reload }) {
  const toast = useToast()
  const { user, profile } = useAuth()
  const [logging, setLogging] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgKey, setMsgKey] = useState(lead.list === 'office' ? 'office' : lead.list === 'referral' ? 'warm_lunch' : 'warm_lunch')
  const title = lead.list === 'office' ? (lead.company || lead.name) : lead.name
  const who = lead.list === 'office' ? [lead.contact_name, lead.area].filter(Boolean).join(' · ') : [lead.company, lead.area].filter(Boolean).join(' · ')
  const text = messageFor(lead, { ...ctx, profile }, msgKey)
  const log = async (o, kind) => {
    setBusy(true)
    const now = new Date().toISOString()
    const act = await supabase.from('lead_activities').insert({ lead_id: lead.id, user_id: user?.id, kind, outcome: o.key, note: note.trim() || null })
    const upd = await supabase.from('leads').update({ stage: o.stage, last_contact_at: now, next_follow_up: o.next ? inDays(o.next) : null, lost_reason: o.stage === 'lost' ? o.label : null, updated_at: now }).eq('id', lead.id)
    setBusy(false)
    if (act.error || upd.error) return toast((act.error || upd.error).message, true)
    setLogging(false); setNote('')
    toast(o.next ? `Logged. Next contact: ${o.next === 2 ? 'in 2 days' : `in ${o.next} days`}.` : 'Logged.')
    reload?.()
  }
  return (
    <div className="find-lead">
      <div className="find-lead-top">
        <div className="find-lead-main">
          <b>{title || 'No name'}</b> <StageChip stage={lead.stage} />
          {who && <small className="muted">{who}</small>}
          {lead.referred_by && <small className="muted">Referred by {lead.referred_by}</small>}
          {lead.notes && <small className="find-note">{lead.notes}</small>}
        </div>
        <div className="find-lead-side">
          {lead.phone && <small>{prettyPhone(lead.phone)}</small>}
          {lead.next_follow_up ? <FollowUp date={lead.next_follow_up} /> : lead.stage === 'new' ? <span className="follow now">Not contacted</span> : null}
        </div>
      </div>
      <div className="find-actions">
        {lead.list !== 'office' && (
          <select value={msgKey} onChange={(e) => setMsgKey(e.target.value)} aria-label="Which message">
            {['warm_lunch', 'warm_shop', 'warm_sell', 'warm_earn'].map((k) => <option key={k} value={k}>{MSG_LABELS[k].replace('People I know: ', '')}</option>)}
          </select>
        )}
        {lead.phone && <a className="btn sm primary" href={wa(lead.phone, text)} target="_blank" rel="noopener noreferrer" onClick={() => setLogging('whatsapp')}>WhatsApp</a>}
        {lead.phone && <a className="btn sm" href={`tel:${String(lead.phone).replace(/\s/g, '')}`} onClick={() => setLogging('call')}>Call</a>}
        <button type="button" className="btn sm ghost" onClick={() => setLogging(logging ? false : 'in_person')}>{logging ? 'Close' : 'Log what happened'}</button>
      </div>
      {lead.list === 'office' && logging === 'call' && <CallScript lead={lead} />}
      {logging && (
        <div className="find-log">
          <small className="muted">What happened{logging === 'whatsapp' ? ' after your WhatsApp' : logging === 'call' ? ' on the call' : ''}?</small>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short note (optional): spoke to Mary, team of 12…" maxLength={300} />
          <div className="find-outcomes">{OUTCOMES.map((o) => <button key={o.key} type="button" className="btn sm" disabled={busy} onClick={() => log(o, logging === 'in_person' ? 'in_person' : logging)}>{o.label}</button>)}</div>
        </div>
      )}
    </div>
  )
}

function CallScript({ lead }) {
  return (
    <ol className="find-script">
      <li>Ask for the office manager, admin or HR{lead.contact_name ? ` (or ${lead.contact_name})` : ''}.</li>
      <li>“I’m from ZaMarket. We deliver homemade lunches to offices{lead.area ? ` around ${lead.area}` : ''}, ordered once for the week and brought at lunchtime.”</li>
      <li>Ask: “How do your staff usually get lunch?” Then listen.</li>
      <li>“Can I send you this week’s menu on WhatsApp?” Get the best number and a name.</li>
      <li>Agree when to check back, and log it below.</li>
    </ol>
  )
}

// ---------------- Offices / People I know ----------------
function ListTab({ list, ctx }) {
  const toast = useToast()
  const [stage, setStage] = useState('open')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const { data, loading, error, reload } = useData(() => {
    let r = supabase.from('leads').select(LEAD_COLS).eq('list', list).order('updated_at', { ascending: false }).limit(500)
    r = stage === 'open' ? r.in('stage', ['new', 'contacted', 'engaged']) : r.eq('stage', stage)
    return q(r)
  }, [list, stage])
  const shown = useMemo(() => (data || []).filter((l) => !search || `${l.name} ${l.company} ${l.contact_name} ${l.area} ${l.phone}`.toLowerCase().includes(search.toLowerCase())), [data, search])
  if (error) return <SetupNeeded error={error} />
  const office = list === 'office'
  return (
    <div className="stack">
      <div className="card">
        <div className="between">
          <div>
            <h3>{office ? 'Offices for the weekly lunch' : 'People I know'}</h3>
            <p className="muted small">{office
              ? 'Offices, banks, schools’ staff rooms, clinics, shops with staff. Add them as you find them (walking past, Google Maps, people you know there); work through them one by one.'
              : 'Friends, family, old classmates, colleagues, past customers, people in your groups. Each gets one personal message about one thing that suits them.'}</p>
          </div>
          <button type="button" className="btn primary" onClick={() => setAdding(!adding)}>{adding ? 'Close' : office ? 'Add offices' : 'Add people'}</button>
        </div>
        {adding && <AddLeads list={list} done={() => { setAdding(false); reload() }} toast={toast} />}
      </div>
      <div className="row wrap">
        <div className="segmented">{[['open', 'Open'], ['won', office ? 'Customers' : 'Said yes'], ['lost', 'Not now']].map(([v, l]) => <button key={v} type="button" className={stage === v ? 'on' : ''} onClick={() => setStage(v)}>{l}</button>)}</div>
        <input className="find-search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <Loading /> : !shown.length ? <Empty title={stage === 'open' ? 'Nobody here yet' : 'None yet'}>{stage === 'open' ? `Tap “${office ? 'Add offices' : 'Add people'}” to start the list.` : ''}</Empty> : (
        <div className="find-list">{shown.map((l) => <LeadCard key={l.id} lead={l} ctx={ctx} reload={reload} />)}</div>
      )}
    </div>
  )
}

function AddLeads({ list, done, toast, extra = {} }) {
  const office = list === 'office'
  const [f, setF] = useState({ company: '', contact_name: '', name: '', phone: '', area: '', notes: '', referred_by: '' })
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (val) => setF((x) => ({ ...x, [k]: val }))
  const rowFor = (r) => ({
    list, channel: list === 'office' ? 'cold' : list === 'referral' ? 'referral' : 'warm', stage: 'new',
    name: (office ? r.company : r.name)?.trim() || null, company: r.company?.trim() || null, contact_name: r.contact_name?.trim() || null,
    phone: usablePhone(r.phone) ? String(r.phone).replace(/\s/g, '') : null, area: r.area?.trim() || null, notes: r.notes?.trim() || null,
    referred_by: r.referred_by?.trim() || null, interest: list === 'office' || list === 'referral' ? 'Weekly lunch' : null, ...extra,
  })
  const insert = async (rows) => {
    setBusy(true)
    let added = 0; let already = 0; let failed = ''
    for (const r of rows) {
      const { error } = await supabase.from('leads').insert(rowFor(r))
      if (!error) added += 1
      else if (/duplicate|leads_open_phone/i.test(error.message)) already += 1
      else failed = error.message
    }
    setBusy(false)
    if (failed && !added) return toast(failed, true)
    toast(`${added} added${already ? ` · ${already} already in your lists` : ''}`)
    done()
  }
  const one = (e) => {
    e.preventDefault()
    if (office ? !f.company.trim() : !f.name.trim()) return toast(office ? 'Type the office name' : 'Type a name', true)
    insert([f])
  }
  // "Name, phone, area" one per line (offices: "Office, area, phone").
  const many = () => {
    const rows = paste.split('\n').map((line) => line.split(/[,;\t]/).map((x) => x.trim())).filter((p) => p[0])
      .map((p) => { const phone = p.find((x) => usablePhone(x)) || ''; const rest = p.filter((x) => x !== phone); return office ? { company: rest[0], area: rest[1] || '', phone } : { name: rest[0], area: rest[1] || '', phone } })
    if (!rows.length) return toast('Paste one per line', true)
    insert(rows)
  }
  // On Android Chrome: pick people straight from the phone's contacts.
  const canPick = typeof navigator !== 'undefined' && 'contacts' in navigator && typeof navigator.contacts?.select === 'function'
  const pick = async () => {
    try {
      const got = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const rows = (got || []).map((c) => ({ name: c.name?.[0] || '', phone: c.tel?.[0] || '' })).filter((c) => c.name && c.phone)
      if (rows.length) insert(rows)
    } catch { /* closed */ }
  }
  return (
    <div className="stack mt">
      <form className="find-form" onSubmit={one}>
        {office ? (
          <>
            <Field label="Office name"><Input value={f.company} onChange={set('company')} placeholder="e.g. Acme Insurance, Longacres" /></Field>
            <Field label="Person to ask for (optional)"><Input value={f.contact_name} onChange={set('contact_name')} placeholder="e.g. Mrs Banda, office manager" /></Field>
          </>
        ) : (
          <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        )}
        {list === 'referral' && <Field label="Referred by (the customer)"><Input value={f.referred_by} onChange={set('referred_by')} placeholder="Who brought them" /></Field>}
        {list === 'referral' && <Field label="Office (optional)"><Input value={f.company} onChange={set('company')} /></Field>}
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="0977 123 456" /></Field>
        <Field label="Area (optional)"><Input value={f.area} onChange={set('area')} placeholder="e.g. Cairo Road, Rhodes Park" /></Field>
        <Field label="Note (optional)"><Input value={f.notes} onChange={set('notes')} placeholder={office ? 'e.g. about 15 staff, no canteen' : 'e.g. works at a bank, likes cakes'} /></Field>
        <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
      </form>
      {list !== 'referral' && (
        <details className="find-more">
          <summary>Add many at once</summary>
          {canPick && !office && <button type="button" className="btn" onClick={pick} disabled={busy}>Pick from my phone’s contacts</button>}
          <Textarea rows={5} value={paste} onChange={setPaste} placeholder={office ? 'One office per line: Office, area, phone\nAcme Insurance, Longacres, 0977123456' : 'One person per line: Name, area, phone\nMary Phiri, Kabulonga, 0977123456'} />
          <button type="button" className="btn" onClick={many} disabled={busy}>Add these</button>
        </details>
      )}
    </div>
  )
}

// ---------------- Referrals ----------------
const REWARD_KEY = 'zm-find-reward'
function ReferralsTab({ ctx }) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [reward, setReward] = useState(() => { try { return localStorage.getItem(REWARD_KEY) || '1 free lunch' } catch { return '1 free lunch' } })
  const { data, loading, error, reload } = useData(() => q(supabase.from('leads').select(LEAD_COLS).eq('list', 'referral').order('updated_at', { ascending: false }).limit(300)), [])
  if (error) return <SetupNeeded error={error} />
  const owed = (data || []).filter((l) => l.stage === 'won' && !l.reward_given_at)
  const give = async (l) => {
    const { error: e } = await supabase.from('leads').update({ reward_given_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', l.id)
    if (e) return toast(e.message, true)
    toast(`Marked: ${l.referred_by} has had their reward`); reload()
  }
  return (
    <div className="stack">
      <div className="card">
        <h3>Customers bring customers</h3>
        <p className="muted small">When a customer brings someone who orders or books, the customer gets a thank-you reward. Send every happy customer the message below to forward, and add the people they bring.</p>
        <div className="find-reward">
          <Field label="The reward (shown here only)"><Input value={reward} onChange={(val) => { setReward(val); try { localStorage.setItem(REWARD_KEY, val) } catch { /* ignore */ } }} /></Field>
        </div>
        <div className="find-copy">
          <p>{messageFor({}, { ...ctx, profile: null }, 'referral')}</p>
          <button type="button" className="btn sm" onClick={() => navigator.clipboard?.writeText(messageFor({}, { ...ctx, profile: null }, 'referral')).then(() => toast('Copied'), () => toast('Could not copy', true))}>Copy the message</button>
        </div>
        <div className="row mt"><button type="button" className="btn primary" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add someone a customer brought'}</button></div>
        {adding && <AddLeads list="referral" done={() => { setAdding(false); reload() }} toast={toast} />}
      </div>
      {owed.length > 0 && (
        <div className="card find-owed">
          <h3>Rewards owed</h3>
          {owed.map((l) => (
            <div key={l.id} className="between find-owed-row">
              <span><b>{l.referred_by || 'A customer'}</b> brought {l.name}: {reward}</span>
              <button type="button" className="btn sm primary" onClick={() => give(l)}>Given</button>
            </div>
          ))}
        </div>
      )}
      {loading ? <Loading /> : !(data || []).length ? <Empty title="No referrals yet">When a customer sends you someone, add them here.</Empty> : (
        <div className="find-list">{data.map((l) => <LeadCard key={l.id} lead={l} ctx={ctx} reload={reload} />)}</div>
      )}
    </div>
  )
}

// ---------------- Seller reports ----------------
function SellersTab() {
  const toast = useToast()
  const [vendor, setVendor] = useState('')
  const [days, setDays] = useState(7)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data: vendors } = useData(() => q(supabase.from('vendors').select('id,business_name,phone,status').order('business_name')), [])
  const v = (vendors || []).find((x) => x.id === vendor)
  useEffect(() => {
    if (!vendor) { setReport(null); return }
    setBusy(true)
    supabase.rpc('seller_report', { p_vendor: vendor, p_days: days }).then(({ data, error }) => {
      setBusy(false)
      if (error) { setReport(null); toast(/seller_report|function/.test(error.message) ? 'Seller reports are not switched on yet: run section 34 of run-in-supabase.sql in Supabase.' : error.message, true); return }
      setReport(data)
    })
  }, [vendor, days])
  const text = report && v ? [
    `Assalamu alaikum! Here is what ZaMarket did for ${v.business_name} in the last ${days} days:`,
    `• ${report.views} views of your products, by ${report.people} people`,
    report.lunch_views ? `• ${report.lunch_views} visits to your lunch page` : '',
    `• ${report.taps} taps to ask about them (WhatsApp, call, enquiry)`,
    report.shares ? `• ${report.shares} shares` : '',
    `• ${report.orders} orders`,
    report.lunch_bookings ? `• ${report.lunch_bookings} lunch bookings (${report.lunches} lunches)` : '',
    report.top?.length ? `Most seen: ${report.top.map((x) => x.name).join(', ')}.` : '',
    'We keep sharing your products every week. Thank you for selling with us!',
  ].filter(Boolean).join('\n') : ''
  return (
    <div className="stack">
      <div className="card">
        <h3>Show each seller what we did</h3>
        <p className="muted small">Their real numbers: views, people, taps to ask, orders and lunch bookings. Send it every Monday. It shows them the marketing is working, and the numbers are never made up.</p>
        <div className="find-form">
          <Field label="Seller"><Select value={vendor} onChange={setVendor} placeholder="Choose a seller" options={(vendors || []).map((x) => [x.id, x.business_name])} /></Field>
          <Field label="Period"><div className="segmented">{[[7, '7 days'], [30, '30 days']].map(([d, l]) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}</div></Field>
        </div>
      </div>
      {busy && <Loading />}
      {report && v && !busy && (
        <div className="card">
          <div className="find-stats">
            {[['Views', report.views], ['People', report.people], ['Taps to ask', report.taps], ['Orders', report.orders], ...(report.lunch_bookings || report.lunch_views ? [['Lunch bookings', report.lunch_bookings]] : [])].map(([l, n]) => <div key={l}><strong>{n}</strong><small>{l}</small></div>)}
          </div>
          <pre className="find-report">{text}</pre>
          <div className="row">
            {v.phone && <a className="btn primary" href={wa(v.phone, text)} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>}
            <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => toast('Could not copy', true))}>Copy</button>
          </div>
          {!report.views && !report.orders && <p className="muted small mt">Low numbers this week? Make a video of their products today (Video maker → Today’s post), and send this next week.</p>}
        </div>
      )}
    </div>
  )
}

// ---------------- Real numbers ----------------
// The whole road from a visit to money, so every week you can see where
// people drop off and fix that one step. Nothing is estimated.
const kwacha = (n) => `K${Math.round(Number(n) || 0).toLocaleString('en-ZM')}`
const CHANNEL_NAMES = { direct: 'Typed the link / unknown', organic: 'Found us', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', google: 'Google', warm: 'People we know', cold: 'Offices and cold outreach', referral: 'Referrals', reseller: 'Affiliates', affiliate: 'Affiliates', content: 'Content', paid: 'Paid ads', other: 'Other', marketplace: 'Marketplace' }
function ResultsTab() {
  const [days, setDays] = useState(30)
  const { data: n, loading, error } = useData(() => q(supabase.rpc('growth_numbers', { p_days: days })), [days])
  if (loading) return <Loading />
  if (error) return /growth_numbers|function/.test(String(error)) ? <Empty title="One step first">Run section 35 of run-in-supabase.sql in Supabase, then come back.</Empty> : <Empty title="Could not load">{String(error)}</Empty>
  const steps = [
    ['Visited the site', n.visitors, 'people'],
    ['Looked at a product', n.viewers, 'people'],
    ['Tapped to ask (WhatsApp, call, enquiry)', n.askers, 'people'],
    ['Became a lead', n.leads, 'leads'],
    ['Were contacted by us', n.contacted, 'leads'],
    ['Ordered or booked', n.orders + n.lunch_bookings, 'orders'],
    ['Paid or delivered', n.paid_orders, 'shop orders'],
  ]
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)
  // The weakest step, and what to do about it.
  const fixes = [
    [pct(n.viewers, n.visitors), 'Most visitors leave without opening a product: put the best products first and make the opening of each video show the product.'],
    [pct(n.askers, n.viewers), 'People look but don’t ask: make the offer clearer on the product page (price, delivery, a WhatsApp button) and use real reviews.'],
    [pct(n.contacted, n.leads), 'Leads are waiting: contact every new lead the same day (Find customers → Today).'],
    [pct(n.orders + n.lunch_bookings, n.contacted || n.leads), 'Conversations don’t turn into orders: follow up twice, answer the price question clearly, and make ordering one step.'],
    [pct(n.paid_orders, n.orders), 'Orders are not being paid or delivered: confirm and collect payment faster.'],
  ].filter(([p]) => p !== null)
  const weak = fixes.length ? fixes.reduce((a, b) => (b[0] < a[0] ? b : a)) : null
  const max = Math.max(1, ...n.weeks.map((w) => w.visitors))
  const maxSales = Math.max(1, ...n.weeks.map((w) => Number(w.sales)))
  return (
    <div className="stack">
      <div className="row wrap between">
        <div className="segmented">{[[7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, l]) => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}</div>
        <small className="muted">{n.conversations} conversations logged in this time</small>
      </div>
      <div className="find-stats">
        <div><strong>{kwacha(Number(n.sales) + Number(n.lunch_paid))}</strong><small>Sold and paid ({kwacha(n.sales)} shop · {kwacha(n.lunch_paid)} lunch)</small></div>
        <div><strong>{n.orders + n.lunch_bookings}</strong><small>Orders and bookings</small></div>
        <div><strong>{n.won}</strong><small>Leads won</small></div>
      </div>
      <div className="card">
        <h3>From a visit to money</h3>
        <p className="muted small mb">Each step with how many of the step before made it. The first steps count people (one visitor = one phone); the later ones count leads and orders.</p>
        <div className="find-road">
          {steps.map(([label, v], i) => {
            const p = i ? pct(v, steps[i - 1][1]) : null
            return (
              <div key={label} className="find-step">
                <span className="find-step-bar" style={{ width: `${Math.max(4, Math.round((v / Math.max(1, steps[0][1])) * 100))}%` }} />
                <b>{v}</b><span>{label}</span>{p !== null && <em>{p}%</em>}
              </div>
            )
          })}
        </div>
        {weak && <p className="find-fix"><b>Fix this first:</b> {weak[1]}</p>}
      </div>
      <div className="card">
        <h3>Week by week</h3>
        <div className="find-weeks">
          {n.weeks.map((w) => (
            <div key={w.week} className="find-week">
              <div className="find-week-bars"><span className="v" style={{ height: `${Math.round((w.visitors / max) * 100)}%` }} title={`${w.visitors} visitors`} /><span className="s" style={{ height: `${Math.round((Number(w.sales) / maxSales) * 100)}%` }} title={kwacha(w.sales)} /></div>
              <small>{new Date(`${w.week}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>
            </div>
          ))}
        </div>
        <p className="muted small"><span className="find-key v" /> visitors <span className="find-key s" /> money in</p>
      </div>
      <div className="card">
        <h3>Where they came from</h3>
        <table className="find-table"><thead><tr><th>Channel</th><th>Visitors</th><th>Leads</th><th>Orders</th></tr></thead>
          <tbody>{n.channels.filter((c) => c.visitors || c.leads || c.orders).sort((a, b) => (b.orders - a.orders) || (b.leads - a.leads) || (b.visitors - a.visitors)).map((c) => <tr key={c.channel}><td>{CHANNEL_NAMES[c.channel] || c.channel}</td><td>{c.visitors}</td><td>{c.leads}</td><td>{c.orders}</td></tr>)}</tbody>
        </table>
        <p className="muted small mt">Put more time into the channel that brings orders, not just visitors.</p>
      </div>
    </div>
  )
}

// ---------------- Messages ----------------
function Messages({ messages, save }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(messages)
  return (
    <details className="card find-more" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary>Ready messages (edit them to sound like you)</summary>
      <p className="muted small">{'{name}'} becomes the person’s first name, {'{link}'} the lunch link, {'{me}'} your first name. Kept on this phone.</p>
      {Object.keys(DEFAULT_MESSAGES).map((k) => (
        <Field key={k} label={MSG_LABELS[k]}><Textarea rows={3} value={draft[k]} onChange={(val) => setDraft((d) => ({ ...d, [k]: val }))} /></Field>
      ))}
      <div className="row"><button type="button" className="btn primary" onClick={() => save(draft)}>Save messages</button><button type="button" className="btn ghost" onClick={() => { setDraft(DEFAULT_MESSAGES); save(DEFAULT_MESSAGES) }}>Back to the originals</button></div>
    </details>
  )
}

function SetupNeeded({ error }) {
  return notReady(error)
    ? <Empty title="One step first">Run section 34 of run-in-supabase.sql in Supabase, then come back. It adds the offices, people and referral lists.</Empty>
    : <Empty title="Could not load">{String(error?.message || error)}</Empty>
}
