// A campaign pack based ONLY on published marketplace information. No fabricated
// scarcity, reviews, shipping times, or discount claims.
const SITE = 'https://zamarket.shop'
const LIMIT = 140

export function storefrontPath(item, type) {
  if (type === 'article') return `/blog/${item.slug}`
  return item.vendor_slug && item.slug ? `/${item.vendor_slug}/${item.slug}` : `/p/${item.slug}`
}

export function matchingCampaigns(campaigns, path) {
  return (campaigns || []).filter(c =>
    c.status === 'active' && c.code &&
    (c.destination === path || c.destination === `${SITE}${path}` || c.destination === `${SITE}${path}/`)
  )
}

function trim(text, length = LIMIT) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= length) return clean
  return `${clean.slice(0, length - 1).trimEnd()}…`
}

export function makeLaunchPack(item, type = 'product', campaign = null) {
  if (!item?.slug) throw new Error('Choose a published product or article.')
  const path = storefrontPath(item, type)
  if (campaign && !matchingCampaigns([campaign], path).length) {
    throw new Error('The campaign points to a different page. Create one for this specific product or article.')
  }
  const link = campaign ? `${SITE}/go/${encodeURIComponent(campaign.code)}` : SITE + path
  const name = String(item.name || item.title || '').trim()
  if (!name) throw new Error('The product or article needs a title.')
  const intro = trim(item.description || item.excerpt || '', 180)
  const short = trim(intro, 92)
  const validPrice = type === 'product' && item.price !== null && item.price !== undefined && item.price !== '' && Number.isFinite(Number(item.price)) && Number(item.price) >= 0
  const price = validPrice ? `K${Number(item.price).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null
  const priceLine = price ? `Price: ${price}.` : ''
  const action = type === 'article' ? 'Read the guide' : 'See details and order'
  const opening = type === 'article' ? `Shopping in Lusaka? Here's a practical guide: ${name}.` : `Looking for ${name} in Lusaka? Find it on ZA Market.`
  const proof = intro ? `${intro}\n\n` : ''
  const base = `${opening}\n\n${proof}${priceLine}${priceLine ? '\n\n' : ''}${action}: ${link}`
  return {
    path, link, tracked: Boolean(campaign),
    details: { title: name, description: intro, price, type },
    whatsapp: base,
    facebook: `${opening}\n\n${proof}${priceLine}${priceLine ? '\n\n' : ''}${action} on ZA Market:\n${link}\n\n#Zambia #Lusaka #ZAMarket`,
    instagram: `${opening}\n\n${proof}${priceLine}${priceLine ? '\n\n' : ''}Find this on ZA Market. Link in bio (or share the URL in your story): ${link}\n\n#Lusaka #ZambianBusiness #ZAMarket`,
    tiktok: `Video idea (15–25 seconds)\n\n0–3s: Show ${name} clearly. On-screen hook: “Looking for ${trim(name, 48)} in Lusaka?”\n3–15s: Show real product details${intro ? `: ${short}` : ' and how it works'}.\n15–25s: Show ${price ? `the verified current price (${price}) and` : ''} where to find it.\nCTA: ${action} through ZA Market — ${link}\n\nFilm original footage, use subtitles, and do not invent claims or reviews.`,
    // Keep the destination intact; truncating a tracked link makes SMS useless.
    sms: `${trim(`${name}${price ? ` — ${price}` : ''}. ${action}`, Math.max(16, 158 - link.length))}: ${link}`,
    visualBrief: `Promotional graphic brief: ${name}. ${price ? `Display the product price as ${price}.` : 'Do not invent a price.'} Use an actual product photo, the ZA Market brand, a readable heading and a clear call-to-action. Link: ${link}. ${intro ? `Verified description: ${intro}` : ''}`,
    callToAction: action,
    alternates: {
      whatsapp: `${type === 'article' ? 'Useful buying guide' : 'Local shopping find'}: ${name}\n${short ? `\n${short}\n` : ''}${price ? `\n${price}\n` : ''}\nSee it here: ${link}`,
      facebook: `Searching for ${name} in Lusaka?\n\n${short ? `${short}\n\n` : ''}${price ? `Current listed price: ${price}\n\n` : ''}${action}: ${link}\n\n#ZAMarket #Lusaka`,
      instagram: `${name} — on ZA Market.\n\n${short ? `${short}\n\n` : ''}${price ? `${price}\n\n` : ''}${action}. Find the URL in our bio or story: ${link}\n\n#Zambia #ZAMarket`,
      tiktok: `Alternate video idea (15 seconds)\n0–4s: Show the actual product or subject of ${name}.\n4–11s: Demonstrate one real detail${short ? ` — ${short}` : ''}.\n11–15s: Display “${action}” and ZA Market.\nLink: ${link}\nUse original photos and subtitles.`,
    },
  }
}
