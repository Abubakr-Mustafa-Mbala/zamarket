// One icon family, drawn as SVG, used everywhere. No emoji in the interface.
// Stroke style, 24px grid, currentColor — so icons inherit the colour around them.

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
const wrap = (children, props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" {...S} {...props}>{children}</svg>
)

export const Icon = {
  tag: (p) => wrap(<><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.4" /></>, p),
  smartphone: (p) => wrap(<><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>, p),
  utensils: (p) => wrap(<><path d="M6 2.5v8a2.5 2.5 0 0 0 5 0v-8M8.5 10.5V21.5" /><path d="M17.5 2.5c-1.6 1-2.5 3-2.5 5.5s1 3.5 2.5 3.5V21.5" /></>, p),
  house: (p) => wrap(<><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5v11h13v-11" /><path d="M10 20.5v-6h4v6" /></>, p),
  wrench: (p) => wrap(<path d="M15.5 3a5.5 5.5 0 0 0-5 7.7L3 18.2 5.8 21l7.5-7.5A5.5 5.5 0 1 0 15.5 3Z" />, p),
  graduation: (p) => wrap(<><path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" /><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5" /></>, p),
  car: (p) => wrap(<><path d="M4 16v3M20 16v3" /><path d="M3 15.5v-3l2-5.2A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.3l2 5.2v3Z" /><circle cx="7.5" cy="15.5" r="1.4" /><circle cx="16.5" cy="15.5" r="1.4" /></>, p),
  calendar: (p) => wrap(<><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>, p),
  shirt: (p) => wrap(<path d="M8 3 4 5.5 5.5 10l2-1v12h9V9l2 1L20 5.5 16 3a4 4 0 0 1-8 0Z" />, p),
  sparkles: (p) => wrap(<><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" /><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" /></>, p),
  heartPulse: (p) => wrap(<><path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z" /><path d="M5 12h3l1.5-2.5 2 5 1.5-3 1 1.5h4" /></>, p),
  dumbbell: (p) => wrap(<><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" /></>, p),
  sprout: (p) => wrap(<><path d="M12 21v-8" /><path d="M12 13C12 9 9 7 5 7c0 4 3 6 7 6Z" /><path d="M12 13c0-3.3 2.4-5.5 6-5.5 0 3.6-2.6 5.5-6 5.5Z" /></>, p),
  briefcase: (p) => wrap(<><rect x="3" y="7.5" width="18" height="13" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 12.5h18" /></>, p),
  baby: (p) => wrap(<><circle cx="12" cy="8" r="4" /><path d="M9.5 8.2h.01M14.5 8.2h.01M10.4 10.4a2.4 2.4 0 0 0 3.2 0" /><path d="M6 20.5c1.5-2.5 3.6-3.8 6-3.8s4.5 1.3 6 3.8" /></>, p),
  paw: (p) => wrap(<><circle cx="7" cy="8.5" r="2" /><circle cx="12" cy="6.5" r="2" /><circle cx="17" cy="8.5" r="2" /><path d="M12 11.5c-3 0-5 2.2-5 4.6 0 2 1.7 3.4 5 3.4s5-1.4 5-3.4c0-2.4-2-4.6-5-4.6Z" /></>, p),
  grid: (p) => wrap(<><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>, p),
  more: (p) => wrap(<><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>, p),
  search: (p) => wrap(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>, p),
  cart: (p) => wrap(<><path d="M2.5 3.5h2.2l2.4 11h10l2.4-8H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>, p),
  user: (p) => wrap(<><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.4-4 4-6 7.5-6s6.1 2 7.5 6" /></>, p),
  heart: (p) => wrap(<path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z" />, p),
  pin: (p) => wrap(<><path d="M12 21.5s7-6.2 7-11.3a7 7 0 0 0-14 0C5 15.3 12 21.5 12 21.5Z" /><circle cx="12" cy="10" r="2.6" /></>, p),
  shield: (p) => wrap(<><path d="M12 2.5 20 6v6c0 5-3.6 8.2-8 9.5-4.4-1.3-8-4.5-8-9.5V6l8-3.5Z" /><path d="m8.5 12 2.4 2.4L15.5 9.8" /></>, p),
  truck: (p) => wrap(<><rect x="2.5" y="6.5" width="12" height="9.5" rx="2" /><path d="M14.5 9.5h3.2l3.3 3.4V16h-6.5" /><circle cx="7" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></>, p),
  star: (p) => wrap(<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9L3.5 9.7l5.9-.8L12 3.5Z" />, p),
  headphones: (p) => wrap(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="2.5" y="13.5" width="4.5" height="7" rx="2" /><rect x="17" y="13.5" width="4.5" height="7" rx="2" /></>, p),
  clock: (p) => wrap(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>, p),
  arrow: (p) => wrap(<path d="M4.5 12h14m-5-5 5 5-5 5" />, p),
  message: (p) => wrap(<path d="M20.5 12c0 4.1-3.8 7.4-8.5 7.4a9.9 9.9 0 0 1-2.8-.4L4 21l1.3-3.6A7 7 0 0 1 3.5 12C3.5 7.9 7.3 4.6 12 4.6s8.5 3.3 8.5 7.4Z" />, p),
  phone: (p) => wrap(<path d="M5 3.5h3.5L10 8l-2.3 1.9a12 12 0 0 0 5.4 5.4L15 13l4.5 1.5V18c0 1.4-1.1 2.5-2.5 2.5C9.8 20.5 3.5 14.2 3.5 6 3.5 4.6 4.6 3.5 5 3.5Z" />, p),
  camera: (p) => wrap(<><rect x="2.5" y="7" width="19" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.6" /><path d="M8.5 7 10 4.5h4L15.5 7" /></>, p),
  plane: (p) => wrap(<path d="M3 13.5 21 5l-4.5 15-4-5.5L3 13.5Z" />, p),
  gift: (p) => wrap(<><rect x="3" y="9" width="18" height="11.5" rx="2" /><path d="M3 13.5h18M12 9v11.5" /><path d="M12 9S9.5 3.5 7 4.8 9 9 12 9s4.5-2.9 3-4.2S12 9 12 9Z" /></>, p),
  music: (p) => wrap(<><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>, p),
  filter: (p) => wrap(<><path d="M4 7h16M7 12h10M10 17h4" /></>, p),
  info: (p) => wrap(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>, p),
  check: (p) => wrap(<path d="m5 12.5 4.5 4.5L19 7" />, p),
  box: (p) => wrap(<><path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16Z" /><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" /></>, p),
  ticket: (p) => wrap(<><path d="M3.5 8.5V6.5h17v2a2.5 2.5 0 0 0 0 5v2h-17v-2a2.5 2.5 0 0 0 0-5Z" /><path d="M13 6.5v11" strokeDasharray="2 2.5" /></>, p),
}

export default Icon
