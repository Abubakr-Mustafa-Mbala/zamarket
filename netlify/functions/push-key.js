// The public half of the notification key pair, served at runtime.
//
// This used to be a VITE_ variable, which was a mistake. Vite bakes those
// into the JavaScript at BUILD time, so adding the value in Netlify did
// nothing until the site was rebuilt — and the browser just reported
// "notifications are not set up on the server yet" with no way to tell
// whether the key was missing, misspelled or simply not deployed yet.
//
// Read here instead, it takes effect the moment it is saved, there is one
// variable instead of two, and nothing needs rebuilding.
//
// The public key is public by design: it is sent to every browser that turns
// notifications on. The PRIVATE key is never read here and must never be.

export default async function pushKey() {
  const key = String(process.env.VAPID_PUBLIC_KEY || '').trim()

  // A sanity check on the shape, so a pasted-in mistake is reported as a
  // mistake rather than failing silently inside the browser later.
  const looksRight = /^[A-Za-z0-9_-]{80,100}$/.test(key)

  return new Response(JSON.stringify({
    key: looksRight ? key : '',
    configured: !!key,
    valid: looksRight,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Cached briefly: the key changes approximately never, but a short TTL
      // means a correction is picked up within the minute.
      'cache-control': 'public, max-age=60',
    },
  })
}

export const config = { path: '/api/push-key' }
