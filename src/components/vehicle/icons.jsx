// Small line icons for the showroom. Original drawings, no icon library.
const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' }

export const VI = {
  year: <svg viewBox="0 0 24 24" {...G}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  mileage: <svg viewBox="0 0 24 24" {...G}><path d="M4.5 17a8 8 0 1 1 15 0" /><path d="m12 13 4-4" /><circle cx="12" cy="13" r="1.2" /></svg>,
  transmission: <svg viewBox="0 0 24 24" {...G}><circle cx="6" cy="6" r="1.8" /><circle cx="12" cy="6" r="1.8" /><circle cx="18" cy="6" r="1.8" /><circle cx="6" cy="18" r="1.8" /><circle cx="12" cy="18" r="1.8" /><path d="M6 8v8M12 8v8M18 8v4H6" /></svg>,
  fuel: <svg viewBox="0 0 24 24" {...G}><path d="M5 20V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15M3.5 20h12M5 10h9" /><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3" /></svg>,
  engine: <svg viewBox="0 0 24 24" {...G}><path d="M4 10h3l2-2h6l2 2h2v3h1.5v-2h1v6h-1v-2H19v3h-3l-2 2H8l-2-2H4z" /><path d="M9 5h6M12 5v3" /></svg>,
  drive: <svg viewBox="0 0 24 24" {...G}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M12 3.5V10M5 16.5l5.3-3.3M19 16.5l-5.3-3.3" /></svg>,
  body: <svg viewBox="0 0 24 24" {...G}><path d="M3 15v-3l2.2-5h13.6L21 12v3" /><path d="M2.5 15h19v3h-19z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></svg>,
  colour: <svg viewBox="0 0 24 24" {...G}><path d="M12 3.5c3 3.6 6 6.8 6 10.2a6 6 0 0 1-12 0c0-3.4 3-6.6 6-10.2Z" /></svg>,
  seats: <svg viewBox="0 0 24 24" {...G}><path d="M7 4h5a2 2 0 0 1 2 2v7H7z" /><path d="M5 13h12a2 2 0 0 1 2 2v2H5zM7 17v3M17 17v3" /></svg>,
  condition: <svg viewBox="0 0 24 24" {...G}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  papers: <svg viewBox="0 0 24 24" {...G}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5Z" /><path d="M14 3.5V8h4M9 12h6M9 15.5h6" /></svg>,
  service: <svg viewBox="0 0 24 24" {...G}><path d="M14.5 5.5a4 4 0 0 0-5.3 5.3L4 16v4h4l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" /></svg>,
  make: <svg viewBox="0 0 24 24" {...G}><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8M12 8v8" /></svg>,
  model: <svg viewBox="0 0 24 24" {...G}><path d="M4 7h16M4 12h16M4 17h10" /></svg>,
  variant: <svg viewBox="0 0 24 24" {...G}><path d="M4 7h16M4 12h10M4 17h6" /></svg>,
  pin: <svg viewBox="0 0 24 24" {...G}><path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>,
  camera: <svg viewBox="0 0 24 24" {...G}><path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  phone: <svg viewBox="0 0 24 24" {...G}><path d="M5 4h3.5l1.6 4-2.1 1.4a10.5 10.5 0 0 0 6.6 6.6l1.4-2.1 4 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z" /></svg>,
  chat: <svg viewBox="0 0 24 24" {...G}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>,
  share: <svg viewBox="0 0 24 24" {...G}><circle cx="18" cy="5.5" r="2.3" /><circle cx="6" cy="12" r="2.3" /><circle cx="18" cy="18.5" r="2.3" /><path d="m8 11 8-4.3M8 13l8 4.3" /></svg>,
  check: <svg viewBox="0 0 24 24" {...G}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  search: <svg viewBox="0 0 24 24" {...G}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></svg>,
  whatsapp: <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.2A9.7 9.7 0 0 0 3.7 16.9L2.4 21.6l4.9-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.2-.2-.5-.3Z" /></svg>,
}

export const FACT_ICON = {
  year: VI.year, mileage_km: VI.mileage, transmission: VI.transmission, fuel: VI.fuel, engine: VI.engine, drive: VI.drive,
  body: VI.body, colour: VI.colour, seats: VI.seats, condition: VI.condition, papers: VI.papers, service: VI.service,
  make: VI.make, model: VI.model, variant: VI.variant,
}
