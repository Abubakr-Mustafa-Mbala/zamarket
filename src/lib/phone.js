// One place that decides what counts as a phone number we can ring.
// Zambian mobile numbers are ten digits starting 09 or 07, or the same
// nine digits after +260. Other countries' numbers are let through on length
// alone, because a customer abroad is still a customer.

export const phoneDigits = (value) => String(value || '').replace(/\D/g, '')

export function usablePhone(value) {
  const d = phoneDigits(value)
  return d.length >= 9 && d.length <= 15
}

// How a number is shown back to a person: 0977 123 456.
export function prettyPhone(value) {
  let d = phoneDigits(value)
  if (d.length === 12 && d.startsWith('260')) d = '0' + d.slice(3)
  if (d.length === 9) d = '0' + d
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
  return d
}

// The address WhatsApp wants: country code, no plus, no leading zero.
export function waNumber(value) {
  const d = phoneDigits(value)
  if (d.length === 10 && d.startsWith('0')) return '260' + d.slice(1)
  if (d.length === 9) return '260' + d
  return d
}
