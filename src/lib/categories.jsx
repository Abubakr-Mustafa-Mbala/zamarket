// Store departments. Products store the `name`; icons are simple original line drawings.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

const BUILT_IN = [
  { name: 'Phones & electronics', icon: <svg viewBox="0 0 32 32" {...S}><rect x="10" y="4" width="12" height="24" rx="2.5" /><path d="M14.5 24.5h3" /></svg> },
  { name: 'Home & kitchen', icon: <svg viewBox="0 0 32 32" {...S}><path d="M5 15 16 6l11 9" /><path d="M8 13v13h16V13" /><path d="M13 26v-7h6v7" /></svg> },
  { name: 'Fashion', icon: <svg viewBox="0 0 32 32" {...S}><path d="M12 5 6 8l-2 6 4 1.5V27h16V15.5L28 14l-2-6-6-3c0 2.2-1.8 4-4 4s-4-1.8-4-4Z" /></svg> },
  { name: 'Beauty & personal care', icon: <svg viewBox="0 0 32 32" {...S}><rect x="11" y="13" width="10" height="14" rx="2" /><path d="M13 13V9h6v4" /><path d="M14.5 9V5.5h3V9" /></svg> },
  { name: 'Food & cakes', icon: <svg viewBox="0 0 32 32" {...S}><path d="M6 26h20" /><path d="M7 26V17h18v9" /><path d="M7 21c3 0 3-2 6-2s3 2 6 2 3-2 6-2" /><path d="M16 17v-4" /><path d="M16 9.5c.9 0 1.5-.8 1.5-1.6 0-1-1.5-2.4-1.5-2.4s-1.5 1.4-1.5 2.4c0 .8.6 1.6 1.5 1.6Z" /></svg> },
  { name: 'Services', icon: <svg viewBox="0 0 32 32" {...S}><rect x="5" y="7" width="22" height="20" rx="2.5" /><path d="M5 13h22M11 4.5v5M21 4.5v5" /><path d="m12.5 20 2.5 2.5 5-5" /></svg> },
  { name: 'Kids & baby', icon: <svg viewBox="0 0 32 32" {...S}><circle cx="16" cy="17" r="9" /><circle cx="12.5" cy="15.5" r=".6" fill="currentColor" /><circle cx="19.5" cy="15.5" r=".6" fill="currentColor" /><path d="M13 20.5c1.8 1.4 4.2 1.4 6 0M16 8c0-2 2-3 3-2" /></svg> },
  { name: 'Health', icon: <svg viewBox="0 0 32 32" {...S}><path d="M16 27s-10-6-10-13a5.5 5.5 0 0 1 10-3 5.5 5.5 0 0 1 10 3c0 7-10 13-10 13Z" /><path d="M16 13v6M13 16h6" /></svg> },
  { name: 'Tools & hardware', icon: <svg viewBox="0 0 32 32" {...S}><path d="M19.5 6.5a5 5 0 0 0-6.2 6.4L5.5 20.7a2.1 2.1 0 0 0 3 3l7.8-7.8a5 5 0 0 0 6.4-6.2l-3 3-3-.9-.9-3 3.7-2.3Z" /></svg> },
  { name: 'Courses & training', icon: <svg viewBox="0 0 32 32" {...S}><path d="M3 12 16 6l13 6-13 6-13-6Z" /><path d="M8 14.5V21c0 2 3.6 4 8 4s8-2 8-4v-6.5M29 12v8" /></svg> },
  { name: 'Vehicles', icon: <svg viewBox="0 0 32 32" {...S}><path d="M5 20v-4l2.5-6h17L27 16v4" /><path d="M4 20h24v4H4z" /><circle cx="9.5" cy="24" r="2" /><circle cx="22.5" cy="24" r="2" /><path d="M8 16h16" /></svg> },
  { name: 'Events & venues', icon: <svg viewBox="0 0 32 32" {...S}><path d="M6 27V11l10-6 10 6v16" /><path d="M11 27v-8h10v8M6 27h20" /><path d="M16 9v4" /></svg> },
  { name: 'Other', icon: <svg viewBox="0 0 32 32" {...S}><rect x="6" y="6" width="8.5" height="8.5" rx="2" /><rect x="17.5" y="6" width="8.5" height="8.5" rx="2" /><rect x="6" y="17.5" width="8.5" height="8.5" rx="2" /><rect x="17.5" y="17.5" width="8.5" height="8.5" rx="2" /></svg> },
]

// Icons sellers can choose from, keyed by a short name kept in Settings.
export const ICON_KEYS = ['phone', 'home', 'fashion', 'beauty', 'food', 'services', 'kids', 'health', 'tools', 'other']
const BY_KEY = Object.fromEntries(BUILT_IN.map((d, i) => [ICON_KEYS[i], d.icon]))

// The shop's departments are editable in Settings. These are only the fallback.
export const DEFAULT_DEPARTMENTS = BUILT_IN.map((d, i) => ({ name: d.name, icon: ICON_KEYS[i] }))

export function departmentsFrom(settings) {
  const list = settings?.departments
  const clean = Array.isArray(list) ? list.filter((d) => d?.name) : null
  return (clean?.length ? clean : DEFAULT_DEPARTMENTS).map((d) => ({ name: d.name, iconKey: d.icon || 'other', icon: BY_KEY[d.icon] || BY_KEY.other }))
}

export const iconByKey = (key) => BY_KEY[key] || BY_KEY.other
export const iconFor = (name, departments) => (departments || DEFAULT_DEPARTMENTS).map((d) => ({ ...d, icon: BY_KEY[d.icon || d.iconKey] || BY_KEY.other })).find((d) => d.name === name)?.icon || BY_KEY.other
