// WebRTC Service para Voice/Video Chat
import { wsService } from './websocket'
import { getWebRTCConfig } from '../config/webrtc'
import { connectionMonitor, ConnectionQuality } from './connectionMonitor'
import { VoiceActivityDetector } from './voiceActivityDetector'
import { TrackManager, TrackType, TrackState } from './trackManager'
import { ReconnectionManager } from './reconnectionManager'

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

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private remoteStreams: Map<string, MediaStream> = new Map()
  private currentChannelId: string | null = null
  private listeners: Map<string, Set<Function>> = new Map()
  
  // Track manager for robust media track management
  private trackManager: TrackManager = new TrackManager()

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
      console.error('❌ Failed to configure TURN server:', error)
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
  }

  // Entrar em canal de voz
  async joinVoiceChannel(channelId: string, videoEnabled: boolean = false): Promise<void> {
    try {
      console.log('🎤 Joining voice channel:', channelId)
      console.log('📡 WebSocket ready state:', wsService ? 'connected' : 'not connected')

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
      console.log('✅ Local stream obtained, tracks:', this.localStream.getTracks().map(t => `${t.kind}: ${t.enabled}`))
    } catch (error) {
      console.error('❌ Failed to get user media:', error)
      
      // Improved error messages (Requirement 5.5, 7.5)
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          const errorMsg = videoEnabled 
            ? 'Microphone and camera permissions denied. Please allow access in your browser settings.'
            : 'Microphone permission denied. Please allow access in your browser settings.'
          this.emit('video-error', { 
            error: errorMsg,
            severity: 'error',
            action: 'check-permissions',
          })
          throw new Error(errorMsg)
        } else if (error.name === 'NotFoundError') {
          const errorMsg = videoEnabled
            ? 'No microphone or camera found. Please connect audio/video devices.'
            : 'No microphone found. Please connect a microphone.'
          this.emit('video-error', { 
            error: errorMsg,
            severity: 'error',
            action: 'check-device',
          })
          throw new Error(errorMsg)
        } else if (error.name === 'NotReadableError') {
          const errorMsg = 'Microphone or camera is already in use by another application.'
          this.emit('video-error', { 
            error: errorMsg,
            severity: 'error',
            action: 'check-device',
          })
          throw new Error(errorMsg)
        } else {
          const errorMsg = 'Failed to access microphone/camera. Please check your devices and try again.'
          this.emit('video-error', { 
            error: errorMsg,
            severity: 'error',
            action: 'retry',
          })
          throw new Error(errorMsg)
        }
      } else {
        const errorMsg = 'An unexpected error occurred while accessing media devices.'
        this.emit('video-error', { 
          error: errorMsg,
          severity: 'error',
          action: 'retry',
        })
        throw new Error(errorMsg)
      }
    }
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
        // Enhanced error logging with full context (Requirement 4.5)
        console.error('❌ Failed to handle negotiation needed:', {
          peerId: userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Listener para ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Log ICE candidate type for statistics
        const candidateType = this.extractCandidateType(event.candidate)
        if (candidateType) {
          const types = this.iceCandidateTypes.get(userId)
          if (types) {
            types.add(candidateType)
          }
          console.log(`📊 ICE candidate type for ${userId}: ${candidateType}`)
        }

        console.log('📤 Sending ICE candidate to', userId)
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
        }
      }

      // Detect connection failure and trigger TURN fallback
      if (iceState === 'failed' && !this.usingTURNOnly.get(userId)) {
        console.warn('⚠️ Direct P2P connection failed, attempting TURN fallback for', userId)
        this.attemptTURNFallback(userId)
      }
    }

    // Listener para mudanças de conexão
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState)

      // Emit connection state changes for monitoring
      this.emit('connection-state-change', {
        userId,
        state: pc.connectionState,
        iceState: pc.iceConnectionState
      })

      // Trigger automatic reconnection on disconnected or failed state
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log(`⚠️ Connection ${pc.connectionState} for ${userId}, attempting reconnection`)
        this.attemptReconnection(userId)
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
      return urls.some(url => url.startsWith('turn:'))
    })
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
   */
  private async attemptTURNFallback(userId: string): Promise<void> {
    try {
      console.log('🔄 Attempting TURN fallback for', userId)

      // Check if we have TURN servers configured
      const turnServers = this.getTURNOnlyServers()
      if (turnServers.length === 0) {
        console.error('❌ No TURN servers configured, cannot fallback')
        this.emit('turn-fallback-failed', { userId, reason: 'no-turn-servers' })
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
      console.error('❌ TURN fallback failed for', userId, error)
      this.emit('turn-fallback-failed', { userId, error })
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
      console.error(`❌ Reconnection failed for ${userId}:`, error)
      
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
  private async handleExistingUsers(data: { users: Array<{ userId: string; username: string }> }) {
    console.log('👥 Received existing users:', data.users.length)

    // Para cada usuário existente, criar conexão e enviar offer
    for (const user of data.users) {
      try {
        console.log('👤 Connecting to existing user:', user.username, 'userId:', user.userId)

        // Criar conexão peer
        const pc = await this.createPeerConnection(user.userId)

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

        this.emit('user-joined', user)
      } catch (error) {
        console.error('Failed to connect to existing user:', user.username, error)
      }
    }
  }

  // Handler: Novo usuário entrou no canal
  // Task 14: Enhanced with comprehensive operation logging (Requirements 4.1, 4.2, 4.5)
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
      // Criar conexão peer
      const pc = await this.createPeerConnection(data.userId)

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
      
      console.log('✅ User joined handled successfully:', data.username)

      this.emit('user-joined', data)
    } catch (error) {
      // Enhanced error logging with full context (Requirement 4.5)
      console.error('❌ Failed to handle user joined:', {
        peerId: data.userId,
        username: data.username,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Handler: Recebeu offer de outro usuário
  // Task 14: Enhanced with comprehensive negotiation logging (Requirements 4.2, 4.5)
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
        // Se não existe, criar nova conexão
        console.log('➕ Creating new peer connection for offer from', data.userId)
        pc = await this.createPeerConnection(data.userId)
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
      
      console.log('✅ Offer handled successfully for', data.userId)
    } catch (error) {
      // Enhanced error logging with full context (Requirement 4.5)
      console.error('❌ Failed to handle offer:', {
        peerId: data.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        offerType: data.offer.type,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Handler: Recebeu answer de outro usuário
  // Task 14: Enhanced with comprehensive negotiation logging (Requirements 4.2, 4.5)
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
      } catch (error) {
        // Enhanced error logging with full context (Requirement 4.5)
        console.error('❌ Failed to handle answer:', {
          peerId: data.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
          answerType: data.answer.type,
          signalingState: pc.signalingState,
          timestamp: new Date().toISOString(),
        })
      }
    } else {
      console.error('❌ No peer connection found for answer from', data.userId)
    }
  }

  // Handler: Recebeu ICE candidate
  private async handleIceCandidate(data: { userId: string; candidate: RTCIceCandidateInit }) {
    console.log('📨 Received ICE candidate from', data.userId)
    const pc = this.peerConnections.get(data.userId)
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        console.log('✅ ICE candidate added')
      } catch (error) {
        console.error('Failed to add ICE candidate:', error)
      }
    } else {
      console.warn('⚠️ No peer connection found for', data.userId)
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
  // Task 14: Enhanced with comprehensive operation logging (Requirements 4.1, 4.4, 4.5)
  async toggleVideo(): Promise<boolean> {
    return this.trackManager.queueOperation('add-video', async () => {
      try {
        // Log operation start (Requirement 4.1)
        console.log('📹 Toggle video operation started')
        console.log('📊 Video state before toggle:', {
          hasLocalStream: !!this.localStream,
          currentTrack: this.trackManager.getCurrentVideoTrack()?.id || 'none',
          currentType: this.trackManager.getCurrentTrackType(),
          isActive: this.trackManager.getCurrentTrackState().isActive,
          peerCount: this.peerConnections.size,
          timestamp: new Date().toISOString(),
        })
        
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
          
          console.log('✅ Video toggle (enable) completed successfully')
          return true
        }

        // No video track exists, add new camera track
        // Note: addVideoTrack already has audio preservation checks
        console.log('📊 No existing video track, adding new camera track')
        return await this.addVideoTrack()
      } catch (error) {
        // Enhanced error logging with full context (Requirement 4.5)
        console.error('❌ Failed to toggle video:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined,
          currentTrack: this.trackManager.getCurrentVideoTrack()?.id || 'none',
          currentType: this.trackManager.getCurrentTrackType(),
          peerCount: this.peerConnections.size,
          timestamp: new Date().toISOString(),
        })
        
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

  // Adicionar track de vídeo dinamicamente
  // Implements Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.5, 5.2, 5.4, 6.3
  async addVideoTrack(): Promise<boolean> {
    return this.trackManager.queueOperation('add-video', async () => {
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
        console.error('❌ Failed to add video track:', error)
        
        // Handle specific error types with improved messages (Requirement 5.5)
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            this.emit('video-error', { 
              error: 'Camera permission denied. Please allow camera access in your browser settings.',
              severity: 'warning',
              action: 'check-permissions',
            })
          } else if (error.name === 'NotFoundError') {
            this.emit('video-error', { 
              error: 'No camera found. Please connect a camera and try again.',
              severity: 'warning',
              action: 'check-device',
            })
          } else if (error.name === 'NotReadableError') {
            this.emit('video-error', { 
              error: 'Camera is already in use by another application. Please close other apps using the camera.',
              severity: 'warning',
              action: 'check-device',
            })
          } else if (error.name === 'OverconstrainedError') {
            this.emit('video-error', { 
              error: 'Camera does not support the requested video quality. Trying with default settings.',
              severity: 'info',
              action: 'retry',
            })
          } else if (error.message && error.message.includes('replace')) {
            // Track replacement error
            this.emit('video-error', { 
              error: 'Failed to update video for other participants. Your video may not be visible to others.',
              severity: 'error',
              action: 'reconnect',
            })
          } else if (error.message && error.message.includes('sender')) {
            // Sender creation/verification error
            this.emit('video-error', { 
              error: 'Failed to establish video connection with some participants. Your video may not be visible to all.',
              severity: 'error',
              action: 'retry',
            })
          } else if (error.message && error.message.includes('stable')) {
            // Signaling state error
            this.emit('video-error', { 
              error: 'Connection is busy. Please wait a moment and try again.',
              severity: 'warning',
              action: 'retry',
            })
          } else {
            this.emit('video-error', { 
              error: 'Failed to access camera. Please check your camera and try again.',
              severity: 'error',
              action: 'retry',
            })
          }
        } else {
          this.emit('video-error', { 
            error: 'An unexpected error occurred while accessing the camera.',
            severity: 'error',
            action: 'retry',
          })
        }
        
        return false
      }
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
   * Synchronize video state across all peer connections
   * Implements Requirement 5.5: State synchronization across peers
   * 
   * This method verifies that all peer connections have consistent video state
   * with the local video state. If inconsistencies are detected, it automatically
   * fixes them by adding or replacing tracks as needed.
   * 
   * Inconsistencies can occur when:
   * - A peer connection is established after video was enabled
   * - Network issues cause track transmission to fail
   * - Renegotiation fails or is interrupted
   * - Manual recovery operations are needed
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
      
      // If no video track or video is disabled, ensure all peers have no video sender
      if (!currentVideoTrack || !currentTrackState.isActive || !currentVideoTrack.enabled) {
        console.log('ℹ️ Video is disabled locally, ensuring all peers have no active video')
        await this.synchronizeDisabledVideoState()
        return
      }
      
      // Video is enabled locally, ensure all peers have the correct video track
      console.log('ℹ️ Video is enabled locally, ensuring all peers have correct video track')
      await this.synchronizeEnabledVideoState(currentVideoTrack)
      
      console.log('✅ Video state synchronized successfully across all peers')
      
      // Emit state change event (Requirement 7.5)
      this.emit('video-state-synchronized', {
        trackId: currentVideoTrack.id,
        trackType: currentTrackType,
        isActive: currentTrackState.isActive,
        peerCount: this.peerConnections.size,
      })
      
    } catch (error) {
      console.error('❌ Failed to synchronize video state:', error)
      
      // Emit error event with detailed information (Requirement 7.4)
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
   * Synchronize disabled video state across all peers
   * Ensures all peer connections have no active video senders
   * 
   * @returns Promise<void>
   */
  private async synchronizeDisabledVideoState(): Promise<void> {
    console.log('🔄 Synchronizing disabled video state...')
    
    const inconsistentPeers: string[] = []
    const fixResults: Array<{ peerId: string; success: boolean; error?: string }> = []
    
    // Check each peer connection
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (videoSender && videoSender.track && videoSender.track.enabled) {
        // Peer has active video sender but local video is disabled - inconsistent
        console.warn(`⚠️ Peer ${peerId} has active video sender but local video is disabled`)
        inconsistentPeers.push(peerId)
        
        try {
          // Disable the video track for this peer by replacing with null
          await videoSender.replaceTrack(null)
          console.log(`✅ Disabled video sender for peer ${peerId}`)
          
          fixResults.push({ peerId, success: true })
        } catch (error) {
          console.error(`❌ Failed to disable video sender for peer ${peerId}:`, error)
          
          fixResults.push({
            peerId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      } else {
        console.log(`✅ Peer ${peerId} video state is consistent (disabled)`)
      }
    }
    
    // Log synchronization results
    if (inconsistentPeers.length > 0) {
      const successCount = fixResults.filter(r => r.success).length
      const failureCount = fixResults.filter(r => !r.success).length
      
      console.log(`📊 Disabled video state synchronization: ${inconsistentPeers.length} inconsistent peers, ${successCount} fixed, ${failureCount} failed`)
      
      if (failureCount > 0) {
        const failedPeers = fixResults.filter(r => !r.success).map(r => r.peerId)
        console.warn(`⚠️ Failed to synchronize disabled video state for peers: ${failedPeers.join(', ')}`)
      }
    } else {
      console.log('✅ All peers have consistent disabled video state')
    }
  }

  /**
   * Synchronize enabled video state across all peers
   * Ensures all peer connections have the correct video track
   * 
   * @param expectedTrack - The video track that should be present on all peers
   * @returns Promise<void>
   */
  private async synchronizeEnabledVideoState(expectedTrack: MediaStreamTrack): Promise<void> {
    console.log('🔄 Synchronizing enabled video state...', {
      expectedTrackId: expectedTrack.id,
      expectedTrackKind: expectedTrack.kind,
      expectedTrackEnabled: expectedTrack.enabled,
      expectedTrackReadyState: expectedTrack.readyState,
    })
    
    // Verify track is valid
    if (expectedTrack.readyState !== 'live') {
      const error = `Expected track is not live (readyState: ${expectedTrack.readyState})`
      console.error(`❌ ${error}`)
      throw new Error(error)
    }
    
    if (!this.localStream) {
      const error = 'No local stream available'
      console.error(`❌ ${error}`)
      throw new Error(error)
    }
    
    const inconsistentPeers: Array<{
      peerId: string
      issue: 'missing-sender' | 'wrong-track' | 'disabled-track'
      currentTrackId?: string
    }> = []
    
    const fixResults: Array<{ peerId: string; success: boolean; error?: string }> = []
    
    // Check each peer connection for inconsistencies
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      
      if (!videoSender) {
        // Missing video sender - needs to be added
        console.warn(`⚠️ Peer ${peerId} is missing video sender`)
        inconsistentPeers.push({ peerId, issue: 'missing-sender' })
      } else if (!videoSender.track) {
        // Sender exists but has no track - needs track
        console.warn(`⚠️ Peer ${peerId} has video sender but no track`)
        inconsistentPeers.push({ peerId, issue: 'missing-sender' })
      } else if (videoSender.track.id !== expectedTrack.id) {
        // Wrong track - needs to be replaced
        console.warn(`⚠️ Peer ${peerId} has wrong video track:`, {
          expected: expectedTrack.id,
          actual: videoSender.track.id,
        })
        inconsistentPeers.push({
          peerId,
          issue: 'wrong-track',
          currentTrackId: videoSender.track.id,
        })
      } else if (!videoSender.track.enabled) {
        // Correct track but disabled - needs to be enabled
        console.warn(`⚠️ Peer ${peerId} has correct track but it's disabled`)
        inconsistentPeers.push({
          peerId,
          issue: 'disabled-track',
          currentTrackId: videoSender.track.id,
        })
      } else {
        console.log(`✅ Peer ${peerId} video state is consistent`)
      }
    }
    
    // Fix inconsistencies
    if (inconsistentPeers.length > 0) {
      console.log(`🔧 Fixing ${inconsistentPeers.length} inconsistent peer(s)...`)
      
      for (const { peerId, issue, currentTrackId } of inconsistentPeers) {
        const pc = this.peerConnections.get(peerId)
        if (!pc) {
          console.error(`❌ Peer connection not found for ${peerId}`)
          fixResults.push({
            peerId,
            success: false,
            error: 'Peer connection not found',
          })
          continue
        }
        
        try {
          if (issue === 'missing-sender') {
            // Add track to create new sender (triggers negotiation)
            console.log(`➕ Adding video track for peer ${peerId}`)
            
            // Wait for stable signaling state
            await this.waitForStableState(pc, peerId)
            
            const newSender = pc.addTrack(expectedTrack, this.localStream)
            
            console.log(`✅ Video sender created for peer ${peerId}:`, {
              trackId: newSender.track?.id,
              trackKind: newSender.track?.kind,
              trackEnabled: newSender.track?.enabled,
            })
            
            fixResults.push({ peerId, success: true })
            
          } else if (issue === 'wrong-track') {
            // Replace track with correct one (no negotiation needed)
            console.log(`🔄 Replacing video track for peer ${peerId}`)
            
            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (videoSender) {
              await videoSender.replaceTrack(expectedTrack)
              
              console.log(`✅ Video track replaced for peer ${peerId}`)
              fixResults.push({ peerId, success: true })
            } else {
              throw new Error('Video sender not found after check')
            }
            
          } else if (issue === 'disabled-track') {
            // Track is correct but disabled - this shouldn't happen in normal operation
            // The track should be enabled at the source, not per-sender
            console.warn(`⚠️ Peer ${peerId} has disabled track - this may indicate a deeper issue`)
            
            // Try replacing with the enabled track
            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (videoSender) {
              await videoSender.replaceTrack(expectedTrack)
              
              console.log(`✅ Video track replaced for peer ${peerId}`)
              fixResults.push({ peerId, success: true })
            } else {
              throw new Error('Video sender not found after check')
            }
          }
          
        } catch (error) {
          console.error(`❌ Failed to fix video state for peer ${peerId}:`, error)
          
          fixResults.push({
            peerId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
      
      // Log synchronization results
      const successCount = fixResults.filter(r => r.success).length
      const failureCount = fixResults.filter(r => !r.success).length
      
      console.log(`📊 Enabled video state synchronization: ${inconsistentPeers.length} inconsistent peers, ${successCount} fixed, ${failureCount} failed`)
      
      if (failureCount > 0) {
        const failedPeers = fixResults.filter(r => !r.success).map(r => r.peerId)
        console.warn(`⚠️ Failed to synchronize enabled video state for peers: ${failedPeers.join(', ')}`)
        
        // Emit warning event
        this.emit('video-error', {
          error: `Video may not be visible to some participants (${failureCount} failed)`,
          severity: 'warning',
          action: 'retry',
          failedPeers,
        })
      }
    } else {
      console.log('✅ All peers have consistent enabled video state')
    }
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
