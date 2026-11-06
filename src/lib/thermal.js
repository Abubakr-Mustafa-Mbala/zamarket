// Printing to a Bluetooth thermal printer straight from the browser.
// Works in Chrome on Android and on a PC. No app to install.
// Most cheap ESC/POS printers expose service 000018f0 with write characteristic 00002af1.

const SERVICE = '000018f0-0000-1000-8000-00805f9b34fb'
const CHAR = '00002af1-0000-1000-8000-00805f9b34fb'
const EXTRA_SERVICES = [SERVICE, '0000ff00-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']

export const btSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth

import { brandMark } from './posterKit'

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
  wrap(value, indent = '') {
    const words = plain(value).split(/\s+/).filter(Boolean)
    let line = indent
    for (const word of words) {
      if (line.trim() && line.length + word.length + 1 > this.width) { this.text(line); line = indent + word }
      else line += (line.trim() ? ' ' : '') + word
    }
    if (line.trim()) this.text(line)
    return this
  }
  qr(value) {
    const data = enc.encode(String(value || ''))
    if (!data.length || data.length > 700) return this
    const len = data.length + 3
    this.raw(bytes(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))
    this.raw(bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x04))
    this.raw(bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31))
    this.raw(bytes(GS, 0x28, 0x6b, len & 255, len >> 8, 0x31, 0x50, 0x30))
    this.raw(data)
    return this.raw(bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30))
  }
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
  // The mark, as a one-bit raster.
  //
  // A thermal head has no greys: a dot is burnt or it is not. So the symbol
  // is drawn to an offscreen canvas in black on white and each pixel is pushed
  // either way at the halfway point. `dots` is the printer's width in dots —
  // 384 on a 58mm printer, 576 on an 80mm — and must be a multiple of eight,
  // which is how ESC/POS packs the rows.
  logo(dots = 384, height = 96) {
    try {
      if (typeof document === 'undefined') return this
      const w = Math.floor(dots / 8) * 8
      const c = document.createElement('canvas')
      c.width = w; c.height = height
      const ctx = c.getContext('2d')
      if (!ctx) return this
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, height)
      const size = Math.min(height, Math.round(w * 0.42))
      brandMark(ctx, Math.round((w - size) / 2), Math.round((height - size) / 2), size, '#000000')
      const px = ctx.getImageData(0, 0, w, height).data

      const perRow = w / 8
      const data = new Uint8Array(perRow * height)
      let anyInk = false
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          // Luminance, then a hard threshold. Anything darker than mid grey
          // burns a dot.
          const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114)
          if (lum < 128) {
            data[y * perRow + (x >> 3)] |= 0x80 >> (x & 7)
            anyInk = true
          }
        }
      }
      if (!anyInk) return this
      this.raw(bytes(GS, 0x76, 0x30, 0x00, perRow & 255, perRow >> 8, height & 255, height >> 8))
      return this.raw(data)
    } catch {
      return this          // a printer is better than no receipt
    }
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
  d.align('center')
  d.logo(opts.dots || 384)
  d.bold(true).big(true).text(opts.business || 'ZaMarket').big(false)
  d.text(opts.site || 'zamarket.shop')
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
  d.bold(true).text('SOLD BY').bold(false)
  const sellers = [...new Set((o.items || []).map(i => opts.sellerFor?.(i) || i.vendor?.business_name || i.product?.vendor?.business_name || 'ZaMarket'))]
  sellers.forEach(name => d.wrap(name))
  d.line()
  d.bold(true).text('CUSTOMER').bold(false)
  d.wrap(o.customer?.full_name || 'Customer')
  if (o.customer?.phone) d.text(o.customer.phone)
  const place = [o.address, o.area, o.district?.name].filter(Boolean).join(', ')
  if (place) d.text(place)
  d.line()
  for (const i of o.items || []) {
    d.wrap(`${i.quantity} x ${i.product?.name || 'Item'}`)
    d.wrap(`Sold by: ${opts.sellerFor?.(i) || i.vendor?.business_name || i.product?.vendor?.business_name || 'ZaMarket'}`)
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
  if (opts.orderUrl) { d.qr(opts.orderUrl); d.text('Scan to view order') }
  d.text(opts.site || 'zamarket.shop')
  if (opts.footer) d.wrap(opts.footer)
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
