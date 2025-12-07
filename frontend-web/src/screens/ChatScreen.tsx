import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '../store/chatStore'
import { useServerStore } from '../store/serverStore'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { useVoiceStore } from '../store/voiceStore'
import { wsService } from '../services/websocket'
import { webrtcService } from '../services/webrtc'
import { api } from '../services/api'
import { Send, Hash, Users, Volume2 } from 'lucide-react'
import MessageList from '../components/MessageList'
import ServerInviteModal from '../components/ServerInviteModal'
import VoiceChannel from '../components/VoiceChannel'
import { useInfiniteMessages } from '../hooks/useInfiniteMessages'

export default function ChatScreen() {
  const { t } = useTranslation('chat')
  const { channelId, serverId } = useParams()
  const [message, setMessage] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [_joiningVoice, setJoiningVoice] = useState(false)
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
      alert(t('deleteMessageError'))
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
      alert(t('editMessageError'))
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

    if (!message.trim() || !channelId || message.length > 2000) {
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
      alert(t('sendMessageError'))
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
      alert(t('voiceJoinError'))
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
          : t('directMessage'))
        : t('directMessage'))
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
      <div className="flex-1 flex items-center justify-center bg-black/20 backdrop-blur-sm p-8">
        <div className="text-center max-w-md animate-scale-in">
          <div className="w-24 h-24 bg-gradient-to-br from-primary-600/20 to-indigo-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-xl border border-white/5 shadow-2xl shadow-primary-500/10">
            <Hash className="w-12 h-12 text-primary-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">{t('selectChannel')}</h3>
          <p className="text-white/50 text-lg leading-relaxed">
            {t('selectChannelDescription') || 'Choose a channel from the sidebar to start chatting.'}
          </p>
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
                <div className={`w-1 h-8 rounded-full ${currentChannel.type === 'voice'
                  ? 'bg-green-500'
                  : currentChannel.type === 'dm'
                    ? 'bg-blue-500'
                    : 'bg-primary-500'
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
                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-800 ${(otherUser as any).status === 'online' ? 'bg-green-500' :
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
                  <p className="text-xs text-dark-400 capitalize">
                    {t((otherUser as any).status || 'offline')}
                  </p>
                ) : null}
                {!isDM && 'description' in currentChannel && currentChannel.description ? (
                  <p className="text-xs text-dark-400">{currentChannel.description}</p>
                ) : null}
              </div>
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
      ) : currentChannel?.type === 'voice' ? (
        <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-black">
          {/* Subtle Background Animation */}
          <div className="absolute inset-0 z-0 opacity-30">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black animate-pulse-slow" />
          </div>

          <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full px-6">
            {/* Pulsing Icon Ring */}
            <div className="relative mb-8 group">
              <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl group-hover:bg-green-500/30 transition-all duration-500 animate-pulse" />
              <div className="relative w-32 h-32 bg-dark-800 rounded-full flex items-center justify-center border border-white/10 shadow-2xl group-hover:scale-105 transition-transform duration-300">
                <Volume2 className="w-12 h-12 text-green-400" />
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 bg-green-500 rounded-full border-4 border-black flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full animate-ping" />
              </div>
            </div>

            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">{channelName}</h1>
            <p className="text-white/40 text-lg mb-12">No one is here yet. Be the first to join!</p>

            <button
              onClick={handleJoinVoice}
              disabled={_joiningVoice}
              className="w-full max-w-xs py-4 px-8 bg-white text-black hover:bg-gray-200 rounded-full font-bold text-lg transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {_joiningVoice ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <Volume2 className="w-5 h-5 fill-current" />
                  {t('joinVoice')}
                </>
              )}
            </button>

            <div className="mt-8 flex items-center gap-4 text-white/30 text-sm font-medium">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                High Quality Voice
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Low Latency
              </div>
            </div>
          </div>
        </div>
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
                  {t('dmStartMessage', { username: otherUser.username }).split('<1>').map((part, i) => {
                    if (i === 0) return part
                    const [username, rest] = part.split('</1>')
                    return (
                      <span key={i}>
                        <span className="font-semibold text-white">{username}</span>
                        {rest}
                      </span>
                    )
                  })}
                </p>
                {'status' in otherUser ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-dark-400">
                    <div className={`w-2 h-2 rounded-full ${(otherUser as any).status === 'online' ? 'bg-green-500' :
                      (otherUser as any).status === 'idle' ? 'bg-yellow-500' :
                        (otherUser as any).status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'
                      }`} />
                    <span className="capitalize">{t((otherUser as any).status || 'offline')}</span>
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

      {/* Input (apenas quando não estiver em voice e o canal não for de voz) */}
      {!isInVoiceThisChannel && currentChannel?.type !== 'voice' && (
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
              placeholder={t('messagePlaceholder', { channelName })}
              maxLength={8000}
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
            {message.length > 1800 && message && (
              <span className={`${message.length >= 2000 ? 'text-red-500' : message.length > 1800 ? 'text-yellow-500' : ''} ${message.length >= 2000 ? 'text-red-500' : ''}`}>
                {t('characterCount', { count: message.length })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
