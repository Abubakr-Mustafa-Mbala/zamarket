import { useEffect, useMemo, useRef, useState } from 'react'
import '../../ai-blog.css'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { date } from '../../lib/format'
import { scoreDraft, LEVELS } from '../../lib/seoScore'
import { planKeywords, verifySteps, outlineFor } from '../../lib/keywordPlanner'
import { Field, Input, Textarea, Loading, Problem, Modal, useToast, Stat } from '../../components/ui'
import Icon from '../../lib/icons'
import BlogMediaTools from '../../components/BlogMediaTools'
import { Article } from '../public/Blog'
import { Link } from 'react-router-dom'
import { JOURNAL_THEMES, resolveJournalTheme } from '../../lib/journalTheme'
import JournalFounderPanel from '../../components/JournalFounderPanel'

const empty = {
  title: '', body: '', excerpt: '', keyword: '', secondary_keywords: [],
  meta_title: '', meta_description: '', category: '', cover_url: '', status: 'draft',
  reading_theme: 'auto', featured_vendor_id: null,
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
function Editor({ post, products, onClose, onSaved, onRequestDelete }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [f, setF] = useState({ ...empty, ...post, secondary_keywords: post?.secondary_keywords || [] })
  const [linked, setLinked] = useState([])
  const linkedVendors = useMemo(() => {
    const unique = new Map()
    for (const product of products) if (product.vendor_id && linked.includes(product.id)) unique.set(product.vendor_id, product.vendor_name)
    return [...unique.entries()]
  }, [products, linked])
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiInstructions, setAiInstructions] = useState('')
  const [aiChecks, setAiChecks] = useState([])
  const [preview, setPreview] = useState(false)
  const bodyRef = useRef(null)
  const insertMedia = (snippet) => {
    const el = bodyRef.current
    const current = f.body || ''
    const pos = el ? el.selectionStart : current.length
    const before = current.slice(0, pos)
    const after = current.slice(pos)
    const prefix = before && !before.endsWith('\n') ? '\n\n' : ''
    const suffix = after && !after.startsWith('\n') ? '\n\n' : '\n'
    const newPos = (before + prefix + snippet).length
    setF(x => ({ ...x, body: before + prefix + snippet + suffix + after }))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(newPos, newPos) })
  }
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
      reading_theme: f.reading_theme || 'auto',
      featured_vendor_id: f.featured_vendor_id || null,
      author_id: profile?.id || null,
    }
    const q = post?.id
      ? supabase.from('posts').update(row).eq('id', post.id).select('id,slug').maybeSingle()
      : supabase.from('posts').insert(row).select('id,slug').maybeSingle()
    const { data, error } = await q
    if (error) { setBusy(false); return toast(error.message, true) }

    const id = data?.id || post?.id
    if (id) {
      const { error: unlinkError } = await supabase.from('post_products').delete().eq('post_id', id)
      if (unlinkError) { setBusy(false); return toast('The article saved, but its linked products could not be updated: ' + unlinkError.message, true) }
      if (linked.length) {
        const { error: linkError } = await supabase.from('post_products').insert(linked.map((pid, i) => ({ post_id: id, product_id: pid, sort: i })))
        if (linkError) { setBusy(false); return toast('The article saved, but product linking failed: ' + linkError.message, true) }
      }
    }
    // IndexNow is optional. Submission failure never undoes a successful publish.
    // Google is notified separately through the sitemap/Search Console.
    if (status === 'published' && (data?.slug || post?.slug)) {
      try {
        const session = await supabase.auth.getSession()
        const token = session.data?.session?.access_token
        if (token) {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 4000)
          try {
            await fetch('/.netlify/functions/indexnow', {
              method: 'POST',
              headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ path: `/blog/${data?.slug || post.slug}` }),
              signal: controller.signal,
            })
          } finally { clearTimeout(timeout) }
        }
      } catch { /* IndexNow may be unconfigured; published article remains live. */ }
    }
    setBusy(false)
    toast(status === 'published' ? 'Published' : 'Saved as a draft')
    onSaved()
  }

  const toggle = (id) => setLinked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))

  // AI writes locally into the editor; only a human can save or publish.
  const askAi = async (mode) => {
    if (aiBusy || busy) return
    if (mode === 'draft' && !f.keyword?.trim() && !f.title?.trim()) {
      toast('Enter the topic or keyword first', true); return
    }
    if (mode === 'improve' && (f.body || '').trim().length < 100) {
      toast('Write a paragraph first, then choose Improve', true); return
    }
    if (mode === 'draft' && f.body?.trim() &&
      !window.confirm('Replace the current unsaved article text with a new AI draft? Save your work first if you want to keep it.')) return
    setAiBusy(true)
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (sessionError || !token) throw new Error('Please sign in again to use the AI writer.')
      const result = await fetch('/.netlify/functions/ai-blog', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode, keyword: f.keyword, title: f.title, body: f.body,
          instructions: aiInstructions, audience: 'People buying in Lusaka, Zambia',
          product_ids: linked,
        }),
      })
      const response = await result.json().catch(() => ({}))
      if (!result.ok) throw new Error(response.message || 'Could not generate an article')
      if (!response.draft?.body) throw new Error('The AI returned an empty draft')
      setF(old => ({ ...old, title: response.draft.title || old.title,
        body: response.draft.body, excerpt: response.draft.excerpt || old.excerpt,
        keyword: response.draft.keyword || old.keyword,
        meta_title: response.draft.meta_title || old.meta_title,
        meta_description: response.draft.meta_description || old.meta_description,
        category: response.draft.category || old.category,
      }))
      setAiChecks(response.draft.fact_checks || [])
      setPreview(false)
      toast('AI draft added to the editor. Please verify it before publishing.')
    } catch (error) { toast(error.message, true) }
    finally { setAiBusy(false) }
  }

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
          {post?.slug && post?.status === 'published' && <Link to={`/blog/${post.slug}?export=pdf`}
            target="_blank" rel="noopener noreferrer" className="btn" title="Open a print-ready document, then save as PDF">Export PDF</Link>}
          {post?.id && (
            <button type="button" className="btn danger" disabled={busy || aiBusy}
              onClick={() => onRequestDelete({ id: post.id, title: f.title, status: f.status })}>
              Delete article
            </button>
          )}
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
          <section className="card stack-sm ai-blog-assistant" aria-label="AI Blog Writer">
            <div className="between wrap">
              <div>
                <h3><Icon.sparkles /> AI Blog Writer</h3>
                <p className="small muted">Draft helpful, natural articles using your chosen topic and linked ZaMarket products.</p>
              </div>
              <span className="small ai-blog-status">Human reviewed · Never auto-published</span>
            </div>
            <Field label="Brief for the AI" hint="Optional. Describe the angle, audience, unique facts, tone, or questions to answer. Do not paste private customer details.">
              <Textarea value={aiInstructions} onChange={setAiInstructions} rows={3}
                placeholder="E.g. Explain how a small Lusaka restaurant should choose a commercial fryer. Give practical buying advice, not advertising hype." />
            </Field>
            <div className="btn-row wrap">
              <button type="button" className="btn primary" disabled={busy || aiBusy} onClick={() => askAi('draft')}>
                {aiBusy ? 'Writing…' : 'Generate article draft'}
              </button>
              <button type="button" className="btn" disabled={busy || aiBusy || !(f.body || '').trim()} onClick={() => askAi('improve')}>
                Improve my writing
              </button>
            </div>
            <p className="small muted">Select relevant catalogue products below before generating if you want the writer to use verified ZaMarket details. An OpenAI API key and the staff-only quota migration must be configured in Netlify/Supabase. Results are editable and never automatically saved.</p>
            {aiChecks.length > 0 && <div className="ai-blog-checks" role="note">
              <strong>Verify before publishing</strong>
              <ul>{aiChecks.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </div>}
          </section>
          <BlogMediaTools onInsert={insertMedia} onCover={set('cover_url')} fallbackAlt={f.title} notify={toast} />
          <section className="card stack-sm">
            <div className="between">
              <strong>Article content</strong>
              <div className="btn-row">
                <button type="button" className={`btn sm ${!preview ? 'primary' : ''}`} onClick={() => setPreview(false)}>Write</button>
                <button type="button" className={`btn sm ${preview ? 'primary' : ''}`} onClick={() => setPreview(true)}>Preview</button>
              </div>
            </div>
            {preview ? <div className="blog-editor-preview"><Article body={f.body} /></div> : (
              <Field label="The article" hint="Markdown: ## heading, ![description](image URL), [video](YouTube/MP4 URL), [words](/search) for internal links.">
                <Textarea ref={bodyRef} value={f.body} onChange={set('body')} rows={20} />
              </Field>
            )}
          </section>
          <Field label="Cover image URL" hint="Upload a cover above, or paste an image URL. Give article images descriptive captions.">
            <Input type="url" value={f.cover_url} onChange={set('cover_url')} placeholder="https://..." />
          </Field>
          {f.cover_url && <img className="blog-cover-preview" src={f.cover_url} alt="Article cover preview" />}
          <Field label="Category">
            <Input value={f.category} onChange={set('category')} placeholder="e.g. Buying guides" />
          </Field>
          <Field label="Short summary" hint="Shown on the blog index.">
            <Textarea value={f.excerpt} onChange={set('excerpt')} rows={2} />
          </Field>
          <section className="card stack-sm journal-editor-settings">
            <h3>Journal presentation</h3>
            <p className="small muted">Choose how this story feels. Automatic uses warm ivory for food, quiet sage for home and bedding, and soft stone for equipment. The rest of ZaMarket stays unchanged.</p>
            <Field label="Reading palette">
              <select className="input" value={f.reading_theme || 'auto'} onChange={e => setF(x => ({ ...x, reading_theme: e.target.value }))}>
                {JOURNAL_THEMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className={`journal-theme-chip journal-theme-${resolveJournalTheme(f.category, f.reading_theme)}`}>
              <strong>Reading preview</strong><span>Comfortable text, consistent headings and a calm background for this category.</span>
            </div>
            <Field label="Featured vendor" hint="Shown by name and storefront link near the article title. Choose a seller associated with a linked product.">
              <select className="input" value={f.featured_vendor_id || ''} onChange={e => setF(x => ({ ...x, featured_vendor_id: e.target.value || null }))}>
                <option value="">Automatically feature the first linked vendor</option>
                {linkedVendors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
          </section>

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


function DeletePostDialog({ post, busy, confirmation, onConfirmation, onClose, onDelete }) {
  if (!post) return null
  return (
    <Modal title="Delete this article?" onClose={busy ? () => {} : onClose}>
      <div className="stack-sm">
        <p><strong>{post.title}</strong></p>
        <p className="small">This permanently removes the {post.status === 'published' ? 'published' : 'saved'} article from ZaMarket.
          Its public link and linked-product cards will no longer work. Uploaded media files are not deleted.</p>
        <p className="small muted">This cannot be undone. Type DELETE below to confirm.</p>
        <Field label="Confirmation">
          <Input value={confirmation} onChange={onConfirmation} placeholder="Type DELETE" autoComplete="off" />
        </Field>
        <div className="btn-row wrap">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Keep article</button>
          <button type="button" className="btn danger" disabled={busy || confirmation !== 'DELETE'} onClick={onDelete}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
export default function Blog() {
  const [report, setReport] = useState(null)
  const [products, setProducts] = useState([])
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('posts')
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const toast = useToast()

  const requestDelete = (post) => {
    if (!post?.id) return
    setDeleteText('')
    setDeleting({ id: post.id, title: post.title, status: post.status })
  }

  const removePost = async () => {
    if (!deleting?.id || deleteBusy || deleteText !== 'DELETE') return
    setDeleteBusy(true)
    try {
      // Database RLS limits deletion to authorised marketing staff. Related
      // post_products rows are removed by their existing ON DELETE CASCADE FK.
      const { data, error: deletionError } = await supabase.from('posts')
        .delete().eq('id', deleting.id).select('id')
      if (deletionError) throw deletionError
      if (!data?.length) throw new Error('Article was not deleted. Check your permissions or reload the list.')
      toast('Article deleted')
      setDeleting(null)
      setEditing(null)
      load()
    } catch (error) {
      toast(error.message || 'Unable to delete this article', true)
    } finally {
      setDeleteBusy(false)
    }
  }

  const load = () => {
    setError(null)
    supabase.rpc('blog_report').then(({ data, error: e }) => {
      if (e) return setError(e)
      setReport(data)
    })
    supabase.from('public_products').select('id,name,images,vendor_id,vendor_name,category,fulfilment,offering_type')
      .then(({ data }) => setProducts(data || []))
  }
  useEffect(load, [])

  if (error) return <Problem error={error} onRetry={load} what="the blog" />
  if (!report) return <Loading shape="page" />

  if (editing) {
    return <>
      <Editor post={editing} products={products} onRequestDelete={requestDelete}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      <DeletePostDialog post={deleting} busy={deleteBusy} confirmation={deleteText}
        onConfirmation={setDeleteText} onClose={() => setDeleting(null)} onDelete={removePost} />
    </>
  }

  const posts = report.posts || []

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Blog</h1>
          <p>Articles that answer what people search for, each one ending at something they can buy.</p>
        </div>
        <div className="btn-row"><Link className="btn" to="/admin/marketing/launch">Promote an article</Link><button className="btn primary" onClick={() => setEditing({ ...empty })}>Write a post</button></div>
      </div>

      <div className="stats-row">
        <Stat label="Published" value={report.published} />
        <Stat label="Drafts" value={report.drafts} />
        <Stat label="Reads" value={report.views} />
      </div>

      <JournalFounderPanel />

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
            <li key={p.id} className="post-list-entry">
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
              <button type="button" className="btn danger sm blog-delete-list" onClick={() => requestDelete(p)}
                aria-label={`Delete article: ${p.title}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <DeletePostDialog post={deleting} busy={deleteBusy} confirmation={deleteText}
        onConfirmation={setDeleteText} onClose={() => setDeleting(null)} onDelete={removePost} />
    </div>
  )
}

async function loadOne(p, setEditing) {
  const { data } = await supabase.from('posts').select('*').eq('id', p.id).maybeSingle()
  setEditing(data || p)
}
