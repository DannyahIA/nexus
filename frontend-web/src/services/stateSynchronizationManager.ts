// State Synchronization Manager for WebRTC
// Implements Requirements 1.5

import { StateInconsistency } from '../types/webrtc'

/**
 * State Synchronization Manager
 * 
 * Responsible for detecting and resolving state inconsistencies between
 * local media state and peer connection states.
 * 
 * Implements Requirement 1.5: State synchronization across peers
 */
export class StateSynchronizationManager {
  /**
   * Detect inconsistencies between expected and actual peer states
   * 
   * Checks for:
   * - Missing video senders when video should be enabled
   * - Wrong video tracks (mismatched track IDs)
   * - Disabled tracks when they should be enabled
   * - Stale connections that need cleanup
   * 
   * @param peerConnections - Map of peer connections to check
   * @param expectedVideoTrack - Expected video track (null if video disabled)
   * @param expectedVideoEnabled - Whether video should be enabled
   * @returns Array of detected inconsistencies
   */
  detectInconsistencies(
    peerConnections: Map<string, RTCPeerConnection>,
    expectedVideoTrack: MediaStreamTrack | null,
    expectedVideoEnabled: boolean
  ): StateInconsistency[] {
    console.log('🔍 Detecting state inconsistencies...', {
      peerCount: peerConnections.size,
      expectedVideoTrack: expectedVideoTrack?.id || 'none',
      expectedVideoEnabled,
    })

    const inconsistencies: StateInconsistency[] = []

    for (const [peerId, pc] of peerConnections.entries()) {
      // Check connection state for stale connections
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        inconsistencies.push({
          type: 'stale-connection',
          peerId,
          expected: 'connected',
          actual: pc.connectionState,
          severity: 'critical',
          recommendation: 'Remove stale connection and attempt reconnection',
        })
        continue
      }

      // Get video sender for this peer
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')

      if (expectedVideoEnabled && expectedVideoTrack) {
        // Video should be enabled - check for issues

        if (!videoSender || !videoSender.track) {
          // Missing video sender
          inconsistencies.push({
            type: 'missing-sender',
            peerId,
            expected: { trackId: expectedVideoTrack.id, hasTrack: true },
            actual: { trackId: null, hasTrack: false },
            severity: 'critical',
            recommendation: 'Add video track to peer connection',
          })
        } else if (videoSender.track.id !== expectedVideoTrack.id) {
          // Wrong track
          inconsistencies.push({
            type: 'wrong-track',
            peerId,
            expected: { trackId: expectedVideoTrack.id },
            actual: { trackId: videoSender.track.id },
            severity: 'warning',
            recommendation: 'Replace video track with correct track',
          })
        } else if (!videoSender.track.enabled) {
          // Track is disabled
          inconsistencies.push({
            type: 'disabled-track',
            peerId,
            expected: { enabled: true },
            actual: { enabled: false },
            severity: 'warning',
            recommendation: 'Enable video track or replace with enabled track',
          })
        }
      } else {
        // Video should be disabled - check if sender has active track

        if (videoSender && videoSender.track && videoSender.track.enabled) {
          // Has active video when it shouldn't
          inconsistencies.push({
            type: 'wrong-track',
            peerId,
            expected: { hasTrack: false },
            actual: { hasTrack: true, trackId: videoSender.track.id },
            severity: 'info',
            recommendation: 'Remove or disable video track',
          })
        }
      }
    }

    console.log(`📊 Detected ${inconsistencies.length} inconsistenc${inconsistencies.length === 1 ? 'y' : 'ies'}`)

    if (inconsistencies.length > 0) {
      console.log('📋 Inconsistencies by severity:', {
        critical: inconsistencies.filter(i => i.severity === 'critical').length,
        warning: inconsistencies.filter(i => i.severity === 'warning').length,
        info: inconsistencies.filter(i => i.severity === 'info').length,
      })
    }

