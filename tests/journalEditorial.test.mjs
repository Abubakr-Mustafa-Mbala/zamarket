import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

test('public Journal and articles expose editorial hierarchy without changing published article data', () => {
  const page = read('../src/pages/public/Blog.jsx')
  assert.match(page, /className="stack journal-index journal-index-2"/)
  assert.match(page, /className="journal-eyebrow"/)
  assert.match(page, /className="post-overline"/)
  assert.match(page, /className="article"/)
  assert.match(page, /Shop the story/)
  assert.match(page, /<Article body=\{post\.body\}/)
  assert.match(page, /<BuyBlock offerings=\{post\.offerings\}/)
  assert.match(page, /<ShareArticle post=\{post\}/)
  assert.match(page, /supabase\.rpc\('blog_index'/)
  assert.match(page, /supabase\.rpc\('post_page'/)
})

test('Journal CSS is a separate last-loaded file and keeps article styles scoped', () => {
  const entry = read('../src/main.jsx')
  const styles = read('../src/journal-editorial.css')
  assert.match(entry, /import '\.\/journal-editorial\.css'/)
  assert.ok(entry.lastIndexOf("import './journal-editorial.css'") > entry.indexOf("import './ai-blog.css'"))
  assert.match(styles, /\.shop \.post-page \.article h2/)
  assert.match(styles, /\.shop \.journal-index \.blog-card/)
  assert.match(styles, /\.blog-editor-preview \.article h2/)
  assert.match(styles, /@media \(max-width: 740px\)/)
  assert.match(styles, /object-fit: contain/)
  assert.match(styles, /font-family: var\(--font-display\)/)
  assert.doesNotMatch(styles, /\.checkout|\.product-detail|\.cart-page/)
})
