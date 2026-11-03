import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { safeAcademyUrl } from '../../lib/affiliateRecruitment'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../components/ui'

export function useAcademyContent() {
  const { user } = useAuth()
  const [data, setData] = useState({ lessons: [], sessions: [], questions: [], error: '' })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!user?.id) return
    let active = true
    const load = async () => {
      const [lessons, sessions, questions] = await Promise.all([
        supabase.from('academy_lessons').select('*').eq('published', true),
        supabase.from('academy_sessions').select('*').order('starts_at', { ascending: true }).limit(40),
        supabase.from('academy_questions').select('*').order('created_at', { ascending: false }).limit(40),
      ])
      if (!active) return
      const problem = [lessons.error, sessions.error, questions.error].filter(Boolean)
      setData({ lessons: lessons.data || [], sessions: sessions.data || [], questions: questions.data || [],
        error: problem.length ? 'Some Academy features are not yet configured. Your starter lessons are still available.' : '' })
    }
    load().catch(() => {
      if (active) setData((prev) => ({ ...prev, error: 'Could not load live Academy content. Try refreshing.' }))
    })
    return () => { active = false }
  }, [user?.id, version])
  return { ...data, reload: () => setVersion((v) => v + 1) }
}

export function LessonResources({ resource }) {
  if (!resource || !resource.published) return null
  const video = safeAcademyUrl(resource.video_url)
  const file = safeAcademyUrl(resource.resource_url)
  return <div className="academy-resource-card">
    {resource.summary && <p>{resource.summary}</p>}
    <div className="btn-row">
      {video && <a className="btn primary sm" href={video} rel="noopener noreferrer" target="_blank">Watch recorded lesson</a>}
      {file && <a className="btn sm" href={file} rel="noopener noreferrer" target="_blank">Open learning materials</a>}
    </div>
    {video && <p className="tiny muted">The recording opens in a new tab. Video data charges may apply.</p>}
  </div>
}

export default function AcademyExtras({ sessions, questions, error, unavailable, reload }) {
  const { user } = useAuth()
  const toast = useToast()
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const ask = async (event) => {
    if (unavailable) return
    event.preventDefault()
    const text = question.trim()
    if (text.length < 10 || text.length > 800 || busy) return
    setBusy(true)
    const { error: err } = await supabase.from('academy_questions').insert({ user_id: user.id, question: text })
    setBusy(false)
    if (err) return toast('Your question could not be sent. Please try again.', true)
    setQuestion('')
    toast('Question sent to the Academy team')
    reload()
  }
  const nextSessions = (sessions || []).filter((s) => s.status === 'scheduled').sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const recordings = (sessions || []).filter((s) => s.status === 'completed' && safeAcademyUrl(s.recording_url)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
  return <div className="stack academy-extras">
    <div className="academy-section-head"><div><span className="academy-kicker">LIVE LEARNING</span><h2>Upcoming calls</h2><p className="small muted">Join team sessions when they are scheduled. Times are displayed in Zambia time.</p></div></div>
    {nextSessions.length ? <div className="academy-grid">{nextSessions.map((s) => <div className="academy-session card" key={s.id}>
      <span className="academy-kicker">SCHEDULED · {s.duration_minutes} MIN</span>
      <h3>{s.title}</h3><p className="small muted">{s.description || 'Live Academy session'}</p>
      <strong>{new Date(s.starts_at).toLocaleString('en-ZM', { timeZone: 'Africa/Lusaka', dateStyle: 'full', timeStyle: 'short' })}</strong>
      {safeAcademyUrl(s.meeting_url) ? <a className="btn primary sm" target="_blank" rel="noopener noreferrer" href={safeAcademyUrl(s.meeting_url)}>Open meeting link</a> : <p className="tiny muted">Meeting link will be shared by the Academy team.</p>}
    </div>)}</div> : <div className="card flat small">No live calls have been scheduled yet. Check back for the next Academy session.</div>}
    {!!recordings.length && <section className="stack"><h2>Previous live-session recordings</h2><div className="academy-grid">{recordings.map((s) => <div className="card stack-sm" key={s.id}><strong>{s.title}</strong><a target="_blank" rel="noopener noreferrer" className="btn sm" href={safeAcademyUrl(s.recording_url)}>Watch recording</a></div>)}</div></section>}
    <section className="academy-qa card stack"><div><span className="academy-kicker">ASK THE TEAM</span><h2>Academy questions & answers</h2><p className="small muted">Ask about product promotion, referrals, sales conversations or commissions. Avoid including private customer information.</p></div>
      {unavailable && <p className="small muted" role="status">Live Q&A is not yet available. Your starter lessons still work.</p>}
      <form onSubmit={ask} className="stack-sm"><label htmlFor="academy-question" className="strong">Your question</label><textarea id="academy-question" className="big-input" rows="3" value={question} minLength={10} maxLength={800} required onChange={(e) => setQuestion(e.target.value)} placeholder="For example: how should I reply when someone asks about delivery?" /><div className="between"><span className="tiny muted">{question.length}/800 characters</span><button className="btn primary" disabled={unavailable || busy || question.trim().length < 10}>{busy ? 'Sending…' : 'Submit question'}</button></div></form>
      <div className="academy-question-list">{questions?.length ? questions.map((q) => <div className="academy-question" key={q.id}><strong>{q.question}</strong>{q.answer ? <p>{q.answer}</p> : <p className="tiny muted">Awaiting an answer from the team.</p>}</div>) : <p className="small muted">Questions you submit and answers shared by the team will appear here.</p>}</div>
    </section>
    {error && <p className="small muted" role="status">{error}</p>}
  </div>
}
