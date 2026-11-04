import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { FeedbackProvider } from './context/FeedbackContext.jsx'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
    <BrowserRouter>
      <FeedbackProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </FeedbackProvider>
    </BrowserRouter>
  </GoogleOAuthProvider>,
)
