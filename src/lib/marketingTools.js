// Every marketing tool, grouped into six workspaces. One list feeds the
// Marketing & Growth Centre (workspace cards, the tools panel, search, quick
// access) and each tool's page header, so a tool added here shows up in all
// of them. `to` is always an existing page: nothing here is a second copy.

export const WORKSPACES = [
  {
    key: 'find', name: 'Find Customers', tone: 'purple', icon: 'users',
    blurb: 'Find buyers, contact offices and people you know, manage enquiries and follow up.',
    tools: [
      { key: 'finder', name: 'Customer Finder', to: '/admin/find-customers', icon: 'target', desc: 'Offices, people you know, referrals, seller reports and real numbers.' },
      { key: 'today', name: 'Today’s Tasks', to: '/admin/marketing/today', icon: 'calendar', desc: 'Your checklist for today: follow-ups, outreach and content.' },
      { key: 'leads', name: 'Leads', to: '/admin/marketing/leads', icon: 'userPlus', desc: 'Everyone who showed interest. Call, message, follow up, win.' },
      { key: 'magnets', name: 'Lead Magnets', to: '/admin/marketing/magnets', icon: 'magnet', desc: 'Free guides, vouchers and checklists that turn visitors into leads.' },
    ],
  },
  {
    key: 'promote', name: 'Promote & Advertise', tone: 'pink', icon: 'megaphone',
    blurb: 'Create adverts, videos, posters and campaigns that put products in front of people.',
    tools: [
      { key: 'studio', name: 'Creative Studio', to: '/admin/studio', icon: 'image', desc: 'Product posters and adverts in every size.' },
      { key: 'videos', name: 'Video Maker', to: '/admin/videos', icon: 'video', desc: 'MP4 videos for cars, products, lunch and the marketplace.' },
      { key: 'launch', name: 'Campaign Launchpad', to: '/admin/marketing/launch', icon: 'rocket', desc: 'Turn a product or article into a tracked, ready-to-share campaign.' },
      { key: 'campaigns', name: 'Campaigns', to: '/admin/marketing/campaigns', icon: 'layers', desc: 'Every ad, post and message with a short link, so results are counted.' },
      { key: 'content', name: 'Content', to: '/admin/marketing/content', icon: 'file', desc: 'What to post, what was posted, where, and what it brought in.' },
      { key: 'creatives', name: 'Creative Record', to: '/admin/marketing/creatives', icon: 'archive', desc: 'Every advert and price list made, and which styles get shared.' },
    ],
  },
  {
    key: 'discover', name: 'Get Discovered', tone: 'blue', icon: 'search',
    blurb: 'Be found on Google for free and attract customers with useful articles.',
    tools: [
      { key: 'seo', name: 'Search & SEO', to: '/admin/marketing/seo', icon: 'google', desc: 'What each page still needs to be found on Google.' },
      { key: 'blog', name: 'Blog & Articles', to: '/admin/marketing/blog', icon: 'book', desc: 'Buying guides that answer what people search for.' },
    ],
  },
  {
    key: 'offers', name: 'Offers & Promotions', tone: 'amber', icon: 'gift',
    blurb: 'Give people good reasons to buy, and choose what shoppers see first.',
    tools: [
      { key: 'giveaways', name: 'Giveaways', to: '/admin/marketing/giveaways', icon: 'trophy', desc: 'Free-to-enter prize draws, winners picked by the system.' },
      { key: 'coupons', name: 'Coupons', to: '/admin/marketing/coupons', icon: 'tag', desc: 'Discount codes, and who pays for each one.' },
      { key: 'front-page', name: 'Front Page', to: '/admin/marketing/front-page', icon: 'layout', desc: 'Pick the products a shopper sees first.' },
      { key: 'featured', name: 'Homepage Hero', to: '/admin/marketing/featured', icon: 'star', desc: 'What is at the top of the homepage today, and what it brought.' },
      { key: 'proof', name: 'Proof Library', to: '/admin/marketing/proof', icon: 'shield', desc: 'Real customer words and photos, ready to post.' },
    ],
  },
  {
    key: 'team', name: 'Grow Your Sales Team', tone: 'green', icon: 'handshake',
    blurb: 'Recruit affiliates, reward referrals and make sure every product is promoted.',
    tools: [
      { key: 'recruiting', name: 'Affiliate Recruiting', to: '/admin/affiliate-recruiting', icon: 'userPlus', desc: 'Bring in and approve new affiliates.' },
      { key: 'referrals', name: 'Referrals', to: '/admin/marketing/referrals', icon: 'share', desc: 'Customers inviting friends, and the rewards they earn.' },
      { key: 'coverage', name: 'Product Coverage', to: '/admin/marketing/coverage', icon: 'box', desc: 'Which products affiliates are ignoring, and how to fix it.' },
      { key: 'requests', name: 'Vendor Requests', to: '/admin/marketing/requests', icon: 'store', desc: 'Sellers asking ZaMarket to advertise for them.' },
    ],
  },
  {
    key: 'track', name: 'Track Performance', tone: 'violet', icon: 'chart',
    blurb: 'See what is working: where customers come from, what it costs and what it returns.',
    tools: [
      { key: 'overview', name: 'Marketing Overview', to: '/admin/marketing#overview', icon: 'gauge', desc: 'Leads, customers won, sales from marketing and cost per customer.' },
      { key: 'growth', name: 'Growth Analytics', to: '/admin/marketing/growth', icon: 'trend', desc: 'Where orders come from, and products people open but never buy.' },
      { key: 'funnels', name: 'Funnels', to: '/admin/marketing/funnels', icon: 'funnel', desc: 'From first seeing you to buying again, with the weakest step marked.' },
      { key: 'spend', name: 'Ad Spend', to: '/admin/marketing/spend', icon: 'coins', desc: 'What each channel costs and what it returns.' },
      { key: 'traffic', name: 'Visitors & Traffic', to: '/admin/traffic', icon: 'eye', desc: 'Who visits, where they come from and what they look at.' },
    ],
  },
]

export const GUIDE = { key: 'start', name: 'Marketing Guide', to: '/admin/marketing/start', icon: 'book', desc: 'Which tool to use for what, in order, and what every number means.' }

export const QUICK = ['studio', 'videos', 'finder', 'launch', 'recruiting', 'traffic', 'start']

export const ALL_TOOLS = [...WORKSPACES.flatMap((w) => w.tools.map((t) => ({ ...t, workspace: w.key, tone: w.tone }))), { ...GUIDE, workspace: 'guide', tone: 'violet' }]
export const toolByKey = (k) => ALL_TOOLS.find((t) => t.key === k)

// The workspace a marketing section belongs to (for the header of a tool page).
export function workspaceOfSection(section) {
  const path = `/admin/marketing/${section}`
  for (const w of WORKSPACES) { const t = w.tools.find((x) => x.to === path); if (t) return { workspace: w, tool: t } }
  if (section === 'start') return { workspace: null, tool: GUIDE }
  return null
}

export function searchTools(text) {
  const q = String(text || '').trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return ALL_TOOLS.filter((t) => { const hay = `${t.name} ${t.desc} ${(WORKSPACES.find((w) => w.key === t.workspace) || {}).name || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)) })
}
