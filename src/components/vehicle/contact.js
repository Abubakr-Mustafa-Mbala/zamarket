import { money } from '../../lib/format'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { productShareUrl } from '../../lib/affiliateLinks'
import { vehicleOf, vehicleTitle, whatsappText, whatsappLink } from '../../lib/vehicle'

// The link a buyer's message carries. When a tracked affiliate sent this buyer
// (or the viewer is the affiliate), it is their /r/ link, so the team can
// credit them when the sale closes.
export function vehicleLink(p, ref) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zamarket.shop'
  // /car/<slug> is a tiny page with the car's own WhatsApp/Facebook preview
  // that opens the car page at once (an affiliate's code rides along as ?r=).
  if (!p?.slug) return ref ? productShareUrl(origin, p, 'reseller', ref) : productShareUrl(origin, p)
  return `${origin}/car/${encodeURIComponent(p.slug)}${ref ? `?r=${encodeURIComponent(ref)}` : ''}`
}

export function useVehicleContact(p) {
  const { settings, role, profile } = useAuth()
  const { attribution } = useCart()
  const ownCode = role === 'reseller' ? profile?.partner?.code : null
  const ref = ownCode || (attribution ? attribution().referral_code : null) || null
  return { ref, link: p ? vehicleLink(p, ref) : '', whatsapp: (settings?.company_whatsapp || '').trim(), phone: (settings?.company_phone || '').trim() }
}

export function askOnWhatsApp(p, contact, question) {
  const v = vehicleOf(p)
  const text = whatsappText({ title: vehicleTitle(v, p.name), price: money(p.price, { whole: true }), link: contact.link, question })
  return whatsappLink(contact.whatsapp, text)
}

