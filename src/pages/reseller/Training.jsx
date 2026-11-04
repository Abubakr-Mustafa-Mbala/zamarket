import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

// Training is NOT in ZaMarket.
//
// Affiliates are trained in Al-Halaqa Academy, which is its own system. The
// nine lessons, the recorded sessions and the Q&A that used to live on this
// page have been removed on purpose — ZaMarket's job is the selling, the
// links and the money, and teaching belongs where the teaching already
// happens. This page is only the door: it tells an affiliate where training
// is and sends them there.
//
// The link comes from the training_url setting (Settings → Vendors and
// affiliates). If it is empty, nothing is linked — an affiliate is told the
// team will send details rather than being dropped on a dead page.
export default function Training() {
  const { settings } = useAuth()
  const raw = String(settings?.training_url || '').trim()

  // Only an external https address is ever linked from here. Anything else is
  // treated as not set, so a bad or unsafe value can never become a link.
  let href = ''
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:' && !url.username && !url.password) href = url.href
  } catch { href = '' }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Training</h1>
          <p>Where to learn how to do this properly.</p>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>Training happens in the Academy</h2>
        <p>
          The lessons are not here. Affiliate training runs in our academy, as a
          proper course with an instructor, rather than as pages inside the
          marketplace. You keep using ZaMarket for the selling itself: your link,
          the products, your earnings.
        </p>
        {href
          ? (
            <>
              <div className="btn-row">
                <a className="btn primary" href={href} target="_blank" rel="noopener noreferrer">Open the Academy</a>
              </div>
              <p className="small muted">
                Opens in a new tab. You sign in there separately — your ZaMarket
                password is not used, and it is not shared with the academy.
              </p>
            </>
          )
          : (
            <p className="small muted">
              The team will send you the academy details after your application is
              approved. If you have been approved and have not received them, ask
              on the support number in the footer.
            </p>
          )}
      </div>

      <div className="card stack-sm">
        <h2>While you wait</h2>
        <p>Three things you can do today without any lesson:</p>
        <ol>
          <li>
            Open <Link to="/sell/products">Products to sell</Link> and find one
            product you would happily use yourself. It is far easier to sell
            something you actually believe in.
          </li>
          <li>
            Copy your link and send it to yourself on WhatsApp, so you see
            exactly what a customer sees before anyone else does.
          </li>
          <li>
            Write a list of thirty people who already know you — family, church,
            work, neighbours, old classmates — before you message anybody.
          </li>
        </ol>
        <p className="small muted">
          Never promise an income, a delivery date or a discount that is not on
          the product page. What you earn depends on what you sell, and there is
          no salary and no guaranteed amount.
        </p>
      </div>
    </div>
  )
}
