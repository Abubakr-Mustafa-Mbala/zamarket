import { useState } from 'react'
import { nameAdvice, tidyName } from '../lib/productName'
import { askAssist } from '../lib/aiAssist'

// Sits under the product name box. It says, in plain words, what makes a
// name hard to read, offers a tidied version made only by removing things,
// and can ask the AI for a plainer wording. Nothing changes until the person
// presses "Use this".
export default function NameHelp({ name, category, description, onUse }) {
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState(null)
  const [note, setNote] = useState('')
  const current = String(name || '').trim()
  if (current.length < 3) return null
  const advice = nameAdvice(current)
  const tidy = tidyName(current)
  const tidyDiffers = tidy && tidy !== current && tidy.length >= 3

  const ask = async () => {
    setBusy(true); setNote(''); setAi(null)
    try {
      const answer = await askAssist({ task: 'listing', name: current, category: category || '', description: description || '' })
      if (answer.name && answer.name !== current) setAi(answer.name)
      else setNote(answer.message || 'This name is already plain. No change suggested.')
    } catch (e) { setNote(e.message) }
    finally { setBusy(false) }
  }
  const use = (value) => { onUse(value); setAi(null); setNote('') }

  return (
    <div className="name-advice" aria-live="polite">
      {advice.length === 0
        ? <span className="ok-text">This name is clear.</span>
        : <ul>{advice.slice(0, 3).map((line) => <li key={line}>{line}</li>)}</ul>}
      {tidyDiffers && (
        <div className="name-suggestion">
          <strong>{tidy}</strong>
          <button type="button" className="btn sm primary" onClick={() => use(tidy)}>Use this</button>
        </div>
      )}
      {ai && (
        <div className="name-suggestion">
          <strong>{ai}</strong>
          <button type="button" className="btn sm primary" onClick={() => use(ai)}>Use this</button>
          <button type="button" className="btn sm ghost" onClick={() => setAi(null)}>No thanks</button>
        </div>
      )}
      {(advice.length > 0 || current.length > 40) && !ai && (
        <div>
          <button type="button" className="btn sm" onClick={ask} disabled={busy}>
            {busy ? 'Thinking…' : 'Suggest a simpler name'}
          </button>
        </div>
      )}
      {note && <span className="tiny muted">{note}</span>}
    </div>
  )
}
