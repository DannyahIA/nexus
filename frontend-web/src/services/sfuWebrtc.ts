// Serviço SFU WebRTC - Conecta diretamente com o SFU do backend
// Substitui conexões P2P por uma única conexão com o servidor SFU

import { EventEmitter } from '../utils/eventEmitter'

export interface SFUUser {
  userId: string
  username: string
  isMuted: boolean
  isSpeaking: boolean
  isVideoEnabled: boolean
}

export interface SFUVideoState {
  isEnabled: boolean
  type: 'camera' | 'screen'
}

export interface SFUConnectionStats {
  peerId: string
  roomId: string
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  signalingState: RTCSignalingState
  isConnected: boolean
  uptime: number
}

export interface SFUSignalingMessage {
  type: 'join' | 'offer' | 'answer' | 'ice-candidate' | 'joined'
  peerId: string
  roomId?: string
  offer?: string
  answer?: string
  candidate?: string
  data?: any
}

class SFUWebRTCService extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStreams = new Map<string, MediaStream>()
  private ws: WebSocket | null = null
  private currentRoomId: string | null = null
  private currentPeerId: string | null = null
  private isVideoEnabled = false
  private isAudioEnabled = true
  private connectionStartTime: number | null = null
  
  // Configuração do servidor SFU
  private readonly SFU_WS_URL: string
  
  // Configuração ICE servers
  private readonly iceServers: RTCIceServer[]

  constructor() {
    super()
    
    // Configurar URLs e servidores
    this.SFU_WS_URL = (globalThis as any).import?.meta?.env?.VITE_SFU_WS_URL || 'ws://localhost:8083/ws'
    
    const turnUrl = (globalThis as any).import?.meta?.env?.VITE_TURN_URL
    const turnUsername = (globalThis as any).import?.meta?.env?.VITE_TURN_USERNAME
    const turnPassword = (globalThis as any).import?.meta?.env?.VITE_TURN_PASSWORD
    
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      ...(turnUrl ? [{
        urls: turnUrl,
        username: turnUsername,
        credential: turnPassword,
      }] : [])
    ]
    
    this.setupWebSocket()
  }

  private setupWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.ws = new WebSocket(this.SFU_WS_URL)
    
    this.ws.onopen = () => {
      console.log('🔗 Connected to SFU WebSocket server')
      this.emit('sfu-connected')
    }

    this.ws.onmessage = async (event) => {
      try {
        const message: SFUSignalingMessage = JSON.parse(event.data)
        await this.handleSignalingMessage(message)
      } catch (error) {
        console.error('❌ Failed to parse SFU message:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('❌ SFU WebSocket error:', error)
      this.emit('sfu-error', error)
    }

    this.ws.onclose = () => {
      console.log('🔌 Disconnected from SFU server')
      this.emit('sfu-disconnected')
      
      // Tentar reconectar após 3 segundos
      setTimeout(() => {
        if (this.currentRoomId) {
          this.setupWebSocket()
        }
      }, 3000)
    }
  }

  private async handleSignalingMessage(message: SFUSignalingMessage): Promise<void> {
    console.log('📥 Received SFU message:', message.type, message)

    switch (message.type) {
      case 'joined':
        console.log('✅ Successfully joined SFU room:', message.roomId)
        this.emit('room-joined', { roomId: message.roomId, peerId: message.peerId })
        break

      case 'answer':
        if (this.peerConnection && message.answer) {
          const answer = new RTCSessionDescription({
            type: 'answer',
            sdp: message.answer
          })
          await this.peerConnection.setRemoteDescription(answer)
          console.log('✅ SFU answer set')
        }
        break

      case 'ice-candidate':
        if (this.peerConnection && message.candidate) {
          const candidate = JSON.parse(message.candidate)
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          console.log('🧊 ICE candidate added from SFU')
        }
        break
    }
  }

  private sendSignalingMessage(message: SFUSignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('⚠️ WebSocket not connected, cannot send message')
    }
  }

  async joinRoom(roomId: string, userId: string): Promise<void> {
    console.log(`🚪 Joining SFU room: ${roomId} as ${userId}`)
    
    this.currentRoomId = roomId
    this.currentPeerId = userId
    this.connectionStartTime = Date.now()

    // Aguardar conexão WebSocket se necessário
    if (this.ws?.readyState !== WebSocket.OPEN) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'))
        }, 5000)

        const onConnect = () => {
          clearTimeout(timeout)
          resolve()
        }

        if (this.ws?.readyState === WebSocket.OPEN) {
          onConnect()
        } else {
          this.once('sfu-connected', onConnect)
        }
      })
    }

    // Obter mídia local
    await this.initializeLocalMedia()

    // Criar peer connection
    await this.createPeerConnection()

    // Enviar mensagem de join
    this.sendSignalingMessage({
      type: 'join',
      peerId: userId,
      roomId: roomId
    })
  }

  private async initializeLocalMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.isVideoEnabled
      })
      
      console.log('🎤 Local media initialized:', {
        hasAudio: this.localStream.getAudioTracks().length > 0,
        hasVideo: this.localStream.getVideoTracks().length > 0
      })
      
      this.emit('local-stream', this.localStream)
    } catch (error) {
      console.error('❌ Failed to get local media:', error)
      throw error
    }
  }

  private async createPeerConnection(): Promise<void> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    })

    // Adicionar tracks locais
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (this.peerConnection && this.localStream) {
          this.peerConnection.addTrack(track, this.localStream)
        }
      })
    }

    // Configurar event handlers
    this.peerConnection.ontrack = (event) => {
      console.log('🎬 Received remote track:', event.track.kind)
      
      const [remoteStream] = event.streams
      const streamId = remoteStream.id
      
      this.remoteStreams.set(streamId, remoteStream)
      this.emit('remote-stream', { streamId, stream: remoteStream })
    }

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          peerId: this.currentPeerId!,
          candidate: JSON.stringify(event.candidate.toJSON())
        })
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      console.log('🔗 SFU connection state:', state)
      
      this.emit('connection-state-change', {
        state,
        roomId: this.currentRoomId,
        peerId: this.currentPeerId
      })

      if (state === 'connected') {
        this.emit('sfu-connected-to-room')
      } else if (state === 'failed' || state === 'disconnected') {
        this.handleConnectionFailure()
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState
      console.log('🧊 ICE connection state:', iceState)
      
      if (iceState === 'connected') {
        console.log('✅ Successfully connected to SFU')
      }
    }

    // Criar oferta para o SFU
    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)

    this.sendSignalingMessage({
      type: 'offer',
      peerId: this.currentPeerId!,
      offer: offer.sdp
    })
  }

  private handleConnectionFailure(): void {
    console.warn('⚠️ SFU connection failed, attempting reconnection...')
    this.emit('connection-failed')
    
    // Limpar conexão atual
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    // Tentar reconectar
    setTimeout(async () => {
      if (this.currentRoomId && this.currentPeerId) {
        try {
          await this.createPeerConnection()
        } catch (error) {
          console.error('❌ Reconnection failed:', error)
        }
      }
    }, 2000)
  }

  async toggleVideo(): Promise<boolean> {
    if (!this.localStream) {
      throw new Error('No local stream available')
    }

    this.isVideoEnabled = !this.isVideoEnabled

    try {
      if (this.isVideoEnabled) {
        // Ativar vídeo
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
        const videoTrack = videoStream.getVideoTracks()[0]
        
        if (videoTrack) {
          // Encontrar sender de vídeo ou criar novo
          const sender = this.peerConnection?.getSenders().find(s => 
            s.track?.kind === 'video'
          )
          
          if (sender) {
            await sender.replaceTrack(videoTrack)
          } else {
            this.peerConnection?.addTrack(videoTrack, this.localStream)
          }
          
          this.localStream.addTrack(videoTrack)
          console.log('📹 Video enabled')
        }
      } else {
        // Desativar vídeo
        const videoTrack = this.localStream.getVideoTracks()[0]
        if (videoTrack) {
          videoTrack.stop()
          this.localStream.removeTrack(videoTrack)
          
          // Remover do peer connection
          const sender = this.peerConnection?.getSenders().find(s => 
            s.track === videoTrack
          )
          if (sender) {
            await sender.replaceTrack(null)
          }
          
          console.log('📹 Video disabled')
        }
      }

      this.emit('video-state-change', { 
        isEnabled: this.isVideoEnabled, 
        type: 'camera' as const 
      })
      
      return this.isVideoEnabled
    } catch (error) {
      console.error('❌ Failed to toggle video:', error)
      return this.isVideoEnabled
    }
  }

  async toggleAudio(): Promise<boolean> {
    if (!this.localStream) {
      throw new Error('No local stream available')
    }

    const audioTrack = this.localStream.getAudioTracks()[0]
    if (audioTrack) {
      this.isAudioEnabled = !this.isAudioEnabled
      audioTrack.enabled = this.isAudioEnabled
      
      console.log(`🎤 Audio ${this.isAudioEnabled ? 'enabled' : 'disabled'}`)
      
      this.emit('audio-state-change', { isEnabled: this.isAudioEnabled })
      return this.isAudioEnabled
    }

    return false
  }

  leaveRoom(): void {
    console.log('🚪 Leaving SFU room')
    
    // Parar todas as tracks locais
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop()
      })
      this.localStream = null
    }

    // Fechar peer connection
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    // Fechar WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // Limpar estado
    this.remoteStreams.clear()
    this.currentRoomId = null
    this.currentPeerId = null
    this.connectionStartTime = null

    this.emit('room-left')
  }

  getConnectionStats(): SFUConnectionStats | null {
    if (!this.currentPeerId || !this.currentRoomId || !this.peerConnection) {
      return null
    }

    return {
      peerId: this.currentPeerId,
      roomId: this.currentRoomId,
      connectionState: this.peerConnection.connectionState,
      iceConnectionState: this.peerConnection.iceConnectionState,
      signalingState: this.peerConnection.signalingState,
      isConnected: this.peerConnection.connectionState === 'connected',
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
    }
  }

  getVideoState(): SFUVideoState {
    return {
      isEnabled: this.isVideoEnabled,
      type: 'camera'
    }
  }

  getAudioState(): { isEnabled: boolean } {
    return {
      isEnabled: this.isAudioEnabled
    }
  }

  getRemoteStreams(): Map<string, MediaStream> {
    return new Map(this.remoteStreams)
  }
}

// Singleton instance
export const sfuWebRTCService = new SFUWebRTCService()

// Para desenvolvimento/debug
if (typeof window !== 'undefined') {
  ;(window as any).sfuWebRTCService = sfuWebRTCService
}
