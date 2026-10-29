import { Component } from 'react'
import { Link } from 'react-router-dom'

// The last line of defence against a black screen.
//
// When a React component throws while rendering, React unmounts the entire tree
// and leaves the page completely empty — no message, no way back, nothing in the
// interface to say what happened. On a dark theme that reads as a black page,
// which is indistinguishable from the site being down.
//
// A boundary catches the throw and renders something a person can act on: what
// broke, a way to try again, and a way back to a page that works. It also keeps
// the failure contained — one broken panel no longer takes the whole app with it.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept in the console so a failure can still be read off a real device.
    console.error('[ZaMarket] a page failed to render:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const home = this.props.home || '/'
    return (
      <div className="boundary">
        <div className="card stack-sm boundary-card">
          <h2>This page hit a problem</h2>
          <p className="small">
            Nothing was lost and nothing was saved incorrectly — this screen simply
            failed to draw. Try it again, and if it keeps happening, send this
            message on and it will point straight at the cause.
          </p>
          <pre className="boundary-detail">{String(error?.message || error)}</pre>
          <div className="btn-row">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>Try again</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload the page</button>
            <Link className="btn ghost" to={home}>Go back</Link>
          </div>
        </div>
      </div>
    )
  }
}
