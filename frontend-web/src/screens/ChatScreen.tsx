import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useChatStore } from '../store/chatStore'
import { useServerStore } from '../store/serverStore'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { useVoiceStore } from '../store/voiceStore'
import { wsService } from '../services/websocket'
import { webrtcService } from '../services/webrtc'
import { api } from '../services/api'
import { Send, Hash, Users, UserPlus, Phone, PhoneOff, Volume2 } from 'lucide-react'
import MessageList from '../components/MessageList'
import ServerInviteModal from '../components/ServerInviteModal'
import VoiceChannel from '../components/VoiceChannel'
import { useInfiniteMessages } from '../hooks/useInfiniteMessages'

export default function ChatScreen() {
  const { channelId, serverId } = useParams()
  const [message, setMessage] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [joiningVoice, setJoiningVoice] = useState(false)
  const typingTimeoutRef = useRef<number | null>(null)
  
  // Voice state
  const isConnected = useVoiceStore((state) => state.isConnected)
  const currentVoiceChannelId = useVoiceStore((state) => state.currentChannelId)
  const setConnected = useVoiceStore((state) => state.setConnected)
  const setDisconnected = useVoiceStore((state) => state.setDisconnected)

  const setActiveChannel = useChatStore((state) => state.setActiveChannel)
  const user = useAuthStore((state) => state.user)
  
  // Server data
  const serverChannels = useServerStore((state) => state.serverChannels)
  const servers = useServerStore((state) => state.servers)
  
  // DM data
  const dmChannels = useFriendsStore((state) => state.dmChannels)

  // Determinar o tipo de canal e dados
  const isDM = !serverId
  const channels = serverId ? (serverChannels[serverId] || []) : []
  const currentChannel = isDM 
    ? dmChannels.find(dm => dm.id === channelId)
    : channels.find(c => c.id === channelId)

  // Obter servidor atual para verificar permissões
  const currentServer = serverId ? servers.find(s => s.id === serverId) : null
  const isServerOwner = currentServer?.ownerId === user?.id
  const isServerAdmin = false // TODO: Implementar sistema de roles/admin

  // Hook para mensagens com scroll infinito
  const { messages, hasMore, loading, loadMore, reset, addMessage, updateMessage, removeMessage } = useInfiniteMessages(channelId)

  // Handlers para ações de mensagem
  const handleDeleteMessage = async (messageId: string) => {
    if (!channelId) return
    
    try {
      await api.deleteMessage(channelId, messageId)
      removeMessage(messageId)
      // TODO: Broadcast via WebSocket para outros usuários quando o backend suportar
    } catch (error) {
      console.error('Failed to delete message:', error)
      alert('Erro ao deletar mensagem')
    }
  }

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!channelId) return
    
    try {
      await api.updateMessage(channelId, messageId, newContent)
      updateMessage(messageId, newContent)
      // TODO: Broadcast via WebSocket para outros usuários quando o backend suportar
    } catch (error) {
      console.error('Failed to edit message:', error)
      alert('Erro ao editar mensagem')
    }
  }

  const handleReplyMessage = (messageId: string) => {
    // TODO: Implementar sistema de reply
    console.log('Reply to message:', messageId)
  }

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
      
      // Se for canal de voz, entrar automaticamente
      if (currentChannel?.type === 'voice' && !isConnected) {
        handleJoinVoice()
      }
      
      // Carregar primeira página após reset (apenas para canais de texto)
      if (currentChannel?.type !== 'voice') {
        setTimeout(() => {
          loadMore()
        }, 100)
      }
      
      // Desinscrever ao trocar de canal
      return () => {
        wsService.unsubscribeFromChannel(channelId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, currentChannel?.type])

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
    
    if (!message.trim() || !channelId) {
      console.log('Cannot send message:', { message: message.trim(), channelId })
      return
    }

    // Limpar timeout de digitação
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    // Enviar indicador de parou de digitar
    if (currentChannel) {
      wsService.sendTyping(currentChannel.id, false)
    }

    const messageToSend = message
    setMessage('') // Limpar input imediatamente para melhor UX

    try {
      console.log('Sending message to channel:', channelId)
      
      // Enviar via API para persistência
      const response = await api.sendMessage(channelId, messageToSend)
      console.log('Message sent successfully:', response.data)
      
      // Enviar via WebSocket para broadcast em tempo real
      wsService.sendMessage(channelId, messageToSend)
      
      // NÃO adicionar mensagem localmente aqui - deixar o WebSocket fazer isso
      // para evitar duplicação. A mensagem será recebida via WebSocket broadcast
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessage(messageToSend) // Restaurar mensagem em caso de erro
      alert('Erro ao enviar mensagem. Tente novamente.')
    }
  }

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  // Voice handlers
  const handleJoinVoice = async () => {
    if (!channelId || !channelName) return
    
    setJoiningVoice(true)
    try {
      await webrtcService.joinVoiceChannel(channelId, false)
      setConnected(channelId, channelName)
      console.log('✅ Joined voice channel')
    } catch (error) {
      console.error('Failed to join voice:', error)
      alert('Não foi possível entrar no canal de voz. Verifique as permissões de microfone.')
    } finally {
      setJoiningVoice(false)
    }
  }

  const handleLeaveVoice = () => {
    webrtcService.leaveVoiceChannel()
    setDisconnected()
  }

  // Verificar se está em voz neste canal
  const isInVoiceThisChannel = isConnected && currentVoiceChannelId === channelId

  // Nome do canal para exibição
  const channelName = currentChannel 
    ? ('name' in currentChannel && currentChannel.name
        ? currentChannel.name 
        : currentChannel.type === 'dm' && 'participants' in currentChannel && Array.isArray(currentChannel.participants) && currentChannel.participants.length > 0
          ? (typeof currentChannel.participants[0] === 'object' && 'username' in currentChannel.participants[0]
              ? currentChannel.participants[0].username
              : 'Direct Message')
          : 'Direct Message')
    : ''

  // Ícone do canal baseado no tipo
  const getChannelIcon = () => {
    if (isDM) return Users
    if (currentChannel?.type === 'voice') return Volume2
    return Hash
  }
  const ChannelIcon = getChannelIcon()

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

  // Obter informações do outro usuário no DM
  const otherUser = isDM && currentChannel && 'participants' in currentChannel && Array.isArray(currentChannel.participants) && currentChannel.participants.length > 0
    ? (typeof currentChannel.participants[0] === 'object' 
        ? currentChannel.participants.find((p: any) => p.userId !== user?.id)
        : null)
    : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ maxWidth: '100%', width: '100%' }}>
      {/* Header */}
      <div className="h-14 bg-dark-800 border-b border-dark-700 flex items-center px-4 gap-4 shadow-sm">
        {currentChannel && (
          <>
            <div className="flex items-center gap-3 flex-1">
              {/* Indicador visual do canal - apenas barra colorida e ícone */}
              <div className="flex items-center gap-2">
                <div className={`w-1 h-8 rounded-full ${
                  currentChannel.type === 'voice' 
                    ? 'bg-green-500' 
                    : currentChannel.type === 'dm' 
                    ? 'bg-blue-500' 
                    : 'bg-primary-500'
                }`} />
                <ChannelIcon className={`w-5 h-5 ${
                  currentChannel.type === 'voice' 
                    ? 'text-green-500' 
                    : currentChannel.type === 'dm' 
                    ? 'text-blue-500' 
                    : 'text-dark-400'
                }`} />
              </div>
              {/* Avatar para DM */}
              {isDM && otherUser && typeof otherUser === 'object' && 'username' in otherUser && (
                <div className="relative">
                  <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                    {otherUser.username?.charAt(0).toUpperCase() || '?'}
                  </div>
                  {/* Status indicator */}
                  {'status' in otherUser ? (
                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-800 ${
                      (otherUser as any).status === 'online' ? 'bg-green-500' :
                      (otherUser as any).status === 'idle' ? 'bg-yellow-500' :
                      (otherUser as any).status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'
                    }`} />
                  ) : null}
                </div>
              )}
              
              {/* Icon para canal de servidor */}
              {!isDM && <ChannelIcon className="w-5 h-5 text-dark-400" />}
              
              <div>
                <h2 className="font-semibold">{channelName}</h2>
                {isDM && otherUser && typeof otherUser === 'object' && 'status' in otherUser ? (
                  <p className="text-xs text-dark-400 capitalize">{(otherUser as any).status || 'offline'}</p>
                ) : null}
                {!isDM && 'description' in currentChannel && currentChannel.description ? (
                  <p className="text-xs text-dark-400">{currentChannel.description}</p>
                ) : null}
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-2">
              {/* Botão de Voice (apenas em servidores) */}
              {!isDM && currentServer && (
                <button
                  onClick={isInVoiceThisChannel ? handleLeaveVoice : handleJoinVoice}
                  disabled={joiningVoice || (isConnected && !isInVoiceThisChannel)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isInVoiceThisChannel
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-dark-700 hover:bg-dark-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={isInVoiceThisChannel ? 'Sair do Voice' : 'Entrar no Voice'}
                >
                  {isInVoiceThisChannel ? (
                    <>
                      <PhoneOff className="w-4 h-4" />
                      Em Voz
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4" />
                      {joiningVoice ? 'Conectando...' : 'Voice'}
                    </>
                  )}
                </button>
              )}

              {/* Botão de Convite (apenas em servidores) */}
              {!isDM && currentServer && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded text-sm font-medium transition-colors"
                  title="Convidar Pessoas"
                >
                  <UserPlus className="w-4 h-4" />
                  Convidar
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal de Convite */}
      {currentServer && (
        <ServerInviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          server={currentServer}
          mode="invite"
        />
      )}

      {/* Voice Channel ou Messages */}
      {isInVoiceThisChannel ? (
        <VoiceChannel
          channelId={channelId}
          channelName={channelName}
          onLeave={handleLeaveVoice}
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* DM User Info Banner (Discord-style) */}
          {isDM && otherUser && typeof otherUser === 'object' && 'username' in otherUser && messages.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl font-bold">
                  {otherUser.username?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <h2 className="text-2xl font-bold mb-2">{otherUser.username}</h2>
              <p className="text-dark-400 mb-4">
                Este é o início da sua conversa direta com <span className="font-semibold text-white">@{otherUser.username}</span>
              </p>
              {'status' in otherUser ? (
                <div className="flex items-center justify-center gap-2 text-sm text-dark-400">
                  <div className={`w-2 h-2 rounded-full ${
                    (otherUser as any).status === 'online' ? 'bg-green-500' :
                    (otherUser as any).status === 'idle' ? 'bg-yellow-500' :
                    (otherUser as any).status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'
                  }`} />
                  <span className="capitalize">{(otherUser as any).status || 'offline'}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}
        
        {/* Message List */}
        {(messages.length > 0 || loading) && (
          <MessageList
            messages={messages}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            currentUserId={user?.id || ''}
            isServerOwner={isServerOwner}
            isServerAdmin={isServerAdmin}
            onDeleteMessage={handleDeleteMessage}
            onEditMessage={handleEditMessage}
            onReplyMessage={handleReplyMessage}
          />
        )}
        </div>
      )}

      {/* Input (apenas quando não estiver em voice) */}
      {!isInVoiceThisChannel && (
      <div className="p-4 border-t border-dark-700">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
          <textarea
            value={message}
            onChange={(e) => {
              handleMessageChange(e)
              // Auto-resize
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage(e as any)
              }
            }}
            placeholder={`Message ${channelName}`}
            maxLength={2000}
            className="flex-1 px-4 py-3 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none overflow-y-auto min-h-[48px] max-h-[120px]"
            style={{ height: '48px' }}
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 min-h-[48px]"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <div className="flex justify-between items-center text-xs text-dark-500 mt-2">
          <span>Pressione Enter para enviar, Shift+Enter para quebrar linha</span>
          <span className={`${message.length > 1800 ? 'text-yellow-500' : ''} ${message.length >= 2000 ? 'text-red-500' : ''}`}>
            {message.length}/2000
          </span>
        </div>
      </div>
      )}
    </div>
  )
}
