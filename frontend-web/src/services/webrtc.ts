// WebRTC Service para Voice/Video Chat
import { wsService } from './websocket'
import { getWebRTCConfig } from '../config/webrtc'
import { connectionMonitor, ConnectionQuality } from './connectionMonitor'
import { VoiceActivityDetector } from './voiceActivityDetector'

export interface VoiceUser {
  userId: string
  username: string
  isMuted: boolean
  isSpeaking: boolean
  isVideoEnabled: boolean
}

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private remoteStreams: Map<string, MediaStream> = new Map()
  private currentChannelId: string | null = null
  private listeners: Map<string, Set<Function>> = new Map()

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

  // Reconnection tracking
  private reconnectionAttempts: Map<string, number> = new Map()
  private reconnectionTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private maxReconnectionAttempts: number = 3
  private reconnectionBackoffs: number[] = [1000, 2000, 4000] // 1s, 2s, 4s

  // VAD instances
  private localVad: VoiceActivityDetector | null = null
  private remoteVads: Map<string, VoiceActivityDetector> = new Map()

  constructor() {
    this.initializeICEServers()
    this.setupWebSocketListeners()
    this.setupConnectionMonitoring()
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
      throw new Error('Não foi possível acessar microfone/câmera')
    }
  }

  // Sair do canal de voz
  leaveVoiceChannel() {
    console.log('🔇 Leaving voice channel')

    // Clean up local VAD
    if (this.localVad) {
      this.localVad.detach()
      this.localVad = null
    }

    // Clean up remote VADs
    this.remoteVads.forEach(vad => vad.detach())
    this.remoteVads.clear()

    // Parar todas as tracks do stream local
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }

    // Fechar todas as conexões peer
    this.peerConnections.forEach((pc, userId) => {
      pc.close()
      // Stop monitoring each connection
      connectionMonitor.stopMonitoring(userId)
      this.peerConnections.delete(userId)
    })

    // Limpar streams remotos
    this.remoteStreams.clear()

    // Clean up TURN fallback tracking
    this.connectionAttempts.clear()
    this.usingTURNOnly.clear()
    this.iceConnectionStates.clear()

    // Clean up connection statistics tracking
    this.connectionStartTimes.clear()
    this.connectionEstablishedTimes.clear()
    this.iceCandidateTypes.clear()

    // Clean up reconnection tracking
    this.reconnectionTimeouts.forEach(timeout => clearTimeout(timeout))
    this.reconnectionTimeouts.clear()
    this.reconnectionAttempts.clear()

    // Notificar servidor
    if (this.currentChannelId) {
      wsService.send({
        type: 'voice:leave',
        channelId: this.currentChannelId,
      })
    }

    this.currentChannelId = null
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
    pc.onnegotiationneeded = async () => {
      try {
        console.log('🔄 Negotiation needed for', userId)

        // Only create offer if we're in stable state or have-local-offer
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
          console.log('⚠️ Skipping negotiation, signaling state:', pc.signalingState)
          return
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        console.log('📤 Sending renegotiation offer to', userId)
        wsService.send({
          type: 'voice:offer',
          data: {
            targetUserId: userId,
            offer: offer,
          }
        })
      } catch (error) {
        console.error('❌ Failed to handle negotiation needed:', error)
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
    pc.ontrack = (event) => {
      console.log('📥 Received remote track from', userId)
      const remoteStream = event.streams[0]
      this.remoteStreams.set(userId, remoteStream)

      // Initialize VAD for remote stream
      const remoteVad = new VoiceActivityDetector()
      remoteVad.attachToStream(remoteStream)
      remoteVad.onVoiceActivity((isActive, level) => {
        this.emit('voice-activity', { userId, isActive, level })
      })
      this.remoteVads.set(userId, remoteVad)

      this.emit('remote-stream', { userId, stream: remoteStream })
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
   * Implements Requirements 5.1, 5.3
   */
  private attemptReconnection(userId: string): void {
    // Check if already reconnecting
    if (this.reconnectionTimeouts.has(userId)) {
      console.log('⚠️ Already attempting reconnection for', userId)
      return
    }

    // Get current attempt count
    const attempts = this.reconnectionAttempts.get(userId) || 0

    // Check if max attempts reached
    if (attempts >= this.maxReconnectionAttempts) {
      console.error(`❌ Max reconnection attempts (${this.maxReconnectionAttempts}) reached for ${userId}`)
      this.emit('reconnection-failed', { userId, attempts })

      // Clean up
      this.reconnectionAttempts.delete(userId)
      this.handleUserLeft({ userId })
      return
    }

    // Calculate backoff delay
    const delay = this.reconnectionBackoffs[attempts] || this.reconnectionBackoffs[this.reconnectionBackoffs.length - 1]

    console.log(`🔄 Scheduling reconnection attempt ${attempts + 1}/${this.maxReconnectionAttempts} for ${userId} in ${delay}ms`)

    // Emit reconnecting state
    this.emit('reconnecting', { userId, attempt: attempts + 1, maxAttempts: this.maxReconnectionAttempts })

    // Schedule reconnection
    const timeout = setTimeout(async () => {
      try {
        console.log(`🔄 Executing reconnection attempt ${attempts + 1} for ${userId}`)

        // Increment attempt counter
        this.reconnectionAttempts.set(userId, attempts + 1)

        // Clear timeout reference
        this.reconnectionTimeouts.delete(userId)

        // Check WebSocket connection first (Requirement 5.5)
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

        // Emit reconnection attempt event
        this.emit('reconnection-attempted', { userId, attempt: attempts + 1 })

      } catch (error) {
        console.error('❌ Reconnection attempt failed for', userId, error)
        this.reconnectionTimeouts.delete(userId)

        // Try again if we haven't reached max attempts
        if (attempts + 1 < this.maxReconnectionAttempts) {
          this.attemptReconnection(userId)
        } else {
          this.emit('reconnection-failed', { userId, attempts: attempts + 1, error })
          this.reconnectionAttempts.delete(userId)
          this.handleUserLeft({ userId })
        }
      }
    }, delay)

    this.reconnectionTimeouts.set(userId, timeout)
  }

  /**
   * Manually trigger reconnection for a user
   * Implements Requirements 5.3
   */
  public manualReconnect(userId: string): void {
    console.log('🔄 Manual reconnection triggered for', userId)

    // Clear any existing reconnection state
    const timeout = this.reconnectionTimeouts.get(userId)
    if (timeout) {
      clearTimeout(timeout)
      this.reconnectionTimeouts.delete(userId)
    }

    // Reset attempt counter
    this.reconnectionAttempts.delete(userId)

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
  private async handleUserJoined(data: { userId: string; username: string }) {
    console.log('👤 User joined voice:', data.username, 'userId:', data.userId)

    try {
      // Criar conexão peer
      const pc = await this.createPeerConnection(data.userId)

      // Criar e enviar offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('📤 Sending offer to', data.username)
      wsService.send({
        type: 'voice:offer',
        data: {
          targetUserId: data.userId,
          offer: offer,
        }
      })

      this.emit('user-joined', data)
    } catch (error) {
      console.error('Failed to handle user joined:', error)
    }
  }

  // Handler: Recebeu offer de outro usuário
  private async handleOffer(data: { userId: string; offer: RTCSessionDescriptionInit }) {
    console.log('📨 Received offer from', data.userId)

    try {
      // Verificar se já existe uma conexão peer
      let pc = this.peerConnections.get(data.userId)

      if (!pc) {
        // Se não existe, criar nova conexão
        pc = await this.createPeerConnection(data.userId)
      } else {
        // Se já existe, esta é uma renegociação
        console.log('🔄 Handling renegotiation offer from', data.userId)
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer))

      // Criar e enviar answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      console.log('📤 Sending answer to', data.userId)
      wsService.send({
        type: 'voice:answer',
        data: {
          targetUserId: data.userId,
          answer: answer,
        }
      })
    } catch (error) {
      console.error('Failed to handle offer:', error)
    }
  }

  // Handler: Recebeu answer de outro usuário
  private async handleAnswer(data: { userId: string; answer: RTCSessionDescriptionInit }) {
    console.log('📨 Received answer from', data.userId)

    const pc = this.peerConnections.get(data.userId)
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
      } catch (error) {
        console.error('Failed to handle answer:', error)
      }
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

    // Clean up reconnection tracking
    const timeout = this.reconnectionTimeouts.get(data.userId)
    if (timeout) {
      clearTimeout(timeout)
      this.reconnectionTimeouts.delete(data.userId)
    }
    this.reconnectionAttempts.delete(data.userId)

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

      return isMuted
    }
    return false
  }

  // Ligar/desligar vídeo
  toggleVideo(): boolean {
    if (!this.localStream) return false

    const videoTrack = this.localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled

      console.log('📹 Toggle video:', videoTrack.enabled)

      // Notificar outros usuários sobre o status
      if (this.currentChannelId) {
        wsService.send({
          type: 'voice:video-status',
          channelId: this.currentChannelId,
          data: {
            isVideoEnabled: videoTrack.enabled,
          }
        })
      }

      return videoTrack.enabled
    }
    return false
  }

  // Adicionar track de vídeo dinamicamente
  async addVideoTrack(): Promise<boolean> {
    try {
      console.log('📹 Adding video track...')

      // Obter stream de vídeo
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        }
      })

      const videoTrack = videoStream.getVideoTracks()[0]

      // Adicionar ao stream local
      if (this.localStream) {
        this.localStream.addTrack(videoTrack)

        // Para cada conexão peer existente, verificar se já tem sender de vídeo
        for (const [userId, pc] of this.peerConnections.entries()) {
          const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')

          if (videoSender) {
            // Se já tem sender, apenas substituir a track
            console.log('🔄 Replacing video track for', userId)
            await videoSender.replaceTrack(videoTrack)
          } else {
            // Se não tem sender, adicionar novo track (vai causar renegociação)
            console.log('➕ Adding video track for', userId)
            pc.addTrack(videoTrack, this.localStream)
          }
        }

        console.log('✅ Video track added')
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

        return true
      }

      return false
    } catch (error) {
      console.error('❌ Failed to add video track:', error)
      return false
    }
  }

  // Compartilhar tela
  async shareScreen(): Promise<boolean> {
    try {
      console.log('🖥️ Starting screen share...')

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        },
        audio: false,
      })

      const screenTrack = screenStream.getVideoTracks()[0]

      // Substituir track de vídeo em todas as conexões
      for (const [userId, pc] of this.peerConnections.entries()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          await sender.replaceTrack(screenTrack)
          console.log('✅ Screen track replaced for', userId)
        } else {
          console.warn('⚠️ No video sender found for', userId, ', adding track')
          pc.addTrack(screenTrack, this.localStream!)
        }
      }

      // Atualizar stream local para mostrar screen share
      if (this.localStream) {
        const oldVideoTrack = this.localStream.getVideoTracks()[0]
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack)
        }
        this.localStream.addTrack(screenTrack)
        this.emit('local-stream', this.localStream)
      }

      // Quando parar de compartilhar, voltar para câmera
      screenTrack.onended = () => {
        console.log('🖥️ Screen share ended by user')
        this.stopScreenShare()
      }

      console.log('✅ Screen share started')
      return true
    } catch (error) {
      console.error('❌ Failed to share screen:', error)
      return false
    }
  }

  // Parar compartilhamento de tela
  async stopScreenShare(): Promise<boolean> {
    try {
      console.log('🖥️ Stopping screen share...')

      // Obter nova track de câmera
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        }
      })

      const cameraTrack = cameraStream.getVideoTracks()[0]

      // Substituir track de tela por câmera em todas as conexões
      for (const [userId, pc] of this.peerConnections.entries()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          await sender.replaceTrack(cameraTrack)
          console.log('✅ Camera track restored for', userId)
        }
      }

      // Atualizar stream local
      if (this.localStream) {
        const oldVideoTrack = this.localStream.getVideoTracks()[0]
        if (oldVideoTrack) {
          oldVideoTrack.stop()
          this.localStream.removeTrack(oldVideoTrack)
        }
        this.localStream.addTrack(cameraTrack)
        this.emit('local-stream', this.localStream)
      }

      console.log('✅ Screen share stopped, camera restored')
      return true
    } catch (error) {
      console.error('❌ Failed to stop screen share:', error)
      return false
    }
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
