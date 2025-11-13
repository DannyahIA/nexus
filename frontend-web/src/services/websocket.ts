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
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        this.isConnecting = false
        
        // Reinscrever em canais após reconexão
        this.subscribedChannels.forEach(channelId => {
          this.subscribeToChannel(channelId)
        })
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

      this.ws.onclose = () => {
        console.log('WebSocket closed')
        this.isConnecting = false
        this.reconnect()
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.isConnecting = false
    }
  }

  private handleMessage(wsMsg: WebSocketMessage) {
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

      default:
        console.log('Unknown message type:', wsMsg.type)
    }
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    )

    setTimeout(() => {
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
  private send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.error('WebSocket is not connected')
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.subscribedChannels.clear()
  }
}

export const wsService = new WebSocketService()
