import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money, date, n } from '../../lib/format'
import { Loading, Input, useToast, Problem, Badge } from '../../components/ui'

// Count the shelf against the system. Whatever is missing has already been paid
// for, so it comes straight off profit — counting is how you find it.
export default function StockCount() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useData(async () => {
    const counts = await q(supabase.from('stock_counts').select('*').order('created_at', { ascending: false }).limit(12))
    const open = counts.find((c) => c.status === 'open')
    return { counts, open, result: open ? await q(supabase.rpc('count_result', { p_count: open.id })) : null }
  }, [])

  if (error) return <Problem error={error} what="stock counting" onRetry={reload} />
  if (loading) return <Loading shape="rows" />

  const start = async () => {
    setBusy(true)
    const { error: e } = await supabase.rpc('start_stock_count')
    setBusy(false)
    if (e) return toast(e.message, true)
    toast('Count started — walk the shelf and type what you see')
    reload()
  }

  if (!data.open) {
    return (
      <div className="stack">
        <div className="page-head">
          <div><h1>Count the stock</h1><p>What the system says you have, against what is actually there.</p></div>
          <button className="btn primary" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start a count'}</button>
        </div>
        <div className="card explain small">
          <p><strong>Why this matters.</strong> Stock you paid for and can't find is money already spent. Until you count, it still shows as profit. Count monthly, or weekly on your fastest-moving items.</p>
          <p className="mt">Nothing changes until you finish the count, and every change is recorded with the date and your name.</p>
        </div>
        {data.counts.length > 0 && (
          <section className="card stack-sm">
            <h3>Past counts</h3>
            <div className="mini-table">
              {data.counts.map((c) => (
                <div key={c.id} className="mini-row">
                  <span className="grow"><strong>{date(c.counted_on)}</strong><span className="tiny muted">{c.note || 'No note'}</span></span>
                  <Badge status={c.status === 'finished' ? 'approved' : 'draft'}>{c.status === 'finished' ? 'Finished' : c.status}</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  return <OpenCount count={data.open} result={data.result} onDone={reload} />
}

function OpenCount({ count, result, onDone }) {
  const toast = useToast()
  const [lines, setLines] = useState(() => Object.fromEntries((result.lines || []).map((l) => [l.product_id, l.counted ?? ''])))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (productId, value) => {
    setLines((x) => ({ ...x, [productId]: value }))
    if (value === '') return
    const { error } = await supabase.rpc('save_count', { p_count: count.id, p_product: productId, p_counted: n(value) })
    if (error) toast(error.message, true)
  }

  const done = (result.lines || []).filter((l) => lines[l.product_id] !== '' && lines[l.product_id] != null)
  const diffs = done.map((l) => ({ ...l, counted: n(lines[l.product_id]) })).filter((l) => l.counted !== l.expected)
  const shortValue = diffs.filter((l) => l.counted < l.expected).reduce((t, l) => t + (l.expected - l.counted) * (l.value ? Math.abs(l.value / (l.difference || 1)) : 0), 0)

  const finish = async () => {
    if (!confirm(`Finish the count? ${diffs.length} product${diffs.length === 1 ? '' : 's'} will be corrected to what you counted.`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('finish_stock_count', { p_count: count.id, p_note: note || null })
    setBusy(false)
    if (error) return toast(error.message, true)
    toast(`Done — ${data.adjusted} product${data.adjusted === 1 ? '' : 's'} corrected`)
    onDone()
  }

  const abandon = async () => {
    if (!confirm('Throw this count away? Nothing will be changed.')) return
    await supabase.from('stock_counts').update({ status: 'abandoned' }).eq('id', count.id)
    onDone()
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Counting — {date(count.counted_on)}</h1><p>{done.length} of {result.lines.length} counted. Type what is on the shelf.</p></div>
        <div className="btn-row">
          <button className="btn ghost" onClick={abandon}>Throw away</button>
          <button className="btn primary" disabled={busy || done.length === 0} onClick={finish}>{busy ? 'Saving…' : 'Finish the count'}</button>
        </div>
      </div>

      {diffs.length > 0 && (
        <div className="card warn-card stack-sm">
          <strong>{diffs.length} difference{diffs.length === 1 ? '' : 's'} so far</strong>
          <div className="mini-table">
            {diffs.slice(0, 6).map((l) => (
              <div key={l.product_id} className="mini-row">
                <span className="grow">{l.name}</span>
                <span className={l.counted < l.expected ? 'bad strong' : 'ok strong'}>
                  {l.counted < l.expected ? `${l.expected - l.counted} missing` : `${l.counted - l.expected} extra`}
                </span>
              </div>
            ))}
          </div>
          <p className="tiny muted">Missing stock is money already spent. Look for it before you finish: it may be an unrecorded sale, a damaged item, or a delivery never marked.</p>
        </div>
      )}

      <section className="card stack-sm">
        <div className="count-list">
          {(result.lines || []).map((l) => {
            const v = lines[l.product_id]
            const diff = v === '' || v == null ? null : n(v) - l.expected
            return (
              <div key={l.product_id} className={`count-row ${diff === null ? '' : diff === 0 ? 'ok' : 'off'}`}>
                <span className="grow">
                  <strong>{l.name}</strong>
                  <span className="tiny muted">System says {l.expected}</span>
                </span>
                <Input type="number" value={v ?? ''} onChange={(val) => save(l.product_id, val)} placeholder="Count" />
                <span className="count-diff">{diff === null ? '' : diff === 0 ? '✓' : diff > 0 ? `+${diff}` : diff}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card stack-sm">
        <Input value={note} onChange={setNote} placeholder="A note about this count (optional)" />
      </section>
    </div>
  )
}
