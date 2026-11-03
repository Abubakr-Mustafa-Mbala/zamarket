import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchCataloguePages } from '../src/lib/paginatedCatalogue.js'

test('fetches all pages without truncating at one response', async () => {
  const input = Array.from({ length: 1203 }, (_, i) => ({ id: i }))
  const ranges = []
  const result = await fetchCataloguePages(async (from, to) => {
    ranges.push([from, to])
    return { data: input.slice(from, to + 1), error: null }
  })
  assert.deepEqual(result, input)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('does not silently return a partial catalogue on page failure', async () => {
  await assert.rejects(fetchCataloguePages(async (from) => from ? { data: null, error: new Error('network') } : { data: Array(500).fill(1), error: null }), /network/)
})

test('rejects unsafe paging configuration and incomplete capped results', async () => {
  await assert.rejects(fetchCataloguePages(async () => ({ data: [1], error: null }), { pageSize: 0 }), RangeError)
  await assert.rejects(fetchCataloguePages(async () => ({ data: [1], error: null }), { pageSize: 1, maxPages: 2 }), /maximum safe page count/)
})
