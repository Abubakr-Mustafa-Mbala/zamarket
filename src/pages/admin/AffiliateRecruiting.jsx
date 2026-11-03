import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { recruitmentUrl } from '../../lib/affiliateRecruitment'

const channels = [
  ['facebook', 'Facebook', 'Post in the ZA Market Page, relevant groups with permission, and Facebook Stories.'],
  ['whatsapp', 'WhatsApp', 'Share on Status and to people who have agreed to hear about opportunities.'],
  ['instagram', 'Instagram', 'Publish a Reel, Stories and a saved Affiliate highlight.'],
  ['tiktok', 'TikTok', 'Record a short explainer showing the real affiliate dashboard.'],
  ['campus', 'Campus ambassadors', 'Speak to student club leaders and societies about practical selling skills.'],
  ['linkedin', 'LinkedIn', 'Reach graduates, sales learners and digital-marketing communities.'],
  ['referral', 'Personal referrals', 'Invite existing customers and eligible affiliates to tell others.'],
]
const caption = `Interested in learning online selling in Zambia?\n\nZA Market is accepting applications for independent affiliates. Promote real products, use your own referral link, access our starter Academy lessons and earn commission when qualifying orders are completed.\n\nNo stock purchase required. This is commission-based work, not a salaried job; income is not guaranteed.\n\nApply: https://zamarket.shop/affiliates?utm_source=facebook&utm_campaign=affiliate_launch`
const clipboard = (text) => navigator.clipboard?.writeText(text)

export default function AffiliateRecruiting() {
  const [report, setReport] = useState(null)
  const [message, setMessage] = useState('')
  const load = () => supabase.rpc('affiliate_recruitment_report').then(({ data, error }) => {
    if (error) setMessage('Recruitment reporting is not ready. Apply the reviewed Academy migration when deploying the release.')
    else { setMessage(''); setReport(data) }
  }).catch(() => setMessage('Recruitment reporting is temporarily unavailable.'))
  useEffect(() => { load() }, [])
  const link = recruitmentUrl('facebook')
  return <div className="stack affiliate-admin">
    <div className="page-head"><div><p className="academy-kicker">AFFILIATE GROWTH</p><h1>Recruiting launchpad</h1><p>Use one trustworthy offer, tracked links and a consistent outreach routine to recruit affiliates across Zambia.</p></div><div className="btn-row"><a className="btn" href="/affiliates" target="_blank" rel="noopener noreferrer">View public page</a><Link to="/admin/affiliate-academy" className="btn primary">Manage Academy</Link></div></div>
    <div className="grid-3"><div className="card"><p className="tiny muted">Applications</p><h2>{report?.applied ?? '—'}</h2></div><div className="card"><p className="tiny muted">Awaiting review</p><h2>{report?.pending ?? '—'}</h2></div><div className="card"><p className="tiny muted">Approved affiliates</p><h2>{report?.approved ?? '—'}</h2></div></div>
    {message && <p className="small muted" role="status">{message}</p>}
    <div className="card stack-sm"><h2>Recruitment channels</h2><p className="small muted">Share these links exactly as shown. Each includes a channel identifier and the launch campaign for attribution reporting.</p><div className="academy-admin-channels">{channels.map(([id, label, tip]) => <div className="academy-admin-channel" key={id}><div><strong>{label}</strong><p className="tiny muted">{tip}</p><code>{recruitmentUrl(id)}</code></div><button className="btn sm" onClick={() => clipboard(recruitmentUrl(id))}>Copy link</button></div>)}</div></div>
    <div className="card stack-sm"><h2>Starter recruitment caption</h2><p className="small muted">Use this as a base. Replace the source in the link for the channel you post on.</p><pre className="academy-caption">{caption}</pre><button className="btn primary" onClick={() => clipboard(caption)}>Copy recruitment caption</button></div>
    {!!report?.by_source?.length && <div className="card"><h2>Application sources</h2><div className="academy-admin-channels">{report.by_source.map((row) => <div className="academy-admin-channel" key={row.source}><strong>{row.source}</strong><span>{row.applications} applications · {row.approved} approved</span></div>)}</div></div>}
    <div className="card stack-sm"><h2>Simple launch routine</h2><ol><li>Make sure Facebook and Instagram profiles use the same ZA Market name, logo and biography.</li><li>Publish one introduction video explaining what affiliates actually do.</li><li>Post and share the tagged landing page, not a raw signup form.</li><li>Reply to interested people, explain that commissions are not guaranteed, and direct them to apply.</li><li>Check applications daily and review them in the <Link to="/admin/resellers">affiliate approval queue</Link>.</li><li>Publish an Academy recording, schedule a Q&A, and track which channels produce trained, active affiliates.</li></ol></div>
  </div>
}
