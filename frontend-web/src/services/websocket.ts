import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import type { Message } from '../store/chatStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080'

// Tipos de mensagens WebSocket
interface WebSocketMessage {
  type: 'message' | 'typing' | 'presence' | 'subscribe' | 'unsubscribe'
  channelId?: string
  userId?: string
  data?: any
  timestamp?: string
}

interface MessageData {
  id: string
  content: string
  authorId: string
  username: string
  avatarUrl?: string
  createdAt: string
}

interface TypingData {
  isTyping: boolean
  username: string
}

interface PresenceData {
  status: 'online' | 'offline' | 'idle' | 'dnd'
  lastSeen: string
}

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 3000
  private isConnecting = false
  private subscribedChannels = new Set<string>()
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private eventListeners: Map<string, Set<Function>> = new Map()

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log('WebSocket already connected or connecting')
      return
    }

    this.isConnecting = true
    const token = useAuthStore.getState().token
    const user = useAuthStore.getState().user

    if (!token || !user) {
      console.error('No auth token or user available')
      this.isConnecting = false
      return
    }

    try {
      this.ws = new WebSocket(`${WS_URL}/ws?token=${token}&username=${user.username}`)

      this.ws.onopen = () => {
        const wasReconnecting = this.reconnectAttempts > 0
        console.log('WebSocket connected', wasReconnecting ? '(reconnected)' : '(initial connection)')
        this.reconnectAttempts = 0
        this.isConnecting = false
        
        // Iniciar heartbeat
        this.startHeartbeat()
        
        // Reinscrever em canais após reconexão
        this.subscribedChannels.forEach(channelId => {
          this.subscribeToChannel(channelId)
        })
        
        // Emit reconnection event if this was a reconnection
        if (wasReconnecting) {
          console.log('🔄 WebSocket reconnected, emitting reconnection event')
          this.emit('websocket:reconnected', {
            timestamp: new Date().toISOString(),
            subscribedChannels: Array.from(this.subscribedChannels),
          })
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.isConnecting = false
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket closed', event.code, event.reason)
        this.isConnecting = false
        this.stopHeartbeat()
        this.reconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.isConnecting = false
    }
  }

  private handleMessage(wsMsg: any) {
    console.log('📨 WebSocket message received:', wsMsg.type, wsMsg)
    
    // Emitir evento customizado para listeners
    this.emit(wsMsg.type, wsMsg)

    switch (wsMsg.type) {
      case 'message':
        if (wsMsg.data) {
          const messageData: MessageData = JSON.parse(wsMsg.data)
          const message: Message = {
            id: messageData.id,
            channelId: wsMsg.channelId || '',
            userId: messageData.authorId,
            username: messageData.username,
            content: messageData.content,
            timestamp: new Date(messageData.createdAt).getTime(),
            avatar: messageData.avatarUrl,
          }
          useChatStore.getState().addMessage(message)
        }
        break

      case 'typing':
        if (wsMsg.data) {
          const typingData: TypingData = JSON.parse(wsMsg.data)
          console.log(`${typingData.username} is ${typingData.isTyping ? 'typing' : 'stopped typing'}`)
          // TODO: Atualizar UI com indicador de digitação
        }
        break

      case 'presence':
        if (wsMsg.data) {
          const presenceData: PresenceData = JSON.parse(wsMsg.data)
          console.log(`User ${wsMsg.userId} is now ${presenceData.status}`)
          // TODO: Atualizar lista de usuários online
        }
        break

      case 'voice:join':
        // Usuário entrou em canal de voz
        if (wsMsg.data && wsMsg.channelId) {
          const userData = JSON.parse(wsMsg.data)
          this.emit('voice:user-joined', {
            channelId: wsMsg.channelId,
            user: {
              id: wsMsg.userId,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
            },
          })
        }
        break

      case 'voice:leave':
        // Usuário saiu de canal de voz
        if (wsMsg.channelId && wsMsg.userId) {
          this.emit('voice:user-left', {
            channelId: wsMsg.channelId,
            userId: wsMsg.userId,
          })
        }
        break

      case 'voice:status':
        // Status de áudio atualizado
        if (wsMsg.data && wsMsg.channelId && wsMsg.userId) {
          const statusData = JSON.parse(wsMsg.data)
          this.emit('voice:status-updated', {
            channelId: wsMsg.channelId,
            userId: wsMsg.userId,
            isMuted: statusData.isMuted,
            isDeafened: statusData.isDeafened,
          })
        }
        break

      case 'voice:speaking':
        // Usuário começou/parou de falar
        if (wsMsg.channelId && wsMsg.userId && wsMsg.data) {
          const speakingData = JSON.parse(wsMsg.data)
          this.emit('voice:speaking', {
            channelId: wsMsg.channelId,
            userId: wsMsg.userId,
            isSpeaking: speakingData.isSpeaking,
          })
        }
        break

      // WebRTC Signaling
      case 'voice:offer':
      case 'voice:answer':
      case 'voice:ice-candidate':
      case 'voice:mute-status':
      case 'voice:video-status':
        // Eventos WebRTC são tratados pelos listeners
        break

      default:
        console.log('Unknown message type:', wsMsg.type)
        break
    }
  }

  private startHeartbeat() {
    // Limpar heartbeat anterior se existir
    this.stopHeartbeat()
    
    // Enviar ping a cada 30 segundos (metade do timeout do servidor)
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' as any })
      }
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private reconnect() {
    // Limpar timeout anterior
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    )

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)
  }

  // Inscrever em um canal
  subscribeToChannel(channelId: string) {
    this.subscribedChannels.add(channelId)
    this.send({
      type: 'subscribe',
      channelId,
    })
  }

  // Desinscrever de um canal
  unsubscribeFromChannel(channelId: string) {
    this.subscribedChannels.delete(channelId)
    this.send({
      type: 'unsubscribe',
      channelId,
    })
  }

  // Função para gerar UUID compatível com todos os browsers
  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    
    // Fallback para browsers sem crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  // Enviar mensagem de chat
  sendMessage(channelId: string, content: string) {
    const user = useAuthStore.getState().user
    if (!user) return

    const messageData: MessageData = {
      id: this.generateUUID(),
      content,
      authorId: user.id,
      username: user.username,
      avatarUrl: user.avatar,
      createdAt: new Date().toISOString(),
    }

    this.send({
      type: 'message',
      channelId,
      data: JSON.stringify(messageData),
    })
  }

  // Enviar indicador de digitação
  sendTyping(channelId: string, isTyping: boolean) {
    const user = useAuthStore.getState().user
    if (!user) return

    const typingData: TypingData = {
      isTyping,
      username: user.username,
    }

    this.send({
      type: 'typing',
      channelId,
      data: JSON.stringify(typingData),
    })
  }

  // Atualizar presença
  updatePresence(status: 'online' | 'offline' | 'idle' | 'dnd') {
    const presenceData: PresenceData = {
      status,
      lastSeen: new Date().toISOString(),
    }

    this.send({
      type: 'presence',
      data: JSON.stringify(presenceData),
    })
  }

  // Enviar mensagem WebSocket genérica
  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.error('WebSocket is not connected')
    }
  }

  // Event emitter para WebRTC e outros eventos customizados
  on(event: string, callback: Function) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
    console.log(`📝 Registered listener for event: ${event}, total listeners: ${this.eventListeners.get(event)!.size}`)
  }

  off(event: string, callback: Function) {
    const callbacks = this.eventListeners.get(event)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  private emit(event: string, data?: any) {
    const callbacks = this.eventListeners.get(event)
    console.log(`🔔 Emitting event: ${event}, listeners: ${callbacks?.size || 0}`)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    } else {
      console.warn(`⚠️ No listeners registered for event: ${event}`)
    }
  }

  // Notificar entrada em canal de voz
  notifyVoiceJoin(channelId: string) {
    const user = useAuthStore.getState().user
    if (!user) return

    this.send({
      type: 'voice:join',
      channelId,
      userId: user.id,
      data: JSON.stringify({
        username: user.username,
        displayName: user.displayName || user.username,
        avatar: user.avatar,
      }),
    })
  }

  // Notificar saída de canal de voz
  notifyVoiceLeave(channelId: string) {
    const user = useAuthStore.getState().user
    if (!user) return

    this.send({
      type: 'voice:leave',
      channelId,
      userId: user.id,
    })
  }

  // Atualizar status de áudio (mute/deafen)
  updateVoiceStatus(channelId: string, isMuted: boolean, isDeafened: boolean) {
    const user = useAuthStore.getState().user
    if (!user) return

    this.send({
      type: 'voice:status',
      channelId,
      userId: user.id,
      data: JSON.stringify({
        isMuted,
        isDeafened,
      }),
    })
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.subscribedChannels.clear()
    this.reconnectAttempts = 0
    // NÃO limpar eventListeners aqui - eles devem persistir entre reconexões
    // this.eventListeners.clear()
  }
}

export const wsService = new WebSocketService()
