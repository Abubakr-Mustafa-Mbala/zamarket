import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Icon from '../lib/icons'

export default function JournalCommunity({ slug }) {
  const { user } = useAuth()
  const [counts, setCounts] = useState({ likes: 0, liked: false, comments: 0 })
  const [comments, setComments] = useState([])
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let live = true
    setAvailable(false)
    Promise.all([
      supabase.rpc('journal_engagement', { p_slug: slug }),
      supabase.rpc('journal_comments_for_post', { p_slug: slug }),
    ]).then(([summary, list]) => {
      if (!live || summary.error || list.error) return
      setCounts(summary.data || { likes: 0, liked: false, comments: 0 })
      setComments(Array.isArray(list.data) ? list.data : [])
      setAvailable(true)
    }).catch(() => {})
    return () => { live = false }
  }, [slug, user?.id])

  const like = async () => {
    if (!user || busy) return
    setBusy(true); setMessage('')
    const { data, error } = await supabase.rpc('journal_toggle_like', { p_slug: slug })
    if (error) setMessage('Please try again.')
    else setCounts(prev => ({ ...prev, liked: Boolean(data), likes: Math.max(0, prev.likes + (data ? 1 : -1)) }))
    setBusy(false)
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!user || busy || draft.trim().length < 2) return
    setBusy(true); setMessage('')
    const { error } = await supabase.rpc('journal_submit_comment', { p_slug: slug, p_body: draft.trim() })
    if (error) setMessage(error.message || 'Unable to submit comment.')
    else { setDraft(''); setMessage('Thank you. Your comment will appear after moderation.') }
    setBusy(false)
  }
  if (!available) return null // migration may not yet be installed
  return (
    <section className="journal-community" id="journal-comments" aria-label="Reader reactions and comments">
      <div className="journal-community-title">
        <div>
          <span className="journal-small-label">THE CONVERSATION</span>
          <h2>What did you think?</h2>
          <p>Share a useful thought or question about this story.</p>
        </div>
        <div className="journal-counts">
          <span><Icon.heart /> {counts.likes} likes</span>
          <span><Icon.message /> {counts.comments} comments</span>
        </div>
      </div>
      <div className="journal-reaction-row">
        {user ? (
          <button type="button" className={`journal-like ${counts.liked ? 'is-liked' : ''}`} onClick={like} disabled={busy} aria-pressed={counts.liked}>
            <Icon.heart /> {counts.liked ? 'Liked' : 'Like this story'}
          </button>
        ) : <Link className="journal-like" to="/login"><Icon.heart /> Sign in to like</Link>}
      </div>
      {comments.length > 0 && <div className="journal-comments-list">
        {comments.map(c => <div className="journal-reader-comment" key={c.id}>
          <div><strong>{c.name || 'Reader'}</strong><span>{new Date(c.created_at).toLocaleDateString('en-ZM', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
          <p>{c.body}</p>
        </div>)}
      </div>}
      {user ? <form onSubmit={submit} className="journal-comment-form">
        <label htmlFor="journal-comment-input">Add a comment</label>
        <textarea id="journal-comment-input" value={draft} onChange={e => setDraft(e.target.value)} maxLength={1200}
          rows={3} placeholder="What would you like to add?" required />
        <div className="journal-comment-actions"><span>Comments are reviewed before appearing.</span>
          <button type="submit" className="journal-action" disabled={busy || draft.trim().length < 2}>Submit comment</button>
        </div>
      </form> : <p className="journal-login-hint"><Link to="/login">Sign in</Link> to join the discussion. Reading and sharing remain open to everyone.</p>}
      {message && <p className="journal-feedback" role="status">{message}</p>}
    </section>
  )
}
