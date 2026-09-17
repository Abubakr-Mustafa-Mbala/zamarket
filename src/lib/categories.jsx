// Store departments. Products store the `name`; icons are simple original line drawings.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const DEPARTMENTS = [
  { name: 'Phones & electronics', icon: <svg viewBox="0 0 32 32" {...S}><rect x="10" y="4" width="12" height="24" rx="2.5" /><path d="M14.5 24.5h3" /></svg> },
  { name: 'Home & kitchen', icon: <svg viewBox="0 0 32 32" {...S}><path d="M5 15 16 6l11 9" /><path d="M8 13v13h16V13" /><path d="M13 26v-7h6v7" /></svg> },
  { name: 'Fashion', icon: <svg viewBox="0 0 32 32" {...S}><path d="M12 5 6 8l-2 6 4 1.5V27h16V15.5L28 14l-2-6-6-3c0 2.2-1.8 4-4 4s-4-1.8-4-4Z" /></svg> },
  { name: 'Beauty & personal care', icon: <svg viewBox="0 0 32 32" {...S}><rect x="11" y="13" width="10" height="14" rx="2" /><path d="M13 13V9h6v4" /><path d="M14.5 9V5.5h3V9" /></svg> },
  { name: 'Food & cakes', icon: <svg viewBox="0 0 32 32" {...S}><path d="M6 26h20" /><path d="M7 26V17h18v9" /><path d="M7 21c3 0 3-2 6-2s3 2 6 2 3-2 6-2" /><path d="M16 17v-4" /><path d="M16 9.5c.9 0 1.5-.8 1.5-1.6 0-1-1.5-2.4-1.5-2.4s-1.5 1.4-1.5 2.4c0 .8.6 1.6 1.5 1.6Z" /></svg> },
  { name: 'Services', icon: <svg viewBox="0 0 32 32" {...S}><rect x="5" y="7" width="22" height="20" rx="2.5" /><path d="M5 13h22M11 4.5v5M21 4.5v5" /><path d="m12.5 20 2.5 2.5 5-5" /></svg> },
  { name: 'Kids & baby', icon: <svg viewBox="0 0 32 32" {...S}><circle cx="16" cy="17" r="9" /><circle cx="12.5" cy="15.5" r=".6" fill="currentColor" /><circle cx="19.5" cy="15.5" r=".6" fill="currentColor" /><path d="M13 20.5c1.8 1.4 4.2 1.4 6 0M16 8c0-2 2-3 3-2" /></svg> },
  { name: 'Health', icon: <svg viewBox="0 0 32 32" {...S}><path d="M16 27s-10-6-10-13a5.5 5.5 0 0 1 10-3 5.5 5.5 0 0 1 10 3c0 7-10 13-10 13Z" /><path d="M16 13v6M13 16h6" /></svg> },
  { name: 'Tools & hardware', icon: <svg viewBox="0 0 32 32" {...S}><path d="M19.5 6.5a5 5 0 0 0-6.2 6.4L5.5 20.7a2.1 2.1 0 0 0 3 3l7.8-7.8a5 5 0 0 0 6.4-6.2l-3 3-3-.9-.9-3 3.7-2.3Z" /></svg> },
  { name: 'Other', icon: <svg viewBox="0 0 32 32" {...S}><rect x="6" y="6" width="8.5" height="8.5" rx="2" /><rect x="17.5" y="6" width="8.5" height="8.5" rx="2" /><rect x="6" y="17.5" width="8.5" height="8.5" rx="2" /><rect x="17.5" y="17.5" width="8.5" height="8.5" rx="2" /></svg> },
]

export const CATEGORY_NAMES = DEPARTMENTS.map((d) => d.name)
export const iconFor = (name) => (DEPARTMENTS.find((d) => d.name === name) || DEPARTMENTS[DEPARTMENTS.length - 1]).icon
