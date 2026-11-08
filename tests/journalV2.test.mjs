import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveJournalTheme, publishedJournalCategories } from '../src/lib/journalTheme.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

test('automatic reading palettes fit food, equipment and bedding without a blue default', () => {
  assert.equal(resolveJournalTheme('Food & Cakes'), 'ivory')
  assert.equal(resolveJournalTheme('Kitchen Equipment'), 'stone')
  assert.equal(resolveJournalTheme('Home & Living / Beds'), 'sage')
  assert.equal(resolveJournalTheme('Electronics'), 'stone')
  assert.equal(resolveJournalTheme('Kitchen Equipment','cocoa'), 'cocoa')
  assert.equal(resolveJournalTheme('Food','not-a-theme'), 'ivory')
})
test('category navigation counts only published results actually returned from public blog_index', () => {
  assert.deepEqual(publishedJournalCategories([
    {slug:'a',title:'Carrot cake',category:'Food & Cakes'},
    {slug:'b',title:'Blender',category:'Kitchen Equipment'},
    {slug:'c',title:'Loaf',category:'Food & Cakes'},
    {slug:null,title:'Unpublished',category:'Ghost category'},
    {slug:'d',title:'No category',category:''},
  ]), [{name:'Food & Cakes',count:2},{name:'Kitchen Equipment',count:1}])
})
test('the article keeps read-only product data, share actions, and store attribution', () => {
  const source=read('../src/pages/public/Blog.jsx')
  assert.match(source,/className="journal-feature-hero"/)
  assert.match(source,/className="journal-reading-sheet"/)
  assert.match(source,/journal-vendor-attribution/)
  assert.match(source,/publishedJournalCategories\(posts\)/)
  assert.match(source,/JournalCommunity slug=\{post.slug\}/)
  assert.match(source,/journal-print-mode/)
  assert.match(source,/journalEngagement|journal_track_event|trackJournalEvent/)
})
test('the founder can choose a palette, vendor, and access print export', () => {
  const source=read('../src/pages/marketing/Blog.jsx')
  assert.match(source,/reading_theme: f.reading_theme/)
  assert.match(source,/featured_vendor_id: f.featured_vendor_id/)
  assert.match(source,/JournalFounderPanel/)
  assert.match(source,/Export PDF/)
  assert.match(source,/Automatically feature the first linked vendor/)
})
test('new journal data requires separate, staff-protected, moderated SQL migration', () => {
  const sql=read('../supabase/migrations/20261108_journal_v2_REVIEW.sql')
  assert.match(sql,/create table if not exists public.journal_likes/)
  assert.match(sql,/create table if not exists public.journal_comments/)
  assert.match(sql,/create table if not exists public.journal_events/)
  assert.match(sql,/alter table public.journal_comments enable row level security/)
  assert.match(sql,/journal_moderate_comment/)
  assert.match(sql,/journal_metrics/)
  assert.match(sql,/p.status='published'/)
})
test('premium CSS is isolated to journal pages and supports printed admin exports', () => {
  const css=read('../src/journal-v2.css')
  const entry=read('../src/main.jsx')
  assert.match(entry,/import '\.\/journal-v2\.css'/)
  assert.match(css,/journal-theme-ivory/)
  assert.match(css,/journal-theme-stone/)
  assert.match(css,/journal-theme-sage/)
  assert.match(css,/@media print/)
  assert.doesNotMatch(css,/[\s,]\.checkout[\s,{]|[\s,]\.cart-page[\s,{]/)
})
