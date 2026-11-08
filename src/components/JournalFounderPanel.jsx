import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function JournalFounderPanel() {
  const [metrics, setMetrics] = useState(null)
  const [queue, setQueue] = useState(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const refresh = async () => {
    const [m, q] = await Promise.all([
      supabase.rpc('journal_metrics'), supabase.rpc('journal_moderation_queue'),
    ])
    if (!m.error && !q.error) {
      setMetrics(Array.isArray(m.data) ? m.data : [])
      setQueue(Array.isArray(q.data) ? q.data : [])
    }
  }
  useEffect(() => { refresh().catch(() => {}) }, [])
  const moderate = async (id, action) => {
    if (busy) return
    setBusy(id); setNote('')
    const { error } = await supabase.rpc('journal_moderate_comment', { p_id: id, p_action: action })
    if (error) setNote(error.message || 'Unable to moderate comment')
    else await refresh()
    setBusy('')
  }
  if (!metrics || !queue) return null // Requires the Journal 2.0 SQL migration.
  const total = k => metrics.reduce((sum, p) => sum + Number(p[k] || 0), 0)
  return <section className="card journal-founder-panel stack-sm" aria-labelledby="journal-performance-heading">
    <div className="between wrap">
      <div><h3 id="journal-performance-heading">Journal performance</h3>
        <p className="small muted">Approximate reader engagement, not verified customer orders or search rankings.</p></div>
      <button className="btn sm" type="button" onClick={() => refresh()}>Refresh</button>
    </div>
    <div className="journal-stats-grid">
      {[
        ['Article reads', total('views')], ['Engaged sessions', total('engaged')],
        ['Likes', total('likes')], ['Approved comments', total('comments')],
        ['Product clicks', total('product_clicks')], ['Share actions', total('share_clicks')],
      ].map(([label, value]) => <div key={label}><strong>{value.toLocaleString('en-US')}</strong><span>{label}</span></div>)}
    </div>
    <p className="tiny muted">Sessions and actions are counted approximately, once per browser session per article per day. Use Search Console for search impressions and rankings.</p>
    {metrics.length > 0 && <div className="journal-metric-articles">
      <h4>By article</h4>
      {metrics.map(p => <div key={p.slug}>
        <Link to={`/blog/${p.slug}`}>{p.title}</Link>
        <span>{p.views} reads · {p.product_clicks} product clicks · {p.engaged} engaged sessions</span>
      </div>)}
    </div>}
    <h4>Comments awaiting review {queue.length ? `(${queue.length})` : ''}</h4>
    {queue.length ? queue.map(c => <div className="journal-moderation" key={c.id}>
      <strong>{c.name} · {c.article}</strong><p>{c.body}</p>
      <div className="btn-row"><button type="button" className="btn sm primary" onClick={() => moderate(c.id, 'approved')} disabled={!!busy}>Approve</button>
      <button type="button" className="btn sm" onClick={() => moderate(c.id, 'rejected')} disabled={!!busy}>Reject</button></div>
    </div>) : <p className="small muted">No comments waiting for approval.</p>}
    {note && <p role="alert">{note}</p>}
  </section>
}
