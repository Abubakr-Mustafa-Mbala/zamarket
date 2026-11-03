// Campaign codes are deliberately short and restricted to safe URL/data values.
// No arbitrary redirect, uploaded URL or executable content is ever accepted.
export const RECRUITMENT_CHANNELS = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'linkedin', 'campus', 'referral', 'direct']
export const CAMPAIGN_ID = /^[a-z0-9][a-z0-9_-]{0,59}$/i

export function cleanCampaign(value, fallback = '') {
  const text = String(value || '').trim().toLowerCase()
  return CAMPAIGN_ID.test(text) ? text : fallback
}

export function recruitmentAttribution(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '')
  const from = cleanCampaign(params.get('utm_source') || params.get('source'), 'direct')
  const source = RECRUITMENT_CHANNELS.includes(from) ? from : 'other'
  return { source, campaign: cleanCampaign(params.get('utm_campaign'), 'organic') }
}

export function recruitmentUrl(source, campaign = 'affiliate_launch') {
  const from = cleanCampaign(source, 'direct')
  const channel = RECRUITMENT_CHANNELS.includes(from) ? from : 'direct'
  const name = cleanCampaign(campaign, 'affiliate_launch')
  return `https://zamarket.shop/affiliates?utm_source=${encodeURIComponent(channel)}&utm_campaign=${encodeURIComponent(name)}`
}

export function applicationLink(search) {
  const { source, campaign } = recruitmentAttribution(search)
  const params = new URLSearchParams({ utm_source: source, utm_campaign: campaign })
  return `/apply/reseller?${params.toString()}`
}

// Videos/handouts can only be external HTTPS resources. Unsafe schemes stay text-free.
export function safeAcademyUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    return url.href
  } catch { return '' }
}
