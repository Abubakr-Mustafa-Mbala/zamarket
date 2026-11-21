import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Split.jsx imports React and Supabase, so test the two pure helpers by
// lifting them out of the source.
const src = fs.readFileSync('src/pages/admin/Split.jsx', 'utf8')
const pick = (name) => src.match(new RegExp(`export function ${name}[\\s\\S]*?\\n}\\n`))[0].replace('export ', '')
const n = (v) => Number(v) || 0
// eslint-disable-next-line no-new-func
const { soloSplit, sumParts } = new Function('n', `${pick('soloSplit')}\n${pick('sumParts')}\nreturn { soloSplit, sumParts }`)(n)

test('a vendor sale shows the vendor share and the assumed delivery cost', () => {
  const t = sumParts([{ subtotal: 260, delivery_fee: 0, items: [{ quantity: 1, vendor_id: 'v', line_total: 260, product: { owner_type: 'vendor' } }], settlements: [{ net_payable: 200, status: 'pending' }], commissions: [], deliveries: [{ delivery_cost: 0, fuel_cost: 0 }] }], [{ amount: 50 }], [], 25)
  assert.equal(t.vendors, 200)
  assert.equal(t.delivery, 25)
  assert.equal(t.guessedDeliveries, 1)
  assert.equal(t.profit, 260 - 200 - 25 - 50)
})

test('one founder gets 100% and a loss shares nothing', () => {
  const r = soloSplit({ profit: -15, reinvested: -4.5, to_share: -10.5, people: [{ user_id: 'a', pct: 0, amount: 0, is_me: true }] })
  assert.equal(r.people[0].pct, 100)
  assert.equal(r.to_share, 0)
  assert.equal(r.reinvested, 0)
  const w = soloSplit({ profit: 100, reinvested: 30, to_share: 70, people: [{ user_id: 'a', pct: 0, amount: 0 }] })
  assert.equal(w.people[0].amount, 70)
})

test('cars listed for owners are not under Our products', () => {
  const p = fs.readFileSync('src/pages/admin/Products.jsx', 'utf8')
  assert.match(p, /tab === 'founder' \? p\.owner_type === 'founder' && !forOthers\(p\)/)
})
