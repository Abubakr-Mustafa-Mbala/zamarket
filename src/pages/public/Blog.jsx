import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/seo'
import { money, date } from '../../lib/format'
import { Loading } from '../../components/ui'
import Icon from '../../lib/icons'
import { safeArticleUrl, describeVideo } from '../../lib/blogMedia'
import { parseArticleHeading } from '../../lib/articleHeadings'
import { resolveJournalTheme, publishedJournalCategories } from '../../lib/journalTheme'
import { trackJournalEvent } from '../../lib/journalEvents'
import { useAuth } from '../../lib/auth'
import JournalCommunity from '../../components/JournalCommunity'

export const headingAnchor = (heading, index) => `${String(heading).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'}-${index}`
export function journalHeadings(body) {
  let index = 0
  return (body || '').split('\n').map(line => parseArticleHeading(line.trim()))
    .filter(Boolean).map(match => ({ id: headingAnchor(match[2], index++), title: match[2], level: match[1].length }))
}

// A very small markdown renderer. The blog is written by the marketplace team,
// not by the public, so this only has to handle what the editor produces —
// headings, paragraphs, lists, links, bold and quotes. No HTML is passed
// through, so a pasted <script> renders as text rather than running.
export function Article({ body }) {
  const blocks = (body || '').split(/\n{2,}/)
  let headingPosition = 0
  const inline = (t) => {
    const out = []
    const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
    let last = 0, m, k = 0
    while ((m = re.exec(t))) {
      if (m.index > last) out.push(t.slice(last, m.index))
      if (m[1]) {
        const href = safeArticleUrl(m[2])
        out.push(!href ? m[1] : href.startsWith('/')
          ? <Link key={k++} to={href}>{m[1]}</Link>
          : <a key={k++} href={href} target="_blank" rel="noopener noreferrer">{m[1]}</a>)
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
      const h = parseArticleHeading(l)
      const bullet = l.match(/^[-*]\s+(.*)$/)
      const numbered = l.match(/^\d+\.\s+(.*)$/)
      const quote = l.match(/^>\s+(.*)$/)
      const image = l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
      const video = l.match(/^\[video\]\(([^)\s]+)\)$/i)
      const imageUrl = image && safeArticleUrl(image[2])
      const videoInfo = video && describeVideo(video[1])

      if (imageUrl) {
        flushPara(); flushList()
        out.push(<figure className="article-media" key={`${key}-img${out.length}`}>
          <img src={imageUrl} alt={image[1] || 'Article image'} loading="lazy" decoding="async" />
          {image[1] && <figcaption>{image[1]}</figcaption>}
        </figure>)
      } else if (videoInfo) {
        flushPara(); flushList()
        out.push(<figure className="article-media article-video" key={`${key}-vid${out.length}`}>
          {videoInfo.kind === 'file'
            ? <video src={videoInfo.src} controls preload="metadata" playsInline aria-label="Article video" />
            : <iframe src={videoInfo.src} title={`${videoInfo.provider} video in article`} loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
        </figure>)
      } else if (h) {
        flushPara(); flushList()
        const Tag = h[1].length >= 3 ? 'h3' : 'h2'
        out.push(<Tag id={headingAnchor(h[2], headingPosition++)} key={`${key}-h${out.length}`}>{inline(h[2])}</Tag>)
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

  return <article className="article">{blocks.map((b, i) => (b.trim() ? render(b, i) : null))}</article>
}

// The offerings the article is about. This is the reason the post exists: a
// reader who is convinced can act without leaving the page.
function BuyBlock({ offerings, onProductClick }) {
  if (!offerings?.length) return null
  return (
    <section className="post-buy">
      <p className="post-section-kicker">DISCOVER THE PRODUCTS</p>
      <h2>Shop the story</h2>
      <p className="post-section-description">Explore the real ZaMarket listings featured in this article.</p>
      <div className="post-buy-grid">
        {offerings.map((o) => {
          const to = o.vendor_slug && o.slug ? `/${o.vendor_slug}/${o.slug}` : `/p/${o.slug}`
          const enquire = o.sales_model === 'negotiate' || o.sales_model === 'enquire'
          return (
            <Link key={o.id} to={to} className="pb-card" onClick={() => onProductClick?.()}>
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
    title: 'ZaMarket Journal — Local stories, guides and discoveries',
    description: 'Discover local Zambian businesses, practical buying guides, and products worth exploring through the ZaMarket Journal.',
  })
  const [posts, setPosts] = useState(null)
  const [category, setCategory] = useState('all')
  useEffect(() => {
    supabase.rpc('blog_index', { p_limit: 200, p_offset: 0 })
      .then(({ data, error }) => setPosts(error ? [] : (data || [])))
      .catch(() => setPosts([]))
  }, [])
  if (!posts) return <Loading shape="cards" />
  const categories = publishedJournalCategories(posts)
  const visible = category === 'all' ? posts : posts.filter(p => p.category === category)

  return (
    <div className="stack journal-index journal-index-2">
      <div className="crumbs"><Link to="/">Home</Link><span>Journal</span></div>
      <header className="blog-head">
        <span className="journal-eyebrow">THE JOURNAL <span aria-hidden="true">·</span> ZAMARKET</span>
        <h1>The ZaMarket Journal</h1>
        <p>Stories, guides and discoveries worth exploring. Get helpful buying advice, meet local businesses and find products you’ll love.</p>
      </header>

      {posts.length > 0 && <nav className="journal-category-nav" aria-label="Explore published Journal categories">
        <button type="button" className={category === 'all' ? 'selected' : ''} onClick={() => setCategory('all')}>All stories <span>{posts.length}</span></button>
        {categories.map(item => <button type="button" key={item.name} className={category === item.name ? 'selected' : ''}
          onClick={() => setCategory(item.name)}>{item.name} <span>{item.count}</span></button>)}
      </nav>}
      {posts.length === 0 ? (
        <div className="empty-shop">
          <h2>Nothing published yet</h2>
          <p>The first guides are being written.</p>
          <Link to="/search" className="btn primary">Browse the shop instead</Link>
        </div>
      ) : (
        <div className={`blog-grid${visible.length === 1 ? ' blog-grid-single' : ''}`}>
          {visible.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="blog-card">
              <span className="bc-pic">
                {p.cover_url ? <img src={p.cover_url} alt={p.title} loading="lazy" /> : <span className="ph" aria-hidden />}
              </span>
              <span className="bc-body">
                {p.category && <em className="bc-cat">{p.category}</em>}
                <strong>{p.title}</strong>
                {p.excerpt && <span className="bc-ex">{p.excerpt}</span>}
                <span className="bc-foot">
                  {p.published_at && <span>{date(p.published_at)}</span>}
                  {p.offerings > 0 && <span>{p.offerings} to buy</span>}
                </span>
                <span className="bc-read">Read the story <span aria-hidden="true">→</span></span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// Sharing an article.
//
// This sits on the public page on purpose. Anyone reading can share it —
// a customer, an affiliate, a vendor, or the owner. Nobody has to sign in,
// and there is no separate "marketing" version of this.
//
// A pasted blog link is a grey rectangle in WhatsApp that nobody opens, so
// the picture is the point: cover photo, headline, address underneath. The
// three shapes are the three places people actually post to.
function ShareArticle({ post, onShare }) {
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const link = `https://zamarket.shop/blog/${post.slug}`
  const caption = `${post.title}\n\n${post.excerpt || ''}\n\n${link}`.replace(/\n{3,}/g, '\n\n')

  const picture = async (shape) => {
    onShare?.()
    setBusy(shape); setNote('')
    try {
      const { articleCard, sharePicture } = await import('../../lib/shareCard')
      const blob = await articleCard({ post, link, shape })
      const how = await sharePicture(blob, { caption, filename: `${post.slug}-${shape}.jpg` })
      setNote(how === 'shared' ? '' : 'Picture saved. Post it with the words below.')
    } catch {
      setNote('That did not work on this device. You can still copy the link.')
    }
    setBusy('')
  }

  const copy = async () => {
    onShare?.()
    try { await navigator.clipboard.writeText(caption); setNote('Copied. Paste it anywhere.') }
    catch { setNote('Copying is blocked here — select the link above instead.') }
  }

  return (
    <section className="post-share" aria-label="Share this article">
      <h2>Share this</h2>
      <p className="small muted">
        Make a picture for WhatsApp status, Instagram or Facebook. The words
        and the link come with it.
      </p>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => picture('story')} disabled={!!busy}>
          {busy === 'story' ? 'Making…' : 'Status / story picture'}
        </button>
        <button type="button" className="btn" onClick={() => picture('post')} disabled={!!busy}>
          {busy === 'post' ? 'Making…' : 'Feed post picture'}
        </button>
        <a className="btn" target="_blank" rel="noopener noreferrer"
           onClick={() => onShare?.()} href={`https://wa.me/?text=${encodeURIComponent(caption)}`}>Send on WhatsApp</a>
        <a className="btn" target="_blank" rel="noopener noreferrer"
           onClick={() => onShare?.()} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}>Facebook</a>
        <button type="button" className="btn" onClick={copy}>Copy words and link</button>
      </div>
      {note && <p className="tiny muted mt" role="status">{note}</p>}
      <p className="tiny muted mt">
        Instagram has no share link, so use the picture: save it, then post it
        from the Instagram app and paste the words there.
      </p>
    </section>
  )
}

export function BlogPost() {
  const { slug } = useParams()
  const { isStaff } = useAuth()
  const [searchParams] = useSearchParams()
  const [post, setPost] = useState(null)
  const [editorial, setEditorial] = useState({})
  const printMode = isStaff && searchParams.get('export') === 'pdf' 

  useEffect(() => {
    if (!slug) return
    setPost(null)
    setEditorial({})
    supabase.rpc('journal_public_meta', { p_slug: slug }).then(({ data }) => setEditorial(data || {})).catch(() => {})
    supabase.rpc('post_page', { p_slug: slug })
      .then(({ data, error }) => setPost(error ? { found: false } : (data || { found: false })))
      .catch(() => setPost({ found: false }))
    supabase.rpc('post_read', { p_slug: slug })
  }, [slug])

  useEffect(() => {
    if (!post?.found) return
    let ready = false
    let sent = false
    const check = () => {
      const article = document.getElementById('journal-reading-body')
      if (!article || !ready || sent || document.visibilityState !== 'visible') return
      const rect = article.getBoundingClientRect()
      const passed = rect.top + rect.height * .58 < window.innerHeight
      if (passed) { sent = true; trackJournalEvent(post.slug, 'engaged_read') }
    }
    const timer = setTimeout(() => { ready = true; check() }, 18000)
    window.addEventListener('scroll', check, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('scroll', check) }
  }, [post?.slug, post?.found])

  useSeo(post?.found ? {
    title: post.meta_title || `${post.title} | ZaMarket`,
    description: post.meta_description || post.excerpt || '',
    image: post.cover_url || undefined,
    // Absolute, because og:url is built from this too and WhatsApp will not
    // resolve a relative path when it builds the link preview.
    canonical: `https://zamarket.shop/blog/${post.slug}`,
  } : post ? { noIndex: true } : {})

  // Article structured data, so Google can show this as a proper article
  // rather than guessing. Written straight into the page because the blog is
  // the one thing here that search engines are meant to read closely.
  useEffect(() => {
    if (!post?.found) return
    const el = document.head.querySelector('script[data-zm-page-article]') ||
      document.head.querySelector('script[data-zm-edge-jsonld]') || document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute('data-zm-page-article', 'true')
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.meta_description || post.excerpt || undefined,
      image: post.cover_url || undefined,
      datePublished: post.published_at,
      author: { '@type': 'Organization', name: post.author || 'ZaMarket' },
      publisher: { '@type': 'Organization', name: 'ZaMarket' },
      mainEntityOfPage: `https://zamarket.shop/blog/${post.slug}`,
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

  const theme = resolveJournalTheme(post.category, editorial.theme)
  const headings = journalHeadings(post.body).filter(h => h.level < 3)
  const vendor = editorial.vendor || (post.offerings || []).find(o => o.vendor_name && o.vendor_slug)
  const vendorName = vendor?.name || vendor?.vendor_name
  const vendorSlug = vendor?.slug || vendor?.vendor_slug
  const onTrackProduct = () => trackJournalEvent(post.slug, 'product_click')
  const onTrackShare = () => trackJournalEvent(post.slug, 'share_click')
  return (
    <div className={`stack post-page journal-article-v2 journal-theme-${theme}${printMode ? ' journal-print-mode' : ''}`}>
      {printMode && <div className="journal-export-toolbar">
        <span>Admin document export · Choose “Save as PDF” in the print dialog.</span>
        <button type="button" className="btn primary" onClick={() => window.print()}>Save as PDF</button>
      </div>}
      <div className="crumbs">
        <Link to="/">Home</Link><Link to="/blog">Journal</Link><span>{post.title}</span>
      </div>

      <div className="journal-feature-hero">
        <header className="post-head">
          <div className="post-overline"><span>ZAMARKET / JOURNAL</span>{post.category && <em className="bc-cat">{post.category}</em>}</div>
          <h1>{post.title}</h1>
          {post.excerpt && <p className="journal-story-deck">{post.excerpt}</p>}
          <div className="post-meta"><span>By {post.author || 'ZaMarket Journal'}</span>
            {post.published_at && <span>{date(post.published_at)}</span>}
            <span>{Math.max(1, Math.ceil((post.body || '').trim().split(/\s+/).filter(Boolean).length / 220))} min read</span>
          </div>
          {vendorName && <div className="journal-vendor-attribution">
            <span className="journal-vendor-mark">{vendor?.logo && <img src={vendor.logo} alt="" />}{!vendor?.logo && <Icon.book />}</span>
            <span><small>FEATURED LOCAL STORE</small><strong>{vendorName}</strong></span>
            {vendorSlug && <Link to={`/${vendorSlug}`}>Explore store <Icon.arrow /></Link>}
          </div>}
        </header>
        {post.cover_url && <div className="post-cover"><img src={post.cover_url} alt={post.title} fetchPriority="high" /></div>}
      </div>
      <div className="journal-reading-sheet">
        <div className="journal-reading-tools">
          <span>THE STORY <span aria-hidden="true">·</span> {Math.max(1, Math.ceil((post.body || '').trim().split(/\s+/).filter(Boolean).length / 220))} MIN READ</span>
          <div><a href="#journal-comments">Join the conversation</a><a href="#journal-share">Share story</a></div>
        </div>
        <div className="journal-reading-layout">
          <div id="journal-reading-body" className="journal-story-text"><Article body={post.body} /></div>
          {headings.length >= 3 && <aside className="journal-toc" aria-label="On this page">
            <strong>IN THIS STORY</strong>
            {headings.slice(0, 8).map(item => <a key={item.id} href={`#${item.id}`}>{item.title}</a>)}
          </aside>}
        </div>
        <BuyBlock offerings={post.offerings} onProductClick={onTrackProduct} />
        <JournalCommunity slug={post.slug} />
        <div id="journal-share"><ShareArticle post={post} onShare={onTrackShare} /></div>
      </div>

      <section className="post-foot">
        <p>
          Find useful local products, read genuine seller stories, and explore the offerings connected to each article.
        </p>
        <div className="btn-row">
          <Link to="/search" className="btn primary">Browse the shop</Link>
          <Link to="/how-it-works" className="btn">How ZaMarket works</Link>
        </div>
      </section>
    </div>
  )
}
