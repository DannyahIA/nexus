import { useNavigate } from 'react-router-dom'
import { Hash, Volume2, Lock, ChevronDown, ChevronRight, Plus, Settings, UserPlus, Bell } from 'lucide-react'
import { useState, useEffect } from 'react'
import ChannelContextMenu from './ChannelContextMenu'
import UserProfilePanel from './UserProfilePanel'
import CreateChannelModal from './CreateChannelModal'
import VoiceChannelUsers from './VoiceChannelUsers'
import { api } from '../services/api'
import { useVoiceUsersStore } from '../store/voiceUsersStore'

interface ChannelListProps {
  serverId: string | null
  serverName?: string
  channels: Array<{
    id: string
    name: string
    type: 'text' | 'voice' | 'dm' | 'group_dm' | 'announcement'
    isPrivate: boolean
  }>
  activeChannelId?: string
  isMuted?: boolean
  isDeafened?: boolean
  onToggleMute?: () => void
  onToggleDeafen?: () => void
}

export default function ChannelList({ 
  serverId, 
  serverName, 
  channels, 
  activeChannelId,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen
}: ChannelListProps) {
  const navigate = useNavigate()
  const [contextMenu, setContextMenu] = useState<{
    channel: any
    position: { x: number; y: number }
  } | null>(null)
  const [textChannelsCollapsed, setTextChannelsCollapsed] = useState(false)
  const [voiceChannelsCollapsed, setVoiceChannelsCollapsed] = useState(false)
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  
  // Voice users store
  const getUsersInChannel = useVoiceUsersStore((state) => state.getUsersInChannel)
  
  // Fechar menu de contexto ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null)
      setShowServerMenu(false)
    }
    if (contextMenu || showServerMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu, showServerMenu])

  const textChannels = channels.filter((c) => c.type === 'text' || c.type === 'announcement')
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  const handleChannelClick = (channelId: string) => {
    if (serverId) {
      navigate(`/server/${serverId}/${channelId}`)
    } else {
      navigate(`/dm/${channelId}`)
    }
  }

  const handleChannelRightClick = (e: React.MouseEvent, channel: any) => {
    e.preventDefault()
    setContextMenu({
      channel,
      position: { x: e.clientX, y: e.clientY }
    })
  }

  const handleUpdateChannels = () => {
    // Recarregar canais após mudança
    window.location.reload()
  }

  const getChannelIcon = (channel: typeof channels[0]) => {
    if (channel.isPrivate) return <Lock className="w-4 h-4" />
    if (channel.type === 'voice') return <Volume2 className="w-4 h-4" />
    if (channel.type === 'announcement') return <Hash className="w-4 h-4 text-yellow-500" />
    return <Hash className="w-4 h-4" />
  }

  return (
    <div className="w-60 bg-dark-800 flex flex-col">
      {/* Header do Servidor */}
      <div className="relative">
        <button
          onClick={() => setShowServerMenu(!showServerMenu)}
          className="w-full h-12 px-4 flex items-center justify-between border-b border-dark-700 shadow-md hover:bg-dark-750 transition-colors"
        >
          <h2 className="font-semibold text-white truncate">{serverName || 'Direct Messages'}</h2>
          {serverId && (
            <ChevronDown className={`w-4 h-4 transition-transform ${showServerMenu ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Dropdown Menu do Servidor */}
        {showServerMenu && serverId && (
          <div className="absolute top-full left-0 right-0 bg-dark-900 border border-dark-700 rounded-b-lg shadow-lg z-10 py-2 animate-scale-in">
            <button className="w-full px-4 py-2 text-left text-sm text-primary-400 hover:bg-dark-800 transition-colors flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Convidar Pessoas
            </button>
            <button 
              onClick={() => {
                setShowCreateChannel(true)
                setShowServerMenu(false)
              }}
              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-dark-800 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Criar Canal
            </button>
            <div className="h-px bg-dark-700 my-2" />
            <button className="w-full px-4 py-2 text-left text-sm text-white hover:bg-dark-800 transition-colors flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configurações do Servidor
            </button>
            <button className="w-full px-4 py-2 text-left text-sm text-white hover:bg-dark-800 transition-colors flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Configurações de Notificação
            </button>
          </div>
        )}
      </div>

      {/* Lista de Canais */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Canais de Texto */}
        {textChannels.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setTextChannelsCollapsed(!textChannelsCollapsed)}
              className="w-full flex items-center justify-between px-2 py-1 mb-1 hover:bg-dark-750 rounded transition-colors group"
            >
              <div className="flex items-center gap-1">
                {textChannelsCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-dark-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-dark-400" />
                )}
                <h3 className="text-xs font-semibold text-dark-400 uppercase">
                  Canais de Texto
                </h3>
              </div>
              {serverId && (
                <Plus 
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateChannel(true)
                  }}
                  className="w-4 h-4 text-dark-400 opacity-0 group-hover:opacity-100 hover:text-white transition-all" 
                />
              )}
            </button>
            {!textChannelsCollapsed && textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleChannelClick(channel.id)}
                onContextMenu={(e) => handleChannelRightClick(e, channel)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 transition-colors group ${
                  channel.id === activeChannelId
                    ? 'bg-dark-600 text-white'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                {getChannelIcon(channel)}
                <span className="truncate text-sm flex-1 text-left">{channel.name}</span>
                {/* Ícones de ação ao hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Settings className="w-3.5 h-3.5 hover:text-white" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Canais de Voz */}
        {voiceChannels.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setVoiceChannelsCollapsed(!voiceChannelsCollapsed)}
              className="w-full flex items-center justify-between px-2 py-1 mb-1 hover:bg-dark-750 rounded transition-colors group"
            >
              <div className="flex items-center gap-1">
                {voiceChannelsCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-dark-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-dark-400" />
                )}
                <h3 className="text-xs font-semibold text-dark-400 uppercase">
                  Canais de Voz
                </h3>
              </div>
              {serverId && (
                <Plus 
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateChannel(true)
                  }}
                  className="w-4 h-4 text-dark-400 opacity-0 group-hover:opacity-100 hover:text-white transition-all" 
                />
              )}
            </button>
            {!voiceChannelsCollapsed && voiceChannels.map((channel) => {
              const usersInChannel = getUsersInChannel(channel.id)
              return (
                <div key={channel.id}>
                  <button
                    onClick={() => handleChannelClick(channel.id)}
                    onContextMenu={(e) => handleChannelRightClick(e, channel)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 transition-colors group ${
                      channel.id === activeChannelId
                        ? 'bg-dark-600 text-white'
                        : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                    }`}
                  >
                    {getChannelIcon(channel)}
                    <span className="truncate text-sm flex-1 text-left">{channel.name}</span>
                    {/* Contador de usuários */}
                    {usersInChannel.length > 0 && (
                      <span className="text-xs text-dark-400">
                        {usersInChannel.length}
                      </span>
                    )}
                    {/* Ícones de ação ao hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Settings className="w-3.5 h-3.5 hover:text-white" />
                    </div>
                  </button>
                  
                  {/* Lista de usuários no canal de voz */}
                  <VoiceChannelUsers 
                    users={usersInChannel} 
                    channelId={channel.id}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Mensagem quando não há canais */}
        {channels.length === 0 && serverId && (
          <div className="flex flex-col items-center justify-center h-full text-dark-400 p-4">
            <p className="text-sm text-center mb-2">Nenhum canal ainda</p>
          </div>
        )}
      </div>

      {/* Menu de Contexto */}
      {contextMenu && (
        <ChannelContextMenu
          channel={contextMenu.channel}
          serverId={serverId || undefined}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onUpdate={handleUpdateChannels}
        />
      )}

      {/* Modal de Criar Canal */}
      {showCreateChannel && serverId && (
        <CreateChannelModal
          isOpen={showCreateChannel}
          onClose={() => setShowCreateChannel(false)}
          onCreate={async (data) => {
            try {
              await api.createServerChannel(serverId, {
                name: data.name,
                type: data.type,
                description: data.description,
              })
              handleUpdateChannels()
            } catch (error) {
              console.error('Failed to create channel:', error)
              alert('Erro ao criar canal')
            }
          }}
        />
      )}

      {/* User Profile Panel */}
      <UserProfilePanel
        isMuted={isMuted}
        isDeafened={isDeafened}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
      />
    </div>
  )
}
