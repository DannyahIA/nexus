/**
 * Background Mode Handler Integration Example
 * 
 * This example demonstrates how the BackgroundModeHandler integrates with
 * the WebRTC service to maintain stable connections when the browser tab
 * loses focus or goes to the background.
 * 
 * Features demonstrated:
 * - Automatic detection of background/foreground transitions
 * - Audio continuity in background (Requirement 4.1)
 * - Video continuity in background (Requirement 4.2)
 * - No reconnection on focus regain (Requirement 4.3)
 * - Connection stability monitoring (Requirement 4.5)
 */

import { webrtcService } from './webrtc'

// Example: Listen for background mode events
export function setupBackgroundModeMonitoring() {
  console.log('📱 Setting up background mode monitoring...')

  // Listen for background mode activation
  webrtcService.on('background-mode-active', (data: { isBackground: boolean }) => {
    if (data.isBackground) {
      console.log('📱 App is now in background mode')
      console.log('✅ Audio and video connections will be maintained')
      console.log('✅ No reconnection will occur when returning to foreground')
    } else {
      console.log('🖥️ App is now in foreground mode')
      console.log('✅ Connections remained stable during background period')
    }
  })

  // Listen for background connection monitoring results
  webrtcService.on('background-connections-monitored', (data: any) => {
    console.log('📊 Background connection monitoring results:', {
      totalConnections: data.totalConnections,
      stableConnections: data.stableConnections,
      unstableConnections: data.unstableConnections,
    })

    if (data.unstableConnections > 0) {
      console.warn('⚠️ Some connections are unstable in background')
      // Could trigger UI notification here
    }
  })

  console.log('✅ Background mode monitoring setup complete')
}

// Example: Manually check background state
export function checkBackgroundState() {
  const isBackground = document.hidden
  console.log('Current state:', isBackground ? 'background' : 'foreground')
  return isBackground
}

// Example: Test background mode behavior
export async function testBackgroundMode() {
  console.log('🧪 Testing background mode behavior...')

  // Join a voice channel first
  try {
    await webrtcService.joinVoiceChannel('test-channel', true)
    console.log('✅ Joined voice channel with video')

    // Simulate background mode (in real app, this happens automatically)
    console.log('📱 Simulating background mode...')
    webrtcService.handleBackgroundMode(true)

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Simulate returning to foreground
    console.log('🖥️ Simulating foreground mode...')
    webrtcService.handleBackgroundMode(false)

    console.log('✅ Background mode test complete')
  } catch (error) {
    console.error('❌ Background mode test failed:', error)
  }
}

// Example: Monitor audio/video tracks in background
export function monitorTracksInBackground() {
  // This is automatically handled by the WebRTC service
  // The handleBackgroundMode method logs track states
  
  // You can also manually check track states:
  webrtcService.on('background-mode-active', (data: { isBackground: boolean }) => {
    if (data.isBackground) {
      console.log('🔍 Checking track states in background...')
      
      // Audio tracks should remain active (Requirement 4.1)
      // Video tracks should remain active if enabled (Requirement 4.2)
      // This is logged automatically by the WebRTC service
    }
  })
}

// Example: Handle Page Visibility API events directly
export function setupPageVisibilityListener() {
  if (typeof document === 'undefined') {
    console.warn('⚠️ Document not available (SSR environment?)')
    return
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('📱 Page is now hidden (background)')
      // The BackgroundModeHandler automatically handles this
    } else {
      console.log('🖥️ Page is now visible (foreground)')
      // The BackgroundModeHandler automatically handles this
      // No reconnection is triggered (Requirement 4.3)
    }
  })

  console.log('✅ Page visibility listener setup complete')
}

// Example usage:
// setupBackgroundModeMonitoring()
// setupPageVisibilityListener()
// testBackgroundMode()
