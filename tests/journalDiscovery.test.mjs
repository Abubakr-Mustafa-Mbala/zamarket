import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseArticleHeading } from '../src/lib/articleHeadings.js'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

test('public article renderer supports both normal and mobile-pasted compact headings', () => {
  assert.deepEqual(parseArticleHeading('## A soft carrot cake')?.slice(0, 3), ['## A soft carrot cake', '##', 'A soft carrot cake'])
  assert.deepEqual(parseArticleHeading('##A soft carrot cake')?.slice(0, 3), ['##A soft carrot cake', '##', 'A soft carrot cake'])
  assert.deepEqual(parseArticleHeading('###How to order')?.slice(0, 3), ['###How to order', '###', 'How to order'])
  assert.equal(parseArticleHeading('###'), null)
  assert.equal(parseArticleHeading('Hello ## world'), null)
})

test('public Journal index has the new brand introduction', () => {
  const blog = read('../src/pages/public/Blog.jsx')
  assert.match(blog, /Stories, guides and discoveries worth exploring/)
  assert.doesNotMatch(blog, /What things cost in Lusaka, who actually sells them/)
  assert.match(blog, /const h = parseArticleHeading\(l\)/)
})

test('public homepage and mobile-visible department navigation feature Journal', () => {
  const shop = read('../src/pages/public/Marketplace.jsx')
  assert.match(shop, /<JournalHighlights \/>/)
  assert.match(shop, /to="\/blog" className=\{`journal-nav/)
  assert.match(shop, /<ShopFooter/)
})

test('Journal preview uses limited public published-only RPC and links to full articles', () => {
  const journal = read('../src/components/JournalHighlights.jsx')
  assert.match(journal, /rpc\('blog_index', \{ p_limit: 3, p_offset: 0 \}\)/)
  assert.match(journal, /to=\{`\/blog\/\$\{post.slug\}`\}/)
  assert.match(journal, /if \(!posts.length\) return null/)
  assert.doesNotMatch(journal, /\.from\('posts'\)/)
})
