import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { CartProvider } from './lib/cart'
import { SavedProvider } from './lib/saved'
import { ToastProvider } from './components/ui'
import './styles.css'

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
