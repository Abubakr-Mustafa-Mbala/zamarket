import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { date } from '../lib/format'
import Icon from '../lib/icons'

// Public, published-only homepage preview. Use the same RPC as /blog rather
// than introducing a new table permission or a second source of truth.
// Optional content: failures must never stop the marketplace loading.
export default function JournalHighlights() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    let active = true
    supabase.rpc('blog_index', { p_limit: 3, p_offset: 0 })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.warn('Journal homepage preview unavailable:', error.message)
          return
        }
        setPosts(Array.isArray(data) ? data.filter((p) => p.slug && p.title).slice(0, 3) : [])
      })
      .catch((error) => {
        if (active) console.warn('Journal homepage preview unavailable:', error?.message || error)
      })
    return () => { active = false }
  }, [])

  // No draft or filler cards. The Journal remains reachable from the public
  // navigation even before the first article has been published.
  if (!posts.length) return null

  return (
    <section className="home-journal" aria-labelledby="home-journal-heading">
      <div className="home-journal-heading">
        <div>
          <span className="home-journal-eyebrow"><Icon.book /> THE ZAMARKET JOURNAL</span>
          <h2 id="home-journal-heading">Stories worth discovering</h2>
          <p>Local businesses, helpful guides and products worth a closer look.</p>
        </div>
        <Link to="/blog" className="home-journal-all">All articles <Icon.arrow /></Link>
      </div>
      <div className={`home-journal-grid${posts.length === 1 ? ' single' : ''}`}>
        {posts.map((post) => (
          <Link key={post.slug} className="home-journal-card" to={`/blog/${post.slug}`}>
            <span className="home-journal-photo">
              {post.cover_url
                ? <img src={post.cover_url} alt="" loading="lazy" decoding="async" />
                : <span className="home-journal-placeholder" aria-hidden><Icon.book /></span>}
            </span>
            <span className="home-journal-info">
              <span className="home-journal-meta">
                {post.category && <span>{post.category}</span>}
                {post.published_at && <time dateTime={post.published_at}>{date(post.published_at)}</time>}
              </span>
              <strong>{post.title}</strong>
              {post.excerpt && <span className="home-journal-excerpt">{post.excerpt}</span>}
              <span className="home-journal-read">Read article <Icon.arrow /></span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
