import { useState, useCallback, useRef } from 'react'
import { api } from '../services/api'

export interface Message {
  id: string
  channelId: string
  userId: string
  username: string
  avatar?: string
  content: string
  timestamp: number
  editedAt?: number
}

export interface UseInfiniteMessagesReturn {
  messages: Message[]
  hasMore: boolean
  loading: boolean
  initialLoading: boolean
  loadMore: () => void
  reset: () => void
  addMessage: (message: Message) => void
  updateMessage: (messageId: string, content: string) => void
  removeMessage: (messageId: string) => void
}

export function useInfiniteMessages(channelId: string | undefined): UseInfiniteMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  
  // Refs para evitar chamadas duplicadas
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const lastLoadTimeRef = useRef(0)
  const channelIdRef = useRef<string | undefined>()
  
  // Limite de mensagens em memória (como Discord)
  const MAX_MESSAGES_IN_MEMORY = 200
  const MESSAGES_PER_PAGE = 50

  // Manter refs sincronizados
  hasMoreRef.current = hasMore
  channelIdRef.current = channelId

  const loadMore = useCallback(() => {
    // Debounce: não permitir chamadas em menos de 500ms
    const now = Date.now()
    if (now - lastLoadTimeRef.current < 500) {
      console.log('🚫 loadMore: Debounced')
      return
    }

    const currentChannelId = channelIdRef.current
    
    if (!currentChannelId) {
      console.log('🚫 loadMore: No channelId')
      return
    }

    if (loadingRef.current) {
      console.log('🚫 loadMore: Already loading')
      return
    }

    if (!hasMoreRef.current) {
      console.log('🚫 loadMore: No more messages')
      return
    }

    lastLoadTimeRef.current = now
    loadingRef.current = true
    setLoading(true)

    console.log('📥 loadMore: Starting...', { channelId: currentChannelId })

    // Pegar timestamp da mensagem mais antiga
    setMessages((prev) => {
      const oldestTimestamp = prev.length > 0 ? prev[0].timestamp : undefined
      const isInitial = prev.length === 0

      if (isInitial) {
        setInitialLoading(true)
      }

      // Fazer a requisição
      const params: any = { limit: MESSAGES_PER_PAGE }
      if (oldestTimestamp) {
        params.before = oldestTimestamp
      }

      api.getMessages(currentChannelId, params)
        .then((response) => {
          const newMessages = response.data.messages || []
          const hasMoreMessages = response.data.hasMore || false

          console.log('✅ loadMore: Success', {
            newCount: newMessages.length,
            hasMore: hasMoreMessages,
          })

          setMessages((current) => {
            // Adicionar novas mensagens no início (são mais antigas)
            const combined = [...newMessages, ...current]
            
            // Remover duplicatas baseado no ID
            const uniqueMap = new Map(combined.map(m => [m.id, m]))
            let unique = Array.from(uniqueMap.values())
            
            // Ordenar por timestamp (mais antigas primeiro)
            unique.sort((a, b) => a.timestamp - b.timestamp)
            
            // GARBAGE COLLECTION: Manter apenas MAX_MESSAGES_IN_MEMORY mais recentes
            // Isso previne problemas de memória em canais com milhares de mensagens
            if (unique.length > MAX_MESSAGES_IN_MEMORY) {
              console.log(`🗑️ Garbage Collection: Removendo ${unique.length - MAX_MESSAGES_IN_MEMORY} mensagens antigas`)
              unique = unique.slice(-MAX_MESSAGES_IN_MEMORY)
              // Se removermos mensagens, significa que sempre haverá mais antigas
              setHasMore(true)
              hasMoreRef.current = true
            }
            
            return unique
          })

          setHasMore(hasMoreMessages)
          hasMoreRef.current = hasMoreMessages
        })
        .catch((error) => {
          console.error('❌ loadMore: Error', error)
        })
        .finally(() => {
          loadingRef.current = false
          setLoading(false)
          setInitialLoading(false)
        })

      return prev // Não modificar o estado aqui
    })
  }, [])

  const reset = useCallback(() => {
    console.log('🔄 reset: Clearing messages')
    setMessages([])
    setHasMore(true)
    setLoading(false)
    setInitialLoading(false)
    loadingRef.current = false
    hasMoreRef.current = true
    lastLoadTimeRef.current = 0
  }, [])

  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      // Adicionar nova mensagem no final (mais recente)
      const exists = prev.some(m => m.id === message.id)
      if (exists) return prev
      return [...prev, message]
    })
  }, [])

  const updateMessage = useCallback((messageId: string, content: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content, editedAt: Date.now() }
          : m
      )
    )
  }, [])

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }, [])

  return {
    messages,
    hasMore,
    loading,
    initialLoading,
    loadMore,
    reset,
    addMessage,
    updateMessage,
    removeMessage,
  }
}
