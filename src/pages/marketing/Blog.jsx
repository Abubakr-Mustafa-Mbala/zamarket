import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { date } from '../../lib/format'
import { scoreDraft, LEVELS } from '../../lib/seoScore'
import { planKeywords, verifySteps, outlineFor } from '../../lib/keywordPlanner'
import { Field, Input, Textarea, Loading, Problem, Modal, useToast, Stat } from '../../components/ui'
import Icon from '../../lib/icons'

const empty = {
  title: '', body: '', excerpt: '', keyword: '', secondary_keywords: [],
  meta_title: '', meta_description: '', category: '', cover_url: '', status: 'draft',
}

// ---------------------------------------------------------------------------
// The coach. It sits beside the draft and updates as you type, so the rules are
// learned by writing rather than by reading a guide once and forgetting it.
// ---------------------------------------------------------------------------
function Coach({ draft, linked }) {
  const result = useMemo(() => scoreDraft({
    title: draft.title,
    slug: draft.slug || '',
    body: draft.body,
    metaTitle: draft.meta_title,
    metaDescription: draft.meta_description,
    keyword: draft.keyword,
    secondary: draft.secondary_keywords || [],
    linkedOfferings: linked,
  }), [draft, linked])

  const tone = result.failing > 0 ? 'bad' : result.score >= 80 ? 'ok' : 'warn'
  const order = { [LEVELS.FAIL]: 0, [LEVELS.WARN]: 1, [LEVELS.PASS]: 2 }
  const sorted = [...result.checks].sort((a, b) => order[a.level] - order[b.level])

  return (
    <aside className="coach">
      <div className={`coach-head ${tone}`}>
        <span className="coach-score">{result.score}</span>
        <span className="coach-band">
          <strong>{result.band}</strong>
          <em>{result.stats.total} words{draft.keyword ? ` · ${result.stats.count} mentions` : ''}</em>
        </span>
      </div>

      <ul className="coach-list">
        {sorted.map((c) => (
          <li key={c.id} className={c.level}>
            <span className="coach-icon" aria-hidden>
              {c.level === LEVELS.PASS ? <Icon.check /> : c.level === LEVELS.WARN ? <Icon.info /> : '!'}
            </span>
            <span>
              <strong>{c.label}</strong>
              <em>{c.detail}</em>
            </span>
          </li>
        ))}
      </ul>

      <div className="coach-note">
        <strong>Why there is no density target</strong>
        <p>
          Repeating a phrase does not make Google rank you, and it has not for years. The checks above
          care about where the phrase sits and whether the article really answers the question. The
          only reason repetition is measured at all is to catch stuffing.
        </p>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// What to write about, built from the real catalogue.
// ---------------------------------------------------------------------------
function Ideas({ products, onPick }) {
  const [open, setOpen] = useState(null)
  const ideas = useMemo(() => planKeywords(products, { limit: 30 }), [products])
  if (!products.length) {
    return <p className="small muted">Publish an offering first — the ideas here are built from what you actually sell.</p>
  }
  return (
    <div className="ideas">
      <p className="small muted">
        Built from your own offerings and ranked by how winnable each looks for a new site.
        These are not search volumes — nobody gives those away free. Check the ones you like
        with the three steps inside, then write.
      </p>
      <ul className="idea-list">
        {ideas.map((k) => (
          <li key={k.phrase}>
            <button type="button" className="idea-row" onClick={() => setOpen(k)}>
              <span className={`idea-score ${k.score >= 70 ? 'ok' : k.score >= 50 ? 'warn' : 'bad'}`}>{k.score}</span>
              <span className="idea-text">
                <strong>{k.phrase}</strong>
                <em>{k.difficulty} · {k.kind} · {k.offerings.length} offering{k.offerings.length === 1 ? '' : 's'} fit</em>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <Modal title={open.phrase} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="row">
              <span className={`idea-score ${open.score >= 70 ? 'ok' : 'warn'}`}>{open.score}</span>
              <strong>{open.difficulty}</strong>
            </div>
            <ul className="tp-facts">{open.reasons.map((r) => <li key={r}>{r}</li>)}</ul>

            <h4>Check it before you write — ten minutes, no paid tool</h4>
            <ol className="coach-steps">
              {verifySteps(open.phrase).map((s) => (
                <li key={s.what}><strong>{s.what}</strong><span>{s.how}</span></li>
              ))}
            </ol>

            <h4>A shape that works</h4>
            <ol className="coach-steps">
              {outlineFor(open).map((l) => <li key={l}><span>{l}</span></li>)}
            </ol>

            <button className="btn primary" onClick={() => { onPick(open); setOpen(null) }}>
              Start a post for this
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function Editor({ post, products, onClose, onSaved }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [f, setF] = useState({ ...empty, ...post, secondary_keywords: post?.secondary_keywords || [] })
  const [linked, setLinked] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    if (!post?.id) return
    supabase.from('post_products').select('product_id,sort').eq('post_id', post.id)
      .then(({ data }) => setLinked((data || []).sort((a, b) => a.sort - b.sort).map((r) => r.product_id)))
  }, [post?.id])

  const save = async (status) => {
    if (!f.title.trim()) return toast('Give it a title first', true)
    setBusy(true)
    const result = scoreDraft({
      title: f.title, slug: f.slug || '', body: f.body, metaTitle: f.meta_title,
      metaDescription: f.meta_description, keyword: f.keyword,
      secondary: f.secondary_keywords, linkedOfferings: linked.length,
    })
    const row = {
      title: f.title, body: f.body, excerpt: f.excerpt, keyword: f.keyword || null,
      secondary_keywords: f.secondary_keywords, meta_title: f.meta_title || null,
      meta_description: f.meta_description || null, category: f.category || null,
      cover_url: f.cover_url || null, status, seo_score: result.score,
      author_id: profile?.id || null,
    }
    const q = post?.id
      ? supabase.from('posts').update(row).eq('id', post.id).select('id').maybeSingle()
      : supabase.from('posts').insert(row).select('id').maybeSingle()
    const { data, error } = await q
    if (error) { setBusy(false); return toast(error.message, true) }

    const id = data?.id || post?.id
    if (id) {
      await supabase.from('post_products').delete().eq('post_id', id)
      if (linked.length) {
        await supabase.from('post_products').insert(linked.map((pid, i) => ({ post_id: id, product_id: pid, sort: i })))
      }
    }
    setBusy(false)
    toast(status === 'published' ? 'Published' : 'Saved as a draft')
    onSaved()
  }

  const toggle = (id) => setLinked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  return (
    <div className="blog-editor">
      <div className="page-head">
        <div>
          <h1>{post?.id ? 'Edit post' : 'New post'}</h1>
          <p>Write for one question a customer actually asks. The checker on the right explains itself.</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={onClose}>Back</button>
          <button className="btn" disabled={busy} onClick={() => save('draft')}>Save draft</button>
          <button className="btn primary" disabled={busy} onClick={() => save('published')}>
            {busy ? 'Saving…' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="blog-split">
        <div className="stack">
          <Field label="The phrase this post is for" hint="What someone types into Google. Everything is measured against this.">
            <Input value={f.keyword} onChange={set('keyword')} placeholder="where to buy packed lunches in Lusaka" />
          </Field>
          <Field label="Title" hint="Put the phrase in it, near the start if it reads naturally.">
            <Input value={f.title} onChange={set('title')} />
          </Field>
          <Field label="The article" hint="Markdown. ## makes a subheading. [words](/search) links to a page on ZaMarket.">
            <Textarea value={f.body} onChange={set('body')} rows={20} />
          </Field>
          <Field label="Short summary" hint="Shown on the blog index.">
            <Textarea value={f.excerpt} onChange={set('excerpt')} rows={2} />
          </Field>

          <section className="card stack-sm">
            <h3>What a reader can buy at the end</h3>
            <p className="small muted">
              Attach the offerings this post is about. Without them the article sends a ready buyer
              somewhere else.
            </p>
            <div className="link-grid">
              {products.map((p) => (
                <button type="button" key={p.id}
                  className={`link-pick ${linked.includes(p.id) ? 'on' : ''}`}
                  onClick={() => toggle(p.id)}>
                  {p.images?.[0] && <img src={p.images[0]} alt="" loading="lazy" />}
                  <span>
                    <strong>{p.name}</strong>
                    <em>{p.vendor_name || 'ZaMarket'}</em>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="card stack-sm">
            <h3>How it looks in Google</h3>
            <div className="serp">
              <div className="serp-url">zamarket · /blog/{(f.slug || f.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}</div>
              <div className="serp-title">{f.meta_title || f.title || 'Your title here'}</div>
              <div className="serp-desc">{f.meta_description || f.excerpt || 'Your description here.'}</div>
            </div>
            <Field label="Search title" hint="About 60 characters. Can differ from the headline.">
              <Input value={f.meta_title} onChange={set('meta_title')} />
            </Field>
            <Field label="Search description" hint="About 155 characters. This decides who clicks.">
              <Textarea value={f.meta_description} onChange={set('meta_description')} rows={2} />
            </Field>
          </section>
        </div>

        <Coach draft={f} linked={linked.length} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function Blog() {
  const [report, setReport] = useState(null)
  const [products, setProducts] = useState([])
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('posts')

  const load = () => {
    setError(null)
    supabase.rpc('blog_report').then(({ data, error: e }) => {
      if (e) return setError(e)
      setReport(data)
    })
    supabase.from('public_products').select('id,name,images,vendor_name,category,fulfilment,offering_type')
      .then(({ data }) => setProducts(data || []))
  }
  useEffect(load, [])

  if (error) return <Problem error={error} onRetry={load} what="the blog" />
  if (!report) return <Loading shape="page" />

  if (editing) {
    return <Editor post={editing.id ? editing : editing} products={products}
      onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
  }

  const posts = report.posts || []

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Blog</h1>
          <p>Articles that answer what people search for, each one ending at something they can buy.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ ...empty })}>Write a post</button>
      </div>

      <div className="stats-row">
        <Stat label="Published" value={report.published} />
        <Stat label="Drafts" value={report.drafts} />
        <Stat label="Reads" value={report.views} />
      </div>

      <div className="chips wrap">
        <button className={`chip ${tab === 'posts' ? 'on' : ''}`} onClick={() => setTab('posts')}>Posts</button>
        <button className={`chip ${tab === 'ideas' ? 'on' : ''}`} onClick={() => setTab('ideas')}>What to write about</button>
      </div>

      {tab === 'ideas' ? (
        <Ideas products={products} onPick={(k) => setEditing({
          ...empty,
          keyword: k.phrase,
          title: k.phrase.replace(/\b\w/g, (c) => c.toUpperCase()),
        })} />
      ) : posts.length === 0 ? (
        <div className="empty-shop">
          <h2>No posts yet</h2>
          <p>One article answering a real question will do more in your first week than ten that answer nothing.</p>
          <button className="btn primary" onClick={() => setTab('ideas')}>See what to write about</button>
        </div>
      ) : (
        <ul className="post-list">
          {posts.map((p) => (
            <li key={p.id}>
              <button type="button" className="post-row" onClick={() => loadOne(p, setEditing)}>
                <span className={`post-score ${p.seo_score >= 80 ? 'ok' : p.seo_score >= 50 ? 'warn' : 'bad'}`}>
                  {p.seo_score ?? '—'}
                </span>
                <span className="post-main">
                  <strong>{p.title}</strong>
                  <em>
                    {p.status === 'published' ? `Published ${date(p.published_at)}` : 'Draft'}
                    {p.keyword ? ` · for "${p.keyword}"` : ' · no phrase chosen'}
                    {` · ${p.offerings} offering${p.offerings === 1 ? '' : 's'}`}
                  </em>
                </span>
                <span className="post-views">{p.views} read{p.views === 1 ? '' : 's'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

async function loadOne(p, setEditing) {
  const { data } = await supabase.from('posts').select('*').eq('id', p.id).maybeSingle()
  setEditing(data || p)
}
