import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p) => readFileSync(at(p), 'utf8')
const card = read('src/lib/shareCard.js')
const blog = read('src/pages/public/Blog.jsx')

test('an article can be turned into a picture in all three shapes', () => {
  // A blog link pasted into WhatsApp is a grey rectangle nobody opens.
  assert.match(card, /export async function articleCard/)
  assert.match(card, /story: \[1080, 1920\]/)   // WhatsApp status, IG/FB story
  assert.match(card, /post: \[1080, 1350\]/)    // IG and FB feed
  assert.match(card, /wide: \[1200, 630\]/)     // the link preview card
})

test('the card carries the real brand mark, not a drawn stand-in', () => {
  assert.match(card, /import \{ brandLockup \} from '\.\/posterKit'/)
  const article = card.slice(card.indexOf('export async function articleCard'))
  assert.match(article, /brandLockup\(ctx/)
})

test('the text is laid out to fit, never over the picture or the foot', () => {
  const article = card.slice(card.indexOf('export async function articleCard'))
  // Lines are only drawn when there is measured room for them.
  assert.match(article, /const titleRoom = Math\.max\(1, Math\.floor\(\(textBottom - y\) \/ titleLead\)\)/)
  assert.match(article, /const lines = Math\.floor\(\(textBottom - y\) \/ exLead\)/)
  assert.match(article, /if \(lines >= 1\)/)
})

test('the photo runs to the edge with square corners', () => {
  // `cover` rounds its corners, which is right on an inset card and wrong on
  // a photo that bleeds to the edge of the image.
  const article = card.slice(card.indexOf('export async function articleCard'))
  assert.doesNotMatch(article, /cover\(ctx, photo/)
  assert.match(article, /ctx\.rect\(0, 0, w, picH\); ctx\.clip\(\)/)
})

test('the address is not printed twice', () => {
  // The lockup already reads zamarket.shop. Repeating it on the right said
  // the same thing twice and collided with the mark when the slug was long.
  const article = card.slice(card.indexOf('export async function articleCard'))
  assert.match(article, /Read the full story/)
  assert.doesNotMatch(article, /replace\(\/\^https\?:\\\/\\\/\/, ''\)\.split\('\/'\)\[0\]/)
})

test('a missing cover photo does not break the share', () => {
  assert.match(card, /img\.onerror = \(\) => res\(null\)/)
  const article = card.slice(card.indexOf('export async function articleCard'))
  assert.match(article, /\} else \{\s*\n\s*ctx\.fillStyle = PINE/)
})

test('anyone reading can share, with no sign-in', () => {
  // Affiliates, vendors, customers and the owner get the same buttons,
  // because this lives on the public article page.
  assert.match(blog, /function ShareArticle\(\{ post \}\)/)
  assert.match(blog, /<ShareArticle post=\{post\} \/>/)
  assert.doesNotMatch(blog.slice(blog.indexOf('function ShareArticle')), /useAuth|isStaff|role ===/)
})

test('the share offers the three places people actually post to', () => {
  const share = blog.slice(blog.indexOf('function ShareArticle'), blog.indexOf('export function BlogPost'))
  assert.match(share, /picture\('story'\)/)
  assert.match(share, /picture\('post'\)/)
  assert.match(share, /wa\.me\/\?text=/)
  assert.match(share, /facebook\.com\/sharer/)
  // Instagram has no share URL, so the honest answer is the picture.
  assert.match(share, /Instagram has no share link/)
})

test('the words and the link travel with the picture', () => {
  const share = blog.slice(blog.indexOf('function ShareArticle'), blog.indexOf('export function BlogPost'))
  assert.match(share, /const caption = /)
  assert.match(share, /https:\/\/zamarket\.shop\/blog\/\$\{post\.slug\}/)
  assert.match(share, /sharePicture\(blob, \{ caption/)
})

test('the share code is only fetched when someone actually shares', () => {
  // Canvas work and the poster paths are dead weight for a reader who just
  // wants the article, so the module is imported on the tap.
  const share = blog.slice(blog.indexOf('function ShareArticle'), blog.indexOf('export function BlogPost'))
  assert.match(share, /await import\('\.\.\/\.\.\/lib\/shareCard'\)/)
})

test('a device that cannot share says so instead of failing silently', () => {
  const share = blog.slice(blog.indexOf('function ShareArticle'), blog.indexOf('export function BlogPost'))
  assert.match(share, /catch \{[\s\S]{0,120}That did not work on this device/)
  assert.match(share, /catch \{ setNote\('Copying is blocked here/)
})
