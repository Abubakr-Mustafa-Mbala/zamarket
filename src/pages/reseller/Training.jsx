import { useState } from 'react'
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
  const { settings, profile } = useAuth()
  const code = String(profile?.partner?.academy_code || '').trim()
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
          <h1>Affiliate Academy</h1>
          <p>Practical training for promoting real products and following up with customers.</p>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>Your training is in Al-Halaqa</h2>
        <p>
          Al-Halaqa is our academy, where the affiliate course runs. Keep using
          ZaMarket for the selling itself: your link, the products and your earnings.
        </p>
        <ol className="academy-steps small">
          <li>Open the Academy{href ? ' with the button below' : ''}.</li>
          <li>It asks for a code from your teacher. Enter your code{code ? ' shown here' : ''}.</li>
          <li>Start with the first lesson and work through in order.</li>
        </ol>
        {code
          ? <AcademyCode code={code} />
          : (
            <p className="small muted">
              Your academy code is not ready yet. The team creates your Academy account after
              approval and your code appears here. If you have been approved and see no code, ask
              on the support number in the footer.
            </p>
          )}
        {href
          ? (
            <>
              <div className="btn-row">
                <a className="btn primary" href={href} target="_blank" rel="noopener noreferrer">Open the Academy</a>
              </div>
              <p className="small muted">
                Opens in a new tab. The Academy uses your code, not your ZaMarket
                password, and your ZaMarket password is never shared with it.
              </p>
            </>
          )
          : (
            <p className="small muted">
              The Academy link has not been added yet. The team will send it to you.
            </p>
          )}
      </div>

      <div className="card stack-sm">
        <h2>Putting learning into practice</h2>
        <p>Choose a product that fits the people you want to reach. Read its real description, check its listed price and seller, and create a clear, honest promotion that sends interested buyers to the product page.</p>
        <p className="small muted">Your earning opportunities depend on eligible completed sales and the published commission terms. Training does not guarantee an income.</p>
      </div>
    </div>
  )
}

// The code, large enough to read off a phone and type into the Academy, with
// a copy button.
function AcademyCode({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) }
  }
  return (
    <div className="academy-code">
      <span className="tiny muted">Your academy code</span>
      <strong>{code}</strong>
      <button type="button" className="btn sm" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
    </div>
  )
}
