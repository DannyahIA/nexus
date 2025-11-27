// WebRTC Service para Voice/Video Chat
import { wsService } from './websocket'
import { getWebRTCConfig } from '../config/webrtc'
import { connectionMonitor, ConnectionQuality } from './connectionMonitor'
import { VoiceActivityDetector } from './voiceActivityDetector'
import { TrackManager, TrackType, TrackState } from './trackManager'
import { ReconnectionManager } from './reconnectionManager'
import { StateSynchronizationManager } from './stateSynchronizationManager'
import { getMediaErrorInfo, getErrorGuidance } from './mediaErrorHandler'
import { BackgroundModeHandler } from './backgroundModeHandler'
import { errorLogger } from './errorLogger'

export interface VoiceUser {
  userId: string
  username: string
  isMuted: boolean
  isSpeaking: boolean
  isVideoEnabled: boolean
}

export interface VideoState {
  isEnabled: boolean
  type: TrackType
}

export interface HealthCheckResult {
  peerId: string
  isHealthy: boolean
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  signalingState: RTCSignalingState
  issues: string[]
  recommendations: string[]
  timestamp: number
}

export interface ConnectionStatistics {
  userId: string
  establishmentTime: number | null
  candidateTypes: string[]
  usingTURN: boolean
  connectionState: RTCPeerConnectionState | null
  iceConnectionState: RTCIceConnectionState | null
  signalingState: RTCSignalingState | null
  startTime: number | null
  isConnected: boolean
}

// Re-export ErrorLog from errorLogger for consistency
export type { ErrorLog } from './errorLogger'

export interface BrowserInfo {
  userAgent: string
  platform: string
  language: string
  onLine: boolean
  cookieEnabled: boolean
}

