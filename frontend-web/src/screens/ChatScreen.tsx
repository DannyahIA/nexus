import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { wsService } from '../services/websocket'
import { api } from '../services/api'
import { Send, Hash, Menu, LogOut, Settings, CheckSquare, Plus } from 'lucide-react'
import CreateChannelModal from '../components/CreateChannelModal'

export default function ChatScreen() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<number | null>(null)

  const channels = useChatStore((state) => state.channels)
  const messages = useChatStore((state) => state.messages)
  const activeChannelId = useChatStore((state) => state.activeChannelId)
  const setActiveChannel = useChatStore((state) => state.setActiveChannel)
  const setChannels = useChatStore((state) => state.setChannels)
  const setMessages = useChatStore((state) => state.setMessages)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const currentChannel = channels.find((c) => c.id === (channelId || activeChannelId))
  const currentMessages = messages[channelId || activeChannelId || ''] || []

  useEffect(() => {
    // Connect WebSocket
    wsService.connect()

    // Load channels
    loadChannels()

    return () => {
      wsService.disconnect()
    }
  }, [])

  useEffect(() => {
    if (channelId) {
      setActiveChannel(channelId)
      loadMessages(channelId)
      
      // Inscrever no canal via WebSocket
      wsService.subscribeToChannel(channelId)
      
      // Desinscrever do canal anterior ao trocar
      return () => {
        wsService.unsubscribeFromChannel(channelId)
      }
    }
  }, [channelId])

  useEffect(() => {
    scrollToBottom()
  }, [currentMessages])

  const loadChannels = async () => {
    try {
      const response = await api.getChannels()
      setChannels(response.data)
    } catch (error) {
      console.error('Failed to load channels:', error)
    }
  }

  const loadMessages = async (channelId: string) => {
    try {
      const response = await api.getMessages(channelId)
      setMessages(channelId, response.data)
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleCreateChannel = async (data: { name: string; description: string; type: string }) => {
    try {
      const response = await api.createChannel(data)
      // Recarregar canais
      loadChannels()
      // Navegar para o novo canal
      if (response.data?.id) {
        navigate(`/chat/${response.data.id}`)
      }
    } catch (error) {
      console.error('Failed to create channel:', error)
    }
  }

  return (
    <div className="flex h-screen bg-dark-900 text-white">
      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? 'w-64' : 'w-0'
        } bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-300 overflow-hidden`}
      >
        {/* User Profile */}
        <div className="p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.username}</p>
              <p className="text-xs text-dark-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Channels List */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 mb-2">
              <h3 className="text-xs font-semibold text-dark-400 uppercase">
                Channels
              </h3>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="p-1 hover:bg-dark-700 rounded text-dark-400 hover:text-white transition-colors"
                title="Create Channel"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => navigate(`/chat/${channel.id}`)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  channel.id === (channelId || activeChannelId)
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-300 hover:bg-dark-700'
                }`}
              >
                <Hash className="w-4 h-4" />
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="p-2 border-t border-dark-700">
          <button
            onClick={() => navigate('/tasks')}
            className="w-full flex items-center gap-2 px-3 py-2 text-dark-300 hover:bg-dark-700 rounded-lg mb-1 transition-colors"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Tasks</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 bg-dark-800 border-b border-dark-700 flex items-center px-4 gap-4">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          {currentChannel && (
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-dark-400" />
              <h2 className="font-semibold">{currentChannel.name}</h2>
              {currentChannel.description && (
                <span className="text-sm text-dark-400">- {currentChannel.description}</span>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {currentMessages.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                {msg.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-medium">{msg.username}</span>
                  <span className="text-xs text-dark-400">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-dark-200 break-words">{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-dark-700">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={handleMessageChange}
              placeholder={`Message ${currentChannel?.name || ''}`}
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

      {/* Create Channel Modal */}
      <CreateChannelModal
        isOpen={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
        onCreate={handleCreateChannel}
      />
    </div>
  )
}
