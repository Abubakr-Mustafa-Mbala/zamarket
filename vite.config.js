import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  // Keep component and function names through minification. Without this the
  // error screen can only report mangled identifiers like "Qe ‹ zt", which is
  // no more useful than reporting nothing -- and the screen tells people the
  // message points straight at the cause. Costs a little bundle size and buys
  // a crash report that names the screen.
  esbuild: { keepNames: true },
})