    return inconsistencies
  }

  /**
   * Synchronize state by fixing detected inconsistencies
   * 
   * Applies fixes for each type of inconsistency:
   * - missing-sender: Adds track to peer connection
   * - wrong-track: Replaces track with correct one
   * - disabled-track: Replaces track with enabled version
   * - stale-connection: Marks for cleanup (handled by caller)
   * 
   * @param inconsistencies - Array of inconsistencies to fix
   * @param peerConnections - Map of peer connections
   * @param targetVideoTrack - Target video track to use for fixes
   * @param localStream - Local media stream
   * @returns Promise that resolves when synchronization is complete
   */
  async synchronizeState(
    inconsistencies: StateInconsistency[],
    peerConnections: Map<string, RTCPeerConnection>,
    targetVideoTrack: MediaStreamTrack | null,
    localStream: MediaStream | null
  ): Promise<void> {
    if (inconsistencies.length === 0) {
      console.log('✅ No inconsistencies to fix')
      return
    }

    console.log(`🔧 Synchronizing state for ${inconsistencies.length} inconsistenc${inconsistencies.length === 1 ? 'y' : 'ies'}...`)

    const fixResults: Array<{
      peerId: string
      type: string
      success: boolean
      error?: string
    }> = []

    for (const inconsistency of inconsistencies) {
      const { peerId, type } = inconsistency
      const pc = peerConnections.get(peerId)

      if (!pc) {
        console.error(`❌ Peer connection not found for ${peerId}`)
        fixResults.push({
          peerId,
          type,
          success: false,
          error: 'Peer connection not found',
        })
        continue
      }

      try {
        switch (type) {
          case 'missing-sender':
            await this.fixMissingSender(pc, peerId, targetVideoTrack, localStream)
            fixResults.push({ peerId, type, success: true })
            break

          case 'wrong-track':
            await this.fixWrongTrack(pc, peerId, targetVideoTrack)
            fixResults.push({ peerId, type, success: true })
            break

          case 'disabled-track':
            await this.fixDisabledTrack(pc, peerId, targetVideoTrack)
            fixResults.push({ peerId, type, success: true })
            break

          case 'stale-connection':
            // Stale connections should be handled by caller (cleanup/reconnection)
            console.log(`ℹ️ Stale connection for ${peerId} - should be handled by caller`)
            fixResults.push({
              peerId,
              type,
              success: false,
              error: 'Stale connection requires cleanup',
            })
            break

          default:
            console.warn(`⚠️ Unknown inconsistency type: ${type}`)
            fixResults.push({
              peerId,
              type,
              success: false,
              error: `Unknown inconsistency type: ${type}`,
            })
        }
      } catch (error) {
        console.error(`❌ Failed to fix ${type} for ${peerId}:`, error)
        fixResults.push({
          peerId,
          type,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Log synchronization results
    const successCount = fixResults.filter(r => r.success).length
    const failureCount = fixResults.filter(r => !r.success).length

    console.log(`📊 Synchronization results: ${successCount} fixed, ${failureCount} failed`)

    if (failureCount > 0) {
      const failedPeers = fixResults.filter(r => !r.success).map(r => r.peerId)
      console.warn(`⚠️ Failed to synchronize state for peers: ${failedPeers.join(', ')}`)
    }
  }

  /**
   * Fix missing sender by adding track to peer connection
   * 
   * @param pc - Peer connection
   * @param peerId - Peer ID for logging
   * @param track - Track to add
   * @param localStream - Local media stream
   */
  private async fixMissingSender(
    pc: RTCPeerConnection,
    peerId: string,
    track: MediaStreamTrack | null,
    localStream: MediaStream | null
  ): Promise<void> {
    if (!track) {
      throw new Error('Cannot fix missing sender: no track provided')
    }

    if (!localStream) {
      throw new Error('Cannot fix missing sender: no local stream available')
    }

    console.log(`➕ Adding video track for peer ${peerId}`)

    // Wait for stable signaling state
    await this.waitForStableState(pc, peerId)

    // Add track to peer connection (triggers negotiation)
    const sender = pc.addTrack(track, localStream)

    console.log(`✅ Video sender created for peer ${peerId}:`, {
      trackId: sender.track?.id,
      trackKind: sender.track?.kind,
      trackEnabled: sender.track?.enabled,
    })
  }

  /**
   * Fix wrong track by replacing with correct track
   * 
   * @param pc - Peer connection
   * @param peerId - Peer ID for logging
   * @param track - Correct track to use
   */
  private async fixWrongTrack(
    pc: RTCPeerConnection,
    peerId: string,
    track: MediaStreamTrack | null
  ): Promise<void> {
    console.log(`🔄 Replacing video track for peer ${peerId}`)

    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')

    if (!videoSender) {
      throw new Error('Video sender not found')
    }

    // Replace track (no negotiation needed)
    await videoSender.replaceTrack(track)

    console.log(`✅ Video track replaced for peer ${peerId}`)
  }

  /**
   * Fix disabled track by replacing with enabled version
   * 
   * @param pc - Peer connection
   * @param peerId - Peer ID for logging
   * @param track - Enabled track to use
   */
  private async fixDisabledTrack(
    pc: RTCPeerConnection,
    peerId: string,
    track: MediaStreamTrack | null
  ): Promise<void> {
    if (!track) {
      throw new Error('Cannot fix disabled track: no track provided')
    }

    console.log(`🔄 Replacing disabled track for peer ${peerId}`)

    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')

    if (!videoSender) {
      throw new Error('Video sender not found')
    }

    // Replace with enabled track
    await videoSender.replaceTrack(track)

    console.log(`✅ Disabled track replaced for peer ${peerId}`)
  }

  /**
   * Wait for stable signaling state before operations
   * 
   * @param pc - RTCPeerConnection to wait for
   * @param peerId - Peer ID for logging
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 5000)
   * @returns Promise that resolves when signaling state is stable
   * @throws Error if timeout is reached
   */
  private async waitForStableState(
    pc: RTCPeerConnection,
    peerId: string,
    timeoutMs: number = 5000
  ): Promise<void> {
    if (pc.signalingState === 'stable') {
      return
    }

    console.log(`⏳ Waiting for stable signaling state for ${peerId}, current: ${pc.signalingState}`)

    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      const checkState = () => {
        if (pc.signalingState === 'stable') {
          console.log(`✅ Signaling state stable for ${peerId}`)
          resolve()
          return
        }

        if (Date.now() - startTime > timeoutMs) {
          const error = `Timeout waiting for stable state for ${peerId}, state: ${pc.signalingState}`
          console.error(`❌ ${error}`)
          reject(new Error(error))
          return
        }

        // Check again in 100ms
        setTimeout(checkState, 100)
      }

      // Listen for signaling state changes
      const onSignalingStateChange = () => {
        if (pc.signalingState === 'stable') {
          pc.removeEventListener('signalingstatechange', onSignalingStateChange)
          resolve()
        }
      }

      pc.addEventListener('signalingstatechange', onSignalingStateChange)

      // Start checking
      checkState()
    })
  }

  /**
   * Verify consistency of video state across all peers
   * 
   * Checks that all peer connections have the expected video state.
   * Returns true if all peers are consistent, false otherwise.
   * 
   * @param peerConnections - Map of peer connections to verify
   * @param expectedVideoTrack - Expected video track (null if video disabled)
   * @param expectedVideoEnabled - Whether video should be enabled
   * @returns True if all peers are consistent
   */
  verifyConsistency(
    peerConnections: Map<string, RTCPeerConnection>,
    expectedVideoTrack: MediaStreamTrack | null,
    expectedVideoEnabled: boolean
  ): boolean {
    console.log('🔍 Verifying state consistency...', {
      peerCount: peerConnections.size,
      expectedVideoTrack: expectedVideoTrack?.id || 'none',
      expectedVideoEnabled,
    })

    const inconsistencies = this.detectInconsistencies(
      peerConnections,
      expectedVideoTrack,
      expectedVideoEnabled
    )

    const isConsistent = inconsistencies.length === 0

    if (isConsistent) {
      console.log('✅ All peers have consistent state')
    } else {
      console.warn(`⚠️ Found ${inconsistencies.length} inconsistenc${inconsistencies.length === 1 ? 'y' : 'ies'}`)
    }

    return isConsistent
  }
}
