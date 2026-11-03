import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recruitmentAttribution, recruitmentUrl, applicationLink, safeAcademyUrl } from '../src/lib/affiliateRecruitment.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('platform recruitment links use the official domain and distinguish sources', () => {
  const fb = new URL(recruitmentUrl('facebook'))
  const ig = new URL(recruitmentUrl('instagram'))
  assert.equal(fb.origin, 'https://zamarket.shop')
  assert.equal(fb.pathname, '/affiliates')
  assert.equal(fb.searchParams.get('utm_source'), 'facebook')
  assert.equal(ig.searchParams.get('utm_source'), 'instagram')
  assert.equal(ig.searchParams.get('utm_campaign'), 'affiliate_launch')
})

test('recruitment attribution preserves a campaign through the application CTA', () => {
  const current = '?utm_source=whatsapp&utm_campaign=november_26'
  const values = recruitmentAttribution(current)
  assert.deepEqual(values, { source: 'whatsapp', campaign: 'november_26' })
  const next = applicationLink(current)
  const url = new URL(next, 'https://zamarket.shop')
  assert.equal(url.pathname, '/apply/reseller')
  assert.equal(url.searchParams.get('utm_source'), 'whatsapp')
  assert.equal(url.searchParams.get('utm_campaign'), 'november_26')
})

test('unsafe sources and campaign strings do not become links or markup', () => {
  const url = new URL(recruitmentUrl('javascript:alert(1)', '<script>'))
  assert.equal(url.searchParams.get('utm_source'), 'direct')
  assert.equal(url.searchParams.get('utm_campaign'), 'affiliate_launch')
  assert.deepEqual(recruitmentAttribution('?utm_source=unknown&utm_campaign=%3Cimg%3E'), { source: 'other', campaign: 'organic' })
  assert.equal(safeAcademyUrl('javascript:alert(1)'), '')
  assert.equal(safeAcademyUrl('http://example.com/video'), '')
  assert.equal(safeAcademyUrl('https://example.com/video'), 'https://example.com/video')
})

test('public recruitment route and SEO are visible to search engines', () => {
  assert.match(read('../src/App.jsx'), /path="\/affiliates"/)
  assert.match(read('../netlify/edge-functions/seo.js'), /parts\[0\] === 'affiliates'/)
  assert.match(read('../netlify/functions/sitemap.js'), /\$\{SITE\}\/affiliates/)
})

test('private academy content is only readable by eligible affiliates and marketing staff', () => {
  const sql = read('../supabase/migrations/20261103_affiliate_academy_recruitment_REVIEW.sql')
  assert.match(sql, /academy_session_read[\s\S]*public\.is_approved_affiliate\(\) or public\.can_market\(\)/)
  assert.match(sql, /academy_question_insert[\s\S]*user_id = auth\.uid\(\) and public\.is_approved_affiliate\(\)/)
  assert.match(sql, /create or replace function public\.affiliate_recruitment_report/)
})
