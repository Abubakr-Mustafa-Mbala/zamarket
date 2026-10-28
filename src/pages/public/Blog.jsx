import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/seo'
import { money, date } from '../../lib/format'
import { Loading } from '../../components/ui'
import Icon from '../../lib/icons'

// A very small markdown renderer. The blog is written by the marketplace team,
// not by the public, so this only has to handle what the editor produces —
// headings, paragraphs, lists, links, bold and quotes. No HTML is passed
// through, so a pasted <script> renders as text rather than running.
function Article({ body }) {
  const blocks = (body || '').split(/\n{2,}/)
  const inline = (t) => {
    const out = []
    const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
    let last = 0, m, k = 0
    while ((m = re.exec(t))) {
      if (m.index > last) out.push(t.slice(last, m.index))
      if (m[1]) {
        const href = m[2]
        out.push(href.startsWith('/')
          ? <Link key={k++} to={href}>{m[1]}</Link>
          : <a key={k++} href={href} target="_blank" rel="noreferrer nofollow">{m[1]}</a>)
      } else if (m[3]) out.push(<strong key={k++}>{m[3]}</strong>)
      else if (m[4]) out.push(<code key={k++}>{m[4]}</code>)
      last = m.index + m[0].length
    }
    if (last < t.length) out.push(t.slice(last))
    return out
  }

  // A heading and the paragraph under it are usually one block, because writers
  // press Enter once after a heading, not twice. Each block is therefore read
  // line by line rather than classified by its first character.
  const render = (block, key) => {
    const lines = block.split('\n').filter((l) => l.trim())
    const out = []
    let para = []
    let list = null

    const flushPara = () => {
      if (!para.length) return
      out.push(<p key={`${key}-p${out.length}`}>{inline(para.join(' '))}</p>)
      para = []
    }
    const flushList = () => {
      if (!list) return
      const Tag = list.kind === 'ol' ? 'ol' : 'ul'
      out.push(<Tag key={`${key}-l${out.length}`}>
        {list.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
      </Tag>)
      list = null
    }

    for (const raw of lines) {
      const l = raw.trim()
      const h = l.match(/^(#{1,3})\s+(.*)$/)
      const bullet = l.match(/^[-*]\s+(.*)$/)
      const numbered = l.match(/^\d+\.\s+(.*)$/)
      const quote = l.match(/^>\s+(.*)$/)

      if (h) {
        flushPara(); flushList()
        const Tag = h[1].length >= 3 ? 'h3' : 'h2'
        out.push(<Tag key={`${key}-h${out.length}`}>{inline(h[2])}</Tag>)
      } else if (bullet) {
        flushPara()
        if (!list || list.kind !== 'ul') { flushList(); list = { kind: 'ul', items: [] } }
        list.items.push(bullet[1])
      } else if (numbered) {
        flushPara()
        if (!list || list.kind !== 'ol') { flushList(); list = { kind: 'ol', items: [] } }
        list.items.push(numbered[1])
      } else if (quote) {
        flushPara(); flushList()
        out.push(<blockquote key={`${key}-q${out.length}`}>{inline(quote[1])}</blockquote>)
      } else {
        flushList()
        para.push(l)
      }
    }
    flushPara(); flushList()
    return out
  }

  return <div className="article">{blocks.map((b, i) => (b.trim() ? render(b, i) : null))}</div>
}

// The offerings the article is about. This is the reason the post exists: a
// reader who is convinced can act without leaving the page.
function BuyBlock({ offerings }) {
  if (!offerings?.length) return null
  return (
    <section className="post-buy">
      <h2>{offerings.length === 1 ? 'What this is about' : 'Everything in this article'}</h2>
      <div className="post-buy-grid">
        {offerings.map((o) => {
          const to = o.vendor_slug && o.slug ? `/${o.vendor_slug}/${o.slug}` : `/p/${o.slug}`
          const enquire = o.sales_model === 'negotiate' || o.sales_model === 'enquire'
          return (
            <Link key={o.id} to={to} className="pb-card">
              <span className="pb-pic">
                {o.image ? <img src={o.image} alt={o.name} loading="lazy" /> : <span className="ph" aria-hidden><Icon.box /></span>}
              </span>
              <span className="pb-body">
                <strong>{o.name}</strong>
                {o.vendor_name && <em>by {o.vendor_name}</em>}
                <span className="pb-foot">
                  <span className="pb-price">
                    {money(o.price)}
                    {o.normal_price && Number(o.normal_price) > Number(o.price) && <s>{money(o.normal_price)}</s>}
                  </span>
                  <span className="btn sm primary">{enquire ? 'Enquire' : 'View'}</span>
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export function BlogIndex() {
  useSeo({
    title: 'ZaMarket journal — buying guides for Lusaka',
    description: 'Straight answers about buying in Lusaka: what things cost, who sells them, and how delivery works. Written by the ZaMarket team.',
  })
  const [posts, setPosts] = useState(null)
  useEffect(() => {
    supabase.rpc('blog_index', { p_limit: 36, p_offset: 0 })
      .then(({ data, error }) => setPosts(error ? [] : (data || [])))
      .catch(() => setPosts([]))
  }, [])
  if (!posts) return <Loading shape="cards" />

  return (
    <div className="stack">
      <div className="crumbs"><Link to="/">Home</Link><span>Journal</span></div>
      <header className="blog-head">
        <h1>The ZaMarket journal</h1>
        <p>What things cost in Lusaka, who actually sells them, and how to get them delivered.</p>
      </header>

      {posts.length === 0 ? (
        <div className="empty-shop">
          <h2>Nothing published yet</h2>
          <p>The first guides are being written.</p>
          <Link to="/search" className="btn primary">Browse the shop instead</Link>
        </div>
      ) : (
        <div className="blog-grid">
          {posts.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="blog-card">
              <span className="bc-pic">
                {p.cover_url ? <img src={p.cover_url} alt="" loading="lazy" /> : <span className="ph" aria-hidden />}
              </span>
              <span className="bc-body">
                {p.category && <em className="bc-cat">{p.category}</em>}
                <strong>{p.title}</strong>
                {p.excerpt && <span className="bc-ex">{p.excerpt}</span>}
                <span className="bc-foot">
                  {p.published_at && <span>{date(p.published_at)}</span>}
                  {p.offerings > 0 && <span>{p.offerings} to buy</span>}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function BlogPost() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)

  useEffect(() => {
    if (!slug) return
    supabase.rpc('post_page', { p_slug: slug })
      .then(({ data, error }) => setPost(error ? { found: false } : (data || { found: false })))
      .catch(() => setPost({ found: false }))
    supabase.rpc('post_read', { p_slug: slug })
  }, [slug])

  useSeo(post?.found ? {
    title: post.meta_title || `${post.title} | ZaMarket`,
    description: post.meta_description || post.excerpt || '',
    image: post.cover_url || undefined,
    canonical: `/blog/${post.slug}`,
  } : {})

  // Article structured data, so Google can show this as a proper article
  // rather than guessing. Written straight into the page because the blog is
  // the one thing here that search engines are meant to read closely.
  useEffect(() => {
    if (!post?.found) return
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.meta_description || post.excerpt || undefined,
      image: post.cover_url || undefined,
      datePublished: post.published_at,
      author: { '@type': 'Organization', name: post.author || 'ZaMarket' },
      publisher: { '@type': 'Organization', name: 'ZaMarket' },
      mainEntityOfPage: `${window.location.origin}/blog/${post.slug}`,
    })
    document.head.appendChild(el)
    return () => { el.remove() }
  }, [post])

  if (!post) return <Loading shape="page" />
  if (!post.found) {
    return (
      <div className="empty-shop">
        <h2>We couldn't find that article</h2>
        <p>It may have been renamed.</p>
        <Link to="/blog" className="btn primary">All articles</Link>
      </div>
    )
  }

  return (
    <div className="stack post-page">
      <div className="crumbs">
        <Link to="/">Home</Link><Link to="/blog">Journal</Link><span>{post.title}</span>
      </div>

      <header className="post-head">
        {post.category && <em className="bc-cat">{post.category}</em>}
        <h1>{post.title}</h1>
        <p className="post-meta">
          {post.author}{post.published_at ? ` · ${date(post.published_at)}` : ''}
        </p>
      </header>

      {post.cover_url && (
        <div className="post-cover"><img src={post.cover_url} alt="" /></div>
      )}

      <Article body={post.body} />
      <BuyBlock offerings={post.offerings} />

      <section className="post-foot">
        <p>
          Every order on ZaMarket is confirmed by phone before you pay, delivered by us, and ours to
          put right if something goes wrong.
        </p>
        <div className="btn-row">
          <Link to="/search" className="btn primary">Browse the shop</Link>
          <Link to="/how-it-works" className="btn">How ZaMarket works</Link>
        </div>
      </section>
    </div>
  )
}
