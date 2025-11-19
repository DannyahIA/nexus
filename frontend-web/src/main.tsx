import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { logWebRTCConfigStatus } from './config/webrtc'

// Validate WebRTC configuration on startup
console.log('🚀 Validating WebRTC configuration...')
logWebRTCConfigStatus()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