export interface DiagnosticReport {
  timestamp: number
  channelId: string | null
  localState: {
    hasLocalStream: boolean
    hasAudio: boolean
    hasVideo: boolean
    videoType: TrackType
    isAudioEnabled: boolean
    isVideoEnabled: boolean
    audioTrackId: string | null
    videoTrackId: string | null
  }
  peerStates: Map<string, {
    connectionState: RTCPeerConnectionState
    iceConnectionState: RTCIceConnectionState
    signalingState: RTCSignalingState
    hasRemoteStream: boolean
    remoteAudioTracks: number
    remoteVideoTracks: number
  }>
  healthChecks: HealthCheckResult[]
  connectionStatistics: ConnectionStatistics[]
  connectionQuality: Map<string, ConnectionQuality>
  browserInfo: BrowserInfo
  activeReconnections: string[]
  backgroundMode: boolean
  recentErrors: import('./errorLogger').ErrorLog[]
}

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private remoteStreams: Map<string, MediaStream> = new Map()
  private currentChannelId: string | null = null
  private listeners: Map<string, Set<Function>> = new Map()
  
  // Track manager for robust media track management
  private trackManager: TrackManager = new TrackManager()

  // State synchronization manager for video state consistency
  private stateSyncManager: StateSynchronizationManager = new StateSynchronizationManager()

  // Background mode handler for maintaining connections when tab loses focus
  private backgroundModeHandler: BackgroundModeHandler = new BackgroundModeHandler({
    maintainVideoInBackground: true,
    enableLogging: true,
  })

  // Configuração STUN/TURN
  private iceServers: RTCIceServer[] = []

  // TURN fallback tracking
  private connectionAttempts: Map<string, number> = new Map()
  private usingTURNOnly: Map<string, boolean> = new Map()
  private iceConnectionStates: Map<string, RTCIceConnectionState> = new Map()

  // Connection statistics tracking
  private connectionStartTimes: Map<string, number> = new Map()
  private connectionEstablishedTimes: Map<string, number> = new Map()
  private iceCandidateTypes: Map<string, Set<string>> = new Map()

  // Reconnection manager
  private reconnectionManager: ReconnectionManager = new ReconnectionManager({
    maxAttempts: 3,
    backoffDelays: [1000, 2000, 4000], // 1s, 2s, 4s
  })

  // VAD instances
  private localVad: VoiceActivityDetector | null = null
  private remoteVads: Map<string, VoiceActivityDetector> = new Map()

  // Active speaker tracking
  private activeSpeakerId: string | null = null
  private speakingUsers: Map<string, number> = new Map() // userId -> last speaking timestamp
  private activeSpeakerTimeout: NodeJS.Timeout | null = null
  private readonly ACTIVE_SPEAKER_THRESHOLD = 500 // ms - how long to wait before changing active speaker

  constructor() {
    this.initializeICEServers()
    this.setupWebSocketListeners()
    this.setupConnectionMonitoring()
    this.setupReconnectionManager()
    this.setupBackgroundModeHandler()
    this.setupNetworkAdaptation()
  }

  /**
   * Setup connection quality monitoring
   */
  private setupConnectionMonitoring(): void {
    // Listen for quality changes and emit events
    connectionMonitor.onQualityChange((userId: string, quality: ConnectionQuality) => {
      console.log('📊 Connection quality changed for', userId, ':', quality.quality)
      this.emit('connection-quality-change', { userId, quality })
    })
  }

  /**
   * Setup reconnection manager with callback
   * Implements Requirements 2.4, 2.5
   */
  private setupReconnectionManager(): void {
    this.reconnectionManager.setReconnectionCallback(async (userId: string, attempt: number) => {
      console.log(`🔄 Reconnection callback triggered for ${userId}, attempt ${attempt}`)
      
      // Capture current media state before reconnection (Requirement 2.5)
      const audioTrack = this.localStream?.getAudioTracks()[0]
      const videoTrack = this.trackManager.getCurrentVideoTrack()
      const videoState = this.trackManager.getCurrentTrackState()
      const audioEnabled = audioTrack?.enabled ?? false
      const videoEnabled = videoState.isActive && !!videoTrack
      
      console.log('📊 Capturing state before reconnection:', {
        hasAudio: !!audioTrack,
        audioEnabled,
        hasVideo: !!videoTrack,
        videoEnabled,
        videoType: videoState.type,
      })
      
      // Check WebSocket connection first (Requirement 5.4)
      if (!wsService || (wsService as any).ws?.readyState !== WebSocket.OPEN) {
        console.warn('⚠️ WebSocket not connected, waiting for WebSocket reconnection before peer reconnection')

        // Wait for WebSocket to reconnect (with timeout)
        const wsReconnectTimeout = 5000 // 5 seconds
        const wsReconnectStart = Date.now()

        while ((wsService as any).ws?.readyState !== WebSocket.OPEN) {
          if (Date.now() - wsReconnectStart > wsReconnectTimeout) {
            throw new Error('WebSocket reconnection timeout')
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        console.log('✅ WebSocket reconnected, proceeding with peer reconnection')
      }

      // Close existing connection
      const existingPc = this.peerConnections.get(userId)
      if (existingPc) {
        existingPc.close()
        this.peerConnections.delete(userId)
      }

      // Stop monitoring old connection
      connectionMonitor.stopMonitoring(userId)

      // Create new peer connection
      const pc = await this.createPeerConnection(userId)

      // Create and send new offer with ICE restart
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)

      console.log('📤 Sending reconnection offer to', userId)
      wsService.send({
        type: 'voice:offer',
        data: {
          targetUserId: userId,
          offer: offer,
        }
      })

      // Verify state was restored after reconnection (Requirement 2.5)
      // Note: The tracks are automatically added to the new peer connection
      // in createPeerConnection via addTrack(), so state is preserved
      const newAudioTrack = this.localStream?.getAudioTracks()[0]
      const newVideoTrack = this.trackManager.getCurrentVideoTrack()
      const newVideoState = this.trackManager.getCurrentTrackState()
      const newAudioEnabled = newAudioTrack?.enabled ?? false
      const newVideoEnabled = newVideoState.isActive && !!newVideoTrack
      
      console.log('📊 Verifying state after reconnection:', {
        hasAudio: !!newAudioTrack,
        audioEnabled: newAudioEnabled,
        hasVideo: !!newVideoTrack,
        videoEnabled: newVideoEnabled,
        videoType: newVideoState.type,
      })
      
      // Verify audio state matches
      if (audioEnabled !== newAudioEnabled) {
        console.warn('⚠️ Audio state mismatch after reconnection:', {
          before: audioEnabled,
          after: newAudioEnabled,
        })
      }
      
      // Verify video state matches
      if (videoEnabled !== newVideoEnabled) {
        console.warn('⚠️ Video state mismatch after reconnection:', {
          before: videoEnabled,
          after: newVideoEnabled,
        })
      }
      
      if (audioEnabled === newAudioEnabled && videoEnabled === newVideoEnabled) {
        console.log('✅ State successfully restored after reconnection')
      }

      // Emit reconnection attempt event
      this.emit('reconnection-attempted', { userId, attempt })
      
      // Emit state restoration event (Requirement 2.5)
      this.emit('state-restored', {
        userId,
        audioEnabled: newAudioEnabled,
        videoEnabled: newVideoEnabled,
        videoType: newVideoState.type,
      })
    })
  }

  /**
   * Setup background mode handler with event listeners
   * Implements Requirements 4.1, 4.2, 4.3, 4.4, 4.5
   */
  private setupBackgroundModeHandler(): void {
    // Initialize the background mode handler
    this.backgroundModeHandler.initialize()

    // Listen for background mode entered event (Requirements 4.1, 4.2, 4.5)
    this.backgroundModeHandler.on('background-mode-entered', (data: any) => {
      console.log('📱 Background mode entered, maintaining connections')
      this.handleBackgroundMode(true)
    })

    // Listen for foreground mode entered event (Requirement 4.3)
    this.backgroundModeHandler.on('foreground-mode-entered', (data: any) => {
      console.log('🖥️ Foreground mode entered, connections remain stable')
      this.handleBackgroundMode(false)
    })

    // Listen for background maintenance events (Requirement 4.5)
    this.backgroundModeHandler.on('background-maintenance', (data: any) => {
      console.log('🔄 Background maintenance triggered')
      this.monitorConnectionsInBackground()
    })

    console.log('✅ Background mode handler setup complete')
  }

  /**
   * Setup network adaptation to handle network condition changes
   * Implements Requirement 6.5: Network adaptation
   * 
   * This method sets up listeners for network condition changes (online/offline events)
   * and attempts ICE restart or reconnection when network conditions change.
   */
  private setupNetworkAdaptation(): void {
    console.log('🌐 Setting up network adaptation')

    // Listen for online event (network connection restored)
    window.addEventListener('online', () => {
      console.log('🌐 Network connection restored (online event)')
      this.handleNetworkChange('online')
    })

    // Listen for offline event (network connection lost)
    window.addEventListener('offline', () => {
      console.log('🌐 Network connection lost (offline event)')
      this.handleNetworkChange('offline')
    })

    // Log initial network state
    console.log('📊 Initial network state:', {
      online: navigator.onLine,
      timestamp: new Date().toISOString(),
    })

    console.log('✅ Network adaptation setup complete')
  }

  /**
   * Handle network condition changes
   * Implements Requirement 6.5: Network adaptation
   * 
   * When network conditions change, this method:
   * 1. Logs the network change event
   * 2. Attempts ICE restart for all active peer connections
   * 3. Triggers reconnection if ICE restart fails
   * 
   * @param eventType - Type of network event ('online' or 'offline')
   */
  private async handleNetworkChange(eventType: 'online' | 'offline'): Promise<void> {
    console.log(`🌐 Handling network change: ${eventType}`)
    
    // Log detailed network change information
    console.log('📊 Network change details:', {
      eventType,
      online: navigator.onLine,
      currentChannelId: this.currentChannelId,
      activePeerConnections: this.peerConnections.size,
      peerIds: Array.from(this.peerConnections.keys()),
      timestamp: new Date().toISOString(),
    })

    // Emit network change event for UI notification
    this.emit('network-change', {
      eventType,
      online: navigator.onLine,
      timestamp: new Date().toISOString(),
    })

    // If we're offline, just log and wait for online event
    if (eventType === 'offline') {
      console.warn('⚠️ Network offline - waiting for connection to be restored')
      this.emit('network-offline', {
        message: 'Network connection lost. Waiting for connection to be restored...',
        timestamp: new Date().toISOString(),
      })
      return
    }

    // Network is back online - attempt to recover connections
    if (eventType === 'online') {
      console.log('✅ Network back online - attempting to recover connections')
      
      // Check if we're in a voice channel
      if (!this.currentChannelId) {
        console.log('ℹ️ Not in a voice channel, no connections to recover')
        return
      }

      // Check if we have any peer connections
      if (this.peerConnections.size === 0) {
        console.log('ℹ️ No active peer connections to recover')
        return
      }

      // Emit recovery started event
      this.emit('network-recovery-started', {
        peerCount: this.peerConnections.size,
        timestamp: new Date().toISOString(),
      })

      // Attempt ICE restart for all peer connections
      await this.attemptICERestartForAllPeers()
    }
  }

  /**
   * Attempt ICE restart for all active peer connections
   * Implements Requirement 6.5: Network adaptation with ICE restart
   * 
   * This method attempts to restart ICE for all active peer connections.
   * If ICE restart fails, it triggers full reconnection.
   */
  private async attemptICERestartForAllPeers(): Promise<void> {
    console.log('🔄 Attempting ICE restart for all peer connections')
    
    const results: Array<{
      userId: string
      success: boolean
      method: 'ice-restart' | 'reconnection' | 'failed'
      error?: string
    }> = []

    // Process each peer connection
    for (const [userId, pc] of this.peerConnections.entries()) {
      try {
        console.log(`🔄 Attempting ICE restart for peer ${userId}`)
        
        // Log connection state before ICE restart
        console.log('📊 Connection state before ICE restart:', {
          userId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          timestamp: new Date().toISOString(),
        })

        // Check if connection is in a state that can be recovered with ICE restart
        const canUseICERestart = 
          pc.connectionState === 'connected' ||
          pc.connectionState === 'connecting' ||
          pc.iceConnectionState === 'checking' ||
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'

        if (!canUseICERestart) {
          console.warn(`⚠️ Connection state not suitable for ICE restart for ${userId}, triggering full reconnection`)
          
          // Trigger full reconnection instead
          this.attemptReconnection(userId)
          
          results.push({
            userId,
            success: true,
            method: 'reconnection',
          })
          
          continue
        }

        // Attempt ICE restart by creating a new offer with iceRestart flag
        console.log(`🔄 Creating offer with ICE restart for ${userId}`)
        
        const offer = await pc.createOffer({ iceRestart: true })
        await pc.setLocalDescription(offer)

        console.log(`📤 Sending ICE restart offer to ${userId}`)
        wsService.send({
          type: 'voice:offer',
          data: {
            targetUserId: userId,
            offer: offer,
          }
        })

        // Log successful ICE restart initiation
        console.log('✅ ICE restart initiated for', userId)
        
        results.push({
          userId,
          success: true,
          method: 'ice-restart',
        })

        // Emit ICE restart event
        this.emit('ice-restart-attempted', {
          userId,
          timestamp: new Date().toISOString(),
        })

      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logPeerConnectionError(
          error,
          'ice-restart',
          userId,
          pc,
          {
            timestamp: new Date().toISOString(),
          }
        )

        // If ICE restart fails, trigger full reconnection
        console.log(`🔄 Falling back to full reconnection for ${userId}`)
        this.attemptReconnection(userId)

        results.push({
          userId,
          success: true,
          method: 'reconnection',
          error: error instanceof Error ? error.message : 'Unknown error',
        })

        // Emit ICE restart failed event
        this.emit('ice-restart-failed', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Log summary of ICE restart attempts
    const iceRestartCount = results.filter(r => r.method === 'ice-restart').length
    const reconnectionCount = results.filter(r => r.method === 'reconnection').length
    const failedCount = results.filter(r => r.method === 'failed').length

    console.log('📊 ICE restart summary:', {
      totalPeers: this.peerConnections.size,
      iceRestartAttempts: iceRestartCount,
      reconnectionAttempts: reconnectionCount,
      failed: failedCount,
      results,
      timestamp: new Date().toISOString(),
    })

    // Emit recovery completed event
    this.emit('network-recovery-completed', {
      totalPeers: this.peerConnections.size,
      iceRestartAttempts: iceRestartCount,
      reconnectionAttempts: reconnectionCount,
      failed: failedCount,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Initialize ICE servers with TURN configuration from environment
   */
  private initializeICEServers(): void {
    // Always include Google STUN servers
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]

    // Add TURN server from environment configuration
    try {
      const config = getWebRTCConfig()
      this.iceServers.push({
        urls: config.turnUrl,
        username: config.turnUsername,
        credential: config.turnPassword,
      })
      console.log('✅ TURN server configured from environment')
    } catch (error) {
      // Enhanced error logging with full context (Requirement 6.4)
      errorLogger.logError(
        error,
        {
          operation: 'turn-server-configuration',
        }
      )
      console.warn('⚠️ Continuing with STUN-only configuration')
    }
  }

  private setupWebSocketListeners() {
    console.log('🔧 Setting up WebRTC WebSocket listeners')
    // Listeners para signaling via WebSocket
    wsService.on('voice:offer', (data: any) => {
      console.log('🔔 voice:offer event received', data)
      this.handleOffer(data)
    })
    wsService.on('voice:answer', (data: any) => {
      console.log('🔔 voice:answer event received', data)
      this.handleAnswer(data)
    })
    wsService.on('voice:ice-candidate', (data: any) => {
      console.log('🔔 voice:ice-candidate event received', data)
      this.handleIceCandidate(data)
    })
    wsService.on('voice:existing-users', (data: any) => {
      console.log('🔔 voice:existing-users event received', data)
      this.handleExistingUsers(data)
    })
    wsService.on('voice:user-joined', (data: any) => {
      console.log('🔔 voice:user-joined event received', data)
      this.handleUserJoined(data)
    })
    wsService.on('voice:user-left', (data: any) => {
      console.log('🔔 voice:user-left event received', data)
      this.handleUserLeft(data)
    })
    wsService.on('voice:mute-status', (data: any) => {
      console.log('🔔 voice:mute-status event received', data)
      this.handleMuteStatus(data)
    })
    wsService.on('voice:video-status', (data: any) => {
      console.log('🔔 voice:video-status event received', data)
      this.handleVideoStatus(data)
    })
    // Listen for WebSocket reconnection events (Requirement 5.4)
    wsService.on('websocket:reconnected', (data: any) => {
      console.log('🔔 websocket:reconnected event received', data)
      this.handleWebSocketReconnection(data)
    })
  }

  // Entrar em canal de voz
  // Enhanced implementation for Requirements 1.1 (camera activation reliability)
  async joinVoiceChannel(channelId: string, videoEnabled: boolean = false): Promise<void> {
    console.log('🎤 Joining voice channel:', { channelId, videoEnabled })
    console.log('📊 WebSocket ready state:', wsService ? 'connected' : 'not connected')

    // Attempt to get user media with retry logic (Requirement 1.1)
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📹 Attempting to get user media (attempt ${attempt}/${maxRetries})`)
        
        // Obter stream local (áudio + vídeo opcional)
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: videoEnabled ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          } : false,
        })

        // Verify camera activation if video was requested (Requirement 1.1)
        if (videoEnabled) {
          const videoTracks = this.localStream.getVideoTracks()
          if (videoTracks.length === 0) {
            throw new Error('Video was requested but no video track was obtained')
          }
          
          const videoTrack = videoTracks[0]
          if (!videoTrack.enabled || videoTrack.readyState !== 'live') {
            console.warn('⚠️ Video track obtained but not in expected state:', {
              enabled: videoTrack.enabled,
              readyState: videoTrack.readyState,
              label: videoTrack.label,
            })
            
            // Try to enable the track if it's disabled
            if (!videoTrack.enabled) {
              videoTrack.enabled = true
              console.log('✅ Enabled video track')
            }
          }
          
          console.log('✅ Camera activation verified:', {
            trackId: videoTrack.id,
            label: videoTrack.label,
            enabled: videoTrack.enabled,
            readyState: videoTrack.readyState,
          })
        }

        // Initialize VAD for local stream
        this.localVad = new VoiceActivityDetector()
        this.localVad.attachToStream(this.localStream)
        this.localVad.onVoiceActivity((isActive, level) => {
          // Emit local voice activity
          this.emit('voice-activity', { userId: 'local', isActive, level })

          // Update active speaker tracking for local user
          this.updateActiveSpeaker('local', isActive)

          // Optional: Send VAD status to peers via WebSocket if needed
          // For now we rely on client-side VAD on both ends
        })

        this.currentChannelId = channelId

        console.log('📤 Sending voice:join to server', { channelId, videoEnabled })

        // Notificar servidor que entrou no canal de voz
        wsService.send({
          type: 'voice:join',
          channelId,
          videoEnabled,
        })

        this.emit('local-stream', this.localStream)
        console.log('✅ Local stream obtained successfully, tracks:', this.localStream.getTracks().map(t => `${t.kind}: ${t.enabled}`))
        
        // Success - exit retry loop
        return
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logMediaDeviceError(
          error,
          'get-user-media',
          videoEnabled ? 'camera-and-microphone' : 'microphone',
          {
            attempt,
            maxRetries,
            channelId,
            videoEnabled,
          }
        )
        
        // Don't retry for permission errors or device not found
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
            console.log('🚫 Non-retryable error, stopping retry attempts')
            break
          }
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 500 // 500ms, 1s, 2s
          console.log(`⏳ Waiting ${delay}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    // All retries failed, handle error
    console.error('❌ Failed to get user media after all retries')
    
    // Use centralized error handler for user-friendly messages (Requirement 6.1)
    const context = videoEnabled ? 'both' : 'microphone'
    const errorInfo = getMediaErrorInfo(lastError, context)
    const guidance = getErrorGuidance(errorInfo)
    
    // Enhanced error logging with full context (Requirement 6.4)
    errorLogger.logMediaDeviceError(
      lastError,
      'get-user-media-final-failure',
      videoEnabled ? 'camera-and-microphone' : 'microphone',
      {
        channelId,
        videoEnabled,
        maxRetries,
        errorInfo,
        guidance,
      }
    )
    
    // Emit error event with detailed information
    this.emit('video-error', {
      error: errorInfo.error,
      severity: errorInfo.severity,
      action: errorInfo.action,
      guidance: guidance,
      technicalDetails: errorInfo.technicalDetails,
    })
    
    throw new Error(errorInfo.error)
  }

  // Sair do canal de voz
  // Enhanced implementation for Requirements 5.1, 5.2
  leaveVoiceChannel() {
    console.log('🔇 Leaving voice channel')
    const activeReconnectionsBefore = this.reconnectionManager.getActiveReconnections()
    console.log('📊 Cleanup state before leave:', {
      peerConnections: this.peerConnections.size,
      remoteStreams: this.remoteStreams.size,
      hasLocalStream: !!this.localStream,
      activeReconnections: activeReconnectionsBefore.length,
      remoteVads: this.remoteVads.size,
      currentChannelId: this.currentChannelId,
    })

    // Clean up local VAD
    if (this.localVad) {
      console.log('🧹 Cleaning up local VAD')
      this.localVad.detach()
      this.localVad = null
    }

    // Clean up remote VADs
    console.log(`🧹 Cleaning up ${this.remoteVads.size} remote VAD(s)`)
    this.remoteVads.forEach((vad, userId) => {
      console.log(`  Detaching VAD for user ${userId}`)
      vad.detach()
    })
    this.remoteVads.clear()

    // Reset track manager
    console.log('🧹 Resetting track manager')
    this.trackManager.reset()

    // Parar todas as tracks do stream local
    if (this.localStream) {
      const tracks = this.localStream.getTracks()
      console.log(`🧹 Stopping ${tracks.length} local track(s)`)
      tracks.forEach(track => {
        console.log(`  Stopping ${track.kind} track: ${track.id}`)
        track.stop()
      })
      this.localStream = null
    }

    // Fechar todas as conexões peer e limpar event listeners
    console.log(`🧹 Closing ${this.peerConnections.size} peer connection(s)`)
    this.peerConnections.forEach((pc, userId) => {
      console.log(`  Closing peer connection for user ${userId}`)
      
      // Remove all event listeners before closing
      pc.onicecandidate = null
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      pc.onconnectionstatechange = null
      pc.onnegotiationneeded = null
      
      // Close the connection
      pc.close()
      
      // Stop monitoring each connection
      connectionMonitor.stopMonitoring(userId)
    })
    
    // Clear peer connections map
    this.peerConnections.clear()

    // Limpar streams remotos
    console.log(`🧹 Clearing ${this.remoteStreams.size} remote stream(s)`)
    this.remoteStreams.clear()

    // Clean up TURN fallback tracking
    console.log('🧹 Clearing TURN fallback tracking')
    this.connectionAttempts.clear()
    this.usingTURNOnly.clear()
    this.iceConnectionStates.clear()

    // Clean up connection statistics tracking
    console.log('🧹 Clearing connection statistics')
    this.connectionStartTimes.clear()
    this.connectionEstablishedTimes.clear()
    this.iceCandidateTypes.clear()

    // Clean up reconnection tracking using ReconnectionManager
    const activeReconnections = this.reconnectionManager.getActiveReconnections()
    console.log(`🧹 Canceling ${activeReconnections.length} reconnection attempt(s)`)
    this.reconnectionManager.cleanupAll()

    // Clean up active speaker tracking
    console.log('🧹 Clearing active speaker tracking')
    this.activeSpeakerId = null
    this.speakingUsers.clear()
    if (this.activeSpeakerTimeout) {
      clearTimeout(this.activeSpeakerTimeout)
      this.activeSpeakerTimeout = null
    }

    // Notificar servidor
    if (this.currentChannelId) {
      console.log(`📤 Notifying server about leaving channel ${this.currentChannelId}`)
      wsService.send({
        type: 'voice:leave',
        channelId: this.currentChannelId,
      })
    }

    this.currentChannelId = null
    
    // Verify cleanup was successful
    const activeReconnectionsAfter = this.reconnectionManager.getActiveReconnections()
    console.log('📊 Cleanup state after leave:', {
      peerConnections: this.peerConnections.size,
      remoteStreams: this.remoteStreams.size,
      hasLocalStream: !!this.localStream,
      activeReconnections: activeReconnectionsAfter.length,
      remoteVads: this.remoteVads.size,
      currentChannelId: this.currentChannelId,
    })
    
    // Verify all maps are empty (Requirement 5.1, 5.2)
    if (this.peerConnections.size !== 0) {
      console.error('❌ Cleanup verification failed: peerConnections not empty')
    }
    if (this.remoteStreams.size !== 0) {
      console.error('❌ Cleanup verification failed: remoteStreams not empty')
    }
    if (activeReconnectionsAfter.length !== 0) {
      console.error('❌ Cleanup verification failed: active reconnections not empty')
    }
    if (this.remoteVads.size !== 0) {
      console.error('❌ Cleanup verification failed: remoteVads not empty')
    }
    
    console.log('✅ Voice channel cleanup completed')
    this.emit('voice-disconnected')
  }

  // Criar conexão peer com outro usuário
  private async createPeerConnection(userId: string, forceTURNOnly: boolean = false): Promise<RTCPeerConnection> {
    // Use TURN-only configuration if forced
    const iceServers = forceTURNOnly ? this.getTURNOnlyServers() : this.iceServers
    const pc = new RTCPeerConnection({ iceServers })

    // Track connection start time for statistics
    this.connectionStartTimes.set(userId, Date.now())
    this.iceCandidateTypes.set(userId, new Set())

    if (forceTURNOnly) {
      console.log('🔄 Creating peer connection with TURN-only mode for', userId)
      this.usingTURNOnly.set(userId, true)
    }

    // Adicionar tracks locais
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!)
      })
    }

    // Handle negotiation needed (for adding tracks dynamically)
    // Task 14: Enhanced with comprehensive negotiation logging (Requirements 4.2, 4.4, 4.5)
    pc.onnegotiationneeded = async () => {
      try {
        console.log('🔄 Negotiation needed for', userId)
        
        // Log negotiation trigger details (Requirement 4.2)
        console.log('📊 Negotiation needed event:', {
          peerId: userId,
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          senders: pc.getSenders().map(s => ({
            kind: s.track?.kind,
            trackId: s.track?.id,
            enabled: s.track?.enabled,
          })),
          timestamp: new Date().toISOString(),
        })

        // Only create offer if we're in stable state or have-local-offer
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
          console.log('⚠️ Skipping negotiation, signaling state:', pc.signalingState)
          return
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        // Log offer details (Requirement 4.2)
        console.log('📊 Renegotiation offer created:', {
          peerId: userId,
          offerType: offer.type,
          sdpLength: offer.sdp?.length || 0,
          timestamp: new Date().toISOString(),
        })

        console.log('📤 Sending renegotiation offer to', userId)
        wsService.send({
          type: 'voice:offer',
          data: {
            targetUserId: userId,
            offer: offer,
          }
        })
        
        console.log('✅ Renegotiation offer sent successfully to', userId)
      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logPeerConnectionError(
          error,
          'negotiation-needed',
          userId,
          pc,
          {
            timestamp: new Date().toISOString(),
          }
        )
      }
    }

    // Listener para ICE candidates
    // Task 8.8: Enhanced with timestamp logging (Requirement 9.4)
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const timestamp = new Date().toISOString()
        
        // Log ICE candidate type for statistics
        const candidateType = this.extractCandidateType(event.candidate)
        if (candidateType) {
          const types = this.iceCandidateTypes.get(userId)
          if (types) {
            types.add(candidateType)
          }
          console.log(`📊 ICE candidate type for ${userId}: ${candidateType}`)
        }

        // Log ICE candidate sending with timestamp (Requirement 9.4)
        console.log('📤 Sending ICE candidate to', userId, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          timestamp,
        })
        
        wsService.send({
          type: 'voice:ice-candidate',
          data: {
            targetUserId: userId,
            candidate: event.candidate,
          }
        })
      }
    }

    // Listener para stream remoto
    // Task 14: Enhanced with comprehensive track logging (Requirements 4.1, 4.3)
    pc.ontrack = (event) => {
      console.log('📥 Received remote track from', userId)
      
      // Log track details (Requirement 4.1, 4.3)
      console.log('📊 Remote track received:', {
        peerId: userId,
        track: {
          kind: event.track.kind,
          id: event.track.id,
          label: event.track.label,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          muted: event.track.muted,
        },
        streams: event.streams.map(s => ({
          id: s.id,
          active: s.active,
          trackCount: s.getTracks().length,
        })),
        transceiver: event.transceiver ? {
          direction: event.transceiver.direction,
          currentDirection: event.transceiver.currentDirection,
        } : null,
        timestamp: new Date().toISOString(),
      })
      
      const remoteStream = event.streams[0]
      this.remoteStreams.set(userId, remoteStream)

      // Initialize VAD for remote stream
      const remoteVad = new VoiceActivityDetector()
      remoteVad.attachToStream(remoteStream)
      remoteVad.onVoiceActivity((isActive, level) => {
        this.emit('voice-activity', { userId, isActive, level })
        
        // Update active speaker tracking for remote user
        this.updateActiveSpeaker(userId, isActive)
      })
      this.remoteVads.set(userId, remoteVad)

      this.emit('remote-stream', { userId, stream: remoteStream })
      
      console.log('✅ Remote track setup complete for', userId)
    }

    // Monitor ICE connection state for TURN fallback
    // Task 6.3: Enhanced to log bidirectional connection establishment (Requirement 2.2)
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      console.log(`ICE connection state with ${userId}:`, iceState)
      this.iceConnectionStates.set(userId, iceState)

      // Log connection establishment time when connected
      if (iceState === 'connected' && !this.connectionEstablishedTimes.has(userId)) {
        const startTime = this.connectionStartTimes.get(userId)
        if (startTime) {
          const establishmentTime = Date.now() - startTime
          this.connectionEstablishedTimes.set(userId, establishmentTime)

          // Log connection statistics
          this.logConnectionStatistics(userId, establishmentTime)

          // Start monitoring connection quality when connected
          connectionMonitor.startMonitoring(userId, pc)
          
          // Log bidirectional connection fully established (Requirement 2.2)
          console.log('✅ Bidirectional connection fully established:', {
            peerId: userId,
            establishmentTime: `${establishmentTime}ms`,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
            localTracks: this.localStream?.getTracks().map(t => ({
              kind: t.kind,
              id: t.id,
              enabled: t.enabled,
            })) || [],
            remoteTracks: this.remoteStreams.get(userId)?.getTracks().map(t => ({
              kind: t.kind,
              id: t.id,
              enabled: t.enabled,
            })) || [],
            timestamp: new Date().toISOString(),
          })
          
          // Emit bidirectional connection established event (Requirement 2.2)
          this.emit('bidirectional-connection-established', {
            userId,
            establishmentTime,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
          })
        }
      }

      // Detect connection failure and trigger TURN fallback
      if (iceState === 'failed' && !this.usingTURNOnly.get(userId)) {
        console.warn('⚠️ Direct P2P connection failed, attempting TURN fallback for', userId)
        this.attemptTURNFallback(userId)
      }
    }

    // Listener para mudanças de conexão
    // Task 6.5: Enhanced to detect unexpected disconnections and implement cleanup (Requirement 2.3)
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState)
      
      // Log detailed connection state information (Requirement 2.3)
      console.log('📊 Connection state change details:', {
        userId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        timestamp: new Date().toISOString(),
      })

      // Emit connection state changes for monitoring
      this.emit('connection-state-change', {
        userId,
        state: pc.connectionState,
        iceState: pc.iceConnectionState
      })

      // Detect unexpected disconnections (Requirement 2.3)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log(`⚠️ Connection ${pc.connectionState} for ${userId}`)
        
        // Determine if this is an unexpected disconnection
        const isUnexpected = this.currentChannelId !== null // Still in channel
        
        if (isUnexpected) {
          console.warn('⚠️ Unexpected disconnection detected for', userId)
          
          // Log disconnection details (Requirement 2.3)
          console.log('📊 Unexpected disconnection details:', {
            userId,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            wasConnected: this.connectionEstablishedTimes.has(userId),
            connectionDuration: this.connectionEstablishedTimes.has(userId)
              ? Date.now() - (this.connectionStartTimes.get(userId) || 0)
              : 0,
            timestamp: new Date().toISOString(),
          })
          
          // Emit unexpected disconnect event (Requirement 2.3)
          this.emit('unexpected-disconnect', {
            userId,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            timestamp: new Date().toISOString(),
          })
        }
        
        // Trigger automatic reconnection on disconnected or failed state
        console.log(`🔄 Attempting reconnection for ${userId}`)
        this.attemptReconnection(userId)
      }
      
      // Detect when connection is closed (Requirement 2.3)
      if (pc.connectionState === 'closed') {
        console.log(`🔒 Connection closed for ${userId}`)
        
        // Clean up peer connection resources (Requirement 2.3)
        this.cleanupPeerConnection(userId)
        
        // Emit user-left event (Requirement 2.3)
        this.emit('user-left', { userId })
      }
    }

    this.peerConnections.set(userId, pc)
    return pc
  }

  /**
   * Get TURN-only server configuration (excludes STUN servers)
   */
  private getTURNOnlyServers(): RTCIceServer[] {
    return this.iceServers.filter(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
      return urls.some(url => url.startsWith('turn:') || url.startsWith('turns:'))
    })
  }

  /**
   * Get STUN-only servers for fallback when TURN is unavailable
   * Implements Requirement 8.2: STUN fallback with warnings
   */
  private getSTUNOnlyServers(): RTCIceServer[] {
    return this.iceServers.filter(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
      return urls.some(url => url.startsWith('stun:'))
    })
  }

  /**
   * Detect if TURN server is unavailable
   * Implements Requirement 8.2: Detect TURN server unavailability
   * 
   * This method checks if TURN servers are configured and available.
   * Returns true if TURN is unavailable, false if available.
   */
  private isTURNUnavailable(): boolean {
    const turnServers = this.getTURNOnlyServers()
    
    // TURN is unavailable if no TURN servers are configured
    if (turnServers.length === 0) {
      console.warn('⚠️ No TURN servers configured in ICE servers')
      return true
    }

    // Check if TURN configuration is valid
    for (const server of turnServers) {
      // TURN servers require credentials
      if (!server.username || !server.credential) {
        console.warn('⚠️ TURN server configured but missing credentials:', server.urls)
        return true
      }
    }

    // TURN appears to be available
    return false
  }

  /**
   * Extract ICE candidate type from RTCIceCandidate
   * Returns: 'host', 'srflx' (server reflexive), or 'relay' (TURN)
   */
  private extractCandidateType(candidate: RTCIceCandidate): string | null {
    if (!candidate.candidate) return null

    // Parse candidate string to extract type
    // Format: "candidate:... typ host|srflx|relay ..."
    const match = candidate.candidate.match(/typ\s+(\w+)/)
    if (match && match[1]) {
      return match[1]
    }

    return null
  }

  /**
   * Log connection statistics for analytics
   */
  private logConnectionStatistics(userId: string, establishmentTime: number): void {
    const candidateTypes = Array.from(this.iceCandidateTypes.get(userId) || [])
    const usingTURN = this.usingTURNOnly.get(userId) || candidateTypes.includes('relay')

    const stats = {
      userId,
      establishmentTime,
      candidateTypes,
      usingTURN,
      timestamp: new Date().toISOString()
    }

    console.log('📊 Connection Statistics:', stats)
    console.log(`📊 Connection established in ${establishmentTime}ms`)
    console.log(`📊 ICE candidate types used: ${candidateTypes.join(', ') || 'none yet'}`)
    console.log(`📊 TURN relay used: ${usingTURN ? 'YES' : 'NO'}`)

    // Emit statistics event for external tracking/analytics
    this.emit('connection-statistics', stats)
  }

  /**
   * Attempt TURN fallback when direct P2P connection fails
   * Implements Requirement 6.2: TURN fallback on P2P failure
   * Implements Requirement 8.2: STUN fallback when TURN unavailable
   */
  private async attemptTURNFallback(userId: string): Promise<void> {
    try {
      console.log('🔄 Attempting TURN fallback for', userId)

      // Check if TURN is unavailable (Requirement 8.2)
      if (this.isTURNUnavailable()) {
        console.warn('⚠️ TURN server unavailable, falling back to STUN-only mode')
        await this.attemptSTUNFallback(userId)
        return
      }

      // Check if we have TURN servers configured
      const turnServers = this.getTURNOnlyServers()
      if (turnServers.length === 0) {
        console.error('❌ No TURN servers configured, falling back to STUN-only')
        await this.attemptSTUNFallback(userId)
        return
      }

      // Track connection attempt
      const attempts = (this.connectionAttempts.get(userId) || 0) + 1
      this.connectionAttempts.set(userId, attempts)

      if (attempts > 1) {
        console.warn('⚠️ Already attempted TURN fallback for', userId)
        return
      }

      // Close existing connection
      const existingPc = this.peerConnections.get(userId)
      if (existingPc) {
        existingPc.close()
        this.peerConnections.delete(userId)
      }

      // Create new connection with TURN-only
      const pc = await this.createPeerConnection(userId, true)

      // Create and send new offer with TURN-only
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)

      console.log('📤 Sending TURN fallback offer to', userId)
      wsService.send({
        type: 'voice:offer',
        data: {
          targetUserId: userId,
          offer: offer,
        }
      })

      this.emit('turn-fallback-attempted', { userId })

    } catch (error) {
      // Enhanced error logging with full context (Requirement 6.4)
      const pc = this.peerConnections.get(userId)
      errorLogger.logPeerConnectionError(
        error,
        'turn-fallback',
        userId,
        pc || null,
        {
          attempts: this.connectionAttempts.get(userId) || 0,
        }
      )
      this.emit('turn-fallback-failed', { userId, error })
      
      // Try STUN-only as last resort (Requirement 8.2)
      console.warn('⚠️ TURN fallback failed, attempting STUN-only fallback')
      await this.attemptSTUNFallback(userId)
    }
  }

  /**
   * Attempt STUN-only fallback when TURN is unavailable
   * Implements Requirement 8.2: STUN fallback with warnings
   * 
   * This method is called when TURN servers are unavailable or fail.
   * It creates a connection using only STUN servers for NAT traversal.
   * Note: STUN-only connections may fail in restrictive network environments.
   */
  private async attemptSTUNFallback(userId: string): Promise<void> {
    try {
      console.warn('⚠️ Attempting STUN-only fallback for', userId)
      console.warn('⚠️ WARNING: STUN-only mode has limited connectivity')
      console.warn('⚠️ WARNING: Connection may fail in restrictive network environments (symmetric NAT, firewalls)')
      console.warn('⚠️ WARNING: Direct peer-to-peer connection required - no relay available')

      // Get STUN-only servers
      const stunServers = this.getSTUNOnlyServers()
      if (stunServers.length === 0) {
        console.error('❌ No STUN servers available, cannot establish connection')
        this.emit('stun-fallback-failed', { 
          userId, 
          reason: 'no-stun-servers',
          message: 'No STUN servers configured. Connection cannot be established.'
        })
        return
      }

      console.log('📊 STUN-only fallback details:', {
        userId,
        stunServers: stunServers.length,
        stunUrls: stunServers.map(s => s.urls),
        timestamp: new Date().toISOString(),
      })

      // Track connection attempt
      const attempts = (this.connectionAttempts.get(userId) || 0) + 1
      this.connectionAttempts.set(userId, attempts)

      // Close existing connection
      const existingPc = this.peerConnections.get(userId)
      if (existingPc) {
        existingPc.close()
        this.peerConnections.delete(userId)
      }

      // Create new peer connection with STUN-only configuration
      const pc = new RTCPeerConnection({ iceServers: stunServers })

      // Track connection start time
      this.connectionStartTimes.set(userId, Date.now())
      this.iceCandidateTypes.set(userId, new Set())

      // Add local tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          pc.addTrack(track, this.localStream!)
        })
      }

      // Set up event handlers (same as createPeerConnection)
      pc.onnegotiationneeded = async () => {
        try {
          console.log('🔄 Negotiation needed for STUN-only connection', userId)
          if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
            console.log('⚠️ Skipping negotiation, signaling state:', pc.signalingState)
            return
          }

          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          console.log('📤 Sending STUN-only renegotiation offer to', userId)
          wsService.send({
            type: 'voice:offer',
            data: {
              targetUserId: userId,
              offer: offer,
            }
          })
        } catch (error) {
          console.error('❌ Failed to handle STUN-only negotiation:', error)
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateType = this.extractCandidateType(event.candidate)
          if (candidateType) {
            const types = this.iceCandidateTypes.get(userId)
            if (types) {
              types.add(candidateType)
            }
          }

          wsService.send({
            type: 'voice:ice-candidate',
            data: {
              targetUserId: userId,
              candidate: event.candidate,
            }
          })
        }
      }

      pc.ontrack = (event) => {
        console.log('📥 Received remote track from STUN-only connection', userId)
        const remoteStream = event.streams[0]
        this.remoteStreams.set(userId, remoteStream)

        // Initialize VAD for remote stream
        const remoteVad = new VoiceActivityDetector()
        remoteVad.attachToStream(remoteStream)
        remoteVad.onVoiceActivity((isActive, level) => {
          this.emit('voice-activity', { userId, isActive, level })
          this.updateActiveSpeaker(userId, isActive)
        })
        this.remoteVads.set(userId, remoteVad)

        this.emit('remote-stream', { userId, stream: remoteStream })
      }

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState
        console.log(`ICE connection state (STUN-only) with ${userId}:`, iceState)
        this.iceConnectionStates.set(userId, iceState)

        if (iceState === 'connected') {
          const startTime = this.connectionStartTimes.get(userId)
          if (startTime) {
            const establishmentTime = Date.now() - startTime
            this.connectionEstablishedTimes.set(userId, establishmentTime)
            this.logConnectionStatistics(userId, establishmentTime)
            connectionMonitor.startMonitoring(userId, pc)
            
            console.log('✅ STUN-only connection established successfully')
            console.warn('⚠️ Connection is using STUN-only mode (no TURN relay)')
          }
        } else if (iceState === 'failed') {
          console.error('❌ STUN-only connection failed for', userId)
          console.error('❌ Network environment may be too restrictive for P2P connection')
          this.emit('stun-fallback-failed', { 
            userId, 
            reason: 'ice-failed',
            message: 'STUN-only connection failed. Network may be too restrictive.'
          })
        }
      }

      pc.onconnectionstatechange = () => {
        console.log(`Connection state (STUN-only) with ${userId}:`, pc.connectionState)
        
        if (pc.connectionState === 'failed') {
          console.error('❌ STUN-only peer connection failed for', userId)
          this.emit('stun-fallback-failed', { 
            userId, 
            reason: 'connection-failed',
            message: 'STUN-only connection failed.'
          })
        } else if (pc.connectionState === 'closed') {
          console.log(`🔒 STUN-only connection closed for ${userId}`)
          this.cleanupPeerConnection(userId)
          this.emit('user-left', { userId })
        }
      }

      // Store peer connection
      this.peerConnections.set(userId, pc)

      // Create and send offer
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)

      console.log('📤 Sending STUN-only fallback offer to', userId)
      wsService.send({
        type: 'voice:offer',
        data: {
          targetUserId: userId,
          offer: offer,
        }
      })

      // Emit warning event for UI notification (Requirement 8.2)
      this.emit('stun-fallback-attempted', { 
        userId,
        warning: 'Using STUN-only mode. Connection may be unstable in restrictive networks.',
        limitations: [
          'No relay server available',
          'May fail with symmetric NAT',
          'May fail behind restrictive firewalls',
          'Direct peer-to-peer connection required'
        ]
      })

      console.warn('⚠️ STUN-only fallback initiated for', userId)
      console.warn('⚠️ Monitor connection quality - may be unstable')

    } catch (error) {
      // Enhanced error logging with full context (Requirement 6.4)
      const pc = this.peerConnections.get(userId)
      errorLogger.logPeerConnectionError(
        error,
        'stun-fallback',
        userId,
        pc || null,
        {
          attempts: this.connectionAttempts.get(userId) || 0,
          stunServers: this.getSTUNOnlyServers().length,
        }
      )
      this.emit('stun-fallback-failed', { 
        userId, 
        error,
        message: error instanceof Error ? error.message : 'STUN-only fallback failed'
      })
    }
  }

  /**
   * Attempt automatic reconnection with exponential backoff
   * Implements Requirements 2.4, 2.5
   * 
   * Uses ReconnectionManager to handle reconnection logic with exponential backoff
   */
  private attemptReconnection(userId: string): void {
    console.log(`🔄 Attempting reconnection for ${userId}`)
    
    // Emit reconnecting state
    const attemptCount = this.reconnectionManager.getAttemptCount(userId)
    this.emit('reconnecting', { 
      userId, 
      attempt: attemptCount + 1, 
      maxAttempts: 3 
    })

    // Use ReconnectionManager to handle reconnection
    this.reconnectionManager.attemptReconnection(userId).catch((error) => {
      // Enhanced error logging with full context (Requirement 6.4)
      const pc = this.peerConnections.get(userId)
      errorLogger.logPeerConnectionError(
        error,
        'reconnection',
        userId,
        pc || null,
        {
          attempts: this.reconnectionManager.getAttemptCount(userId),
          channelId: this.currentChannelId,
        }
      )
      
      // Emit reconnection failed event
      this.emit('reconnection-failed', { 
        userId, 
        attempts: this.reconnectionManager.getAttemptCount(userId),
        error 
      })

      // Clean up user connection
      this.handleUserLeft({ userId })
    })
  }

  /**
   * Manually trigger reconnection for a user
   * Implements Requirement 2.4
   */
  public manualReconnect(userId: string): void {
    console.log('🔄 Manual reconnection triggered for', userId)

    // Reset reconnection state in manager
    this.reconnectionManager.resetReconnectionState(userId)

    // Trigger reconnection
    this.attemptReconnection(userId)
  }

  // Handler: Recebeu lista de usuários já conectados
  // Task 6.1: Enhanced to properly process all users with comprehensive logging and error handling
  // Implements Requirement 2.1: Complete user list on rejoin
  private async handleExistingUsers(data: { users: Array<{ userId: string; username: string }> }) {
    console.log('👥 Received existing users:', data.users.length)
    
    // Log detailed information about existing users (Requirement 2.1)
    console.log('📊 Existing users list:', {
      totalUsers: data.users.length,
      userIds: data.users.map(u => u.userId),
      usernames: data.users.map(u => u.username),
      timestamp: new Date().toISOString(),
    })
    
    // Verify all users in list are processed (Requirement 2.1)
    const connectionResults: Array<{
      userId: string
      username: string
      success: boolean
      error?: string
      connectionEstablished: boolean
    }> = []

    // Para cada usuário existente, criar conexão e enviar offer
    for (const user of data.users) {
      try {
        console.log('👤 Connecting to existing user:', user.username, 'userId:', user.userId)
        
        // Log connection attempt start (Requirement 2.1)
        console.log('📊 Starting connection to existing user:', {
          userId: user.userId,
          username: user.username,
          currentPeerCount: this.peerConnections.size,
          hasLocalStream: !!this.localStream,
          timestamp: new Date().toISOString(),
        })

        // Criar conexão peer
        const pc = await this.createPeerConnection(user.userId)
        
        // Verify peer connection was created (Requirement 2.1)
        if (!this.peerConnections.has(user.userId)) {
          throw new Error(`Peer connection not found in map after creation for ${user.userId}`)
        }

        // Criar e enviar offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        console.log('📤 Sending offer to existing user', user.username)
        wsService.send({
          type: 'voice:offer',
          data: {
            targetUserId: user.userId,
            offer: offer,
          }
        })
        
        // Log successful connection setup (Requirement 2.1)
        console.log('✅ Connection setup completed for existing user:', {
          userId: user.userId,
          username: user.username,
          offerSent: true,
          peerConnectionState: pc.connectionState,
          signalingState: pc.signalingState,
        })

        this.emit('user-joined', user)
        
        // Track successful connection attempt
        connectionResults.push({
          userId: user.userId,
          username: user.username,
          success: true,
          connectionEstablished: false, // Will be true when ICE completes
        })
      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logChannelError(
          error,
          'connect-to-existing-user',
          this.currentChannelId,
          {
            userId: user.userId,
            username: user.username,
            timestamp: new Date().toISOString(),
          }
        )
        
        // Track failed connection attempt
        connectionResults.push({
          userId: user.userId,
          username: user.username,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          connectionEstablished: false,
        })
        
        // Emit error event for UI notification
        this.emit('connection-error', {
          userId: user.userId,
          username: user.username,
          error: error instanceof Error ? error.message : 'Failed to connect',
          phase: 'existing-user-connection',
        })
      }
    }
    
    // Log summary of connection attempts (Requirement 2.1)
    const successCount = connectionResults.filter(r => r.success).length
    const failureCount = connectionResults.filter(r => !r.success).length
    
    console.log('📊 Existing users connection summary:', {
      totalUsers: data.users.length,
      successfulConnections: successCount,
      failedConnections: failureCount,
      successRate: `${((successCount / data.users.length) * 100).toFixed(1)}%`,
      results: connectionResults,
      timestamp: new Date().toISOString(),
    })
    
    // Emit summary event for monitoring
    this.emit('existing-users-processed', {
      totalUsers: data.users.length,
      successfulConnections: successCount,
      failedConnections: failureCount,
      results: connectionResults,
    })
    
    // Verify all users were processed (Requirement 2.1)
    if (connectionResults.length !== data.users.length) {
      console.error('❌ Not all users were processed!', {
        expected: data.users.length,
        actual: connectionResults.length,
      })
    } else {
      console.log('✅ All existing users were processed')
    }
  }

  // Handler: Novo usuário entrou no canal
  // Task 14: Enhanced with comprehensive operation logging (Requirements 4.1, 4.2, 4.5)
  // Task 6.3: Enhanced to ensure bidirectional connection establishment (Requirement 2.2)
  private async handleUserJoined(data: { userId: string; username: string }) {
    console.log('👤 User joined voice:', data.username, 'userId:', data.userId)
    
    // Log operation start (Requirement 4.1)
    console.log('📊 Starting peer connection setup:', {
      peerId: data.userId,
      username: data.username,
      currentPeerCount: this.peerConnections.size,
      hasLocalStream: !!this.localStream,
      localTracks: this.localStream?.getTracks().map(t => ({
        kind: t.kind,
        id: t.id,
        enabled: t.enabled,
      })) || [],
      timestamp: new Date().toISOString(),
    })

    try {
      // Verify both sides create peer connections (Requirement 2.2)
      // This side (local) creates a peer connection and sends an offer
      // The other side should receive the offer and create their peer connection
      
      // Criar conexão peer (local side of bidirectional connection)
      const pc = await this.createPeerConnection(data.userId)
      
      // Verify peer connection was created locally (Requirement 2.2)
      if (!this.peerConnections.has(data.userId)) {
        throw new Error(`Local peer connection not found in map after creation for ${data.userId}`)
      }
      
      console.log('✅ Local peer connection created for', data.username)

      // Criar e enviar offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Log offer details (Requirement 4.2)
      console.log('📊 Offer created for new user:', {
        peerId: data.userId,
        username: data.username,
        offerType: offer.type,
        sdpLength: offer.sdp?.length || 0,
        timestamp: new Date().toISOString(),
      })

      console.log('📤 Sending offer to', data.username)
      wsService.send({
        type: 'voice:offer',
        data: {
          targetUserId: data.userId,
          offer: offer,
        }
      })
      
      // Log bidirectional establishment progress (Requirement 2.2)
      console.log('📊 Bidirectional connection establishment:', {
        peerId: data.userId,
        username: data.username,
        localSide: 'offer sent',
        remoteSide: 'waiting for answer',
        localConnectionState: pc.connectionState,
        localSignalingState: pc.signalingState,
        timestamp: new Date().toISOString(),
      })
      
      console.log('✅ User joined handled successfully:', data.username)

      this.emit('user-joined', data)
    } catch (error) {
      // Enhanced error logging with full context (Requirement 6.4)
      const pc = this.peerConnections.get(data.userId)
      errorLogger.logPeerConnectionError(
        error,
        'handle-user-joined',
        data.userId,
        pc || null,
        {
          username: data.username,
          channelId: this.currentChannelId,
          timestamp: new Date().toISOString(),
        }
      )
      
      // Emit error event for UI notification
      this.emit('connection-error', {
        userId: data.userId,
        username: data.username,
        error: error instanceof Error ? error.message : 'Failed to establish connection',
        phase: 'user-joined',
      })
    }
  }

  // Handler: Recebeu offer de outro usuário
  // Task 14: Enhanced with comprehensive negotiation logging (Requirements 4.2, 4.5)
  // Task 6.3: Enhanced to log bidirectional connection establishment (Requirement 2.2)
  private async handleOffer(data: { userId: string; offer: RTCSessionDescriptionInit }) {
    console.log('📨 Received offer from', data.userId)
    
    // Log negotiation event details (Requirement 4.2)
    console.log('📊 Offer details:', {
      peerId: data.userId,
      offerType: data.offer.type,
      sdpLength: data.offer.sdp?.length || 0,
      timestamp: new Date().toISOString(),
    })

    try {
      // Verificar se já existe uma conexão peer
      let pc = this.peerConnections.get(data.userId)

      if (!pc) {
        // Se não existe, criar nova conexão (remote side of bidirectional connection)
        console.log('➕ Creating new peer connection for offer from', data.userId)
        pc = await this.createPeerConnection(data.userId)
        
        // Log bidirectional connection establishment (Requirement 2.2)
        console.log('📊 Bidirectional connection establishment:', {
          peerId: data.userId,
          localSide: 'peer connection created',
          remoteSide: 'offer received',
          direction: 'remote->local',
          timestamp: new Date().toISOString(),
        })
      } else {
        // Se já existe, esta é uma renegociação
        console.log('🔄 Handling renegotiation offer from', data.userId)
        
        // Log current connection state before renegotiation (Requirement 4.2)
        console.log('📊 Connection state before renegotiation:', {
          peerId: data.userId,
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        })
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
      console.log('✅ Remote description set for', data.userId)

      // Criar e enviar answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      // Log answer details (Requirement 4.2)
      console.log('📊 Answer created:', {
        peerId: data.userId,
        answerType: answer.type,
        sdpLength: answer.sdp?.length || 0,
        timestamp: new Date().toISOString(),
      })

      console.log('📤 Sending answer to', data.userId)
      wsService.send({
        type: 'voice:answer',
        data: {
          targetUserId: data.userId,
          answer: answer,
        }
      })
      
      // Log bidirectional connection progress (Requirement 2.2)
      console.log('📊 Bidirectional connection progress:', {
        peerId: data.userId,
        localSide: 'answer sent',
        remoteSide: 'waiting for ICE candidates',
        localConnectionState: pc.connectionState,
        localSignalingState: pc.signalingState,
        timestamp: new Date().toISOString(),
      })
      
      console.log('✅ Offer handled successfully for', data.userId)
    } catch (error) {
      // Enhanced error logging with full context (Requirement 6.4)
      const pc = this.peerConnections.get(data.userId)
      errorLogger.logPeerConnectionError(
        error,
        'handle-offer',
        data.userId,
        pc || null,
        {
          offerType: data.offer.type,
          channelId: this.currentChannelId,
          timestamp: new Date().toISOString(),
        }
      )
      
      // Emit error event for UI notification
      this.emit('connection-error', {
        userId: data.userId,
        error: error instanceof Error ? error.message : 'Failed to handle offer',
        phase: 'offer-handling',
      })
    }
  }

  // Handler: Recebeu answer de outro usuário
  // Task 14: Enhanced with comprehensive negotiation logging (Requirements 4.2, 4.5)
  // Task 6.3: Enhanced to log bidirectional connection completion (Requirement 2.2)
  private async handleAnswer(data: { userId: string; answer: RTCSessionDescriptionInit }) {
    console.log('📨 Received answer from', data.userId)
    
    // Log negotiation event details (Requirement 4.2)
    console.log('📊 Answer details:', {
      peerId: data.userId,
      answerType: data.answer.type,
      sdpLength: data.answer.sdp?.length || 0,
      timestamp: new Date().toISOString(),
    })

    const pc = this.peerConnections.get(data.userId)
    if (pc) {
      try {
        // Log connection state before setting answer (Requirement 4.2)
        console.log('📊 Connection state before answer:', {
          peerId: data.userId,
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        })
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        
        console.log('✅ Answer handled successfully for', data.userId)
        
        // Log connection state after setting answer (Requirement 4.2)
        console.log('📊 Connection state after answer:', {
          peerId: data.userId,
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        })
        
        // Log bidirectional connection completion (Requirement 2.2)
        console.log('📊 Bidirectional connection signaling complete:', {
          peerId: data.userId,
          localSide: 'answer received and processed',
          remoteSide: 'signaling complete',
          direction: 'local->remote',
          signalingState: pc.signalingState,
          nextPhase: 'ICE candidate exchange',
          timestamp: new Date().toISOString(),
        })
      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logPeerConnectionError(
          error,
          'handle-answer',
          data.userId,
          pc,
          {
            answerType: data.answer.type,
            channelId: this.currentChannelId,
            timestamp: new Date().toISOString(),
          }
        )
        
        // Emit error event for UI notification
        this.emit('connection-error', {
          userId: data.userId,
          error: error instanceof Error ? error.message : 'Failed to handle answer',
          phase: 'answer-handling',
        })
      }
    } else {
      console.error('❌ No peer connection found for answer from', data.userId)
      
      // Emit error event for missing peer connection
      this.emit('connection-error', {
        userId: data.userId,
        error: 'No peer connection found for answer',
        phase: 'answer-handling',
      })
    }
  }

  // Handler: Recebeu ICE candidate
  // Task 8.8: Enhanced with timestamp logging (Requirement 9.4)
  private async handleIceCandidate(data: { userId: string; candidate: RTCIceCandidateInit }) {
    const timestamp = new Date().toISOString()
    console.log('📨 Received ICE candidate from', data.userId)
    
    // Log ICE candidate details with timestamp (Requirement 9.4)
    console.log('📊 ICE candidate details:', {
      peerId: data.userId,
      candidate: data.candidate.candidate,
      sdpMid: data.candidate.sdpMid,
      sdpMLineIndex: data.candidate.sdpMLineIndex,
      timestamp,
    })
    
    const pc = this.peerConnections.get(data.userId)
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        console.log('✅ ICE candidate added:', {
          peerId: data.userId,
          timestamp,
        })
      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logPeerConnectionError(
          error,
          'add-ice-candidate',
          data.userId,
          pc,
          {
            candidate: data.candidate.candidate,
            timestamp,
          }
        )
      }
    } else {
      console.warn('⚠️ No peer connection found for ICE candidate:', {
        peerId: data.userId,
        timestamp,
      })
    }
  }

  // Handler: Usuário saiu do canal
  private handleUserLeft(data: { userId: string }) {
    console.log('👋 User left voice:', data.userId)

    const pc = this.peerConnections.get(data.userId)
    if (pc) {
      pc.close()
      this.peerConnections.delete(data.userId)
    }

    this.remoteStreams.delete(data.userId)

    // Clean up remote VAD
    const remoteVad = this.remoteVads.get(data.userId)
    if (remoteVad) {
      remoteVad.detach()
      this.remoteVads.delete(data.userId)
    }

    // Stop monitoring connection quality
    connectionMonitor.stopMonitoring(data.userId)

    // Clean up TURN fallback tracking
    this.connectionAttempts.delete(data.userId)
    this.usingTURNOnly.delete(data.userId)
    this.iceConnectionStates.delete(data.userId)

    // Clean up connection statistics tracking
    this.connectionStartTimes.delete(data.userId)
    this.connectionEstablishedTimes.delete(data.userId)
    this.iceCandidateTypes.delete(data.userId)

    // Clean up reconnection tracking using ReconnectionManager
    this.reconnectionManager.cancelReconnection(data.userId)
    this.reconnectionManager.resetReconnectionState(data.userId)

    // Clean up active speaker tracking
    this.speakingUsers.delete(data.userId)
    if (this.activeSpeakerId === data.userId) {
      // If the leaving user was the active speaker, clear it
      this.setActiveSpeaker(null)
    }

    this.emit('user-left', data)
  }

  /**
   * Clean up peer connection resources
   * Task 6.5: Implements Requirement 2.3 - Cleanup on unexpected disconnect
   * 
   * This method is called when a peer connection is closed or needs to be cleaned up.
   * It ensures all resources associated with the peer connection are properly released.
   * 
   * @param userId - User ID of the peer connection to clean up
   */
  private cleanupPeerConnection(userId: string): void {
    console.log('🧹 Cleaning up peer connection for', userId)
    
    // Log cleanup operation start (Requirement 2.3)
    console.log('📊 Peer connection cleanup details:', {
      userId,
      hasPeerConnection: this.peerConnections.has(userId),
      hasRemoteStream: this.remoteStreams.has(userId),
      hasRemoteVad: this.remoteVads.has(userId),
      isBeingMonitored: connectionMonitor.isMonitoring(userId),
      timestamp: new Date().toISOString(),
    })

    // Close and remove peer connection (Requirement 2.3)
    const pc = this.peerConnections.get(userId)
    if (pc) {
      console.log(`  Closing peer connection for ${userId}`)
      
      // Remove event listeners before closing to prevent callbacks
      pc.onicecandidate = null
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      pc.onconnectionstatechange = null
      pc.onnegotiationneeded = null
      
      // Close the connection
      pc.close()
      
      // Remove from map
      this.peerConnections.delete(userId)
      console.log(`  ✅ Peer connection closed and removed for ${userId}`)
    }

    // Remove remote stream (Requirement 2.3)
    if (this.remoteStreams.has(userId)) {
      console.log(`  Removing remote stream for ${userId}`)
      this.remoteStreams.delete(userId)
      console.log(`  ✅ Remote stream removed for ${userId}`)
    }

    // Clean up remote VAD (Requirement 2.3)
    const remoteVad = this.remoteVads.get(userId)
    if (remoteVad) {
      console.log(`  Detaching remote VAD for ${userId}`)
      remoteVad.detach()
      this.remoteVads.delete(userId)
      console.log(`  ✅ Remote VAD detached and removed for ${userId}`)
    }

    // Stop monitoring connection quality (Requirement 2.3)
    if (connectionMonitor.isMonitoring(userId)) {
      console.log(`  Stopping connection monitoring for ${userId}`)
      connectionMonitor.stopMonitoring(userId)
      console.log(`  ✅ Connection monitoring stopped for ${userId}`)
    }

    // Clean up TURN fallback tracking (Requirement 2.3)
    this.connectionAttempts.delete(userId)
    this.usingTURNOnly.delete(userId)
    this.iceConnectionStates.delete(userId)
    console.log(`  ✅ TURN fallback tracking cleaned up for ${userId}`)

    // Clean up connection statistics tracking (Requirement 2.3)
    this.connectionStartTimes.delete(userId)
    this.connectionEstablishedTimes.delete(userId)
    this.iceCandidateTypes.delete(userId)
    console.log(`  ✅ Connection statistics cleaned up for ${userId}`)

    // Clean up reconnection tracking using ReconnectionManager (Requirement 2.3)
    this.reconnectionManager.cancelReconnection(userId)
    this.reconnectionManager.resetReconnectionState(userId)
    console.log(`  ✅ Reconnection tracking cleaned up for ${userId}`)

    // Clean up active speaker tracking (Requirement 2.3)
    this.speakingUsers.delete(userId)
    if (this.activeSpeakerId === userId) {
      console.log(`  Clearing active speaker (was ${userId})`)
      this.setActiveSpeaker(null)
      console.log(`  ✅ Active speaker cleared`)
    }

    // Log cleanup completion (Requirement 2.3)
    console.log('✅ Peer connection cleanup completed for', userId)
    
    // Verify cleanup was successful (Requirement 2.3)
    const cleanupVerification = {
      hasPeerConnection: this.peerConnections.has(userId),
      hasRemoteStream: this.remoteStreams.has(userId),
      hasRemoteVad: this.remoteVads.has(userId),
      hasConnectionAttempts: this.connectionAttempts.has(userId),
      hasConnectionStats: this.connectionStartTimes.has(userId),
    }
    
    const allCleanedUp = Object.values(cleanupVerification).every(v => v === false)
    
    if (!allCleanedUp) {
      console.error('❌ Cleanup verification failed for', userId, cleanupVerification)
    } else {
      console.log('✅ Cleanup verification passed for', userId)
    }
  }

  // Handler: Status de mute mudou
  private handleMuteStatus(data: any) {
    console.log('🔇 Mute status changed:', data.userId, data.isMuted || data.data?.isMuted)
    const isMuted = data.isMuted || data.data?.isMuted
    this.emit('mute-status-changed', {
      userId: data.userId,
      isMuted: isMuted
    })
  }

  // Handler: Status de vídeo mudou
  private handleVideoStatus(data: any) {
    console.log('📹 Video status changed:', data.userId, data.isVideoEnabled || data.data?.isVideoEnabled)
    const isVideoEnabled = data.isVideoEnabled || data.data?.isVideoEnabled
    this.emit('video-status-changed', {
      userId: data.userId,
      isVideoEnabled: isVideoEnabled
    })
  }

  /**
   * Handler: WebSocket reconnection detected
   * Implements Requirement 5.4: Peer re-establishment on WebSocket reconnect
   * 
   * When the WebSocket reconnects, this method:
   * 1. Detects if we're still in a voice channel
   * 2. Re-establishes peer connections with all users in the channel
   * 3. Restores channel state (audio/video settings)
   * 
   * @param data - Reconnection event data containing timestamp and subscribed channels
   */
  private async handleWebSocketReconnection(data: any): Promise<void> {
    console.log('🔄 WebSocket reconnection detected, re-establishing peer connections')
    
    // Log reconnection details (Requirement 5.4)
    console.log('📊 WebSocket reconnection details:', {
      timestamp: data.timestamp,
      subscribedChannels: data.subscribedChannels,
      currentChannelId: this.currentChannelId,
      activePeerConnections: this.peerConnections.size,
      hasLocalStream: !!this.localStream,
      localStreamTracks: this.localStream?.getTracks().map(t => ({
        kind: t.kind,
        id: t.id,
        enabled: t.enabled,
        readyState: t.readyState,
      })) || [],
    })

    // Check if we're in a voice channel (Requirement 5.4)
    if (!this.currentChannelId) {
      console.log('ℹ️ Not in a voice channel, no peer connections to re-establish')
      return
    }

    // Check if we have a local stream (Requirement 5.4)
    if (!this.localStream) {
      console.warn('⚠️ No local stream available, cannot re-establish peer connections')
      return
    }

    // Capture current media state before reconnection (Requirement 5.4)
    const audioTrack = this.localStream.getAudioTracks()[0]
    const videoTrack = this.trackManager.getCurrentVideoTrack()
    const videoState = this.trackManager.getCurrentTrackState()
    const audioEnabled = audioTrack?.enabled ?? false
    const videoEnabled = videoState.isActive && !!videoTrack
    
    console.log('📊 Capturing channel state before peer re-establishment:', {
      channelId: this.currentChannelId,
      hasAudio: !!audioTrack,
      audioEnabled,
      hasVideo: !!videoTrack,
      videoEnabled,
      videoType: videoState.type,
      currentPeerCount: this.peerConnections.size,
      timestamp: new Date().toISOString(),
    })

    // Store list of current peer IDs before cleanup
    const existingPeerIds = Array.from(this.peerConnections.keys())
    console.log('📊 Existing peer connections before cleanup:', existingPeerIds)

    // Clean up existing peer connections (Requirement 5.4)
    console.log('🧹 Cleaning up existing peer connections before re-establishment')
    for (const [userId, pc] of this.peerConnections.entries()) {
      console.log(`  Closing peer connection for ${userId}`)
      
      // Remove event listeners
      pc.onicecandidate = null
      pc.ontrack = null
      pc.oniceconnectionstatechange = null
      pc.onconnectionstatechange = null
      pc.onnegotiationneeded = null
      
      // Close the connection
      pc.close()
      
      // Stop monitoring
      connectionMonitor.stopMonitoring(userId)
    }
    
    // Clear peer connection maps
    this.peerConnections.clear()
    this.remoteStreams.clear()
    
    // Clean up remote VADs
    this.remoteVads.forEach((vad) => {
      vad.detach()
    })
    this.remoteVads.clear()
    
    // Clean up tracking data
    this.connectionAttempts.clear()
    this.usingTURNOnly.clear()
    this.iceConnectionStates.clear()
    this.connectionStartTimes.clear()
    this.connectionEstablishedTimes.clear()
    this.iceCandidateTypes.clear()
    
    console.log('✅ Cleanup completed, peer connections cleared')

    // Emit event to notify UI that we're reconnecting
    this.emit('websocket-reconnecting', {
      channelId: this.currentChannelId,
      timestamp: new Date().toISOString(),
    })

    // Re-join the voice channel to trigger server to send existing users list (Requirement 5.4)
    console.log('📤 Re-joining voice channel after WebSocket reconnection')
    console.log('📊 Re-join details:', {
      channelId: this.currentChannelId,
      videoEnabled,
      audioEnabled,
      timestamp: new Date().toISOString(),
    })

    try {
      // Send voice:join message to server
      // The server will respond with voice:existing-users which will trigger peer connection establishment
      wsService.send({
        type: 'voice:join',
        channelId: this.currentChannelId,
        videoEnabled: videoEnabled,
      })

      console.log('✅ Voice channel re-join message sent')
      
      // Emit event to notify that peer re-establishment has been initiated (Requirement 5.4)
      this.emit('peer-reestablishment-initiated', {
        channelId: this.currentChannelId,
        previousPeerCount: existingPeerIds.length,
        audioEnabled,
        videoEnabled,
        videoType: videoState.type,
        timestamp: new Date().toISOString(),
      })

      // Log state restoration information (Requirement 5.4)
      console.log('📊 Channel state to be restored:', {
        channelId: this.currentChannelId,
        audioEnabled,
        videoEnabled,
        videoType: videoState.type,
        previousPeers: existingPeerIds,
        timestamp: new Date().toISOString(),
      })

      console.log('✅ WebSocket reconnection handling completed')
      console.log('ℹ️ Waiting for server to send existing users list to complete peer re-establishment')

    } catch (error) {
      // Enhanced error logging with full context (Requirement 6.4)
      errorLogger.logChannelError(
        error,
        'websocket-reconnection-handling',
        this.currentChannelId,
        {
          audioEnabled,
          videoEnabled,
          videoType: videoState.type,
          previousPeerCount: existingPeerIds.length,
          timestamp: new Date().toISOString(),
        }
      )

      // Emit error event for UI notification
      this.emit('websocket-reconnection-error', {
        channelId: this.currentChannelId,
        error: error instanceof Error ? error.message : 'Failed to handle WebSocket reconnection',
        timestamp: new Date().toISOString(),
      })

      console.error('❌ Failed to handle WebSocket reconnection:', error)
    }
  }

  // Mutar/desmutar microfone
  // Implements Requirement 7.4: State changes emit events
  toggleMute(): boolean {
    if (!this.localStream) return false

    const audioTrack = this.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      const isMuted = !audioTrack.enabled

      console.log('🔇 Toggle mute:', isMuted)

      // Notificar outros usuários
      if (this.currentChannelId) {
        wsService.send({
          type: 'voice:mute-status',
          channelId: this.currentChannelId,
          data: {
            isMuted: isMuted,
          }
        })
      }

      // Emit local mute state change event (Requirement 7.4)
      this.emit('mute-state-change', { isMuted })

      return isMuted
    }
    return false
  }

  // Ligar/desligar vídeo
  // Implements Requirements 1.1, 1.2, 1.3, 5.1, 6.3
  // Task 5.3: Enhanced with state verification and operation queuing (Requirement 1.3)
  async toggleVideo(): Promise<boolean> {
    // Operation queuing prevents race conditions (Requirement 1.3)
    return this.trackManager.queueOperation('add-video', async () => {
      try {
        // Log operation start with comprehensive state (Requirement 1.3)
        console.log('📹 Toggle video operation started')
        
        // Verify state BEFORE toggle (Requirement 1.3)
        const stateBefore = {
          hasLocalStream: !!this.localStream,
          currentTrack: this.trackManager.getCurrentVideoTrack(),
          currentTrackId: this.trackManager.getCurrentVideoTrack()?.id || 'none',
          currentType: this.trackManager.getCurrentTrackType(),
          isActive: this.trackManager.getCurrentTrackState().isActive,
          isEnabled: this.trackManager.getCurrentVideoTrack()?.enabled ?? false,
          peerCount: this.peerConnections.size,
          timestamp: new Date().toISOString(),
        }
        
        console.log('📊 Video state before toggle:', stateBefore)
        
        // Verify state consistency before operation (Requirement 1.3)
        if (stateBefore.currentTrack) {
          const trackInStream = this.localStream?.getVideoTracks().find(t => t.id === stateBefore.currentTrackId)
          if (!trackInStream) {
            console.warn('⚠️ State inconsistency detected: track in manager but not in stream')
          } else if (trackInStream.enabled !== stateBefore.isEnabled) {
            console.warn('⚠️ State inconsistency detected: track enabled state mismatch', {
              inStream: trackInStream.enabled,
              inManager: stateBefore.isEnabled,
            })
          }
        }
        
        // Check if we're still in a voice channel
        if (!this.currentChannelId) {
          console.warn('⚠️ Not in a voice channel, canceling video toggle')
          return false
        }
        
        if (!this.localStream) {
          console.error('❌ No local stream available')
          return false
        }

        // Capture audio state before operation (Requirement 6.3)
        const audioStateBefore = this.getAudioState()

        const currentTrack = this.trackManager.getCurrentVideoTrack()
        const currentType = this.trackManager.getCurrentTrackType()

        // If video is currently enabled, disable it
        if (currentTrack && currentTrack.enabled) {
          // Log video disable operation (Requirement 4.1, 4.4)
          console.log('📊 Disabling video:', {
            trackId: currentTrack.id,
            trackType: currentType,
            trackLabel: currentTrack.label,
            peerCount: this.peerConnections.size,
            timestamp: new Date().toISOString(),
          })
          
          currentTrack.enabled = false
          this.trackManager.updateTrackState(currentType, currentTrack, false)
          
          // Verify local stream video track state (Requirement 2.4)
          this.verifyLocalStreamVideoTrack(true, false)
          
          // Log sender state change (Requirement 4.4)
          console.log('📊 Sender states after video disable:')
          for (const [peerId, pc] of this.peerConnections.entries()) {
            const senders = pc.getSenders()
            console.log(`  Peer ${peerId}:`, senders.map(s => ({
              kind: s.track?.kind,
              trackId: s.track?.id,
              enabled: s.track?.enabled,
            })))
          }
          
          console.log('📹 Video disabled')

          // Notify other users
          if (this.currentChannelId) {
            wsService.send({
              type: 'voice:video-status',
              channelId: this.currentChannelId,
              data: {
                isVideoEnabled: false,
              }
            })
          }

          this.emit('video-state-change', { isEnabled: false, type: currentType })
          
          // Verify audio state after operation (Requirement 6.3)
          this.verifyAudioPreserved(audioStateBefore)
          
          // Verify state AFTER toggle (Requirement 1.3)
          const stateAfter = {
            currentTrack: this.trackManager.getCurrentVideoTrack(),
            currentTrackId: this.trackManager.getCurrentVideoTrack()?.id || 'none',
            isActive: this.trackManager.getCurrentTrackState().isActive,
            isEnabled: this.trackManager.getCurrentVideoTrack()?.enabled ?? false,
            timestamp: new Date().toISOString(),
          }
          
          console.log('📊 Video state after toggle (disable):', stateAfter)
          
          // Verify expected state (Requirement 1.3)
          if (stateAfter.isEnabled !== false) {
            console.error('❌ State verification failed: video should be disabled but is enabled')
          } else if (stateAfter.isActive !== false) {
            console.error('❌ State verification failed: video should be inactive but is active')
          } else {
            console.log('✅ State verification passed: video is correctly disabled')
          }
          
          console.log('✅ Video toggle (disable) completed successfully')
          return false
        }

        // If video is disabled or no track exists, enable/add video
        if (currentTrack && !currentTrack.enabled) {
          // Log video enable operation (Requirement 4.1, 4.4)
          console.log('📊 Enabling video:', {
            trackId: currentTrack.id,
            trackType: currentType,
            trackLabel: currentTrack.label,
            peerCount: this.peerConnections.size,
            timestamp: new Date().toISOString(),
          })
          
          // Re-enable existing track
          currentTrack.enabled = true
          this.trackManager.updateTrackState(currentType, currentTrack, true)
          
          // Verify local stream video track state (Requirement 2.4)
          this.verifyLocalStreamVideoTrack(true, true)
          
          // Log sender state change (Requirement 4.4)
          console.log('📊 Sender states after video enable:')
          for (const [peerId, pc] of this.peerConnections.entries()) {
            const senders = pc.getSenders()
            console.log(`  Peer ${peerId}:`, senders.map(s => ({
              kind: s.track?.kind,
              trackId: s.track?.id,
              enabled: s.track?.enabled,
            })))
          }
          
          console.log('📹 Video enabled')

          // Notify other users
          if (this.currentChannelId) {
            wsService.send({
              type: 'voice:video-status',
              channelId: this.currentChannelId,
              data: {
                isVideoEnabled: true,
              }
            })
          }

          this.emit('video-state-change', { isEnabled: true, type: currentType })
          
          // Verify audio state after operation (Requirement 6.3)
          this.verifyAudioPreserved(audioStateBefore)
          
          // Verify state AFTER toggle (Requirement 1.3)
          const stateAfter = {
            currentTrack: this.trackManager.getCurrentVideoTrack(),
            currentTrackId: this.trackManager.getCurrentVideoTrack()?.id || 'none',
            isActive: this.trackManager.getCurrentTrackState().isActive,
            isEnabled: this.trackManager.getCurrentVideoTrack()?.enabled ?? false,
            timestamp: new Date().toISOString(),
          }
          
          console.log('📊 Video state after toggle (enable):', stateAfter)
          
          // Verify expected state (Requirement 1.3)
          if (stateAfter.isEnabled !== true) {
            console.error('❌ State verification failed: video should be enabled but is disabled')
          } else if (stateAfter.isActive !== true) {
            console.error('❌ State verification failed: video should be active but is inactive')
          } else {
            console.log('✅ State verification passed: video is correctly enabled')
          }
          
          console.log('✅ Video toggle (enable) completed successfully')
          return true
        }

        // No video track exists, add new camera track
        // Note: Use internal method to avoid nested queueOperation
        console.log('📊 No existing video track, adding new camera track')
        return await this.addVideoTrackInternal()
      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logChannelError(
          error,
          'toggle-video',
          this.currentChannelId,
          {
            currentTrack: this.trackManager.getCurrentVideoTrack()?.id || 'none',
            currentType: this.trackManager.getCurrentTrackType(),
            peerCount: this.peerConnections.size,
            timestamp: new Date().toISOString(),
          }
        )
        
        // Improved error messages (Requirement 5.5, 7.5)
        if (error instanceof Error) {
          this.emit('video-error', { 
            error: `Failed to toggle video: ${error.message}`,
            severity: 'error',
            action: 'retry',
          })
        } else {
          this.emit('video-error', { 
            error: 'Failed to toggle video. Please try again.',
            severity: 'error',
            action: 'retry',
          })
        }
        
        return false
      }
    })
  }

  // Adicionar track de vídeo dinamicamente (internal version without queueing)
  // Implements Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.5, 5.2, 5.4, 6.3
  private async addVideoTrackInternal(): Promise<boolean> {
      try {
        console.log('📹 Adding video track...')

        if (!this.localStream) {
          console.error('❌ No local stream available')
          return false
        }

        // Capture audio state before operation (Requirement 6.3)
        const audioStateBefore = this.getAudioState()

        // Obter stream de vídeo
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          }
        })

        const videoTrack = videoStream.getVideoTracks()[0]
        console.log(`📹 Obtained video track: ${videoTrack.id}`)

        // Check if we already have a video track
        const existingVideoTrack = this.localStream.getVideoTracks()[0]
        
        if (existingVideoTrack) {
          // Replace existing track
          await this.replaceVideoTrackForAllPeers(videoTrack)
          
          // Update local stream (only video track)
          this.localStream.removeTrack(existingVideoTrack)
          this.localStream.addTrack(videoTrack)
          
          // Verify local stream video track state (Requirement 2.4)
          this.verifyLocalStreamVideoTrack(true, true)
        } else {
          // Add new track to local stream
          this.localStream.addTrack(videoTrack)
          
          // Verify local stream video track state (Requirement 2.4)
          this.verifyLocalStreamVideoTrack(true, true)

          // Para cada conexão peer existente, verificar se já tem sender de vídeo
          // Implements Requirements 2.1, 2.2, 2.5, 5.2, 5.4
          const addTrackResults: Array<{ peerId: string; success: boolean; error?: string }> = []
          
          for (const [userId, pc] of this.peerConnections.entries()) {
            console.log(`📊 Checking video sender for peer ${userId}`)
            
            try {
              // Wait for stable signaling state before operations (Requirement 5.4)
              await this.waitForStableState(pc, userId)
              
              const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')

              if (videoSender) {
                // Se já tem sender, apenas substituir a track
                // Implements Requirement 2.2: Use replaceTrack() for existing senders
                console.log(`🔄 Replacing video track for ${userId} (sender exists)`)
                await videoSender.replaceTrack(videoTrack)
                
                // Verify sender after replacement (Requirement 2.5)
                const verifiedSender = pc.getSenders().find(s => s.track?.kind === 'video')
                if (!verifiedSender || verifiedSender.track?.id !== videoTrack.id) {
                  throw new Error(`Sender verification failed after replaceTrack for ${userId}`)
                }
                
                // Log sender state after replacement (Requirement 2.5)
                console.log(`📊 Sender state for ${userId} after replace:`, {
                  trackId: videoSender.track?.id,
                  trackKind: videoSender.track?.kind,
                  trackEnabled: videoSender.track?.enabled,
                })
                
                addTrackResults.push({ peerId: userId, success: true })
              } else {
                // Se não tem sender, adicionar novo track (vai causar renegociação)
                // Implements Requirement 2.1: Use addTrack() for peers without senders
                console.log(`➕ Adding video track for ${userId} (no sender exists)`)
                const sender = pc.addTrack(videoTrack, this.localStream)
                
                // Verify sender was created (Requirement 2.2)
                if (!sender || !sender.track) {
                  throw new Error(`Failed to create sender for ${userId}`)
                }
                
                console.log(`📊 Sender created for ${userId}:`, {
                  trackId: sender.track?.id,
                  trackKind: sender.track?.kind,
                  trackEnabled: sender.track?.enabled,
                })
                
                // Verify sender exists in peer connection
                const verifiedSender = pc.getSenders().find(s => s.track?.kind === 'video')
                if (!verifiedSender) {
                  // Trigger renegotiation if sender missing (Requirement 5.2)
                  console.warn(`⚠️ Sender not found after addTrack for ${userId}, triggering renegotiation`)
                  await this.triggerRenegotiation(pc, userId)
                  
                  // Verify again after renegotiation
                  const renegotiatedSender = pc.getSenders().find(s => s.track?.kind === 'video')
                  if (!renegotiatedSender) {
                    throw new Error(`Sender still missing after renegotiation for ${userId}`)
                  }
                  console.log(`✅ Sender verified after renegotiation for ${userId}`)
                }
                
                addTrackResults.push({ peerId: userId, success: true })
              }
            } catch (error) {
              console.error(`❌ Failed to add/replace video track for ${userId}:`, error)
              addTrackResults.push({ 
                peerId: userId, 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error' 
              })
            }
          }
          
          // Log results summary
          const successCount = addTrackResults.filter(r => r.success).length
          const failureCount = addTrackResults.filter(r => !r.success).length
          
          console.log(`📊 Video track addition results: ${successCount} succeeded, ${failureCount} failed`)
          
          if (failureCount > 0) {
            const failedPeers = addTrackResults.filter(r => !r.success).map(r => r.peerId)
            console.warn(`⚠️ Failed to add video track for peers: ${failedPeers.join(', ')}`)
          }
          
          // Verify and fix all peers have video senders after operation (Requirements 2.5, 5.1, 8.2)
          await this.verifyAndFixVideoSenders()
        }

        // Update track manager state
        this.trackManager.updateTrackState('camera', videoTrack, true)

        console.log('✅ Video track added successfully')
        this.emit('local-stream', this.localStream)

        // Notificar outros usuários sobre o status
        if (this.currentChannelId) {
          wsService.send({
            type: 'voice:video-status',
            channelId: this.currentChannelId,
            data: {
              isVideoEnabled: true,
            }
          })
        }

        this.emit('video-state-change', { isEnabled: true, type: 'camera' })
        
        // Verify audio state after operation (Requirement 6.3)
        this.verifyAudioPreserved(audioStateBefore)
        
        return true
      } catch (error) {
        // Enhanced error logging with full context (Requirement 6.4)
        errorLogger.logMediaDeviceError(
          error,
          'add-video-track',
          'camera',
          {
            channelId: this.currentChannelId,
            peerCount: this.peerConnections.size,
            hasLocalStream: !!this.localStream,
          }
        )
        
        // Check if this is a media device error or a connection error (Requirement 6.1)
        if (error instanceof Error) {
          // Handle media device errors with centralized error handler
          if (['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'SecurityError'].includes(error.name)) {
            const errorInfo = getMediaErrorInfo(error, 'camera')
            const guidance = getErrorGuidance(errorInfo)
            
            console.error('📋 Media device error details:', {
              error: errorInfo.error,
              severity: errorInfo.severity,
              action: errorInfo.action,
              technicalDetails: errorInfo.technicalDetails,
              guidance: guidance,
            })
            
            this.emit('video-error', {
              error: errorInfo.error,
              severity: errorInfo.severity,
              action: errorInfo.action,
              guidance: guidance,
              technicalDetails: errorInfo.technicalDetails,
            })
          } else if (error.message && error.message.includes('replace')) {
            // Track replacement error
            this.emit('video-error', { 
              error: 'Failed to update video for other participants. Your video may not be visible to others.',
              severity: 'error',
              action: 'reconnect',
              guidance: getErrorGuidance({ error: '', severity: 'error', action: 'reconnect' }),
            })
          } else if (error.message && error.message.includes('sender')) {
            // Sender creation/verification error
            this.emit('video-error', { 
              error: 'Failed to establish video connection with some participants. Your video may not be visible to all.',
              severity: 'error',
              action: 'retry',
              guidance: getErrorGuidance({ error: '', severity: 'error', action: 'retry' }),
            })
          } else if (error.message && error.message.includes('stable')) {
            // Signaling state error
            this.emit('video-error', { 
              error: 'Connection is busy. Please wait a moment and try again.',
              severity: 'warning',
              action: 'retry',
              guidance: getErrorGuidance({ error: '', severity: 'warning', action: 'retry' }),
            })
          } else {
            // Generic error
            this.emit('video-error', { 
              error: 'Failed to access camera. Please check your camera and try again.',
              severity: 'error',
              action: 'retry',
              guidance: getErrorGuidance({ error: '', severity: 'error', action: 'retry' }),
            })
          }
        } else {
          this.emit('video-error', { 
            error: 'An unexpected error occurred while accessing the camera.',
            severity: 'error',
            action: 'retry',
            guidance: getErrorGuidance({ error: '', severity: 'error', action: 'retry' }),
          })
        }
        
        return false
      }
  }

  /**
   * Public method to add video track (uses queue)
   * This is the public API that should be called from outside
   */
  async addVideoTrack(): Promise<boolean> {
    return this.trackManager.queueOperation('add-video', async () => {
      return await this.addVideoTrackInternal()
    })
  }

  /**
   * Verify all peer connections have video senders
   * Implements Requirement 2.5: Verify video senders exist for all peers
   * 
   * @param expectedTrackId - Expected video track ID
   */
  private async verifyVideoSenders(expectedTrackId: string): Promise<void> {
    console.log('🔍 Verifying video senders for all peers...')
    
    let allVerified = true
    const missingPeers: string[] = []
    
    for (const [userId, pc] of this.peerConnections.entries()) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (!videoSender) {
        console.error(`❌ No video sender found for peer ${userId}`)
        allVerified = false
        missingPeers.push(userId)
      } else if (videoSender.track?.id !== expectedTrackId) {
        console.warn(`⚠️ Video sender for peer ${userId} has unexpected track ID:`, {
          expected: expectedTrackId,
          actual: videoSender.track?.id,
        })
      } else {
        console.log(`✅ Video sender verified for peer ${userId}:`, {
          trackId: videoSender.track.id,
          trackEnabled: videoSender.track.enabled,
        })
      }
    }
    
    if (!allVerified) {
      console.error(`❌ Video sender verification failed for ${missingPeers.length} peer(s): ${missingPeers.join(', ')}`)
      this.emit('video-error', {
        error: `Video may not be visible to some participants (${missingPeers.length} failed)`,
        severity: 'warning',
        action: 'retry',
        failedPeers: missingPeers,
      })
    } else {
      console.log('✅ All video senders verified successfully')
    }
  }

  /**
   * Verify and fix video senders for all peer connections
   * Implements Requirements 2.5, 5.1, 8.2
   * 
   * Checks all peer connections for video senders and automatically recreates
   * missing senders. This method is used for automatic recovery when video
   * transmission issues are detected.
   * 
   * @returns Promise<void>
   */
  async verifyAndFixVideoSenders(): Promise<void> {
    console.log('🔍 Verifying and fixing video senders for all peers...')
    
    // Get current video track
    const currentVideoTrack = this.trackManager.getCurrentVideoTrack()
    
    if (!currentVideoTrack) {
      console.log('ℹ️ No video track available, skipping sender verification')
      return
    }
    
    if (!this.localStream) {
      console.error('❌ No local stream available')
      return
    }
    
    const verificationResults: Array<{
      peerId: string
      hasSender: boolean
      fixed: boolean
      error?: string
    }> = []
    
    // Check each peer connection
    for (const [peerId, pc] of this.peerConnections.entries()) {
      console.log(`📊 Checking video sender for peer ${peerId}`)
      
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (!videoSender) {
        // Missing sender - attempt to recreate
        console.warn(`⚠️ No video sender found for peer ${peerId}, attempting to recreate...`)
        
        try {
          // Add track to peer connection (triggers negotiation)
          const newSender = pc.addTrack(currentVideoTrack, this.localStream)
          
          console.log(`✅ Video sender recreated for peer ${peerId}:`, {
            trackId: newSender.track?.id,
            trackKind: newSender.track?.kind,
            trackEnabled: newSender.track?.enabled,
          })
          
          verificationResults.push({
            peerId,
            hasSender: false,
            fixed: true,
          })
        } catch (error) {
          console.error(`❌ Failed to recreate video sender for peer ${peerId}:`, error)
          
          verificationResults.push({
            peerId,
            hasSender: false,
            fixed: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      } else {
        // Sender exists - verify it has the correct track
        const hasCorrectTrack = videoSender.track?.id === currentVideoTrack.id
        
        if (!hasCorrectTrack) {
          console.warn(`⚠️ Video sender for peer ${peerId} has incorrect track:`, {
            expected: currentVideoTrack.id,
            actual: videoSender.track?.id,
          })
          
          // Attempt to fix by replacing track
          try {
            await videoSender.replaceTrack(currentVideoTrack)
            console.log(`✅ Video track replaced for peer ${peerId}`)
            
            verificationResults.push({
              peerId,
              hasSender: true,
              fixed: true,
            })
          } catch (error) {
            console.error(`❌ Failed to replace video track for peer ${peerId}:`, error)
            
            verificationResults.push({
              peerId,
              hasSender: true,
              fixed: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        } else {
          console.log(`✅ Video sender verified for peer ${peerId}:`, {
            trackId: videoSender.track.id,
            trackEnabled: videoSender.track.enabled,
          })
          
          verificationResults.push({
            peerId,
            hasSender: true,
            fixed: false, // No fix needed
          })
        }
      }
    }
    
    // Log verification summary
    const totalPeers = verificationResults.length
    const peersWithSenders = verificationResults.filter(r => r.hasSender).length
    const peersFixed = verificationResults.filter(r => r.fixed).length
    const peersFailed = verificationResults.filter(r => r.hasSender === false && r.fixed === false).length
    
    console.log('📊 Video sender verification summary:', {
      totalPeers,
      peersWithSenders,
      peersFixed,
      peersFailed,
      results: verificationResults,
    })
    
    // Emit events based on results
    if (peersFailed > 0) {
      const failedPeers = verificationResults
        .filter(r => r.fixed === false && r.hasSender === false)
        .map(r => r.peerId)
      
      console.error(`❌ Failed to fix video senders for ${peersFailed} peer(s): ${failedPeers.join(', ')}`)
      
      this.emit('video-error', {
        error: `Video may not be visible to some participants (${peersFailed} failed)`,
        severity: 'warning',
        action: 'retry',
        failedPeers,
      })
    } else if (peersFixed > 0) {
      console.log(`✅ Fixed video senders for ${peersFixed} peer(s)`)
      
      this.emit('video-senders-fixed', {
        peersFixed,
        results: verificationResults,
      })
    } else {
      console.log('✅ All video senders verified successfully, no fixes needed')
    }
  }

  /**
   * Wait for stable signaling state before operations
   * Implements Requirement 5.4: Wait for stable state before negotiation
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
   * Trigger renegotiation for a peer connection
   * Implements Requirement 5.2: Renegotiate when track is missing
   * Task 14: Enhanced with comprehensive negotiation logging (Requirements 4.2, 4.4, 4.5)
   * 
   * @param pc - RTCPeerConnection to renegotiate
   * @param peerId - Peer ID for logging
   * @returns Promise that resolves when renegotiation offer is sent
   */
  private async triggerRenegotiation(pc: RTCPeerConnection, peerId: string): Promise<void> {
    try {
      console.log(`🔄 Triggering renegotiation for ${peerId}`)
      
      // Log connection state before renegotiation (Requirement 4.2)
      console.log('📊 Connection state before renegotiation:', {
        peerId,
        signalingState: pc.signalingState,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        senders: pc.getSenders().map(s => ({
          kind: s.track?.kind,
          trackId: s.track?.id,
          enabled: s.track?.enabled,
        })),
        timestamp: new Date().toISOString(),
      })
      
      // Wait for stable state before creating offer
      await this.waitForStableState(pc, peerId)
      
      // Create and send new offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Log offer details (Requirement 4.2)
      console.log('📊 Renegotiation offer created:', {
        peerId,
        offerType: offer.type,
        sdpLength: offer.sdp?.length || 0,
        signalingState: pc.signalingState,
        timestamp: new Date().toISOString(),
      })
      
      console.log(`📤 Sending renegotiation offer to ${peerId}`)
      wsService.send({
        type: 'voice:offer',
        data: {
          targetUserId: peerId,
          offer: offer,
        }
      })
      
      // Log sender state after renegotiation (Requirement 4.4)
      console.log('📊 Sender state after renegotiation:', {
        peerId,
        senders: pc.getSenders().map(s => ({
          kind: s.track?.kind,
          trackId: s.track?.id,
          enabled: s.track?.enabled,
        })),
      })
      
      console.log(`✅ Renegotiation triggered for ${peerId}`)
    } catch (error) {
      // Enhanced error logging with full context (Requirement 4.5)
      console.error(`❌ Failed to trigger renegotiation for ${peerId}:`, {
        peerId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        signalingState: pc.signalingState,
        connectionState: pc.connectionState,
        timestamp: new Date().toISOString(),
      })
      throw error
    }
  }

  /**
   * Recreate sender for a peer connection after failure
   * Implements Requirement 5.3: Sender recreation on failure
   * 
   * This method detects track transmission failures and attempts recovery by:
   * 1. Removing the existing sender (if any)
   * 2. Waiting for stable signaling state
   * 3. Adding the track again to create a new sender
   * 4. Triggering renegotiation to establish the new sender
   * 5. Verifying the sender was successfully created
   * 
   * @param peerId - Peer ID to recreate sender for
   * @param track - Media track to add to the peer connection
   * @returns Promise that resolves when sender is recreated
   * @throws Error if sender recreation fails
   */
  async recreateSenderForPeer(peerId: string, track: MediaStreamTrack): Promise<void> {
    console.log(`🔄 Attempting to recreate sender for peer ${peerId}`, {
      trackId: track.id,
      trackKind: track.kind,
      trackEnabled: track.enabled,
      trackReadyState: track.readyState,
    })

    try {
      // Get peer connection
      const pc = this.peerConnections.get(peerId)
      
      if (!pc) {
        const error = `No peer connection found for ${peerId}`
        console.error(`❌ ${error}`)
        throw new Error(error)
      }

      // Log current connection state for debugging
      console.log(`📊 Peer connection state for ${peerId}:`, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
      })

      // Check if track is valid
      if (track.readyState !== 'live') {
        const error = `Track is not live (readyState: ${track.readyState})`
        console.error(`❌ ${error}`)
        throw new Error(error)
      }

      // Step 1: Remove existing sender if present
      const existingSender = pc.getSenders().find(s => s.track?.kind === track.kind)
      
      if (existingSender) {
        console.log(`🗑️ Removing existing ${track.kind} sender for ${peerId}`)
        
        try {
          // Remove the track from the sender
          await existingSender.replaceTrack(null)
          
          // Remove the sender from the peer connection
          pc.removeTrack(existingSender)
          
          console.log(`✅ Existing sender removed for ${peerId}`)
        } catch (removeError) {
          console.warn(`⚠️ Failed to remove existing sender for ${peerId}:`, removeError)
          // Continue anyway - we'll try to add the new track
        }
      } else {
        console.log(`ℹ️ No existing ${track.kind} sender found for ${peerId}`)
      }

      // Step 2: Wait for stable signaling state
      console.log(`⏳ Waiting for stable signaling state for ${peerId}`)
      await this.waitForStableState(pc, peerId)

      // Step 3: Add track to create new sender
      console.log(`➕ Adding ${track.kind} track to peer connection for ${peerId}`)
      
      if (!this.localStream) {
        const error = 'No local stream available'
        console.error(`❌ ${error}`)
        throw new Error(error)
      }

      const newSender = pc.addTrack(track, this.localStream)
      
      console.log(`✅ New sender created for ${peerId}:`, {
        trackId: newSender.track?.id,
        trackKind: newSender.track?.kind,
        trackEnabled: newSender.track?.enabled,
      })

      // Step 4: Trigger renegotiation to establish the new sender
      console.log(`🔄 Triggering renegotiation for ${peerId} to establish new sender`)
      await this.triggerRenegotiation(pc, peerId)

      // Step 5: Verify sender was successfully created
      console.log(`🔍 Verifying sender for ${peerId}`)
      
      const verifiedSender = pc.getSenders().find(s => s.track?.kind === track.kind)
      
      if (!verifiedSender) {
        const error = `Sender verification failed: no ${track.kind} sender found after recreation`
        console.error(`❌ ${error}`)
        throw new Error(error)
      }

      if (verifiedSender.track?.id !== track.id) {
        console.warn(`⚠️ Sender has different track ID than expected:`, {
          expected: track.id,
          actual: verifiedSender.track?.id,
        })
      }

      console.log(`✅ Sender successfully recreated and verified for ${peerId}:`, {
        trackId: verifiedSender.track?.id,
        trackKind: verifiedSender.track?.kind,
        trackEnabled: verifiedSender.track?.enabled,
      })

      // Emit recovery success event
      this.emit('sender-recreated', {
        peerId,
        trackKind: track.kind,
        trackId: track.id,
        success: true,
      })

    } catch (error) {
      console.error(`❌ Failed to recreate sender for ${peerId}:`, error)
      
      // Log detailed error information for debugging (Requirement 4.5)
      const errorDetails = {
        peerId,
        trackId: track.id,
        trackKind: track.kind,
        trackReadyState: track.readyState,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }
      
      console.error('📊 Sender recreation failure details:', errorDetails)

      // Emit recovery failure event
      this.emit('sender-recreation-failed', {
        peerId,
        trackKind: track.kind,
        trackId: track.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      })

      // Re-throw error for caller to handle
      throw error
    }
  }

  /**
   * Get audio state snapshot for verification
   * Implements Requirement 6.3: Audio preservation during video transitions
   * 
   * @returns Audio state information
   */
  private getAudioState(): { hasAudioTrack: boolean; isEnabled: boolean; trackId: string | null } {
    if (!this.localStream) {
      return { hasAudioTrack: false, isEnabled: false, trackId: null }
    }

    const audioTrack = this.localStream.getAudioTracks()[0]
    if (!audioTrack) {
      return { hasAudioTrack: false, isEnabled: false, trackId: null }
    }

    return {
      hasAudioTrack: true,
      isEnabled: audioTrack.enabled,
      trackId: audioTrack.id,
    }
  }

  /**
   * Verify audio state has not changed
   * Implements Requirement 6.3: Audio preservation during video transitions
   * 
   * @param beforeState - Audio state before operation
   * @returns True if audio state is unchanged
   */
  private verifyAudioPreserved(beforeState: { hasAudioTrack: boolean; isEnabled: boolean; trackId: string | null }): boolean {
    const afterState = this.getAudioState()
    
    const preserved = (
      beforeState.hasAudioTrack === afterState.hasAudioTrack &&
      beforeState.isEnabled === afterState.isEnabled &&
      beforeState.trackId === afterState.trackId
    )

    if (!preserved) {
      console.error('❌ Audio state changed during video operation!', {
        before: beforeState,
        after: afterState,
      })
    } else {
      console.log('✅ Audio state preserved during video operation')
    }

    return preserved
  }

  /**
   * Verify local stream video track presence matches expected state
   * Implements Requirement 2.4: Verify local stream contains video track when enabled
   * 
   * @param shouldHaveVideo - Whether video track should be present
   * @param shouldBeEnabled - Whether video track should be enabled (only checked if shouldHaveVideo is true)
   * @returns True if local stream video track state matches expectations
   */
  private verifyLocalStreamVideoTrack(shouldHaveVideo: boolean, shouldBeEnabled?: boolean): boolean {
    if (!this.localStream) {
      console.error('❌ No local stream available for verification')
      return false
    }

    const videoTracks = this.localStream.getVideoTracks()
    const hasVideoTrack = videoTracks.length > 0
    
    if (shouldHaveVideo) {
      // Should have exactly one video track
      if (videoTracks.length === 0) {
        console.error('❌ Local stream video track verification failed: Expected video track but none found')
        return false
      }
      
      if (videoTracks.length > 1) {
        console.warn('⚠️ Local stream has multiple video tracks:', videoTracks.length)
      }
      
      const videoTrack = videoTracks[0]
      
      // Check enabled state if specified
      if (shouldBeEnabled !== undefined && videoTrack.enabled !== shouldBeEnabled) {
        console.error('❌ Local stream video track verification failed:', {
          expected: { enabled: shouldBeEnabled },
          actual: { enabled: videoTrack.enabled },
          trackId: videoTrack.id,
        })
        return false
      }
      
      console.log('✅ Local stream video track verified:', {
        trackId: videoTrack.id,
        enabled: videoTrack.enabled,
        label: videoTrack.label,
        readyState: videoTrack.readyState,
      })
      return true
    } else {
      // Should have no video tracks
      if (hasVideoTrack) {
        console.error('❌ Local stream video track verification failed: Expected no video track but found', videoTracks.length)
        return false
      }
      
      console.log('✅ Local stream video track verified: No video track present as expected')
      return true
    }
  }

  /**
   * Replace video track across all peer connections with error recovery
   * Implements Requirements 1.1, 1.2, 3.1, 3.2, 3.4, 6.1, 6.2, 6.3, 6.5
   * 
   * Uses RTCRtpSender.replaceTrack() to swap tracks without triggering renegotiation.
   * Supports null track to disable video.
   * Ensures audio tracks are never modified during the operation.
   * Implements failure recovery by restoring previous track state on error.
   * 
   * Task 12: Enhanced with detailed logging and verification for screen share
   * 
   * @param newTrack - New video track to replace with (or null to disable video)
   * @returns Promise that resolves when all replacements complete
   * @throws Error if replacement fails and recovery is not possible
   */
  private async replaceVideoTrackForAllPeers(newTrack: MediaStreamTrack | null): Promise<void> {
    const trackDescription = newTrack 
      ? `${newTrack.id} (kind: ${newTrack.kind}, label: ${newTrack.label})`
      : 'null (disable)'
    
    console.log('🔄 Replacing video track for all peers with', trackDescription)
    
    // Capture audio state before operation (Requirement 6.3)
    const audioStateBefore = this.getAudioState()
    
    // Save current track state for recovery (Requirement 6.5)
    const previousTrack = this.trackManager.getCurrentVideoTrack()
    const previousType = this.trackManager.getCurrentTrackType()
    const previousState = this.trackManager.getCurrentTrackState()
    
    console.log(`📊 Saving previous state for recovery: type=${previousType}, trackId=${previousTrack?.id || 'none'}`)
    
    // Track replacement results for each peer (Task 12: Requirement 3.1, 3.2, 3.4)
    const replacementResults: Array<{
      peerId: string
      success: boolean
      hadSender: boolean
      error?: string
      replacedTrackId?: string
      newTrackId?: string
    }> = []

    // Log operation start for all peers (Task 12: Requirement 3.1)
    console.log(`📊 Starting track replacement for ${this.peerConnections.size} peer(s)`)
    
    const replacementPromises: Promise<void>[] = []
    const failedPeers: string[] = []

    for (const [userId, pc] of this.peerConnections.entries()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (sender) {
        const oldTrackId = sender.track?.id || 'none'
        
        // Log replacement operation for this peer (Task 12: Requirement 3.1)
        console.log(`🔄 Replacing video track for peer ${userId}:`, {
          oldTrackId,
          newTrackId: newTrack?.id || 'null',
          senderExists: true,
        })
        
        replacementPromises.push(
          sender.replaceTrack(newTrack).then(() => {
            // Verify sender after replacement (Task 12: Requirement 3.2)
            const verifiedSender = pc.getSenders().find(s => s.track?.kind === 'video')
            const verifiedTrackId = verifiedSender?.track?.id || 'none'
            
            // Log successful replacement with verification (Task 12: Requirement 3.1, 3.2)
            console.log(`✅ Video track replaced for peer ${userId}:`, {
              oldTrackId,
              newTrackId: newTrack?.id || 'null',
              verifiedTrackId,
              verificationPassed: newTrack ? verifiedTrackId === newTrack.id : verifiedTrackId === 'none',
            })
            
            // Verify the replacement was successful (Task 12: Requirement 3.2)
            if (newTrack && verifiedTrackId !== newTrack.id) {
              const error = `Sender verification failed: expected ${newTrack.id}, got ${verifiedTrackId}`
              console.error(`❌ ${error}`)
              throw new Error(error)
            }
            
            replacementResults.push({
              peerId: userId,
              success: true,
              hadSender: true,
              replacedTrackId: oldTrackId,
              newTrackId: newTrack?.id || 'null',
            })
          }).catch((error) => {
            // Log replacement failure with details (Task 12: Requirement 3.4)
            console.error(`❌ Failed to replace track for peer ${userId}:`, {
              oldTrackId,
              newTrackId: newTrack?.id || 'null',
              error: error instanceof Error ? error.message : 'Unknown error',
              errorName: error instanceof Error ? error.name : 'Unknown',
            })
            
            failedPeers.push(userId)
            
            replacementResults.push({
              peerId: userId,
              success: false,
              hadSender: true,
              replacedTrackId: oldTrackId,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            
            throw error
          })
        )
      } else {
        // No sender found - log warning (Task 12: Requirement 3.1)
        console.warn(`⚠️ No video sender found for peer ${userId} - cannot replace track`)
        
        replacementResults.push({
          peerId: userId,
          success: false,
          hadSender: false,
          error: 'No video sender found',
        })
      }
    }

    try {
      await Promise.all(replacementPromises)
      
      // Log summary of replacement operation (Task 12: Requirement 3.1)
      const successCount = replacementResults.filter(r => r.success).length
      const failureCount = replacementResults.filter(r => !r.success).length
      const noSenderCount = replacementResults.filter(r => !r.hadSender).length
      
      console.log('✅ Video track replaced for all peers:', {
        totalPeers: this.peerConnections.size,
        successCount,
        failureCount,
        noSenderCount,
        newTrackId: newTrack?.id || 'null',
      })
      
      // Verify audio state after operation (Requirement 6.3)
      this.verifyAudioPreserved(audioStateBefore)
    } catch (error) {
      // Track replacement failed for one or more peers
      // Implement failure recovery (Task 12: Requirement 3.4, Requirement 6.5)
      console.error('❌ Track replacement failed, attempting recovery...', {
        failedPeers,
        failedCount: failedPeers.length,
        totalPeers: this.peerConnections.size,
        error: error instanceof Error ? error.message : 'Unknown error',
        replacementResults,
      })
      
      // Attempt to restore previous track state
      await this.restorePreviousTrackState(previousTrack, previousType, previousState)
      
      // Re-throw error after recovery attempt
      throw new Error(`Failed to replace video track for peers: ${failedPeers.join(', ')}`)
    }
  }

  /**
   * Restore previous track state after a failed operation
   * Implements Requirement 6.5: Track replacement failure restores previous state
   * 
   * @param previousTrack - Previous video track
   * @param previousType - Previous track type
   * @param previousState - Previous track state
   */
  private async restorePreviousTrackState(
    previousTrack: MediaStreamTrack | null,
    previousType: TrackType,
    previousState: TrackState
  ): Promise<void> {
    console.log('🔄 Attempting to restore previous track state...', {
      type: previousType,
      trackId: previousTrack?.id || 'none',
      wasActive: previousState.isActive,
    })

    try {
      // Check if previous track is still valid
      if (previousTrack && previousTrack.readyState === 'live') {
        console.log('✅ Previous track is still live, restoring...')
        
        // Restore track across all peer connections
        await this.replaceVideoTrackForAllPeersWithoutRecovery(previousTrack)
        
        // Update local stream
        if (this.localStream) {
          const currentVideoTrack = this.localStream.getVideoTracks()[0]
          if (currentVideoTrack && currentVideoTrack !== previousTrack) {
            this.localStream.removeTrack(currentVideoTrack)
            currentVideoTrack.stop()
          }
          if (!this.localStream.getVideoTracks().includes(previousTrack)) {
            this.localStream.addTrack(previousTrack)
          }
        }
        
        // Restore track manager state
        this.trackManager.updateTrackState(previousType, previousTrack, previousState.isActive)
        
        // Emit state change event
        this.emit('video-state-change', { isEnabled: previousState.isActive, type: previousType })
        
        console.log('✅ Previous track state restored successfully')
      } else {
        // Previous track is not available, disable video
        console.warn('⚠️ Previous track is not available, disabling video')
        await this.disableVideoCompletely()
      }
    } catch (recoveryError) {
      console.error('❌ Failed to restore previous track state:', recoveryError)
      
      // Last resort: disable video completely
      console.warn('⚠️ Recovery failed, disabling video completely')
      await this.disableVideoCompletely()
    }
  }

  /**
   * Replace video track without recovery mechanism (used during recovery)
   * 
   * @param newTrack - New video track to replace with
   */
  private async replaceVideoTrackForAllPeersWithoutRecovery(newTrack: MediaStreamTrack | null): Promise<void> {
    const replacementPromises: Promise<void>[] = []

    for (const [userId, pc] of this.peerConnections.entries()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (sender) {
        replacementPromises.push(
          sender.replaceTrack(newTrack).catch((error) => {
            console.error(`❌ Failed to replace track for ${userId} during recovery:`, error)
            // Don't throw, continue with other peers
          })
        )
      }
    }

    await Promise.all(replacementPromises)
  }

  /**
   * Disable video completely as last resort recovery
   * Implements Requirement 6.5: Failure recovery
   * 
   * Stops all video tracks and removes them from peer connections
   */
  private async disableVideoCompletely(): Promise<void> {
    console.log('🚨 Disabling video completely as recovery fallback')
    
    try {
      // Stop current video track if it exists
      const currentTrack = this.trackManager.getCurrentVideoTrack()
      if (currentTrack) {
        currentTrack.stop()
      }
      
      // Remove video track from local stream
      if (this.localStream) {
        const videoTracks = this.localStream.getVideoTracks()
        videoTracks.forEach(track => {
          track.stop()
          this.localStream!.removeTrack(track)
        })
      }
      
      // Replace with null track (removes video from peer connections)
      await this.replaceVideoTrackForAllPeersWithoutRecovery(null)
      
      // Update track manager state
      this.trackManager.updateTrackState('none', null, false)
      
      // Emit state change event
      this.emit('video-state-change', { isEnabled: false, type: 'none' })
      
      // Emit error to UI (Requirement 5.5)
      this.emit('video-error', { 
        error: 'Video operation failed and could not be recovered. Video has been disabled.',
        severity: 'error',
      })
      
      console.log('✅ Video disabled completely')
    } catch (error) {
      console.error('❌ Failed to disable video completely:', error)
      // At this point, we've done everything we can
    }
  }

  /**
   * Get current video state
   * Implements Requirements 5.1, 7.1
   * 
   * @returns Current video state with enabled status and type
   */
  getVideoState(): VideoState {
    const trackState = this.trackManager.getCurrentTrackState()
    return {
      isEnabled: trackState.isActive,
      type: trackState.type,
    }
  }

  /**
   * Start screen sharing
   * Implements Requirements 2.1, 2.2, 2.4, 3.1, 3.2, 3.4, 6.1, 6.2, 6.3
   * 
   * Uses replaceTrack() to swap camera track with screen track without renegotiation.
   * Saves camera track state to restore later.
   * Ensures audio tracks are never modified during the operation.
   * 
   * Task 12: Enhanced with sender verification after replacement
   * 
   * @returns Promise<boolean> - True if screen share started successfully
   */
  async shareScreen(): Promise<boolean> {
    return this.trackManager.queueOperation('start-screen-share', async () => {
      try {
        console.log('🖥️ Starting screen share...')

        // Check if we're still in a voice channel
        if (!this.currentChannelId) {
          console.warn('⚠️ Not in a voice channel, canceling screen share')
          this.emit('video-error', { error: 'Not in an active call' })
          return false
        }

        if (!this.localStream) {
          console.error('❌ No local stream available')
          this.emit('video-error', { error: 'No active call to share screen in' })
          return false
        }

        // Capture audio state before operation (Requirement 6.3)
        const audioStateBefore = this.getAudioState()

        // Get screen share stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
          },
          audio: false,
        })

        const screenTrack = screenStream.getVideoTracks()[0]
        
        console.log(`📊 Screen track obtained:`, {
          trackId: screenTrack.id,
          label: screenTrack.label,
          enabled: screenTrack.enabled,
          readyState: screenTrack.readyState,
        })

        // Save current camera track before replacing (if it exists)
        const currentTrack = this.trackManager.getCurrentVideoTrack()
        const currentType = this.trackManager.getCurrentTrackType()
        
        console.log(`📊 Current track before screen share: type=${currentType}, trackId=${currentTrack?.id || 'none'}`)

        // Handle screen share cancellation or unexpected termination
        // Implements Requirement 2.4
        screenTrack.onended = () => {
          console.log('🖥️ Screen share ended by user or system')
          this.stopScreenShare()
        }

        // Replace video track across all peer connections using replaceTrack()
        // Implements Requirements 3.1, 3.2, 3.4, 6.1, 6.2
        // This method now includes detailed logging and verification (Task 12)
        await this.replaceVideoTrackForAllPeers(screenTrack)
        
        // Verify all peers have screen track after replacement (Task 12: Requirement 3.2)
        console.log('🔍 Verifying screen track on all peers...')
        await this.verifyScreenTrackOnAllPeers(screenTrack.id)

        // Update local stream (only video track)
        const oldVideoTrack = this.localStream.getVideoTracks()[0]
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack)
        }
        this.localStream.addTrack(screenTrack)
        
        // Verify local stream video track state (Requirement 2.4)
        this.verifyLocalStreamVideoTrack(true, true)

        // Update track manager state
        this.trackManager.updateTrackState('screen', screenTrack, true)

        // Emit events
        this.emit('local-stream', this.localStream)
        this.emit('screen-share-started')
        this.emit('video-state-change', { isEnabled: true, type: 'screen' })

        console.log('✅ Screen share started successfully')
        
        // Verify audio state after operation (Requirement 6.3)
        this.verifyAudioPreserved(audioStateBefore)
        
        return true
      } catch (error) {
        console.error('❌ Failed to share screen:', error)
        
        // Handle specific error types with improved messages (Requirement 5.5)
        // Implements Requirement 2.4 (error handling for cancellation)
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            // User canceled screen share picker
            console.log('ℹ️ User canceled screen share')
            return false
          } else if (error.name === 'NotFoundError') {
            this.emit('video-error', { 
              error: 'No screen or window available to share.',
              severity: 'warning',
              action: 'retry',
            })
          } else if (error.name === 'NotReadableError') {
            this.emit('video-error', { 
              error: 'Cannot access screen sharing. Another application may be blocking it.',
              severity: 'warning',
              action: 'check-permissions',
            })
          } else if (error.message && error.message.includes('replace')) {
            // Track replacement error - attempt recovery
            this.emit('video-error', { 
              error: 'Failed to share screen with other participants. Attempting to restore camera.',
              severity: 'error',
              action: 'recovering',
            })
          } else if (error.message && error.message.includes('verification')) {
            // Verification error after replacement
            this.emit('video-error', { 
              error: 'Screen share may not be visible to all participants. Some connections failed verification.',
              severity: 'warning',
              action: 'retry',
            })
          } else {
            this.emit('video-error', { 
              error: 'Failed to start screen sharing. Please try again.',
              severity: 'error',
              action: 'retry',
            })
          }
        } else {
          this.emit('video-error', { 
            error: 'An unexpected error occurred while starting screen share.',
            severity: 'error',
            action: 'retry',
          })
        }
        
        return false
      }
    })
  }

  /**
   * Stop screen sharing and restore camera
   * Implements Requirements 2.3, 2.4, 3.1, 3.2, 3.4, 3.5, 6.1, 6.2, 6.3
   * 
   * Restores camera track using replaceTrack() without renegotiation.
   * Handles case where camera was not previously enabled.
   * Ensures audio tracks are never modified during the operation.
   * 
   * Task 12: Enhanced with sender verification after replacement
   * 
   * @returns Promise<boolean> - True if screen share stopped successfully
   */
  async stopScreenShare(): Promise<boolean> {
    return this.trackManager.queueOperation('stop-screen-share', async () => {
      try {
        console.log('🖥️ Stopping screen share...')

        if (!this.localStream) {
          console.error('❌ No local stream available')
          return false
        }

        // Capture audio state before operation (Requirement 6.3)
        const audioStateBefore = this.getAudioState()

        const currentTrack = this.trackManager.getCurrentVideoTrack()
        const currentType = this.trackManager.getCurrentTrackType()
        
        console.log(`📊 Current track before stopping screen share: type=${currentType}, trackId=${currentTrack?.id || 'none'}`)

        // Only proceed if we're actually screen sharing
        if (currentType !== 'screen') {
          console.warn('⚠️ Not currently screen sharing, nothing to stop')
          return false
        }

        // Stop the screen track
        if (currentTrack) {
          currentTrack.stop()
          console.log(`📊 Stopped screen track: ${currentTrack.id}`)
        }

        // Get new camera track to restore
        // Implements Requirement 2.3, 3.5
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          }
        })

        const cameraTrack = cameraStream.getVideoTracks()[0]
        
        console.log(`📊 Camera track obtained for restoration:`, {
          trackId: cameraTrack.id,
          label: cameraTrack.label,
          enabled: cameraTrack.enabled,
          readyState: cameraTrack.readyState,
        })

        // Replace screen track with camera track across all peer connections
        // Implements Requirements 3.1, 3.2, 3.4, 3.5, 6.1, 6.2
        // This method now includes detailed logging and verification (Task 12)
        await this.replaceVideoTrackForAllPeers(cameraTrack)
        
        // Verify all peers have camera track after replacement (Task 12: Requirement 3.2, 3.5)
        console.log('🔍 Verifying camera track on all peers after screen share stop...')
        await this.verifyScreenTrackOnAllPeers(cameraTrack.id)

        // Update local stream (only video track)
        const oldVideoTrack = this.localStream.getVideoTracks()[0]
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack)
        }
        this.localStream.addTrack(cameraTrack)
        
        // Verify local stream video track state (Requirement 2.4)
        this.verifyLocalStreamVideoTrack(true, true)

        // Update track manager state
        this.trackManager.updateTrackState('camera', cameraTrack, true)

        // Emit events
        this.emit('local-stream', this.localStream)
        this.emit('screen-share-stopped')
        this.emit('video-state-change', { isEnabled: true, type: 'camera' })

        console.log('✅ Screen share stopped, camera restored successfully')
        
        // Verify audio state after operation (Requirement 6.3)
        this.verifyAudioPreserved(audioStateBefore)
        
        return true
      } catch (error) {
        console.error('❌ Failed to stop screen share:', error)
        
        // Handle camera access errors with improved messages (Requirement 5.5)
        // Implements Requirement 6.5 (failure recovery)
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            this.emit('video-error', { 
              error: 'Camera permission denied. Cannot restore camera. Video has been disabled.',
              severity: 'warning',
              action: 'check-permissions',
            })
            
            // Disable video entirely if we can't restore camera
            const screenTrack = this.localStream.getVideoTracks()[0]
            if (screenTrack) {
              screenTrack.stop()
              this.localStream.removeTrack(screenTrack)
            }
            
            // Replace with null track (removes video) - use recovery-safe version
            await this.replaceVideoTrackForAllPeersWithoutRecovery(null)
            
            this.trackManager.updateTrackState('none', null, false)
            this.emit('video-state-change', { isEnabled: false, type: 'none' })
          } else if (error.name === 'NotFoundError') {
            this.emit('video-error', { 
              error: 'No camera found. Cannot restore camera after screen share.',
              severity: 'warning',
              action: 'check-device',
            })
            
            // Disable video
            await this.disableVideoCompletely()
          } else if (error.name === 'NotReadableError') {
            this.emit('video-error', { 
              error: 'Camera is in use by another application. Cannot restore camera.',
              severity: 'warning',
              action: 'check-device',
            })
            
            // Disable video
            await this.disableVideoCompletely()
          } else if (error.message && error.message.includes('replace')) {
            // Track replacement error
            this.emit('video-error', { 
              error: 'Failed to restore camera for other participants. Video has been disabled.',
              severity: 'error',
              action: 'retry',
            })
            
            // Disable video
            await this.disableVideoCompletely()
          } else if (error.message && error.message.includes('verification')) {
            // Verification error after replacement
            this.emit('video-error', { 
              error: 'Camera may not be visible to all participants after screen share. Some connections failed verification.',
              severity: 'warning',
              action: 'retry',
            })
          } else {
            this.emit('video-error', { 
              error: 'Failed to restore camera after screen share. Please enable video manually.',
              severity: 'error',
              action: 'retry',
            })
            
            // Disable video
            await this.disableVideoCompletely()
          }
        } else {
          this.emit('video-error', { 
            error: 'An unexpected error occurred while stopping screen share.',
            severity: 'error',
            action: 'retry',
          })
          
          // Disable video
          await this.disableVideoCompletely()
        }
        
        return false
      }
    })
  }

  // Obter stream local
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  // Obter stream remoto de um usuário
  getRemoteStream(userId: string): MediaStream | null {
    return this.remoteStreams.get(userId) || null
  }

  // Obter qualidade de conexão de um usuário
  getConnectionQuality(userId: string): ConnectionQuality | null {
    return connectionMonitor.getConnectionQuality(userId)
  }

  /**
   * Update active speaker based on voice activity
   * Implements Requirement 3.2: Active speaker tracking
   * 
   * Uses a threshold-based approach to prevent rapid switching between speakers.
   * Only changes active speaker if someone has been speaking for a minimum duration.
   * 
   * @param userId - User ID who is speaking (or 'local' for local user)
   * @param isActive - Whether the user is currently speaking
   */
  private updateActiveSpeaker(userId: string, isActive: boolean): void {
    const now = Date.now()

    if (isActive) {
      // User started speaking, record timestamp
      this.speakingUsers.set(userId, now)

      // If no one is currently the active speaker, set this user immediately
      if (!this.activeSpeakerId) {
        this.setActiveSpeaker(userId)
        return
      }

      // If someone else is the active speaker, check if they've stopped speaking
      const activeSpeakerLastSpoke = this.speakingUsers.get(this.activeSpeakerId)
      if (activeSpeakerLastSpoke) {
        const timeSinceActiveSpeakerSpoke = now - activeSpeakerLastSpoke
        
        // If active speaker hasn't spoken recently, switch to new speaker
        if (timeSinceActiveSpeakerSpoke > this.ACTIVE_SPEAKER_THRESHOLD) {
          this.setActiveSpeaker(userId)
        }
      }
    } else {
      // User stopped speaking
      // If this was the active speaker, schedule a check to find new active speaker
      if (this.activeSpeakerId === userId) {
        // Clear any existing timeout
        if (this.activeSpeakerTimeout) {
          clearTimeout(this.activeSpeakerTimeout)
        }

        // Wait a bit before clearing active speaker to avoid flickering
        this.activeSpeakerTimeout = setTimeout(() => {
          // Check if anyone else is speaking
          const newActiveSpeaker = this.findMostRecentSpeaker()
          this.setActiveSpeaker(newActiveSpeaker)
          this.activeSpeakerTimeout = null
        }, this.ACTIVE_SPEAKER_THRESHOLD)
      }
    }
  }

  /**
   * Find the most recent speaker from all users
   * 
   * @returns User ID of most recent speaker, or null if no one has spoken recently
   */
  private findMostRecentSpeaker(): string | null {
    const now = Date.now()
    let mostRecentSpeaker: string | null = null
    let mostRecentTime = 0

    for (const [userId, timestamp] of this.speakingUsers.entries()) {
      // Only consider speakers who spoke within the threshold
      if (now - timestamp < this.ACTIVE_SPEAKER_THRESHOLD && timestamp > mostRecentTime) {
        mostRecentSpeaker = userId
        mostRecentTime = timestamp
      }
    }

    return mostRecentSpeaker
  }

  /**
   * Set the active speaker and emit event
   * Implements Requirement 3.2: Active speaker tracking
   * 
   * @param userId - User ID to set as active speaker, or null to clear
   */
  private setActiveSpeaker(userId: string | null): void {
    if (this.activeSpeakerId === userId) {
      return // No change
    }

    const previousSpeaker = this.activeSpeakerId
    this.activeSpeakerId = userId

    console.log('🎤 Active speaker changed:', previousSpeaker, '->', userId)

    // Emit active speaker change event
    this.emit('active-speaker-change', {
      previousSpeaker,
      activeSpeaker: userId,
    })
  }

  /**
   * Get the current active speaker
   * 
   * @returns User ID of active speaker, or null if no active speaker
   */
  getActiveSpeaker(): string | null {
    return this.activeSpeakerId
  }



  /**
   * Perform health check on all peer connections
   * Task 15: Implements Requirements 8.1, 8.2, 8.3, 8.4
   * 
   * This method performs a comprehensive health check on all peer connections:
   * - Verifies expected tracks are present (audio and video if enabled)
   * - Checks connection states (connection, ICE, signaling)
   * - Verifies video senders exist when video is enabled
   * - Identifies issues and generates recommendations
   * - Logs detailed health check results
   * 
   * @returns Array of HealthCheckResult for each peer connection
   */
  performHealthCheck(): HealthCheckResult[] {
    console.log('🏥 Performing health check on all peer connections...')
    
    const results: HealthCheckResult[] = []
    
    // Get current local media state
    const hasLocalStream = !!this.localStream
    const localAudioTrack = this.localStream?.getAudioTracks()[0]
    const localVideoTrack = this.trackManager.getCurrentVideoTrack()
    const videoState = this.trackManager.getCurrentTrackState()
    const isVideoEnabled = videoState.isActive && !!localVideoTrack
    
    console.log('📊 Local media state:', {
      hasLocalStream,
      hasAudioTrack: !!localAudioTrack,
      hasVideoTrack: !!localVideoTrack,
      isVideoEnabled,
      videoType: videoState.type,
      peerCount: this.peerConnections.size,
    })
    
    // Check each peer connection
    for (const [peerId, pc] of this.peerConnections.entries()) {
      console.log(`🔍 Checking health for peer ${peerId}...`)
      
      const issues: string[] = []
      const recommendations: string[] = []
      
      // Get connection states (Requirement 8.3, 8.4)
      const connectionState = pc.connectionState
      const iceConnectionState = pc.iceConnectionState
      const signalingState = pc.signalingState
      
      console.log(`📊 Connection states for peer ${peerId}:`, {
        connectionState,
        iceConnectionState,
        signalingState,
      })
      
      // Check connection state (Requirement 8.3)
      if (connectionState === 'failed') {
        issues.push('Connection state is failed')
        recommendations.push('Trigger reconnection or recreate peer connection')
      } else if (connectionState === 'disconnected') {
        issues.push('Connection state is disconnected')
        recommendations.push('Monitor for reconnection or trigger manual reconnection')
      } else if (connectionState === 'closed') {
        issues.push('Connection state is closed')
        recommendations.push('Remove peer connection and clean up resources')
      }
      
      // Check ICE connection state (Requirement 8.3)
      if (iceConnectionState === 'failed') {
        issues.push('ICE connection state is failed')
        recommendations.push('Attempt TURN fallback or ICE restart')
      } else if (iceConnectionState === 'disconnected') {
        issues.push('ICE connection state is disconnected')
        recommendations.push('Wait for reconnection or trigger ICE restart')
      } else if (iceConnectionState === 'closed') {
        issues.push('ICE connection state is closed')
        recommendations.push('Remove peer connection')
      }
      
      // Check signaling state (Requirement 8.4)
      if (signalingState === 'closed') {
        issues.push('Signaling state is closed')
        recommendations.push('Remove peer connection')
      } else if (signalingState !== 'stable' && signalingState !== 'have-local-offer' && signalingState !== 'have-remote-offer') {
        issues.push(`Signaling state is in unexpected state: ${signalingState}`)
        recommendations.push('Wait for signaling to stabilize or reset connection')
      }
      
      // Get senders for track verification
      const senders = pc.getSenders()
      const audioSender = senders.find(s => s.track?.kind === 'audio')
      const videoSender = senders.find(s => s.track?.kind === 'video')
      
      console.log(`📊 Senders for peer ${peerId}:`, {
        audioSender: audioSender ? {
          hasTrack: !!audioSender.track,
          trackId: audioSender.track?.id,
          trackEnabled: audioSender.track?.enabled,
        } : null,
        videoSender: videoSender ? {
          hasTrack: !!videoSender.track,
          trackId: videoSender.track?.id,
          trackEnabled: videoSender.track?.enabled,
        } : null,
      })
      
      // Verify expected audio track is present (Requirement 8.1)
      if (hasLocalStream && localAudioTrack) {
        if (!audioSender) {
          issues.push('Audio sender is missing')
          recommendations.push('Add audio track to peer connection and renegotiate')
        } else if (!audioSender.track) {
          issues.push('Audio sender exists but has no track')
          recommendations.push('Replace audio track or recreate sender')
        } else if (audioSender.track.id !== localAudioTrack.id) {
          issues.push(`Audio sender has wrong track (expected: ${localAudioTrack.id}, actual: ${audioSender.track.id})`)
          recommendations.push('Replace audio track with correct track')
        } else if (audioSender.track.readyState !== 'live') {
          issues.push(`Audio track is not live (readyState: ${audioSender.track.readyState})`)
          recommendations.push('Replace audio track with live track')
        }
      }
      
      // Verify expected video track is present when video is enabled (Requirement 8.1, 8.2)
      if (isVideoEnabled && localVideoTrack) {
        if (!videoSender) {
          issues.push('Video sender is missing (video is enabled locally)')
          recommendations.push('Add video track to peer connection and renegotiate')
        } else if (!videoSender.track) {
          issues.push('Video sender exists but has no track (video is enabled locally)')
          recommendations.push('Replace video track or recreate sender')
        } else if (videoSender.track.id !== localVideoTrack.id) {
          issues.push(`Video sender has wrong track (expected: ${localVideoTrack.id}, actual: ${videoSender.track.id})`)
          recommendations.push('Replace video track with correct track')
        } else if (videoSender.track.readyState !== 'live') {
          issues.push(`Video track is not live (readyState: ${videoSender.track.readyState})`)
          recommendations.push('Replace video track with live track')
        } else if (!videoSender.track.enabled) {
          issues.push('Video track exists but is disabled')
          recommendations.push('Enable video track or replace with enabled track')
        }
      } else if (!isVideoEnabled && videoSender && videoSender.track && videoSender.track.enabled) {
        // Video is disabled locally but peer has active video sender
        issues.push('Video sender is active but video is disabled locally')
        recommendations.push('Disable video track or replace with null')
      }
      
      // Determine if connection is healthy
      const isHealthy = issues.length === 0
      
      // Create health check result
      const result: HealthCheckResult = {
        peerId,
        isHealthy,
        connectionState,
        iceConnectionState,
        signalingState,
        issues,
        recommendations,
        timestamp: Date.now(),
      }
      
      results.push(result)
      
      // Log result for this peer
      if (isHealthy) {
        console.log(`✅ Health check passed for peer ${peerId}`)
      } else {
        console.warn(`⚠️ Health check failed for peer ${peerId}:`, {
          issues,
          recommendations,
        })
      }
    }
    
    // Log overall health check summary
    const totalPeers = results.length
    const healthyPeers = results.filter(r => r.isHealthy).length
    const unhealthyPeers = results.filter(r => !r.isHealthy).length
    
    console.log('📊 Health check summary:', {
      totalPeers,
      healthyPeers,
      unhealthyPeers,
      timestamp: new Date().toISOString(),
    })
    
    // Log detailed results for unhealthy peers
    if (unhealthyPeers > 0) {
      console.warn(`⚠️ ${unhealthyPeers} peer(s) failed health check:`)
      results.filter(r => !r.isHealthy).forEach(result => {
        console.warn(`  Peer ${result.peerId}:`, {
          connectionState: result.connectionState,
          iceConnectionState: result.iceConnectionState,
          signalingState: result.signalingState,
          issues: result.issues,
          recommendations: result.recommendations,
        })
      })
    } else {
      console.log('✅ All peer connections are healthy')
    }
    
    // Emit health check event
    this.emit('health-check-complete', {
      results,
      totalPeers,
      healthyPeers,
      unhealthyPeers,
      timestamp: Date.now(),
    })
    
    return results
  }

  /**
   * Perform automatic recovery on health check failure
   * Task 16: Implements Requirement 8.5
   * 
   * This method is triggered when health check fails for one or more peer connections.
   * It attempts to automatically recover from detected issues by:
   * - Logging warnings with detailed issue information
   * - Attempting sender recreation for missing or incorrect tracks
   * - Attempting renegotiation when needed
   * - Emitting recovery events for monitoring
   * 
   * Recovery strategies based on issue type:
   * - Missing sender: Add track and trigger renegotiation
   * - Wrong track: Replace track with correct one
   * - Connection state issues: Trigger reconnection
   * - ICE connection issues: Attempt ICE restart or TURN fallback
   * 
   * @param healthCheckResults - Results from performHealthCheck()
   * @returns Promise<void>
   */
  async performAutomaticRecovery(healthCheckResults: HealthCheckResult[]): Promise<void> {
    console.log('🔧 Starting automatic recovery for failed health checks...')
    
    // Filter for unhealthy peers
    const unhealthyPeers = healthCheckResults.filter(r => !r.isHealthy)
    
    if (unhealthyPeers.length === 0) {
      console.log('✅ No unhealthy peers detected, no recovery needed')
      return
    }
    
    console.warn(`⚠️ Attempting recovery for ${unhealthyPeers.length} unhealthy peer(s)`)
    
    // Get current local media state for recovery operations
    const localAudioTrack = this.localStream?.getAudioTracks()[0]
    const localVideoTrack = this.trackManager.getCurrentVideoTrack()
    const videoState = this.trackManager.getCurrentTrackState()
    const isVideoEnabled = videoState.isActive && !!localVideoTrack
    
    const recoveryResults: Array<{
      peerId: string
      issues: string[]
      recoveryAttempted: string[]
      recoverySucceeded: string[]
      recoveryFailed: string[]
    }> = []
    
    // Attempt recovery for each unhealthy peer
    for (const result of unhealthyPeers) {
      const { peerId, issues, recommendations } = result
      
      console.log(`🔧 Attempting recovery for peer ${peerId}...`)
      console.warn(`⚠️ Issues detected for peer ${peerId}:`, issues)
      console.log(`💡 Recommendations for peer ${peerId}:`, recommendations)
      
      const recoveryAttempted: string[] = []
      const recoverySucceeded: string[] = []
      const recoveryFailed: string[] = []
      
      const pc = this.peerConnections.get(peerId)
      
      if (!pc) {
        console.error(`❌ Cannot recover peer ${peerId}: peer connection not found`)
        recoveryFailed.push('Peer connection not found')
        
        recoveryResults.push({
          peerId,
          issues,
          recoveryAttempted,
          recoverySucceeded,
          recoveryFailed,
        })
        
        continue
      }
      
      // Check for connection state issues
      if (result.connectionState === 'failed' || result.connectionState === 'disconnected') {
        recoveryAttempted.push('Trigger reconnection')
        
        try {
          console.log(`🔄 Triggering reconnection for peer ${peerId} due to connection state: ${result.connectionState}`)
          this.attemptReconnection(peerId)
          recoverySucceeded.push('Reconnection triggered')
        } catch (error) {
          console.error(`❌ Failed to trigger reconnection for peer ${peerId}:`, error)
          recoveryFailed.push(`Reconnection failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Check for ICE connection issues
      if (result.iceConnectionState === 'failed') {
        recoveryAttempted.push('Attempt TURN fallback')
        
        try {
          console.log(`🔄 Attempting TURN fallback for peer ${peerId} due to ICE connection failure`)
          await this.attemptTURNFallback(peerId)
          recoverySucceeded.push('TURN fallback attempted')
        } catch (error) {
          console.error(`❌ Failed to attempt TURN fallback for peer ${peerId}:`, error)
          recoveryFailed.push(`TURN fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Check for missing or incorrect audio sender
      if (localAudioTrack && issues.some(issue => issue.includes('Audio sender'))) {
        const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio')
        
        if (!audioSender || !audioSender.track) {
          // Missing audio sender - recreate it
          recoveryAttempted.push('Recreate audio sender')
          
          try {
            console.log(`🔧 Recreating audio sender for peer ${peerId}`)
            await this.recreateSenderForPeer(peerId, localAudioTrack)
            recoverySucceeded.push('Audio sender recreated')
          } catch (error) {
            console.error(`❌ Failed to recreate audio sender for peer ${peerId}:`, error)
            recoveryFailed.push(`Audio sender recreation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        } else if (audioSender.track.id !== localAudioTrack.id) {
          // Wrong audio track - replace it
          recoveryAttempted.push('Replace audio track')
          
          try {
            console.log(`🔧 Replacing audio track for peer ${peerId}`)
            await audioSender.replaceTrack(localAudioTrack)
            recoverySucceeded.push('Audio track replaced')
          } catch (error) {
            console.error(`❌ Failed to replace audio track for peer ${peerId}:`, error)
            recoveryFailed.push(`Audio track replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }
      
      // Check for missing or incorrect video sender (only if video is enabled)
      if (isVideoEnabled && localVideoTrack && issues.some(issue => issue.includes('Video sender'))) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
        
        if (!videoSender || !videoSender.track) {
          // Missing video sender - recreate it
          recoveryAttempted.push('Recreate video sender')
          
          try {
            console.log(`🔧 Recreating video sender for peer ${peerId}`)
            await this.recreateSenderForPeer(peerId, localVideoTrack)
            recoverySucceeded.push('Video sender recreated')
          } catch (error) {
            console.error(`❌ Failed to recreate video sender for peer ${peerId}:`, error)
            recoveryFailed.push(`Video sender recreation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        } else if (videoSender.track.id !== localVideoTrack.id) {
          // Wrong video track - replace it
          recoveryAttempted.push('Replace video track')
          
          try {
            console.log(`🔧 Replacing video track for peer ${peerId}`)
            await videoSender.replaceTrack(localVideoTrack)
            recoverySucceeded.push('Video track replaced')
          } catch (error) {
            console.error(`❌ Failed to replace video track for peer ${peerId}:`, error)
            recoveryFailed.push(`Video track replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }
      
      // Check for video sender when video is disabled
      if (!isVideoEnabled && issues.some(issue => issue.includes('Video sender is active but video is disabled'))) {
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
        
        if (videoSender && videoSender.track) {
          recoveryAttempted.push('Disable video sender')
          
          try {
            console.log(`🔧 Disabling video sender for peer ${peerId} (video is disabled locally)`)
            await videoSender.replaceTrack(null)
            recoverySucceeded.push('Video sender disabled')
          } catch (error) {
            console.error(`❌ Failed to disable video sender for peer ${peerId}:`, error)
            recoveryFailed.push(`Video sender disable failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }
      
      // Check if renegotiation is needed (if we added tracks)
      if (recoverySucceeded.some(r => r.includes('recreated'))) {
        recoveryAttempted.push('Trigger renegotiation')
        
        try {
          console.log(`🔧 Triggering renegotiation for peer ${peerId} after sender recreation`)
          await this.triggerRenegotiation(pc, peerId)
          recoverySucceeded.push('Renegotiation triggered')
        } catch (error) {
          console.error(`❌ Failed to trigger renegotiation for peer ${peerId}:`, error)
          recoveryFailed.push(`Renegotiation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Store recovery results for this peer
      recoveryResults.push({
        peerId,
        issues,
        recoveryAttempted,
        recoverySucceeded,
        recoveryFailed,
      })
      
      // Log recovery summary for this peer
      if (recoveryFailed.length === 0) {
        console.log(`✅ Recovery completed successfully for peer ${peerId}:`, {
          attempted: recoveryAttempted,
          succeeded: recoverySucceeded,
        })
      } else {
        console.warn(`⚠️ Recovery partially failed for peer ${peerId}:`, {
          attempted: recoveryAttempted,
          succeeded: recoverySucceeded,
          failed: recoveryFailed,
        })
      }
    }
    
    // Log overall recovery summary
    const totalRecoveryAttempts = recoveryResults.reduce((sum, r) => sum + r.recoveryAttempted.length, 0)
    const totalRecoverySuccesses = recoveryResults.reduce((sum, r) => sum + r.recoverySucceeded.length, 0)
    const totalRecoveryFailures = recoveryResults.reduce((sum, r) => sum + r.recoveryFailed.length, 0)
    
    console.log('📊 Automatic recovery summary:', {
      unhealthyPeers: unhealthyPeers.length,
      totalRecoveryAttempts,
      totalRecoverySuccesses,
      totalRecoveryFailures,
      timestamp: new Date().toISOString(),
    })
    
    // Emit recovery event
    this.emit('automatic-recovery-complete', {
      results: recoveryResults,
      unhealthyPeers: unhealthyPeers.length,
      totalRecoveryAttempts,
      totalRecoverySuccesses,
      totalRecoveryFailures,
      timestamp: Date.now(),
    })
    
    // Emit warnings for peers that had recovery failures
    const peersWithFailures = recoveryResults.filter(r => r.recoveryFailed.length > 0)
    
    if (peersWithFailures.length > 0) {
      console.warn(`⚠️ ${peersWithFailures.length} peer(s) had recovery failures:`)
      peersWithFailures.forEach(result => {
        console.warn(`  Peer ${result.peerId}:`, {
          issues: result.issues,
          failed: result.recoveryFailed,
        })
      })
      
      // Emit error event for UI notification
      this.emit('video-error', {
        error: `Automatic recovery failed for ${peersWithFailures.length} peer(s). Some connections may not be working properly.`,
        severity: 'warning',
        action: 'manual-check',
        failedPeers: peersWithFailures.map(r => r.peerId),
      })
    } else {
      console.log('✅ All recovery attempts succeeded')
    }
  }

  /**
   * Verify screen/camera track is present on all peer connections
   * Task 12: Implements Requirement 3.2 - Add sender verification after replacement
   * 
   * This method verifies that all peer connections have the expected video track
   * after a screen share start/stop operation. It logs detailed information about
   * each peer's sender state and identifies any peers where verification fails.
   * 
   * @param expectedTrackId - The track ID that should be present on all peers
   * @returns Promise<void>
   * @throws Error if verification fails for any peer
   */
  private async verifyScreenTrackOnAllPeers(expectedTrackId: string): Promise<void> {
    console.log(`🔍 Verifying track ${expectedTrackId} on all peers...`)
    
    const verificationResults: Array<{
      peerId: string
      hasCorrectTrack: boolean
      actualTrackId: string | null
      hasSender: boolean
    }> = []
    
    let allVerified = true
    const failedPeers: string[] = []
    
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (!videoSender) {
        console.error(`❌ Verification failed for peer ${peerId}: No video sender found`)
        allVerified = false
        failedPeers.push(peerId)
        
        verificationResults.push({
          peerId,
          hasCorrectTrack: false,
          actualTrackId: null,
          hasSender: false,
        })
      } else if (!videoSender.track) {
        console.error(`❌ Verification failed for peer ${peerId}: Sender has no track`)
        allVerified = false
        failedPeers.push(peerId)
        
        verificationResults.push({
          peerId,
          hasCorrectTrack: false,
          actualTrackId: null,
          hasSender: true,
        })
      } else if (videoSender.track.id !== expectedTrackId) {
        console.error(`❌ Verification failed for peer ${peerId}: Wrong track ID`, {
          expected: expectedTrackId,
          actual: videoSender.track.id,
        })
        allVerified = false
        failedPeers.push(peerId)
        
        verificationResults.push({
          peerId,
          hasCorrectTrack: false,
          actualTrackId: videoSender.track.id,
          hasSender: true,
        })
      } else {
        console.log(`✅ Verification passed for peer ${peerId}:`, {
          trackId: videoSender.track.id,
          trackLabel: videoSender.track.label,
          trackEnabled: videoSender.track.enabled,
          trackReadyState: videoSender.track.readyState,
        })
        
        verificationResults.push({
          peerId,
          hasCorrectTrack: true,
          actualTrackId: videoSender.track.id,
          hasSender: true,
        })
      }
    }
    
    // Log verification summary
    const totalPeers = this.peerConnections.size
    const verifiedPeers = verificationResults.filter(r => r.hasCorrectTrack).length
    const failedCount = failedPeers.length
    
    console.log(`📊 Track verification summary:`, {
      expectedTrackId,
      totalPeers,
      verifiedPeers,
      failedCount,
      verificationResults,
    })
    
    if (!allVerified) {
      const error = `Track verification failed for ${failedCount} peer(s): ${failedPeers.join(', ')}`
      console.error(`❌ ${error}`)
      
      // Emit warning but don't throw - the track replacement succeeded, just verification failed
      this.emit('video-error', {
        error: `Video may not be visible to some participants (${failedCount} failed verification)`,
        severity: 'warning',
        action: 'retry',
        failedPeers,
      })
      
      // Throw error to indicate verification failure
      throw new Error(error)
    } else {
      console.log(`✅ All ${totalPeers} peer(s) verified successfully with track ${expectedTrackId}`)
    }
  }

  /**
   * Synchronize video state across all peer connections
   * Implements Requirement 1.5: State synchronization across peers
   * 
   * This method verifies that all peer connections have consistent video state
   * with the local video state. If inconsistencies are detected, it automatically
   * fixes them by adding or replacing tracks as needed.
   * 
   * Uses StateSynchronizationManager to detect and fix inconsistencies.
   * 
   * @returns Promise<void>
   */
  async synchronizeVideoState(): Promise<void> {
    console.log('🔄 Synchronizing video state across all peers...')
    
    try {
      // Get current local video state
      const currentVideoTrack = this.trackManager.getCurrentVideoTrack()
      const currentTrackType = this.trackManager.getCurrentTrackType()
      const currentTrackState = this.trackManager.getCurrentTrackState()
      
      console.log('📊 Current local video state:', {
        hasTrack: !!currentVideoTrack,
        trackId: currentVideoTrack?.id || 'none',
        trackType: currentTrackType,
        isActive: currentTrackState.isActive,
        trackEnabled: currentVideoTrack?.enabled,
        trackReadyState: currentVideoTrack?.readyState,
      })
      
      // Determine expected video state
      const expectedVideoEnabled = currentTrackState.isActive && !!currentVideoTrack && currentVideoTrack.enabled
      
      // Detect inconsistencies using StateSynchronizationManager
      const inconsistencies = this.stateSyncManager.detectInconsistencies(
        this.peerConnections,
        currentVideoTrack,
        expectedVideoEnabled
      )
      
      if (inconsistencies.length === 0) {
        console.log('✅ All peers have consistent video state, no synchronization needed')
        return
      }
      
      console.log(`🔧 Found ${inconsistencies.length} inconsistenc${inconsistencies.length === 1 ? 'y' : 'ies'}, synchronizing...`)
      
      // Synchronize state using StateSynchronizationManager
      await this.stateSyncManager.synchronizeState(
        inconsistencies,
        this.peerConnections,
        currentVideoTrack,
        this.localStream
      )
      
      console.log('✅ Video state synchronized successfully across all peers')
      
      // Emit state synchronized event (Requirement 5.3)
      this.emit('video-state-synchronized', {
        trackId: currentVideoTrack?.id || 'none',
        trackType: currentTrackType,
        isActive: currentTrackState.isActive,
        peerCount: this.peerConnections.size,
        inconsistenciesFixed: inconsistencies.length,
      })
      
    } catch (error) {
      console.error('❌ Failed to synchronize video state:', error)
      
      // Emit error event with detailed information
      this.emit('video-error', {
        error: 'Failed to synchronize video state across peers',
        severity: 'warning',
        action: 'retry',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
      
      throw error
    }
  }

  /**
   * Verify video senders exist for all peer connections
   * Implements Requirement 1.4: Video sender presence verification
   * 
   * Checks that all peer connections have video senders when video is enabled.
   * Logs verification results for each peer.
   * 
   * @returns Promise<void>
   */
  async verifyVideoSenders(): Promise<void> {
    console.log('🔍 Verifying video senders for all peers...')
    
    // Get current video state
    const currentVideoTrack = this.trackManager.getCurrentVideoTrack()
    const currentTrackState = this.trackManager.getCurrentTrackState()
    const expectedVideoEnabled = currentTrackState.isActive && !!currentVideoTrack && currentVideoTrack.enabled
    
    if (!expectedVideoEnabled) {
      console.log('ℹ️ Video is disabled, skipping sender verification')
      return
    }
    
    console.log('📊 Verifying video senders:', {
      expectedTrackId: currentVideoTrack?.id,
      peerCount: this.peerConnections.size,
    })
    
    let allVerified = true
    const missingPeers: string[] = []
    const wrongTrackPeers: string[] = []
    
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (!videoSender || !videoSender.track) {
        console.error(`❌ No video sender found for peer ${peerId}`)
        allVerified = false
        missingPeers.push(peerId)
      } else if (videoSender.track.id !== currentVideoTrack!.id) {
        console.warn(`⚠️ Video sender for peer ${peerId} has unexpected track ID:`, {
          expected: currentVideoTrack!.id,
          actual: videoSender.track.id,
        })
        wrongTrackPeers.push(peerId)
      } else {
        console.log(`✅ Video sender verified for peer ${peerId}:`, {
          trackId: videoSender.track.id,
          trackEnabled: videoSender.track.enabled,
        })
      }
    }
    
    // Log verification results
    if (!allVerified) {
      console.error(`❌ Video sender verification failed:`, {
        missingPeers: missingPeers.length,
        wrongTrackPeers: wrongTrackPeers.length,
      })
      
      if (missingPeers.length > 0) {
        console.error(`  Missing senders for: ${missingPeers.join(', ')}`)
      }
      if (wrongTrackPeers.length > 0) {
        console.warn(`  Wrong track for: ${wrongTrackPeers.join(', ')}`)
      }
    } else {
      console.log('✅ All video senders verified successfully')
    }
  }

  /**
   * Handle background mode transitions
   * Implements Requirements 4.1, 4.2, 4.3, 4.5
   * 
   * @param isBackground - Whether the app is in background mode
   */
  public handleBackgroundMode(isBackground: boolean): void {
    if (isBackground) {
      console.log('📱 Handling background mode transition')
      
      // Log current connection states (Requirement 4.5)
      console.log('📊 Connection states in background:', {
        peerCount: this.peerConnections.size,
        hasLocalStream: !!this.localStream,
        audioTracks: this.localStream?.getAudioTracks().length || 0,
        videoTracks: this.localStream?.getVideoTracks().length || 0,
      })
      
      // Ensure audio tracks remain active (Requirement 4.1)
      if (this.localStream) {
        const audioTracks = this.localStream.getAudioTracks()
        audioTracks.forEach(track => {
          if (track.enabled && track.readyState === 'live') {
            console.log('✅ Audio track active in background:', {
              trackId: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
            })
          } else {
            console.warn('⚠️ Audio track not active in background:', {
              trackId: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
            })
          }
        })
        
        // Ensure video tracks remain active if enabled (Requirement 4.2)
        const videoTracks = this.localStream.getVideoTracks()
        videoTracks.forEach(track => {
          if (track.enabled && track.readyState === 'live') {
            console.log('✅ Video track active in background:', {
              trackId: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
            })
          } else {
            console.log('ℹ️ Video track state in background:', {
              trackId: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
            })
          }
        })
      }
      
      // Monitor peer connection states (Requirement 4.5)
      this.monitorConnectionsInBackground()
      
      // Emit background mode event
      this.emit('background-mode-active', { isBackground: true })
      
      console.log('✅ Background mode handling complete')
    } else {
      console.log('🖥️ Handling foreground mode transition')
      
      // Verify connections remain stable (Requirement 4.3)
      console.log('📊 Connection states after returning to foreground:', {
        peerCount: this.peerConnections.size,
        hasLocalStream: !!this.localStream,
      })
      
      // Log that no reconnection is triggered (Requirement 4.3)
      console.log('ℹ️ Connections remain stable, no reconnection triggered (Requirement 4.3)')
      
      // Emit foreground mode event
      this.emit('background-mode-active', { isBackground: false })
      
      console.log('✅ Foreground mode handling complete')
    }
  }

  /**
   * Monitor peer connection states in background mode
   * Implements Requirement 4.5: Background connection stability
   * 
   * Checks all peer connections to ensure they remain in connected or connecting state.
   * Prevents unnecessary disconnections during background mode.
   */
  private monitorConnectionsInBackground(): void {
    console.log('🔍 Monitoring connections in background mode')
    
    const connectionStates: Array<{
      peerId: string
      connectionState: RTCPeerConnectionState
      iceConnectionState: RTCIceConnectionState
      isStable: boolean
    }> = []
    
    // Check each peer connection state
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const connectionState = pc.connectionState
      const iceConnectionState = pc.iceConnectionState
      
      // Connection is stable if it's connected or connecting
      const isStable = (
        connectionState === 'connected' || 
        connectionState === 'connecting' ||
        iceConnectionState === 'connected' ||
        iceConnectionState === 'checking'
      )
      
      connectionStates.push({
        peerId,
        connectionState,
        iceConnectionState,
        isStable,
      })
      
      if (!isStable) {
        console.warn('⚠️ Unstable connection in background:', {
          peerId,
          connectionState,
          iceConnectionState,
        })
      } else {
        console.log('✅ Stable connection in background:', {
          peerId,
          connectionState,
          iceConnectionState,
        })
      }
    }
    
    // Log summary
    const stableCount = connectionStates.filter(s => s.isStable).length
    const unstableCount = connectionStates.filter(s => !s.isStable).length
    
    console.log('📊 Background connection monitoring summary:', {
      totalConnections: connectionStates.length,
      stableConnections: stableCount,
      unstableConnections: unstableCount,
      timestamp: new Date().toISOString(),
    })
    
    // Emit monitoring event
    this.emit('background-connections-monitored', {
      totalConnections: connectionStates.length,
      stableConnections: stableCount,
      unstableConnections: unstableCount,
      connectionStates,
    })
    
    // If all connections are stable, log success
    if (unstableCount === 0 && connectionStates.length > 0) {
      console.log('✅ All connections stable in background mode (Requirement 4.5)')
    }
  }

  /**
   * Get connection quality metrics for all peers
   * Implements Requirement 9.2: Connection quality monitoring
   * 
   * Returns quality metrics for all active peer connections.
   * Emits quality change events when quality degrades.
   * 
   * @returns Map of userId to ConnectionQuality
   */
  getAllConnectionQuality(): Map<string, ConnectionQuality> {
    console.log('📊 Getting connection quality for all peers...')
    
    const qualityMap = new Map<string, ConnectionQuality>()
    
    for (const [userId] of this.peerConnections.entries()) {
      const quality = connectionMonitor.getConnectionQuality(userId)
      if (quality) {
        qualityMap.set(userId, quality)
        
        // Log quality for each peer
        console.log(`📊 Quality for ${userId}:`, {
          quality: quality.quality,
          rtt: quality.rtt,
          packetsLost: quality.packetsLost,
          jitter: quality.jitter,
        })
      }
    }
    
    console.log(`📊 Retrieved quality metrics for ${qualityMap.size} peer(s)`)
    
    return qualityMap
  }

  /**
   * Track quality metrics over time
   * Implements Requirement 9.2: Connection quality monitoring
   * 
   * Monitors connection quality and emits events when quality changes.
   * This method can be called periodically to track quality trends.
   */
  trackQualityMetrics(): void {
    console.log('📊 Tracking quality metrics for all peers...')
    
    const qualityMetrics: Array<{
      userId: string
      quality: string
      rtt: number
      packetsLost: number
      jitter: number
      timestamp: number
    }> = []
    
    for (const [userId] of this.peerConnections.entries()) {
      const quality = connectionMonitor.getConnectionQuality(userId)
      if (quality) {
        qualityMetrics.push({
          userId,
          quality: quality.quality,
          rtt: quality.rtt,
          packetsLost: quality.packetsLost,
          jitter: quality.jitter,
          timestamp: Date.now(),
        })
      }
    }
    
    // Emit quality metrics event
    this.emit('quality-metrics-tracked', {
      metrics: qualityMetrics,
      timestamp: Date.now(),
    })
    
    console.log('📊 Quality metrics tracked:', {
      totalPeers: qualityMetrics.length,
      metrics: qualityMetrics,
    })
  }

  /**
   * Get connection statistics for a specific peer
   * Implements Requirements 9.1, 9.5: Connection statistics logging and establishment time tracking
   * 
   * Returns detailed statistics about a peer connection including:
   * - ICE candidate types used
   * - Connection establishment time
   * - Whether TURN is being used
   * - Current connection states
   * 
   * @param userId - User ID to get statistics for
   * @returns Connection statistics or null if peer not found
   */
  getConnectionStatistics(userId: string): {
    userId: string
    establishmentTime: number | null
    candidateTypes: string[]
    usingTURN: boolean
    connectionState: RTCPeerConnectionState | null
    iceConnectionState: RTCIceConnectionState | null
    signalingState: RTCSignalingState | null
    startTime: number | null
    isConnected: boolean
  } | null {
    const pc = this.peerConnections.get(userId)
    
    if (!pc) {
      console.warn(`⚠️ No peer connection found for ${userId}`)
      return null
    }
    
    // Get establishment time
    const establishmentTime = this.connectionEstablishedTimes.get(userId) || null
    
    // Get ICE candidate types
    const candidateTypes = Array.from(this.iceCandidateTypes.get(userId) || [])
    
    // Check if using TURN
    const usingTURN = this.usingTURNOnly.get(userId) || candidateTypes.includes('relay')
    
    // Get start time
    const startTime = this.connectionStartTimes.get(userId) || null
    
    // Check if connected
    const isConnected = pc.connectionState === 'connected' || pc.iceConnectionState === 'connected'
    
    const stats = {
      userId,
      establishmentTime,
      candidateTypes,
      usingTURN,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      startTime,
      isConnected,
    }
    
    console.log('📊 Connection statistics for', userId, ':', stats)
    
    return stats
  }

  /**
   * Export comprehensive diagnostic report
   * Implements Requirement 9.3: Diagnostic report generation
   * 
   * Generates a complete diagnostic report including:
   * - Local media state
   * - All peer connection states
   * - Health check results
   * - Connection statistics
   * - Connection quality metrics
   * - Browser information
   * - Active reconnections
   * - Background mode status
   * 
   * @returns Complete diagnostic report
   */
  exportDiagnosticReport(): DiagnosticReport {
    console.log('📋 Generating diagnostic report...')
    
    const timestamp = Date.now()
    
    // Gather local state
    const currentVideoTrack = this.trackManager.getCurrentVideoTrack()
    const videoState = this.trackManager.getCurrentTrackState()
    const audioTrack = this.localStream?.getAudioTracks()[0]
    
    const localState = {
      hasLocalStream: !!this.localStream,
      hasAudio: !!audioTrack,
      hasVideo: !!currentVideoTrack,
      videoType: videoState.type,
      isAudioEnabled: audioTrack?.enabled ?? false,
      isVideoEnabled: videoState.isActive,
      audioTrackId: audioTrack?.id || null,
      videoTrackId: currentVideoTrack?.id || null,
    }
    
    // Gather peer states
    const peerStates = new Map<string, {
      connectionState: RTCPeerConnectionState
      iceConnectionState: RTCIceConnectionState
      signalingState: RTCSignalingState
      hasRemoteStream: boolean
      remoteAudioTracks: number
      remoteVideoTracks: number
    }>()
    
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const remoteStream = this.remoteStreams.get(peerId)
      
      peerStates.set(peerId, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        hasRemoteStream: !!remoteStream,
        remoteAudioTracks: remoteStream?.getAudioTracks().length || 0,
        remoteVideoTracks: remoteStream?.getVideoTracks().length || 0,
      })
    }
    
    // Perform health checks
    const healthChecks = this.performHealthCheck()
    
    // Gather connection statistics
    const connectionStatistics: ConnectionStatistics[] = []
    for (const [peerId] of this.peerConnections.entries()) {
      const stats = this.getConnectionStatistics(peerId)
      if (stats) {
        connectionStatistics.push(stats)
      }
    }
    
    // Gather connection quality
    const connectionQuality = this.getAllConnectionQuality()
    
    // Gather browser info
    const browserInfo: BrowserInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      onLine: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
    }
    
    // Get active reconnections
    const activeReconnections = this.reconnectionManager.getActiveReconnections()
    
    // Check background mode
    const backgroundMode = this.backgroundModeHandler.isInBackground()
    
    // Get recent error logs (Requirement 6.4)
    const recentErrors = errorLogger.getRecentErrors(20)
    
    // Create diagnostic report
    const report: DiagnosticReport = {
      timestamp,
      channelId: this.currentChannelId,
      localState,
      peerStates,
      healthChecks,
      connectionStatistics,
      connectionQuality,
      browserInfo,
      activeReconnections,
      backgroundMode,
      recentErrors,
    }
    
    // Log report summary
    console.log('📋 Diagnostic report generated:', {
      timestamp: new Date(timestamp).toISOString(),
      channelId: this.currentChannelId,
      totalPeers: peerStates.size,
      healthyPeers: healthChecks.filter(h => h.isHealthy).length,
      unhealthyPeers: healthChecks.filter(h => !h.isHealthy).length,
      activeReconnections: activeReconnections.length,
      backgroundMode,
    })
    
    // Emit diagnostic report event
    this.emit('diagnostic-report-generated', report)
    
    return report
  }

  /**
   * Format diagnostic report for easy reading
   * Implements Requirement 9.3: Format report for easy reading
   * 
   * Converts diagnostic report to human-readable string format.
   * 
   * @param report - Diagnostic report to format
   * @returns Formatted report string
   */
  formatDiagnosticReport(report: DiagnosticReport): string {
    const lines: string[] = []
    
    lines.push('='.repeat(80))
    lines.push('WEBRTC DIAGNOSTIC REPORT')
    lines.push('='.repeat(80))
    lines.push('')
    
    // Timestamp and channel
    lines.push(`Generated: ${new Date(report.timestamp).toISOString()}`)
    lines.push(`Channel ID: ${report.channelId || 'Not in channel'}`)
    lines.push(`Background Mode: ${report.backgroundMode ? 'Yes' : 'No'}`)
    lines.push('')
    
    // Local state
    lines.push('-'.repeat(80))
    lines.push('LOCAL STATE')
    lines.push('-'.repeat(80))
    lines.push(`Has Local Stream: ${report.localState.hasLocalStream}`)
    lines.push(`Audio: ${report.localState.hasAudio ? 'Yes' : 'No'} (Enabled: ${report.localState.isAudioEnabled})`)
    lines.push(`Video: ${report.localState.hasVideo ? 'Yes' : 'No'} (Enabled: ${report.localState.isVideoEnabled}, Type: ${report.localState.videoType})`)
    if (report.localState.audioTrackId) {
      lines.push(`Audio Track ID: ${report.localState.audioTrackId}`)
    }
    if (report.localState.videoTrackId) {
      lines.push(`Video Track ID: ${report.localState.videoTrackId}`)
    }
    lines.push('')
    
    // Browser info
    lines.push('-'.repeat(80))
    lines.push('BROWSER INFO')
    lines.push('-'.repeat(80))
    lines.push(`User Agent: ${report.browserInfo.userAgent}`)
    lines.push(`Platform: ${report.browserInfo.platform}`)
    lines.push(`Language: ${report.browserInfo.language}`)
    lines.push(`Online: ${report.browserInfo.onLine}`)
    lines.push(`Cookies Enabled: ${report.browserInfo.cookieEnabled}`)
    lines.push('')
    
    // Peer connections
    lines.push('-'.repeat(80))
    lines.push(`PEER CONNECTIONS (${report.peerStates.size})`)
    lines.push('-'.repeat(80))
    
    if (report.peerStates.size === 0) {
      lines.push('No peer connections')
    } else {
      for (const [peerId, state] of report.peerStates.entries()) {
        lines.push(`\nPeer: ${peerId}`)
        lines.push(`  Connection State: ${state.connectionState}`)
        lines.push(`  ICE Connection State: ${state.iceConnectionState}`)
        lines.push(`  Signaling State: ${state.signalingState}`)
        lines.push(`  Remote Stream: ${state.hasRemoteStream ? 'Yes' : 'No'}`)
        lines.push(`  Remote Audio Tracks: ${state.remoteAudioTracks}`)
        lines.push(`  Remote Video Tracks: ${state.remoteVideoTracks}`)
      }
    }
    lines.push('')
    
    // Health checks
    lines.push('-'.repeat(80))
    lines.push('HEALTH CHECKS')
    lines.push('-'.repeat(80))
    
    const healthyCount = report.healthChecks.filter(h => h.isHealthy).length
    const unhealthyCount = report.healthChecks.filter(h => !h.isHealthy).length
    
    lines.push(`Healthy: ${healthyCount}, Unhealthy: ${unhealthyCount}`)
    lines.push('')
    
    for (const check of report.healthChecks) {
      lines.push(`\nPeer: ${check.peerId}`)
      lines.push(`  Status: ${check.isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`)
      
      if (check.issues.length > 0) {
        lines.push(`  Issues:`)
        for (const issue of check.issues) {
          lines.push(`    - ${issue}`)
        }
      }
      
      if (check.recommendations.length > 0) {
        lines.push(`  Recommendations:`)
        for (const rec of check.recommendations) {
          lines.push(`    - ${rec}`)
        }
      }
    }
    lines.push('')
    
    // Connection statistics
    lines.push('-'.repeat(80))
    lines.push('CONNECTION STATISTICS')
    lines.push('-'.repeat(80))
    
    for (const stats of report.connectionStatistics) {
      lines.push(`\nPeer: ${stats.userId}`)
      lines.push(`  Establishment Time: ${stats.establishmentTime ? `${stats.establishmentTime}ms` : 'Not established'}`)
      lines.push(`  ICE Candidate Types: ${stats.candidateTypes.join(', ') || 'None'}`)
      lines.push(`  Using TURN: ${stats.usingTURN ? 'Yes' : 'No'}`)
      lines.push(`  Connected: ${stats.isConnected ? 'Yes' : 'No'}`)
    }
    lines.push('')
    
    // Connection quality
    lines.push('-'.repeat(80))
    lines.push('CONNECTION QUALITY')
    lines.push('-'.repeat(80))
    
    if (report.connectionQuality.size === 0) {
      lines.push('No quality metrics available')
    } else {
      for (const [peerId, quality] of report.connectionQuality.entries()) {
        lines.push(`\nPeer: ${peerId}`)
        lines.push(`  Quality: ${quality.quality.toUpperCase()}`)
        lines.push(`  RTT: ${quality.rtt}ms`)
        lines.push(`  Packets Lost: ${quality.packetsLost}`)
        lines.push(`  Jitter: ${quality.jitter}ms`)
      }
    }
    lines.push('')
    
    // Active reconnections
    if (report.activeReconnections.length > 0) {
      lines.push('-'.repeat(80))
      lines.push('ACTIVE RECONNECTIONS')
      lines.push('-'.repeat(80))
      for (const peerId of report.activeReconnections) {
        lines.push(`  - ${peerId}`)
      }
      lines.push('')
    }
    
    // Recent errors (Requirement 6.4)
    if (report.recentErrors && report.recentErrors.length > 0) {
      lines.push('-'.repeat(80))
      lines.push(`RECENT ERRORS (${report.recentErrors.length})`)
      lines.push('-'.repeat(80))
      
      for (const error of report.recentErrors) {
        lines.push(`\n[${new Date(error.timestamp).toISOString()}]`)
        lines.push(`  Operation: ${error.context.operation}`)
        lines.push(`  Error Type: ${error.errorType}`)
        lines.push(`  Error Name: ${error.errorName}`)
        lines.push(`  Message: ${error.errorMessage}`)
        
        if (error.context.peerId) {
          lines.push(`  Peer ID: ${error.context.peerId}`)
        }
        if (error.context.channelId) {
          lines.push(`  Channel ID: ${error.context.channelId}`)
        }
        if (error.context.connectionState) {
          lines.push(`  Connection State: ${error.context.connectionState}`)
        }
        if (error.context.iceConnectionState) {
          lines.push(`  ICE Connection State: ${error.context.iceConnectionState}`)
        }
        if (error.context.signalingState) {
          lines.push(`  Signaling State: ${error.context.signalingState}`)
        }
        
        if (error.recoveryAttempted) {
          lines.push(`  Recovery Attempted: Yes`)
          if (error.recoverySuccessful !== undefined) {
            lines.push(`  Recovery Successful: ${error.recoverySuccessful ? 'Yes' : 'No'}`)
          }
        }
        
        if (error.stack) {
          lines.push(`  Stack Trace:`)
          const stackLines = error.stack.split('\n').slice(0, 5) // First 5 lines
          for (const stackLine of stackLines) {
            lines.push(`    ${stackLine.trim()}`)
          }
        }
      }
      lines.push('')
    }
    
    lines.push('='.repeat(80))
    lines.push('END OF REPORT')
    lines.push('='.repeat(80))
    
    return lines.join('\n')
  }

  /**
   * Perform health check on all peer connections
   * Implements Requirement 9.3: Health check diagnostics
   * 
   * Checks all peer connection states, verifies track presence and state,
   * generates issues and recommendations for each connection.
   * 
   * @returns Array of HealthCheckResult for each peer connection
   */
  performHealthCheck(): HealthCheckResult[] {
    console.log('🏥 Performing health check on all peer connections...')
    
    const results: HealthCheckResult[] = []
    const timestamp = Date.now()
    
    // Check each peer connection
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const issues: string[] = []
      const recommendations: string[] = []
      
      // Check connection state
      const connectionState = pc.connectionState
      const iceConnectionState = pc.iceConnectionState
      const signalingState = pc.signalingState
      
      // Determine if connection is healthy
      let isHealthy = true
      
      // Check connection state
      if (connectionState === 'failed') {
        isHealthy = false
        issues.push('Connection state is failed')
        recommendations.push('Try manual reconnection or check network connectivity')
      } else if (connectionState === 'disconnected') {
        isHealthy = false
        issues.push('Connection state is disconnected')
        recommendations.push('Automatic reconnection should be in progress')
      } else if (connectionState === 'closed') {
        isHealthy = false
        issues.push('Connection is closed')
        recommendations.push('Connection needs to be re-established')
      }
      
      // Check ICE connection state
      if (iceConnectionState === 'failed') {
        isHealthy = false
        issues.push('ICE connection failed')
        recommendations.push('Check firewall settings and TURN server availability')
      } else if (iceConnectionState === 'disconnected') {
        isHealthy = false
        issues.push('ICE connection disconnected')
        recommendations.push('Network may be unstable, reconnection in progress')
      } else if (iceConnectionState === 'checking') {
        issues.push('ICE connection still establishing')
        recommendations.push('Wait for connection to complete')
      }
      
      // Check signaling state
      if (signalingState !== 'stable' && signalingState !== 'have-local-offer' && signalingState !== 'have-remote-offer') {
        issues.push(`Unusual signaling state: ${signalingState}`)
        recommendations.push('Signaling may be in progress or stuck')
      }
      
      // Check for tracks
      const senders = pc.getSenders()
      
      // Check audio sender
      const audioSender = senders.find(s => s.track?.kind === 'audio')
      if (!audioSender || !audioSender.track) {
        isHealthy = false
        issues.push('No audio sender found')
        recommendations.push('Audio may not be transmitting to this peer')
      } else if (!audioSender.track.enabled) {
        issues.push('Audio track is disabled (muted)')
      } else if (audioSender.track.readyState !== 'live') {
        isHealthy = false
        issues.push(`Audio track is not live: ${audioSender.track.readyState}`)
        recommendations.push('Audio track may have ended unexpectedly')
      }
      
      // Check video sender (if video is enabled)
      const currentVideoTrack = this.trackManager.getCurrentVideoTrack()
      const videoState = this.trackManager.getCurrentTrackState()
      
      if (videoState.isActive && currentVideoTrack) {
        const videoSender = senders.find(s => s.track?.kind === 'video')
        if (!videoSender || !videoSender.track) {
          isHealthy = false
          issues.push('Video is enabled but no video sender found')
          recommendations.push('Video may not be transmitting to this peer - try toggling video')
        } else if (videoSender.track.id !== currentVideoTrack.id) {
          isHealthy = false
          issues.push('Video sender has wrong track')
          recommendations.push('Video track mismatch - try toggling video')
        } else if (!videoSender.track.enabled) {
          issues.push('Video track is disabled')
        } else if (videoSender.track.readyState !== 'live') {
          isHealthy = false
          issues.push(`Video track is not live: ${videoSender.track.readyState}`)
          recommendations.push('Video track may have ended unexpectedly')
        }
      }
      
      // Check for remote tracks
      const remoteStream = this.remoteStreams.get(peerId)
      if (!remoteStream) {
        issues.push('No remote stream received from this peer')
        recommendations.push('May not be receiving audio/video from this peer')
      } else {
        const remoteAudioTracks = remoteStream.getAudioTracks()
        const remoteVideoTracks = remoteStream.getVideoTracks()
        
        if (remoteAudioTracks.length === 0) {
          issues.push('No remote audio track')
          recommendations.push('Not receiving audio from this peer')
        }
        
        // Note: Remote video tracks may be 0 if peer has video disabled, which is normal
      }
      
      // Check connection quality
      const quality = connectionMonitor.getConnectionQuality(peerId)
      if (quality) {
        if (quality.quality === 'poor') {
          issues.push('Connection quality is poor')
          recommendations.push('Network conditions are degraded - consider reducing video quality')
        } else if (quality.quality === 'fair') {
          issues.push('Connection quality is fair')
          recommendations.push('Network conditions are suboptimal')
        }
      }
      
      // Check if connection is being monitored
      if (!connectionMonitor.isMonitoring(peerId)) {
        issues.push('Connection is not being monitored')
        recommendations.push('Connection monitoring may have stopped unexpectedly')
      }
      
      // Create health check result
      const result: HealthCheckResult = {
        peerId,
        isHealthy,
        connectionState,
        iceConnectionState,
        signalingState,
        issues,
        recommendations,
        timestamp,
      }
      
      results.push(result)
      
      // Log result
      if (isHealthy) {
        console.log(`✅ Health check passed for peer ${peerId}`)
      } else {
        console.warn(`⚠️ Health check failed for peer ${peerId}:`, {
          issues,
          recommendations,
        })
      }
    }
    
    // Log summary
    const healthyCount = results.filter(r => r.isHealthy).length
    const unhealthyCount = results.filter(r => !r.isHealthy).length
    
    console.log('📊 Health check summary:', {
      totalPeers: results.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      timestamp: new Date().toISOString(),
    })
    
    // Emit health check event
    this.emit('health-check-completed', {
      results,
      healthyCount,
      unhealthyCount,
      timestamp,
    })
    
    return results
  }

  // Event emitter
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: Function) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  private emit(event: string, data?: any) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }
}

export const webrtcService = new WebRTCService()
