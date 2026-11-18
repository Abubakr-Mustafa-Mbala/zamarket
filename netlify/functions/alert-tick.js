import webpush from 'web-push'

// Every two minutes: tell people about new work on their phone, and send the
// emails the database has queued.
//
// Phone alerts: for everyone who turned them on, the bell's list is read as
// that person (staff, seller or affiliate each see their own) and compared
// with what they were last alerted about. Only something NEW alerts, so a
// pile of waiting work does not buzz every two minutes. New orders are left
// out here because /api/order-alert announces them the moment they arrive.
//
// Emails: affiliate or seller approved, an order for a seller to prepare, a
// payout sent. Off until RESEND_API_KEY is set in Netlify.

const STAFF_SKIP = new Set(['new_orders'])

async function rest(base, key, path, init = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export function newArrivals(groups, before) {
  // First time we see someone: remember, alert nothing (no burst on day one).
  if (!before) return []
  return (groups || []).filter((g) => !STAFF_SKIP.has(g.key) && Number(g.count || 0) > Number(before[g.key] || 0))
}

export function alertText(arrived) {
  const lead = arrived[0]
  const more = arrived.length - 1
  return {
    title: lead.tone === 'urgent' ? 'ZaMarket · needs you now' : 'ZaMarket',
    body: `${lead.label}: ${lead.count}${more > 0 ? ` · and ${more} more thing${more > 1 ? 's' : ''}` : ''}`,
    url: lead.link || '/',
    tag: `zamarket-${lead.key}`,
  }
}

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function emailHtml(subject, body, link, site = 'https://zamarket.shop') {
  const paras = String(body || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
  const button = link ? `<p style="margin:22px 0 6px"><a href="${esc(site + link)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">Open ZaMarket</a></p>` : ''
  return `<!doctype html><html><body style="margin:0;background:#f4f1fa;font-family:Arial,Helvetica,sans-serif;color:#1b1430">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:800;font-size:20px;margin-bottom:14px"><span style="color:#7c3aed">Za</span>Market</div>
<div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #e6def7">
<h1 style="font-size:20px;margin:0 0 14px">${esc(subject)}</h1>${paras}${button}</div>
<p style="color:#8a7fa3;font-size:12px;margin-top:14px">ZaMarket · zamarket.shop · You can turn emails off from the bell in your dashboard.</p>
</div></body></html>`
}

export default async function alertTick() {
  const base = process.env.VITE_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !service) return new Response('not configured', { status: 200 })
  const out = { push: null, email: null }

  // ---- Phone alerts -------------------------------------------------------
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    try {
      webpush.setVapidDetails(process.env.VAPID_CONTACT || 'mailto:hello@zamarket.shop', pub, priv)
      const subs = await rest(base, service, 'push_subscriptions?select=id,user_id,endpoint,p256dh,auth')
      const users = [...new Set((subs || []).map((s) => s.user_id))]
      const states = users.length ? await rest(base, service, `alert_state?select=user_id,counts&user_id=in.(${users.join(',')})`) : []
      const before = Object.fromEntries((states || []).map((s) => [s.user_id, s.counts]))
      const dead = []
      let sent = 0
      for (const uid of users) {
        let groups
        try { groups = await rest(base, service, 'rpc/action_center_for', { method: 'POST', body: JSON.stringify({ p_user: uid }) }) } catch { continue }
        const arrived = newArrivals(groups, before[uid])
        if (arrived.length) {
          const payload = JSON.stringify(alertText(arrived))
          await Promise.all(subs.filter((s) => s.user_id === uid).map(async (s) => {
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' })
              sent += 1
            } catch (e) {
              if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id)
            }
          }))
        }
        const counts = Object.fromEntries((groups || []).map((g) => [g.key, Number(g.count || 0)]))
        await rest(base, service, 'alert_state?on_conflict=user_id', {
          method: 'POST', headers: { prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: uid, counts, updated_at: new Date().toISOString() }),
        }).catch(() => {})
      }
      if (dead.length) await rest(base, service, `push_subscriptions?id=in.(${dead.join(',')})`, { method: 'DELETE' }).catch(() => {})
      out.push = { users: users.length, sent, removed: dead.length }
    } catch (e) { out.push = { error: String(e.message || e) } }
  }

  // ---- Emails -------------------------------------------------------------
  const resend = process.env.RESEND_API_KEY
  if (resend) {
    try {
      const queue = await rest(base, service, 'email_outbox?select=id,to_email,subject,body,link,attempts&sent_at=is.null&attempts=lt.5&order=id&limit=25')
      let sent = 0
      for (const m of queue || []) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: process.env.ALERT_FROM || 'ZaMarket <hello@zamarket.shop>',
            to: [m.to_email],
            reply_to: process.env.REPLY_TO || undefined,
            subject: m.subject,
            text: `${m.body}${m.link ? `\n\nhttps://zamarket.shop${m.link}` : ''}`,
            html: emailHtml(m.subject, m.body, m.link),
          }),
        })
        const patch = res.ok ? { sent_at: new Date().toISOString(), error: null } : { attempts: m.attempts + 1, error: (await res.text()).slice(0, 500) }
        if (res.ok) sent += 1
        await rest(base, service, `email_outbox?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {})
      }
      out.email = { queued: (queue || []).length, sent }
    } catch (e) { out.email = { error: String(e.message || e) } }
  }

  return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '*/2 * * * *' }
