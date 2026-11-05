import { Component } from 'react'
import { Link } from 'react-router-dom'
import { isStaleBuild, recoverFromStaleBuild, dropCaches, dropForeignWorkers } from '../lib/recover'

// The last line of defence against a black screen.
//
// When a React component throws while rendering, React unmounts the entire
// tree and leaves the page completely empty — no message, no way back, nothing
// in the interface to say what happened. On a dark theme that reads as a black
// page, which is indistinguishable from the site being down.
//
// A boundary catches the throw and renders something a person can act on.
//
// It handles one failure specially. When the error is a page file that no
// longer exists on the server — which is what happens to a phone still holding
// the page from before the last deploy — there is nothing for the person to
// decide. The browser is simply out of date, so we clear it out and load the
// site again. Re-rendering would be useless: React caches that particular
// failure and hands back the same rejection every time, which is exactly why
// the old "Try again" button never once worked.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, updating: false }
  }

  static getDerivedStateFromError(error) {
    // Pure, as React requires: decide what to show, start nothing.
    return { error, updating: isStaleBuild(error) }
  }

  componentDidCatch(error, info) {
    // Kept in the console so a failure can still be read off a real device.
    console.error('[ZaMarket] a page failed to render:', error, info?.componentStack)
    if (!isStaleBuild(error)) return
    recoverFromStaleBuild().then((started) => {
      // Already tried within the last minute: stop pretending and show the
      // person what happened rather than leaving a spinner up forever.
      if (!started) this.setState({ updating: false })
    })
  }

  render() {
    const { error, updating } = this.state
    if (!error) return this.props.children

    const home = this.props.home || '/'
    const stale = isStaleBuild(error)

    if (updating) {
      return (
        <div className="boundary">
          <div className="card stack-sm boundary-card">
            <h2>Updating ZaMarket</h2>
            <p className="small">A newer version of the site is ready. Loading it now — this takes a moment.</p>
          </div>
        </div>
      )
    }

    return (
      <div className="boundary">
        <div className="card stack-sm boundary-card">
          <h2>{stale ? 'This page could not load' : 'This page hit a problem'}</h2>
          <p className="small">
            {stale
              ? 'Your phone is holding an old copy of ZaMarket and the page it is asking for is no longer there. Clearing it and loading again fixes this.'
              : 'Nothing was lost and nothing was saved incorrectly — this screen simply failed to draw. Try it again, and if it keeps happening, send this message on and it will point straight at the cause.'}
          </p>
          <pre className="boundary-detail">{String(error?.message || error)}</pre>
          <div className="btn-row">
            {stale ? (
              <button className="btn primary" onClick={() => hardReload()}>Clear and load again</button>
            ) : (
              <button className="btn primary" onClick={() => this.setState({ error: null, updating: false })}>Try again</button>
            )}
            <button className="btn" onClick={() => window.location.reload()}>Reload the page</button>
            <Link className="btn ghost" to={home}>Go back</Link>
          </div>
        </div>
      </div>
    )
  }
}

// The button a person presses after the automatic attempt has already run.
// It ignores the once-a-minute guard, because this one was asked for.
function hardReload() {
  const done = () => {
    try { window.location.reload() } catch { /* nothing left to try */ }
  }
  dropCaches()
    .catch(() => {})
    .then(() => dropForeignWorkers().catch(() => {}))
    .then(done, done)
}
