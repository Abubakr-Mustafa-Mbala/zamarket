import { useState } from 'react'
import { supabase, q } from '../../lib/supabase'
import { useData } from '../../lib/useData'
import { money } from '../../lib/format'
import { Loading, useToast, Problem, Empty, Select } from '../../components/ui'
import { useDepartments } from '../../lib/departments'

// What a shopper sees first.
//
// Everything else on the front page arranges itself: products take turns
// between sellers, group into departments and rotate daily. That is fair, and
// it is not a shop window. One seller adding their whole range makes the page
// theirs, because nothing could say "these are the things worth seeing first".
//
// This is that. A short, hand-picked row that sits above everything, in the
// order chosen here. Clear it and the page goes back to arranging itself.

const photo = (p) => (Array.isArray(p.images) && p.images[0]) || null

function Thumb({ p }) {
  const src = photo(p)
  return src
    ? <img src={src} alt="" className="pick-thumb" loading="lazy" />
    : <span className="pick-thumb pick-thumb-empty" aria-hidden="true" />
}

// Products nobody can browse to.
//
// A product's department is what puts it on the categories page and in its
// shelf on the front page. Leaving it blank is allowed, and a blank one then
// counts toward no tile and belongs to no shelf — it only turns up in search,
// which means it is effectively hidden from anyone browsing.
//
// Fixing it belongs here rather than in a report, because the fix is one
// choice per product.
function NeedsADepartment({ products, departments, onSaved }) {
  const toast = useToast()
  const [saving, setSaving] = useState('')
  const stray = products.filter((p) => !String(p.category || '').trim())
  if (!stray.length) return null

  const assign = async (id, category) => {
    if (!category) return
    setSaving(id)
    const { error } = await supabase.from('products').update({ category }).eq('id', id)
    setSaving('')
    if (error) return toast(error.message, true)
    toast('Filed under ' + category)
    onSaved()
  }

  return (
    <div className="card" style={{ borderColor: 'var(--warn)' }}>
      <h3>{stray.length} {stray.length === 1 ? 'product has' : 'products have'} no department</h3>
      <p className="small muted">
        These are published and for sale, but they appear on no category tile
        and in no shelf on the front page. Only someone searching by name will
        find them. Give each one a department and it joins the rest.
      </p>
      <ul className="pick-list mt">
        {stray.map((p) => (
          <li key={p.id} className="pick-row">
            <Thumb p={p} />
            <span className="pick-name">
              <b>{p.name}</b>
              <span className="tiny muted">{p.vendor_name || 'ZaMarket'} · {money(p.price)}</span>
            </span>
            <Select
              value="" disabled={saving === p.id}
              onChange={(v) => assign(p.id, v)}
              options={departments.map((d) => d.name)}
              placeholder={saving === p.id ? 'Saving…' : 'Choose a department'} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function FrontPage() {
  const toast = useToast()
  const departments = useDepartments()
  const [chosen, setChosen] = useState(null)   // null until loaded
  const [find, setFind] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useData(async () => {
    const [products, picks] = await Promise.all([
      q(supabase.from('public_products')
        .select('id,name,slug,price,images,category,vendor_name,vendor_id')
        .order('name')),
      q(supabase.from('front_page_picks').select('id,front_rank')),
    ])
    const ranks = new Map((picks || []).map((r) => [r.id, r.front_rank]))
    return { products: (products || []).map((p) => ({ ...p, front_rank: ranks.get(p.id) ?? null })) }
  }, [])

  if (error) return <Problem error={error} what="the front page" onRetry={typeof reload === 'function' ? reload : undefined} />
  if (loading) return <Loading />

  const products = data.products || []
  // First render after load: start from whatever is currently picked.
  const picked = chosen ?? products
    .filter((p) => p.front_rank != null)
    .sort((a, b) => Number(a.front_rank) - Number(b.front_rank))
    .map((p) => p.id)

  const byId = new Map(products.map((p) => [p.id, p]))
  const pickedProducts = picked.map((id) => byId.get(id)).filter(Boolean)

  const needle = find.trim().toLowerCase()
  const available = products
    .filter((p) => !picked.includes(p.id))
    .filter((p) => !needle
      || p.name?.toLowerCase().includes(needle)
      || p.vendor_name?.toLowerCase().includes(needle)
      || p.category?.toLowerCase().includes(needle))

  const add = (id) => setChosen([...picked, id])
  const drop = (id) => setChosen(picked.filter((x) => x !== id))
  const move = (i, by) => {
    const next = [...picked]
    const j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setChosen(next)
  }

  const save = async () => {
    setBusy(true)
    const { data: res, error: err } = await supabase.rpc('set_front_page', { p_ids: picked })
    setBusy(false)
    if (err) return toast(err.message, true)
    toast(res?.picked
      ? `Saved. ${res.picked} ${res.picked === 1 ? 'product leads' : 'products lead'} the front page.`
      : 'Cleared. The front page will arrange itself again.')
    setChosen(null)
    reload()
  }

  const current = products.filter((p) => p.front_rank != null).map((p) => p.id)
  const dirty = picked.length !== current.length || picked.some((id, i) => id !== current[i])

  return (
    <div className="stack">
      <div className="page-head workspace-page-head">
        <div>
          <span className="eyebrow"><span className="status-dot" /> THE SHOP WINDOW</span>
          <h1>Front page</h1>
          <p>
            Choose what people see first. These sit above everything else, in
            this order. Everything you do not pick still appears underneath,
            grouped into departments as usual.
          </p>
        </div>
        <div className="btn-row">
          {picked.length > 0 && <button className="btn" onClick={() => setChosen([])} disabled={busy}>Clear all</button>}
          <button className="btn primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : dirty ? 'Save the front page' : 'Saved'}
          </button>
        </div>
      </div>

      <NeedsADepartment products={products} departments={departments} onSaved={reload} />

      <div className="grid-2">
        <div className="card">
          <h3>Showing first {picked.length > 0 && <span className="muted">· {picked.length}</span>}</h3>
          {pickedProducts.length === 0 ? (
            <Empty
              title="Nothing picked yet"
              note="With nothing chosen, the front page arranges itself: products take turns between sellers and group into departments. Pick a few here to put them above all of that." />
          ) : (
            <ol className="pick-list">
              {pickedProducts.map((p, i) => (
                <li key={p.id} className="pick-row">
                  <span className="pick-pos">{i + 1}</span>
                  <Thumb p={p} />
                  <span className="pick-name">
                    <b>{p.name}</b>
                    <span className="tiny muted">{p.vendor_name || 'ZaMarket'} · {money(p.price)}</span>
                  </span>
                  <span className="btn-row">
                    <button type="button" className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`}>↑</button>
                    <button type="button" className="btn sm" onClick={() => move(i, 1)} disabled={i === pickedProducts.length - 1} aria-label={`Move ${p.name} down`}>↓</button>
                    <button type="button" className="btn sm danger" onClick={() => drop(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {dirty && <p className="tiny muted mt">Not saved yet.</p>}
        </div>

        <div className="card">
          <h3>Everything else</h3>
          <input
            className="input" value={find} onChange={(e) => setFind(e.target.value)}
            placeholder="Search by product, seller or category" aria-label="Search products" />
          {available.length === 0 ? (
            <p className="small muted mt">{needle ? 'Nothing matches that.' : 'Everything is already on the front page.'}</p>
          ) : (
            <ul className="pick-list mt">
              {available.slice(0, 60).map((p) => (
                <li key={p.id} className="pick-row">
                  <Thumb p={p} />
                  <span className="pick-name">
                    <b>{p.name}</b>
                    <span className="tiny muted">{p.vendor_name || 'ZaMarket'} · {p.category || 'Uncategorised'} · {money(p.price)}</span>
                  </span>
                  <button type="button" className="btn sm" onClick={() => add(p.id)}>Add</button>
                </li>
              ))}
            </ul>
          )}
          {available.length > 60 && <p className="tiny muted mt">Showing the first 60. Search to narrow it down.</p>}
        </div>
      </div>
    </div>
  )
}
