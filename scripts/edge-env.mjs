// Netlify edge functions do not always receive the site's VITE_ variables
// (they are often scoped to builds only). Link previews on WhatsApp and
// Facebook then can't look a product up and fall back to the generic shop
// preview. So the build writes the two PUBLIC values (the same ones already
// inside the website's JavaScript) next to the edge function.
import { writeFileSync } from 'node:fs'
const url = process.env.VITE_SUPABASE_URL || ''
const key = process.env.VITE_SUPABASE_ANON_KEY || ''
writeFileSync(new URL('../netlify/edge-env.js', import.meta.url),
  `// Written by scripts/edge-env.mjs at build time. Public values only.\nexport const PUBLIC_SUPABASE_URL = ${JSON.stringify(url)}\nexport const PUBLIC_SUPABASE_ANON_KEY = ${JSON.stringify(key)}\n`)
console.log(`edge-env: ${url ? 'Supabase URL set' : 'NO Supabase URL'}; ${key ? 'key set' : 'NO key'}`)
