import { supabase } from './supabase'

// One door to the server-side AI helpers. The key lives on the server; the
// browser only ever sends the signed-in person's own session.
export async function askAssist(body) {
  const { data, error } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token) throw new Error('Please sign in again to use this helper.')
  let result
  try {
    result = await fetch('/.netlify/functions/ai-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach the helper. Check your connection and try again.')
  }
  const answer = await result.json().catch(() => null)
  if (!result.ok) throw new Error(answer?.message || 'The helper could not answer just now.')
  // A page of HTML instead of an answer means the function is not deployed.
  if (!answer || typeof answer !== 'object') throw new Error('The helper is not available yet. Deploy the latest update and try again.')
  return answer
}
