import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { CartProvider } from './lib/cart'
import { SavedProvider } from './lib/saved'
import { ToastProvider } from './components/ui'
import { sweepOnBoot } from './lib/recover'
import './styles.css'
import './premium.css'
import './refinements.css'
import './giveaway-premium.css'
import './studio-premium.css'
import './ai-blog.css'
import './journal-editorial.css'
import './journal-v2.css'

// Clear out anything an older version of the site left behind in this browser.
// We cache nothing ourselves, so whatever is in there is wreckage.
sweepOnBoot()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SavedProvider><CartProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </CartProvider></SavedProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
