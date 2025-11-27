import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { logWebRTCConfigStatus } from './config/webrtc'
import { initializeEnvironment } from './config/environment'

// Validate environment configuration on startup
console.log('🚀 Validating environment configuration...')
try {
  initializeEnvironment()
} catch (error) {
  console.error('Failed to initialize environment:', error)
  // Show error to user
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: monospace; background: #1a1a1a; color: #ff6b6b; min-height: 100vh;">
      <h1>⚠️ Configuration Error</h1>
      <p>The application failed to start due to invalid environment configuration.</p>
      <p>Please check the console for details and ensure all required environment variables are set.</p>
      <p>See <code>.env.example</code> for reference.</p>
    </div>
  `
  throw error
}

// Validate WebRTC configuration
console.log('🚀 Validating WebRTC configuration...')
logWebRTCConfigStatus()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
