import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const auth = readFileSync(fileURLToPath(new URL('../src/pages/public/Auth.jsx', import.meta.url)), 'utf8')

test('a new account can only be created through Google', () => {
  // A forgotten password on a Supabase email account is close to
  // unrecoverable, and an affiliate's earnings sit behind it. Google can put
  // a forgotten password right; ZaMarket cannot.
  assert.doesNotMatch(auth, /supabase\.auth\.signUp\(/)
  assert.match(auth, /signInWithOAuth\(\{/)
})

test('people who already have a password can still sign in', () => {
  // Removing password sign-in would lock out every existing account,
  // including the founder's own.
  assert.match(auth, /signInWithPassword\(\{ email: f\.email, password: f\.password \}\)/)
  assert.match(auth, /autoComplete="current-password"/)
  assert.doesNotMatch(auth, /autoComplete=\{mode === 'in' \? 'current-password' : 'new-password'\}/)
})

test('an existing account can attach Google and stop depending on a password', () => {
  assert.match(auth, /linkIdentity\(\{ provider: 'google'/)
  assert.match(auth, /attach Google from your account page/)
})

test('password recovery is always reachable, not hidden behind a mode', () => {
  assert.match(auth, /resetPasswordForEmail/)
  assert.doesNotMatch(auth, /\{mode === 'in' && <form onSubmit=\{requestReset\}/)
})

test('an application never mints a password account', () => {
  // Sellers and affiliates hold money; their account is the one that must
  // not become unrecoverable.
  const apply = auth.slice(auth.indexOf('export function Apply'))
  assert.doesNotMatch(apply, /auth\.signUp\(/)
  assert.match(apply, /signInWithOAuth/)
})

test('ZaMarket never handles a Google password', () => {
  assert.match(auth, /Your Google password is never seen or stored by ZaMarket/)
  // The only password field left belongs to ZaMarket's own sign-in.
  // Sign-in, and the two fields on the reset-password page. Nothing else.
  assert.equal((auth.match(/type="password"/g) || []).length, 3)
})
