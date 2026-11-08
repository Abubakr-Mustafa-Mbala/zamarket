import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const blog = fs.readFileSync(new URL('../src/pages/marketing/Blog.jsx', import.meta.url), 'utf8')
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
test('Blog lists and editor both offer delete after saving', () => {
  assert.match(blog, /className="btn danger sm blog-delete-list"/)
  assert.match(blog, /post\?\.id && \(/)
  assert.match(blog, /Delete article/)
})
test('Delete requires a named article and explicit typed confirmation', () => {
  assert.match(blog, /Delete this article\?/)
  assert.match(blog, /confirmation !== 'DELETE'/)
  assert.match(blog, /deleteText !== 'DELETE'/)
  assert.match(blog, /\.delete\(\)\.eq\('id', deleting\.id\)\.select\('id'\)/)
  assert.match(blog, /if \(!data\?\.length\)/)
})
test('Database already protects post deletion by staff policy and cascades post links', () => {
  assert.match(schema, /references posts\(id\) on delete cascade/)
  assert.match(schema, /staff_posts_all.*'posts'.*'all'.*'is_staff\(\)'/)
})
