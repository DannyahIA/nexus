import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { Loader2 } from 'lucide-react'

interface Message {
  id: string
  channelId: string
  userId: string
  username: string
  avatar?: string
  content: string
  timestamp: number
  editedAt?: number
}

interface MessageListProps {
  messages: Message[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
}

// Componente de mensagem individual memoizado para evitar re-renders
const MessageItem = memo(({ message, showDateSeparator }: { message: Message; showDateSeparator: boolean }) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  return (
    <>
      {/* Separador de data */}
      {showDateSeparator && (
        <div className="flex items-center justify-center my-4">
          <div className="flex-1 h-px bg-dark-700"></div>
          <span className="px-4 text-xs text-dark-400">
            {new Date(message.timestamp).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <div className="flex-1 h-px bg-dark-700"></div>
        </div>
      )}

      {/* Mensagem */}
      <div className="flex gap-3 hover:bg-dark-800/50 -mx-2 px-2 py-1 rounded transition-colors">
        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
          {message.username.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-medium">{message.username}</span>
            <span className="text-xs text-dark-400">
              {formatTime(message.timestamp)}
            </span>
            {message.editedAt && (
              <span className="text-xs text-dark-500">(editado)</span>
            )}
          </div>
          <p className="text-dark-200 break-words whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </>
  )
})

MessageItem.displayName = 'MessageItem'

export default function MessageList({ messages, loading, hasMore, onLoadMore }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const prevMessagesLengthRef = useRef(0)
  const lastScrollHeightRef = useRef(0)
  const isLoadingMoreRef = useRef(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)

  // Intersection Observer para detectar quando chegar no topo
  useEffect(() => {
    if (!topSentinelRef.current || !hasMore) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && !loading && hasMore && !isLoadingMoreRef.current) {
          console.log('🔝 Intersection Observer: Carregar mais')
          isLoadingMoreRef.current = true
          
          // Salvar altura atual do scroll
          if (scrollRef.current) {
            lastScrollHeightRef.current = scrollRef.current.scrollHeight
          }
          
          onLoadMore()
          
          // Reset após 1 segundo
          setTimeout(() => {
            isLoadingMoreRef.current = false
          }, 1000)
        }
      },
      {
        root: scrollRef.current,
        rootMargin: '200px 0px 0px 0px',
        threshold: 0.1,
      }
    )

    observerRef.current.observe(topSentinelRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [loading, hasMore, onLoadMore])

  // Auto-scroll para o final quando novas mensagens chegam
  useEffect(() => {
    if (!scrollRef.current) return

    const isNewMessage = messages.length > prevMessagesLengthRef.current
    const wasLoading = prevMessagesLengthRef.current === 0
    
    prevMessagesLengthRef.current = messages.length

    if (wasLoading && messages.length > 0) {
      // Primeira carga: scrollar para o final
      console.log('📍 Auto-scroll: Primeira carga')
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 100)
    } else if (isNewMessage && shouldAutoScroll && !isLoadingMoreRef.current) {
      // Nova mensagem e estamos perto do final
      console.log('📍 Auto-scroll: Nova mensagem')
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    } else if (isNewMessage && isLoadingMoreRef.current) {
      // Carregamos mensagens antigas: manter posição
      console.log('📍 Manter posição: Mensagens antigas carregadas')
      setTimeout(() => {
        if (scrollRef.current) {
          const newScrollHeight = scrollRef.current.scrollHeight
          const heightDifference = newScrollHeight - lastScrollHeightRef.current
          scrollRef.current.scrollTop = heightDifference
          lastScrollHeightRef.current = newScrollHeight
        }
      }, 50)
    }
  }, [messages, shouldAutoScroll])

  // Detectar quando o usuário está perto do final
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
    
    // Auto-scroll habilitado se estiver próximo do final (150px)
    const newShouldAutoScroll = distanceFromBottom < 150
    
    if (newShouldAutoScroll !== shouldAutoScroll) {
      setShouldAutoScroll(newShouldAutoScroll)
    }
  }, [shouldAutoScroll])

  // Renderizar apenas primeiras 100 mensagens se tiver muitas (otimização inicial)
  const visibleMessages = messages.length > 100 ? messages.slice(-100) : messages

  // Verificar se mensagem deve ser agrupada (Discord style)
  const shouldGroupMessage = (currentMsg: Message, previousMsg: Message | undefined): boolean => {
    if (!previousMsg) return false
    
    // Mesmo autor
    if (currentMsg.userId !== previousMsg.userId) return false
    
    // Diferença de tempo menor que 5 minutos (300000ms)
    const timeDiff = currentMsg.timestamp - previousMsg.timestamp
    if (timeDiff > 300000) return false
    
    return true
  }

  // Formatar timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4"
      style={{ overflowAnchor: 'none' }} // Previne saltos automáticos
    >
      {/* Sentinel para Intersection Observer (invisível) */}
      <div ref={topSentinelRef} style={{ height: '1px', marginBottom: '-1px' }} />

      {/* Loading indicator no topo */}
      {loading && hasMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        </div>
      )}

      {/* Mensagem quando não há mais mensagens antigas */}
      {!hasMore && messages.length > 0 && (
        <div className="flex justify-center py-4">
          <p className="text-sm text-dark-400">📜 Início da conversa</p>
        </div>
      )}

      {/* Container de mensagens */}
      <div>
        {/* Lista de mensagens otimizada */}
        {visibleMessages.map((msg, index) => {
          const prevMsg = index > 0 ? visibleMessages[index - 1] : undefined
          const isGrouped = shouldGroupMessage(msg, prevMsg)
          
          const showDateSeparator =
            index === 0 ||
            new Date(visibleMessages[index - 1].timestamp).toDateString() !==
              new Date(msg.timestamp).toDateString()

          return (
            <div key={msg.id}>
              {/* Separador de data */}
              {showDateSeparator && (
                <div className="flex items-center justify-center my-4">
                  <div className="flex-1 h-px bg-dark-700"></div>
                  <span className="px-4 text-xs text-dark-400">
                    {new Date(msg.timestamp).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <div className="flex-1 h-px bg-dark-700"></div>
                </div>
              )}

              {/* Mensagem */}
              {isGrouped ? (
                // Mensagem agrupada (sem avatar e nome)
                <div className="flex gap-3 hover:bg-dark-800/50 -mx-2 px-2 py-0.5 rounded group">
                  <div className="w-10 flex-shrink-0 flex items-start justify-center">
                    <span className="text-[10px] text-dark-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatTime(msg.timestamp).split(' ')[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-dark-200 break-words whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                      {msg.editedAt && (
                        <span className="text-xs text-dark-500 ml-1">(editado)</span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                // Mensagem completa (com avatar e nome)
                <div className="flex gap-3 hover:bg-dark-800/50 -mx-2 px-2 py-1 rounded mt-4">
                  <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                    {msg.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-white">{msg.username}</span>
                      <span className="text-xs text-dark-400">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-dark-200 break-words whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                      {msg.editedAt && (
                        <span className="text-xs text-dark-500 ml-1">(editado)</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Aviso quando há mensagens ocultas */}
      {messages.length > 100 && (
        <div className="flex justify-center py-2">
          <p className="text-xs text-dark-500">
            Mostrando últimas 100 mensagens de {messages.length} carregadas
          </p>
        </div>
      )}

      {/* Mensagem quando não há mensagens */}
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-dark-400">
          <p className="text-lg mb-2">Nenhuma mensagem ainda</p>
          <p className="text-sm">Seja o primeiro a enviar uma mensagem!</p>
        </div>
      )}
    </div>
  )
}
