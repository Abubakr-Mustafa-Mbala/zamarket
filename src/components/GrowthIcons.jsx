// Line icons for the Marketing & Growth Centre and the Visitors dashboard:
// one stroke weight, drawn on a 24-unit grid, coloured by the text colour.
const P = {
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9" /></>,
  megaphone: <><path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1Z" /><path d="M7 15l1.5 5h2.5L10 15.5" /><path d="M19 9a4 4 0 0 1 0 6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20h14v-7.5M12 8.5V20" /><path d="M12 8.5S10.5 4 8 4.6c-2 .5-1.4 3.9 4 3.9ZM12 8.5S13.5 4 16 4.6c2 .5 1.4 3.9-4 3.9Z" /></>,
  handshake: <><path d="m2.5 11 3.5-3.5 3 1.5 3-2 3 1 3-1.5 3.5 4" /><path d="m6 7.5 5.5 6.5a1.6 1.6 0 0 0 2.4-2L11 9" /><path d="M9 16.5 10.5 18M11.5 14.5l2 2.2M14 13l2 2" /><path d="m2.5 11 6 6.5a1.6 1.6 0 0 0 2.4-2" /><path d="M21.5 11.5 15 18a1.6 1.6 0 0 1-2.3-2" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h2M12 13h2M8 16.5h2" /></>,
  userPlus: <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20c.6-3.6 3.3-5.5 6.5-5.5 1.7 0 3.2.5 4.3 1.5" /><path d="M18.5 13v6M15.5 16h6" /></>,
  magnet: <><path d="M5 4v8a7 7 0 0 0 14 0V4h-4.5v8a2.5 2.5 0 0 1-5 0V4Z" /><path d="M5 8h4.5M14.5 8H19" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5.2-5 3.8 3.5 3-2.5 4.5 4" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10.5 5-3v9l-5-3" /></>,
  rocket: <><path d="M13.5 4.5c3-1.6 6-1.5 6-1.5s.1 3-1.5 6l-6.5 6.5-4.5-4.5Z" /><path d="M7 11 4 11.5 3 14l4 1M13 17l-.5 3 2.5-1 .5-4" /><circle cx="15.5" cy="8.5" r="1.4" /><path d="M6.5 17.5 4 20" /></>,
  layers: <><path d="m12 3.5 9 4.5-9 4.5L3 8Z" /><path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5" /></>,
  file: <><path d="M6 3h8l4.5 4.5V21H6Z" /><path d="M14 3v4.5h4.5M9 12h6M9 15.5h6M9 9h2" /></>,
  archive: <><rect x="3" y="4" width="18" height="4.5" rx="1" /><path d="M5 8.5V20h14V8.5M10 12.5h4" /></>,
  google: <><path d="M20.5 12.2c0-.6 0-1.1-.2-1.7H12v3.3h4.8a4.4 4.4 0 0 1-1.8 2.8" /><path d="M15 16.6a5.6 5.6 0 0 1-8.4-2.9M6.3 9.9A5.6 5.6 0 0 1 15.4 7" /><path d="M20.5 12.2A8.5 8.5 0 1 1 18 6.2" /></>,
  book: <><path d="M12 6.5c-2-1.6-5-2-8.5-1.6V19c3.5-.4 6.5 0 8.5 1.6 2-1.6 5-2 8.5-1.6V4.9c-3.5-.4-6.5 0-8.5 1.6Z" /><path d="M12 6.5v14" /></>,
  trophy: <><path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0Z" /><path d="M7.5 6H4.5a3 3 0 0 0 3 4.5M16.5 6h3a3 3 0 0 1-3 4.5M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5Z" /></>,
  tag: <><path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8L21 12l-8.5 8.5Z" /><circle cx="8.5" cy="8.5" r="1.6" /></>,
  layout: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9h17M10 9v11" /></>,
  star: <><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" /><path d="m8.8 12 2.2 2.2 4.4-4.6" /></>,
  share: <><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4" /></>,
  box: <><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" /></>,
  store: <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 12v8.5h13V12M10 20.5v-5h4v5" /></>,
  gauge: <><path d="M4 17a8.5 8.5 0 1 1 16 0" /><path d="m12 13 4-4.5" /><circle cx="12" cy="13.5" r="1.3" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  funnel: <><path d="M3.5 4.5h17l-6.5 8v6l-4 2v-8Z" /></>,
  coins: <><ellipse cx="9" cy="7" rx="5.5" ry="2.5" /><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5S14.5 12.4 14.5 11V7" /><path d="M9.5 16c.6 1.2 2.7 2 5 2 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.2-2.4" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  bolt: <><path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6Z" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  cart: <><path d="M3 4h2.5l2.2 11h10.6L20.5 7.5H6.3" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>,
  wallet: <><path d="M4 7.5a2 2 0 0 1 2-2h12v3" /><rect x="3.5" y="8" width="17" height="12" rx="2" /><path d="M16 13.5h2" /></>,
  whatsapp: <><path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6Z" /><path d="M9.2 8.7c.3-.6.8-.6 1-.3l.9 1.8c.1.3 0 .5-.2.8l-.5.5c.6 1.2 1.6 2.2 2.8 2.8l.5-.5c.3-.2.5-.3.8-.2l1.8.9c.3.2.3.7-.3 1-1 .6-2.3.5-4.2-.8-1.7-1.2-2.8-2.7-3.1-4-.2-.9 0-1.6.5-2Z" /></>,
  phone: <><path d="M5 4h3.5l1.5 4-2 1.5a10.5 10.5 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4Z" /></>,
  car: <><path d="M4 16.5V12l2-5h12l2 5v4.5" /><rect x="3" y="12" width="18" height="5" rx="1.5" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /><path d="M6.5 12h11" /></>,
  pages: <><rect x="6.5" y="3.5" width="12" height="15" rx="1.5" /><path d="M4.5 6.5v13a1 1 0 0 0 1 1h10" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
}

export default function GIcon({ name, size = 22, className = '' }) {
  return (
    <svg className={`gi ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name] || P.chart}
    </svg>
  )
}
