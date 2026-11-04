import webpush from 'web-push'

// Tell somebody an order has arrived, even with every tab closed.
//
// Called two ways, and it does not matter which arrives first:
//
//   · by the browser that just placed the order — instant, but only if that
//     browser survives the next second;
//   · by a Supabase database webhook on insert into orders — slower by a
//     moment, but it fires whatever the customer's phone does.
//
// Both are safe to wire up at once. The first caller claims the order in the
// database and every later caller gets nothing back, so an order is announced
// exactly once however many times this runs.
//
// Nothing the caller sends is trusted except the order number. The order is
// read back from the database with the service key, so a stranger posting a
// made-up order to this URL gets a 404 and sends nobody anything.

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

const money = (v) => `K${Number(v || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CHANNEL = {
  status: 'a WhatsApp status', whatsapp: 'WhatsApp', facebook: 'Facebook',
  instagram: 'Instagram', tiktok: 'TikTok', qr: 'a scanned QR code',
  flyer: 'a flyer', search: 'search', marketplace: 'the marketplace',
}

async function rest(base, key, path, init = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, authorization: `Bearer ${key}`,
      'content-type': 'application/json', ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export default async function orderAlert(request) {
  if (request.method !== 'POST') return json(405, { message: 'Method not allowed' })

  const base = process.env.VITE_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !service) return json(503, { message: 'Alerts are not configured' })

  let orderNumber
  try {
    const body = await request.json()
    // A Supabase webhook posts { record: {...} }; the app posts { order_number }.
    const raw = body?.order_number ?? body?.record?.order_number
    orderNumber = Number.parseInt(raw, 10)
  } catch { return json(400, { message: 'Invalid JSON' }) }
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) return json(400, { message: 'Bad order number' })

  // Claim it. Null means it does not exist, is below the alert threshold, or
  // somebody has announced it already — all of which mean: send nothing, quietly.
  let order
  try {
    order = await rest(base, service, 'rpc/claim_order_alert', {
      method: 'POST', body: JSON.stringify({ p_order_number: orderNumber }),
    })
  } catch (e) {
    return json(502, { message: 'Could not read the order', detail: String(e.message || e) })
  }
  if (!order) return json(200, { sent: false, reason: 'already alerted, too small, or not found' })

  const from = CHANNEL[order.channel] || 'the marketplace'
  const title = `New order · ${money(order.total)}`
  const body = `#${order.order_number} — ${order.items}. Came from ${from}.`
  const url = '/admin/orders?status=pending'
  const results = {}

  // ---- 1. Phone notifications -------------------------------------------
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const contact = process.env.VAPID_CONTACT || 'mailto:hello@zamarket.shop'
  if (pub && priv) {
    try {
      webpush.setVapidDetails(contact, pub, priv)
      const subs = await rest(base, service, 'push_subscriptions?select=id,endpoint,p256dh,auth')
      const payload = JSON.stringify({ title, body, url, tag: `order-${order.order_number}` })
      const dead = []
      let sent = 0
      await Promise.all((subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          )
          sent += 1
        } catch (e) {
          // 404/410 mean the browser threw the subscription away. Keeping it
          // would mean retrying a dead endpoint on every order, for ever.
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id)
        }
      }))
      if (dead.length) {
        await rest(base, service, `push_subscriptions?id=in.(${dead.join(',')})`, { method: 'DELETE' })
          .catch(() => {})
      }
      results.push = { sent, removed: dead.length }
    } catch (e) { results.push = { error: String(e.message || e) } }
  } else {
    results.push = { skipped: 'no VAPID keys' }
  }

  // ---- 2. Email ----------------------------------------------------------
  // Resend is used because it needs no phone verification, which rules out
  // most providers from Zambia. Off unless both the key and an address exist.
  const resend = process.env.RESEND_API_KEY
  let settings = []
  try { settings = await rest(base, service, 'settings?select=key,value&key=in.(alert_email,alert_whatsapp)') }
  catch { settings = [] }
  const setting = (k) => String((settings.find((s) => s.key === k)?.value ?? '')).replace(/^"|"$/g, '').trim()
  const to = setting('alert_email')

  if (resend && to) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resend}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.ALERT_FROM || 'ZaMarket <orders@zamarket.shop>',
          to: [to],
          subject: title,
          text: `${body}\n\nOpen the dashboard: https://zamarket.shop${url}`,
        }),
      })
      results.email = res.ok ? { sent: true } : { error: await res.text() }
    } catch (e) { results.email = { error: String(e.message || e) } }
  } else {
    results.email = { skipped: resend ? 'no address set' : 'no RESEND_API_KEY' }
  }

  // ---- 3. WhatsApp -------------------------------------------------------
  // Meta bills every business-initiated message and requires an approved
  // template, so this stays off until all four values exist. The template
  // must take two body variables: the order summary and the amount.
  const waToken = process.env.WHATSAPP_TOKEN
  const waPhoneId = process.env.WHATSAPP_PHONE_ID
  const waTemplate = process.env.WHATSAPP_TEMPLATE
  const waTo = setting('alert_whatsapp').replace(/[^0-9]/g, '')

  if (waToken && waPhoneId && waTemplate && waTo) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${waToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: waTo, type: 'template',
          template: {
            name: waTemplate,
            language: { code: process.env.WHATSAPP_LANG || 'en' },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: `#${order.order_number} — ${order.items}` },
                { type: 'text', text: money(order.total) },
              ],
            }],
          },
        }),
      })
      results.whatsapp = res.ok ? { sent: true } : { error: await res.text() }
    } catch (e) { results.whatsapp = { error: String(e.message || e) } }
  } else {
    results.whatsapp = { skipped: 'not configured' }
  }

  return json(200, { sent: true, order: order.order_number, results })
}

export const config = { path: '/api/order-alert' }
