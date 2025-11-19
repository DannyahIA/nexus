import { useEffect, useRef, useCallback } from 'react'
import { List, ListImperativeAPI } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
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

interface VirtualizedMessageListProps {
  messages: Message[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
}

export default function VirtualizedMessageList({
  messages,
  loading,
  hasMore,
  onLoadMore,
}: VirtualizedMessageListProps) {
  const listRef = useRef<ListImperativeAPI>(null)
  const prevMessagesLengthRef = useRef(0)
  const isLoadingMoreRef = useRef(false)
  const rowHeightCache = useRef(new Map<number, number>())

  // Estimar altura de uma mensagem baseado no conteúdo
  const estimateRowHeight = useCallback((index: number) => {
    const cached = rowHeightCache.current.get(index)
    if (cached) return cached

    const message = messages[index]
    if (!message) return 80

    // Calcular altura baseado em:
    // - Cabeçalho (username + timestamp): 24px
    // - Conteúdo: ~20px por linha (assumindo ~60 chars por linha)
    // - Padding: 16px total
    const headerHeight = 24
    const padding = 16
    const lineHeight = 20
    const charsPerLine = 60
    const lines = Math.ceil(message.content.length / charsPerLine)
    const contentHeight = lines * lineHeight

    const totalHeight = headerHeight + contentHeight + padding
    rowHeightCache.current.set(index, totalHeight)
    
    return totalHeight
  }, [messages])

  // Resetar cache quando mensagens mudarem
  useEffect(() => {
    rowHeightCache.current.clear()
  }, [messages.length])

  // Auto-scroll para o final quando novas mensagens chegam
  useEffect(() => {
    const isNewMessage = messages.length > prevMessagesLengthRef.current
    const wasEmpty = prevMessagesLengthRef.current === 0
    
    prevMessagesLengthRef.current = messages.length

    if (wasEmpty && messages.length > 0) {
      // Primeira carga: scrollar para o final
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollToRow({ index: messages.length - 1, align: 'end' })
        }
      }, 100)
    } else if (isNewMessage && !isLoadingMoreRef.current) {
      // Nova mensagem: scrollar para o final
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollToRow({ index: messages.length - 1, align: 'end' })
        }
      }, 50)
    }
  }, [messages.length])

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

  // Verificar se precisa mostrar separador de data
  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true
    const current = messages[index]
    const previous = messages[index - 1]
    return new Date(current.timestamp).toDateString() !== new Date(previous.timestamp).toDateString()
  }

  // Renderizar item da lista
  const MessageRow = ({ index, style, ariaAttributes }: { 
    index: number; 
    style: React.CSSProperties;
    ariaAttributes: {
      'aria-posinset': number;
      'aria-setsize': number;
      role: 'listitem';
    };
  }) => {
    const message = messages[index]
    if (!message) return <div style={style} {...ariaAttributes} />

    const showDateSeparator = shouldShowDateSeparator(index)

    return (
      <div style={style} {...ariaAttributes}>
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
        <div className="flex gap-3 hover:bg-dark-800/50 px-4 py-2 rounded">
          <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
            {message.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-medium text-white">{message.username}</span>
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
      </div>
    )
  }

  // Renderizar header com loading/início da conversa
  const Header = () => (
    <div className="p-4">
      {loading && hasMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          <span className="ml-2 text-sm text-dark-400">Carregando mensagens...</span>
        </div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="flex justify-center py-4">
          <p className="text-sm text-dark-400">📜 Início da conversa</p>
        </div>
      )}
    </div>
  )

  // Estado vazio
  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-dark-400 bg-dark-900">
        <p className="text-lg mb-2">💬 Nenhuma mensagem ainda</p>
        <p className="text-sm">Seja o primeiro a enviar uma mensagem!</p>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-dark-900">
      {/* Header fixo */}
      <Header />

      {/* Lista virtualizada */}
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => (
          <List<{}>
            listRef={listRef}
            defaultHeight={height - 80}
            rowCount={messages.length}
            rowHeight={estimateRowHeight}
            rowProps={{} as any}
            onRowsRendered={({ startIndex }: any) => {
              if (startIndex === 0 && hasMore && !loading && !isLoadingMoreRef.current) {
                isLoadingMoreRef.current = true
                onLoadMore()
                setTimeout(() => {
                  isLoadingMoreRef.current = false
                }, 1000)
              }
            }}
            rowComponent={MessageRow}
            style={{ width }}
          />
        )}
      </AutoSizer>
    </div>
  )
}
