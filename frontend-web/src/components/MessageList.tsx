import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { Loader2, Trash2, Edit, Reply } from 'lucide-react'
import MessageContextMenu from './MessageContextMenu'

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
  currentUserId: string
  isServerOwner?: boolean
  isServerAdmin?: boolean
  onDeleteMessage: (messageId: string) => void
  onEditMessage?: (messageId: string, newContent: string) => void
  onReplyMessage?: (messageId: string) => void
}

// Componente de mensagem individual memoizado para evitar re-renders
const MessageItem = memo(({ 
  message, 
  showDateSeparator, 
  currentUserId,
  isServerOwner,
  isServerAdmin,
  onDeleteMessage,
  onEditMessage,
  onReplyMessage
}: { 
  message: Message; 
  showDateSeparator: boolean;
  currentUserId: string;
  isServerOwner?: boolean;
  isServerAdmin?: boolean;
  onDeleteMessage: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onReplyMessage?: (messageId: string) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })

  // Detectar tecla Shift
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const canDelete = message.userId === currentUserId || isServerOwner || isServerAdmin
  const canEdit = message.userId === currentUserId

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

      {/* Menu de contexto */}
      {showContextMenu && (
        <MessageContextMenu
          messageId={message.id}
          authorId={message.userId}
          currentUserId={currentUserId}
          isServerOwner={isServerOwner}
          isServerAdmin={isServerAdmin}
          content={message.content}
          position={contextMenuPosition}
          onClose={() => setShowContextMenu(false)}
          onDelete={onDeleteMessage}
          onEdit={onEditMessage}
          onReply={onReplyMessage}
        />
      )}

      {/* Mensagem */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: '40px minmax(0, 1fr)',
          gap: '12px',
          maxWidth: '100%',
          width: '100%',
          position: 'relative'
        }}
        className="hover:bg-dark-800/50 -mx-2 px-2 py-1 rounded transition-colors group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
      >
        {/* Botões de ação no hover com Shift */}
        {isHovered && isShiftPressed && (
          <div className="absolute top-0 right-2 -mt-2 flex gap-1 bg-dark-800 border border-dark-700 rounded shadow-lg p-1 z-10">
            {onReplyMessage && (
              <button
                onClick={() => onReplyMessage(message.id)}
                className="p-1.5 hover:bg-dark-700 rounded text-dark-300 hover:text-white transition-colors"
                title="Responder"
              >
                <Reply className="w-4 h-4" />
              </button>
            )}
            {canEdit && onEditMessage && (
              <button
                onClick={() => {
                  const newContent = prompt('Editar mensagem:', message.content)
                  if (newContent && newContent.trim()) {
                    onEditMessage(message.id, newContent.trim())
                  }
                }}
                className="p-1.5 hover:bg-dark-700 rounded text-dark-300 hover:text-white transition-colors"
                title="Editar"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja deletar esta mensagem?')) {
                    onDeleteMessage(message.id)
                  }
                }}
                className="p-1.5 hover:bg-red-600 rounded text-dark-300 hover:text-white transition-colors"
                title="Deletar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
          {message.username.charAt(0).toUpperCase()}
        </div>
        <div 
          style={{
            minWidth: 0,
            maxWidth: '100%',
            width: '100%',
            overflow: 'hidden'
          }}
        >
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-medium">{message.username}</span>
            <span className="text-xs text-dark-400 flex-shrink-0">
              {formatTime(message.timestamp)}
            </span>
            {message.editedAt && (
              <span className="text-xs text-dark-500 flex-shrink-0">(editado)</span>
            )}
          </div>
          <div 
            className="text-dark-200 leading-relaxed"
            style={{
              wordBreak: 'break-all',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
              maxWidth: '100% !important' as any,
              width: '100% !important' as any,
              minWidth: '0 !important' as any,
              display: 'block',
              boxSizing: 'border-box',
              overflow: 'hidden !important' as any
            }}
          >
            {message.content}
          </div>
        </div>
      </div>
    </>
  )
})

MessageItem.displayName = 'MessageItem'

export default function MessageList({ 
  messages, 
  loading, 
  hasMore, 
  onLoadMore,
  currentUserId,
  isServerOwner = false,
  isServerAdmin = false,
  onDeleteMessage,
  onEditMessage,
  onReplyMessage
}: MessageListProps) {
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

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4"
      style={{ 
        overflowAnchor: 'none',
        maxWidth: '100%',
        width: '100%',
        contain: 'layout'
      }}
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
      <div 
        style={{
          maxWidth: '100%',
          width: '100%',
          overflow: 'hidden',
          contain: 'layout style paint'
        }}
      >
        {/* Lista de mensagens otimizada */}
        {visibleMessages.map((msg, index) => {
          const showDateSeparator =
            index === 0 ||
            new Date(visibleMessages[index - 1].timestamp).toDateString() !==
              new Date(msg.timestamp).toDateString()

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              showDateSeparator={showDateSeparator}
              currentUserId={currentUserId}
              isServerOwner={isServerOwner}
              isServerAdmin={isServerAdmin}
              onDeleteMessage={onDeleteMessage}
              onEditMessage={onEditMessage}
              onReplyMessage={onReplyMessage}
            />
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
