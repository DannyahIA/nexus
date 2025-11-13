import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useChatStore } from '../store/chatStore'
import { useServerStore } from '../store/serverStore'
import { useFriendsStore } from '../store/friendsStore'
import { wsService } from '../services/websocket'
import { api } from '../services/api'
import { Send, Hash, Users } from 'lucide-react'
import MessageList from '../components/MessageList'
import { useInfiniteMessages } from '../hooks/useInfiniteMessages'

export default function ChatScreen() {
  const { channelId, serverId } = useParams()
  const [message, setMessage] = useState('')
  const typingTimeoutRef = useRef<number | null>(null)

  const setActiveChannel = useChatStore((state) => state.setActiveChannel)
  
  // Server data
  const serverChannels = useServerStore((state) => state.serverChannels)
  
  // DM data
  const dmChannels = useFriendsStore((state) => state.dmChannels)

  // Determinar o tipo de canal e dados
  const isDM = !serverId
  const channels = serverId ? (serverChannels[serverId] || []) : []
  const currentChannel = isDM 
    ? dmChannels.find(dm => dm.id === channelId)
    : channels.find(c => c.id === channelId)

  // Hook para mensagens com scroll infinito
  const { messages, hasMore, loading, loadMore, reset, addMessage } = useInfiniteMessages(channelId)

  useEffect(() => {
    // Connect WebSocket
    wsService.connect()

    return () => {
      wsService.disconnect()
    }
  }, [])

  useEffect(() => {
    if (channelId) {
      reset() // Limpar mensagens anteriores
      setActiveChannel(channelId)
      
      // Inscrever no canal via WebSocket
      wsService.subscribeToChannel(channelId)
      
      // Carregar primeira página após reset
      setTimeout(() => {
        loadMore()
      }, 100)
      
      // Desinscrever ao trocar de canal
      return () => {
        wsService.unsubscribeFromChannel(channelId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  // Listener para novas mensagens via WebSocket
  useEffect(() => {
    if (!channelId) return

    // Criar handler para novas mensagens
    const handleNewMessage = (msg: any) => {
      // Adicionar mensagem apenas se for do canal ativo
      if (msg.channelId === channelId) {
        console.log('📨 Nova mensagem via WebSocket:', msg)
        addMessage({
          id: msg.id,
          channelId: msg.channelId,
          userId: msg.userId,
          username: msg.username,
          content: msg.content,
          timestamp: msg.timestamp,
          avatar: msg.avatar,
        })
      }
    }

    // Subscrever no chatStore para receber mensagens
    const unsubscribe = useChatStore.subscribe((state) => {
      const channelMessages = state.messages[channelId] || []
      const latestMessage = channelMessages[channelMessages.length - 1]
      
      // Se há uma nova mensagem que ainda não temos
      if (latestMessage && !messages.find(m => m.id === latestMessage.id)) {
        handleNewMessage(latestMessage)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [channelId, addMessage, messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!message.trim() || !currentChannel) return

    // Limpar timeout de digitação
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    // Enviar indicador de parou de digitar
    wsService.sendTyping(currentChannel.id, false)

    try {
      // Enviar via WebSocket para broadcast em tempo real
      wsService.sendMessage(currentChannel.id, message)
      
      // Também enviar via API para persistência
      await api.sendMessage(currentChannel.id, message)
      
      setMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMessage = e.target.value
    setMessage(newMessage)

    if (!currentChannel) return

    // Enviar indicador de digitação
    wsService.sendTyping(currentChannel.id, true)

    // Limpar timeout anterior
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Enviar "parou de digitar" após 3 segundos de inatividade
    typingTimeoutRef.current = window.setTimeout(() => {
      wsService.sendTyping(currentChannel.id, false)
    }, 3000)
  }

  // Nome do canal para exibição
  const channelName = currentChannel 
    ? ('name' in currentChannel 
        ? currentChannel.name 
        : currentChannel.type === 'dm' 
          ? currentChannel.participants[0]?.username || 'Direct Message'
          : currentChannel.name || 'Group DM')
    : ''

  // Ícone do canal (Hash para servidor, Users para DM)
  const ChannelIcon = isDM ? Users : Hash

  // Retorno antecipado se não há channelId (APÓS todos os hooks)
  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-800">
        <div className="text-center text-dark-400">
          <Hash className="w-16 h-16 mx-auto mb-4" />
          <h3 className="text-xl font-medium mb-2">Selecione um canal</h3>
          <p className="text-sm">Escolha um canal na barra lateral para começar a conversar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="h-14 bg-dark-800 border-b border-dark-700 flex items-center px-4 gap-4">
        {currentChannel && (
          <div className="flex items-center gap-2">
            <ChannelIcon className="w-5 h-5 text-dark-400" />
            <h2 className="font-semibold">{channelName}</h2>
            {!isDM && 'description' in currentChannel && currentChannel.description && (
              <span className="text-sm text-dark-400">- {currentChannel.description}</span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />

      {/* Input */}
      <div className="p-4 border-t border-dark-700">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={handleMessageChange}
            placeholder={`Message ${channelName}`}
            className="flex-1 px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  )
}
