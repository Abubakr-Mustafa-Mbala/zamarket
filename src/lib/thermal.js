// Printing to a Bluetooth thermal printer straight from the browser.
// Works in Chrome on Android and on a PC. No app to install.
// Most cheap ESC/POS printers expose service 000018f0 with write characteristic 00002af1.

const SERVICE = '000018f0-0000-1000-8000-00805f9b34fb'
const CHAR = '00002af1-0000-1000-8000-00805f9b34fb'
const EXTRA_SERVICES = [SERVICE, '0000ff00-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']

export const btSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth

const ESC = 0x1b, GS = 0x1d
const bytes = (...b) => Uint8Array.from(b)
const enc = new TextEncoder()

// Printers use a single-byte code page, so strip anything outside it.
function plain(text) {
  return String(text ?? '')
    .replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/−/g, '-').replace(/×/g, 'x').replace(/·/g, '-').replace(/✓/g, 'OK')
    .replace(/[^\x20-\x7E\n]/g, '')
}

class Doc {
  constructor(width) { this.width = width; this.parts = [bytes(ESC, 0x40)] } // reset
  raw(b) { this.parts.push(b); return this }
  text(s = '') { this.parts.push(enc.encode(plain(s) + '\n')); return this }
  align(a) { return this.raw(bytes(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0)) }
  bold(on) { return this.raw(bytes(ESC, 0x45, on ? 1 : 0)) }
  big(on) { return this.raw(bytes(GS, 0x21, on ? 0x11 : 0x00)) }
  line(char = '-') { return this.text(char.repeat(this.width)) }
  // left text and right text on one line
  row(left, right) {
    const l = plain(left), r = plain(right)
    const space = Math.max(1, this.width - l.length - r.length)
    if (l.length + r.length + 1 > this.width) {
      this.text(l)
      return this.text(' '.repeat(Math.max(0, this.width - r.length)) + r)
    }
    return this.text(l + ' '.repeat(space) + r)
  }
  feedCut() { return this.raw(bytes(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00)) }
  build() {
    const total = this.parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const p of this.parts) { out.set(p, at); at += p.length }
    return out
  }
}

// Receipt for one order. `o` is the same shape the on-screen receipt uses.
export function receiptBytes(o, opts = {}) {
  const width = opts.width || 32
  const money = (v) => `K${Number(v || 0).toFixed(2)}`
  const d = new Doc(width)
  d.align('center').bold(true).big(true).text(opts.business || 'ZaMarket').big(false)
  if (opts.phone) d.text(opts.phone)
  d.bold(false)
  const paid = (o.payments || []).reduce((t, p) => t + Number(p.amount || 0), 0)
  const balance = Math.max(0, Number(o.total) - paid)
  d.text(balance === 0 ? 'RECEIPT' : 'DELIVERY NOTE').align('left').line()
  d.row('Order', `#${o.order_number}`)
  d.row('Date', new Date(o.created_at).toLocaleDateString('en-GB'))
  d.row('Printed', new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))
  if (o.needed_by) d.row('Needed by', new Date(`${o.needed_by}T00:00:00`).toLocaleDateString('en-GB'))
  d.line()
  d.bold(true).text(o.customer?.full_name || 'Customer').bold(false)
  if (o.customer?.phone) d.text(o.customer.phone)
  const place = [o.address, o.area, o.district?.name].filter(Boolean).join(', ')
  if (place) d.text(place)
  d.line()
  for (const i of o.items || []) {
    d.text(`${i.quantity} x ${i.product?.name || 'Item'}`)
    if (i.choices) for (const [k, v] of Object.entries(i.choices)) d.text(`  ${k}: ${v}`)
    if (i.note) d.text(`  "${i.note}"`)
    d.row(`  @ ${money(i.unit_price)}`, money(i.line_total))
  }
  d.line()
  d.row('Subtotal', money(o.subtotal))
  d.row('Delivery', Number(o.delivery_fee) === 0 ? 'Free' : money(o.delivery_fee))
  d.bold(true).row('TOTAL', money(o.total)).bold(false)
  for (const p of o.payments || []) d.row(`Paid ${p.method || ''}`.trim(), money(p.amount))
  d.bold(true).row(balance > 0 ? 'BALANCE DUE' : 'PAID IN FULL', balance > 0 ? money(balance) : 'OK').bold(false)
  d.line()
  if (balance > 0) { d.text('Cash received: ______________'); d.text('') }
  d.text('Received by: ________________')
  d.text('')
  d.text('Delivered by: _______________')
  d.line()
  d.align('center')
  if (opts.footer) d.text(opts.footer)
  if (opts.reviewLink) { d.text('Rate your order:'); d.text(opts.reviewLink) }
  d.feedCut()
  return d.build()
}

// Pick a printer (first time) and send the bytes.
export async function printBytes(data, remembered) {
  if (!btSupported()) throw new Error('This browser cannot print by Bluetooth. Use Chrome on Android or a PC.')
  let device = null
  if (remembered && navigator.bluetooth.getDevices) {
    const known = await navigator.bluetooth.getDevices().catch(() => [])
    device = known.find((x) => x.id === remembered) || null
  }
  if (!device) {
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: EXTRA_SERVICES })
  }
  const server = await device.gatt.connect()
  let characteristic = null
  for (const uuid of EXTRA_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid)
      const chars = await service.getCharacteristics()
      characteristic = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse) || null
      if (characteristic) break
    } catch { /* try the next service */ }
  }
  if (!characteristic) {
    try {
      const service = await server.getPrimaryService(SERVICE)
      characteristic = await service.getCharacteristic(CHAR)
    } catch { /* ignore */ }
  }
  if (!characteristic) { server.disconnect(); throw new Error("Couldn't talk to that printer. Make sure it's on and paired, then try again.") }

  const chunk = 180
  for (let i = 0; i < data.length; i += chunk) {
    const part = data.slice(i, i + chunk)
    if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(part)
    else await characteristic.writeValue(part)
    await new Promise((r) => setTimeout(r, 20))
  }
  setTimeout(() => { try { server.disconnect() } catch { /* ignore */ } }, 1200)
  return device.id
}
