/**
 * Example usage of automatic recovery on health check failure
 * Task 16: Implements Requirement 8.5
 * 
 * This file demonstrates how to use the performHealthCheck() and
 * performAutomaticRecovery() methods in the WebRTC service.
 */

import { webrtcService } from './webrtc'

/**
 * Example 1: Manual health check and recovery
 * 
 * This example shows how to manually trigger a health check
 * and perform automatic recovery if issues are detected.
 */
export async function manualHealthCheckAndRecovery() {
  console.log('🏥 Performing manual health check...')
  
  // Perform health check on all peer connections
  const healthCheckResults = webrtcService.performHealthCheck()
  
  // Check if any peers are unhealthy
  const unhealthyPeers = healthCheckResults.filter(r => !r.isHealthy)
  
  if (unhealthyPeers.length > 0) {
    console.warn(`⚠️ Found ${unhealthyPeers.length} unhealthy peer(s)`)
    
    // Attempt automatic recovery
    await webrtcService.performAutomaticRecovery(healthCheckResults)
    
    console.log('✅ Automatic recovery completed')
  } else {
    console.log('✅ All peer connections are healthy')
  }
}

/**
 * Example 2: Periodic health check with automatic recovery
 * 
 * This example shows how to set up periodic health checks
 * that automatically trigger recovery when issues are detected.
 */
export function setupPeriodicHealthCheck(intervalMs: number = 30000) {
  console.log(`🏥 Setting up periodic health check every ${intervalMs}ms`)
  
  const intervalId = setInterval(async () => {
    console.log('🏥 Running periodic health check...')
    
    const healthCheckResults = webrtcService.performHealthCheck()
    const unhealthyPeers = healthCheckResults.filter(r => !r.isHealthy)
    
    if (unhealthyPeers.length > 0) {
      console.warn(`⚠️ Periodic health check found ${unhealthyPeers.length} unhealthy peer(s)`)
      
      // Automatically trigger recovery
      await webrtcService.performAutomaticRecovery(healthCheckResults)
    }
  }, intervalMs)
  
  // Return cleanup function
  return () => {
    console.log('🛑 Stopping periodic health check')
    clearInterval(intervalId)
  }
}

/**
 * Example 3: Event-driven health check and recovery
 * 
 * This example shows how to listen for connection state changes
 * and trigger health check + recovery when issues are detected.
 */
export function setupEventDrivenHealthCheck() {
  console.log('🏥 Setting up event-driven health check')
  
  // Listen for connection state changes
  webrtcService.on('connection-state-change', async (data: any) => {
    const { userId, state, iceState } = data
    
    // Trigger health check if connection state indicates issues
    if (state === 'failed' || state === 'disconnected' || iceState === 'failed') {
      console.warn(`⚠️ Connection issue detected for peer ${userId}: state=${state}, iceState=${iceState}`)
      console.log('🏥 Triggering health check and recovery...')
      
      const healthCheckResults = webrtcService.performHealthCheck()
      await webrtcService.performAutomaticRecovery(healthCheckResults)
    }
  })
  
  // Listen for recovery completion events
  webrtcService.on('automatic-recovery-complete', (data: any) => {
    const { unhealthyPeers, totalRecoverySuccesses, totalRecoveryFailures } = data
    
    console.log('📊 Recovery completed:', {
      unhealthyPeers,
      successes: totalRecoverySuccesses,
      failures: totalRecoveryFailures,
    })
    
    if (totalRecoveryFailures > 0) {
      console.warn('⚠️ Some recovery attempts failed. Manual intervention may be needed.')
    }
  })
  
  // Listen for health check completion events
  webrtcService.on('health-check-complete', (data: any) => {
    const { totalPeers, healthyPeers, unhealthyPeers } = data
    
    console.log('📊 Health check completed:', {
      total: totalPeers,
      healthy: healthyPeers,
      unhealthy: unhealthyPeers,
    })
  })
}

/**
 * Example 4: Health check on video enable
 * 
 * This example shows how to perform a health check after
 * enabling video to ensure all peers receive the video track.
 */
export async function healthCheckAfterVideoEnable() {
  console.log('📹 Enabling video...')
  
  // Enable video
  const success = await webrtcService.toggleVideo()
  
  if (success) {
    console.log('✅ Video enabled successfully')
    
    // Wait a moment for tracks to propagate
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Perform health check to verify all peers have video
    console.log('🏥 Performing health check after video enable...')
    const healthCheckResults = webrtcService.performHealthCheck()
    
    // Check for video-related issues
    const peersWithVideoIssues = healthCheckResults.filter(r => 
      r.issues.some(issue => issue.includes('Video sender'))
    )
    
    if (peersWithVideoIssues.length > 0) {
      console.warn(`⚠️ Found ${peersWithVideoIssues.length} peer(s) with video issues`)
      
      // Attempt automatic recovery
      await webrtcService.performAutomaticRecovery(healthCheckResults)
    } else {
      console.log('✅ All peers have video track')
    }
  } else {
    console.error('❌ Failed to enable video')
  }
}

/**
 * Example 5: Comprehensive connection monitoring
 * 
 * This example shows a complete monitoring setup that combines
 * periodic health checks with event-driven recovery.
 */
export function setupComprehensiveMonitoring() {
  console.log('🏥 Setting up comprehensive connection monitoring')
  
  // Set up periodic health check (every 30 seconds)
  const stopPeriodicCheck = setupPeriodicHealthCheck(30000)
  
  // Set up event-driven health check
  setupEventDrivenHealthCheck()
  
  // Return cleanup function
  return () => {
    console.log('🛑 Stopping comprehensive monitoring')
    stopPeriodicCheck()
  }
}
