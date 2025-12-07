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
import FloatingLines from '../components/FloatingLinesBackground'
import { memo } from 'react'

const WAVES_CONFIG: ("top" | "middle" | "bottom")[] = ['top', 'middle', 'bottom'];

const BackgroundLayer = memo(() => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <FloatingLines
        enabledWaves={WAVES_CONFIG}
        lineCount={3}
        lineDistance={50}
        bendRadius={5.0}
        bendStrength={-0.5}
        interactive={false}
        parallax={true}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/80 pointer-events-none" />
    </div>
  )
});
BackgroundLayer.displayName = 'BackgroundLayer';

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

      // Adicionar mensagem localmente imediatamente para feedback instantâneo (Optimistic UI)
      // O ID vindo da API garante que não haverá duplicatas se o WS também enviar
      if (response.data) {
        addMessage({
          id: response.data.id,
          channelId: channelId,
          userId: user?.id || '',
          username: user?.username || '',
          content: messageToSend,
          timestamp: response.data.createdAt ? new Date(response.data.createdAt).getTime() : Date.now(),
          avatar: user?.avatar,
        })
      }

      // Enviar via WebSocket para broadcast em tempo real para OUTROS usuários
      // O backend provavelmente não faz broadcast automático da API de persistência
      // Passamos o ID original para garantir consistência
      if (response.data && response.data.id) {
        wsService.sendMessage(channelId, messageToSend, response.data.id)
      } else {
        wsService.sendMessage(channelId, messageToSend)
      }

      // Atualizar lista de DMs com a última mensagem (Optimistic UI para a sidebar)
      if (isDM) {
        const friendsStore = useFriendsStore.getState()
        const existingDM = friendsStore.dmChannels.find(d => d.id === channelId)

        if (existingDM) {
          friendsStore.updateDMChannel(channelId, {
            lastMessage: messageToSend,
            lastMessageAt: Date.now()
          })
        } else {
          // Se o DM não existe na lista (ex: acabado de criar via URL ou Message button sem reload)
          // Precisamos buscar os dados completos do DM ou recarregar a lista
          api.getDMs().then(res => {
            const dms = res.data || []
            friendsStore.setDMChannels(dms)
            // Também inscrever no novo canal se necessário
            const newDM = dms.find((d: any) => d.id === channelId)
            if (newDM) {
              wsService.subscribeToChannel(channelId)
            }
          }).catch(console.error)
        }
      }
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
    <div className="flex-1 flex flex-col relative overflow-hidden" style={{ maxWidth: '100%', width: '100%' }}>
      {/* Background Layer - Only show when NOT in active voice call to avoid duplication */}
      {!isInVoiceThisChannel && <BackgroundLayer />}

      {/* Content wrapper with z-10 to sit above background */}
      <div className="relative z-10 flex-1 flex flex-col h-full bg-black/40 backdrop-blur-sm">
        {/* Header */}
        <div className="h-16 bg-dark-900/40 backdrop-blur-md border-b border-white/5 flex items-center px-4 gap-4 shadow-lg z-20">
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
          <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Animation is provided by parent container now */}

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
              <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
                <div className="text-center max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                  <div className="w-24 h-24 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary-500/20">
                    <span className="text-4xl font-bold text-white">
                      {otherUser.username?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold mb-3 text-white tracking-tight">{otherUser.username}</h2>
                  <p className="text-white/60 mb-8 text-lg leading-relaxed">
                    This is the beginning of your direct message history with <span className="text-white font-semibold">{otherUser.username}</span>.
                  </p>

                  {'status' in otherUser && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-sm">
                      <div className={`w-2.5 h-2.5 rounded-full shadow-lg shadow-current ${(otherUser as any).status === 'online' ? 'bg-green-500 text-green-500' :
                        (otherUser as any).status === 'idle' ? 'bg-yellow-500 text-yellow-500' :
                          (otherUser as any).status === 'dnd' ? 'bg-red-500 text-red-500' : 'bg-gray-500 text-gray-500'
                        }`} />
                      <span className="capitalize text-sm font-medium text-white/80">{t((otherUser as any).status || 'offline')}</span>
                    </div>
                  )}
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
          <div className="p-4 relative z-20">
            <div className="bg-dark-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-2 shadow-xl">
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
                  className="flex-1 px-4 py-3 bg-transparent text-white placeholder-white/40 focus:outline-none resize-none overflow-y-auto min-h-[48px] max-h-[120px]"
                  style={{ height: '48px' }}
                />
                <button
                  type="submit"
                  disabled={!message.trim()}
                  className="p-3 bg-primary-600 hover:bg-primary-500 disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed rounded-xl transition-all duration-200 flex items-center gap-2 min-h-[48px] shadow-lg shadow-primary-900/20"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
              <div className="flex justify-between items-center text-xs text-white/30 px-2 pb-1 pt-1">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                  Shift + Enter for new line
                </span>
                {message.length > 1800 && message && (
                  <span className={`${message.length >= 2000 ? 'text-red-400' : message.length > 1800 ? 'text-yellow-400' : ''}`}>
                    {t('characterCount', { count: message.length })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
