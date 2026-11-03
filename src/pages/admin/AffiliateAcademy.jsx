import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { safeAcademyUrl } from '../../lib/affiliateRecruitment'
import { LESSONS } from '../reseller/Training'
import { useToast } from '../../components/ui'

const blankSession = { title: '', description: '', starts_at: '', duration_minutes: 45, meeting_url: '' }
const sessionTime = (date) => date ? new Date(`${date}:00+02:00`).toISOString() : null

export default function AffiliateAcademy() {
  const toast = useToast()
  const [lessons, setLessons] = useState({})
  const [sessions, setSessions] = useState([])
  const [questions, setQuestions] = useState([])
  const [draft, setDraft] = useState(blankSession)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = async () => {
    const [l, s, q] = await Promise.all([
      supabase.from('academy_lessons').select('*'),
      supabase.from('academy_sessions').select('*').order('starts_at', { ascending: false }).limit(50),
      supabase.from('academy_questions').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    if ([l.error, s.error, q.error].some(Boolean)) setError('Academy database tables are not available. Review and apply the migration before publishing classes.')
    else setError('')
    setLessons(Object.fromEntries((l.data || []).map((row) => [row.lesson_key, row])))
    setSessions(s.data || [])
    setQuestions(q.data || [])
  }
  useEffect(() => { load().catch(() => setError('Could not load Academy data.')) }, [])
  const edit = (key, field, value) => setLessons((prev) => ({ ...prev, [key]: { ...prev[key], lesson_key: key, [field]: value } }))
  const saveLesson = async (key) => {
    const row = lessons[key] || {}
    if ((row.video_url && !safeAcademyUrl(row.video_url)) || (row.resource_url && !safeAcademyUrl(row.resource_url))) return toast('Use valid HTTPS links for videos and learning materials.', true)
    setBusy(key)
    const { error: err } = await supabase.from('academy_lessons').upsert({ lesson_key: key, summary: row.summary || '', video_url: row.video_url || '', resource_url: row.resource_url || '', published: !!row.published, updated_at: new Date().toISOString() }, { onConflict: 'lesson_key' })
    setBusy('')
    if (err) return toast('Could not save the lesson. Check Academy permissions and setup.', true)
    toast('Lesson saved'); load()
  }
  const createSession = async (event) => {
    event.preventDefault()
    if (!draft.title.trim() || !draft.starts_at) return
    if (draft.meeting_url && !safeAcademyUrl(draft.meeting_url)) return toast('Meeting link must use HTTPS.', true)
    let startsAt
    try { startsAt = sessionTime(draft.starts_at) } catch { return toast('Enter a valid Zambia date and time.', true) }
    setBusy('session')
    const { error: err } = await supabase.from('academy_sessions').insert({ title: draft.title.trim(), description: draft.description.trim(), starts_at: startsAt, duration_minutes: Number(draft.duration_minutes), meeting_url: draft.meeting_url.trim(), status: 'scheduled' })
    setBusy('')
    if (err) return toast('Unable to schedule the session.', true)
    setDraft(blankSession); toast('Live session scheduled'); load()
  }
  const updateSession = async (id, changes) => {
    setBusy(id)
    const { error: err } = await supabase.from('academy_sessions').update(changes).eq('id', id)
    setBusy('')
    if (err) return toast('Unable to update the session.', true)
    toast('Session updated'); load()
  }
  const answerQuestion = async (q) => {
    const answer = (q.answer || '').trim()
    if (!answer) return toast('Write an answer first.', true)
    setBusy(q.id)
    const { error: err } = await supabase.from('academy_questions').update({ answer, answered_at: new Date().toISOString(), show_to_others: !!q.show_to_others }).eq('id', q.id)
    setBusy('')
    if (err) return toast('Could not save your answer.', true)
    toast('Answer published'); load()
  }
  return <div className="stack affiliate-admin">
    <div className="page-head"><div><p className="academy-kicker">ZA MARKET ACADEMY</p><h1>Classes & community</h1><p>Publish recordings, schedule live sessions and answer affiliates' questions. Only approved affiliates can access Academy content.</p></div><Link to="/admin/affiliate-recruiting" className="btn">Recruiting launchpad</Link></div>
    {error && <div className="card" role="status">{error}</div>}
    <section className="card stack"><div><h2>Recorded classes</h2><p className="small muted">Record classes using your preferred video service, then paste a secure HTTPS video link. Switch Published on only when the lesson is ready.</p></div>
    <div className="academy-admin-channels">{LESSONS.map((l, index) => { const row = lessons[l.key] || {}; return <details key={l.key} className="academy-admin-lesson"><summary>{index + 1}. {l.title} <span className="tiny muted">{row.published ? 'Published' : 'Draft'}</span></summary><div className="stack-sm"><label>Recorded class URL<input className="big-input" type="url" placeholder="https://..." value={row.video_url || ''} onChange={(e) => edit(l.key, 'video_url', e.target.value)} /></label><label>Handout or worksheet URL<input className="big-input" type="url" placeholder="https://..." value={row.resource_url || ''} onChange={(e) => edit(l.key, 'resource_url', e.target.value)} /></label><label>Teacher guidance or lesson summary<textarea className="big-input" rows={3} maxLength={2000} value={row.summary || ''} onChange={(e) => edit(l.key, 'summary', e.target.value)} /></label><label className="check"><input type="checkbox" checked={!!row.published} onChange={(e) => edit(l.key, 'published', e.target.checked)} /> Publish this lesson's extra resources</label><button className="btn primary sm" disabled={busy === l.key} onClick={() => saveLesson(l.key)}>Save lesson</button></div></details> })}</div></section>
    <section className="card stack"><div><h2>Schedule a live call</h2><p className="small muted">Set the date and time in Zambia (CAT, UTC+2). The meeting link is visible only to approved affiliates and authorised staff.</p></div><form onSubmit={createSession} className="academy-admin-form"><label>Session name<input required className="big-input" maxLength={150} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Live Q&A: Your first 10 sales conversations" /></label><label>Start (Zambia time)<input required type="datetime-local" className="big-input" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} /></label><label>Duration (minutes)<input className="big-input" type="number" min="15" max="240" required value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: e.target.value })} /></label><label>Meeting URL (optional)<input className="big-input" type="url" placeholder="https://meet.google.com/..." value={draft.meeting_url} onChange={(e) => setDraft({ ...draft, meeting_url: e.target.value })} /></label><label className="academy-wide">Description<textarea className="big-input" maxLength={1500} rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label><button className="btn primary" disabled={busy === 'session'}>Schedule session</button></form>
    <div className="academy-admin-channels">{sessions.map((s) => <div key={s.id} className="academy-admin-channel"><div><strong>{s.title}</strong><p className="tiny muted">{new Date(s.starts_at).toLocaleString('en-ZM', { timeZone: 'Africa/Lusaka', dateStyle: 'medium', timeStyle: 'short' })} · {s.status}</p></div><div className="btn-row">{s.status === 'scheduled' && <button className="btn sm" disabled={busy === s.id} onClick={() => updateSession(s.id, { status: 'cancelled' })}>Cancel</button>}{s.status === 'scheduled' && <button className="btn sm" disabled={busy === s.id} onClick={() => { const url = window.prompt('Recording URL (HTTPS), optional', '') || ''; if (url && !safeAcademyUrl(url)) return toast('Use HTTPS for recording URLs.', true); updateSession(s.id, { status: 'completed', recording_url: url }) }}>Complete / add recording</button>}</div></div>)}</div></section>
    <section className="card stack"><div><h2>Affiliate Q&A</h2><p className="small muted">Answer questions privately, or choose to share a useful answer with every approved affiliate. The asker's identity is not displayed alongside shared answers.</p></div><div className="academy-admin-channels">{questions.length ? questions.map((q) => <div key={q.id} className="academy-admin-lesson stack-sm"><strong>{q.question}</strong><p className="tiny muted">Asked {new Date(q.created_at).toLocaleDateString('en-ZM')} · {q.answered_at ? 'Answered' : 'Needs answer'}</p><textarea className="big-input" rows={3} value={q.answer || ''} maxLength={4000} onChange={(e) => setQuestions((prev) => prev.map((v) => v.id === q.id ? { ...v, answer: e.target.value } : v))} /><label className="check"><input type="checkbox" checked={!!q.show_to_others} onChange={(e) => setQuestions((prev) => prev.map((v) => v.id === q.id ? { ...v, show_to_others: e.target.checked } : v))} /> Share this answer with all affiliates</label><button className="btn primary sm" disabled={busy === q.id || !q.answer?.trim()} onClick={() => answerQuestion(q)}>Save answer</button></div>) : <p className="small muted">No questions submitted yet.</p>}</div></section>
  </div>
}
