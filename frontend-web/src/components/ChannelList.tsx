import { useNavigate } from 'react-router-dom'
import { Hash, Volume2, Lock, ChevronDown, ChevronRight, Plus, Settings, UserPlus, ClipboardList } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ChannelContextMenu from './ChannelContextMenu'
import UserProfilePanel from './UserProfilePanel'
import CreateChannelModal from './CreateChannelModal'
import ServerInviteModal from './ServerInviteModal'
import ServerSettingsModal from './ServerSettingsModal'
import VoiceChannelUsers from './VoiceChannelUsers'
import VoiceStatus from './VoiceStatus'
import { api } from '../services/api'
import { useVoiceUsersStore } from '../store/voiceUsersStore'
import { useVoiceStore } from '../store/voiceStore'
import { webrtcService } from '../services/webrtc'
import { Server } from '../store/serverStore'

interface ChannelListProps {
  serverId: string | null
  server?: Server
  serverName?: string
  channels: Array<{
    id: string
    name: string
    type: 'text' | 'voice' | 'dm' | 'group_dm' | 'announcement' | 'task'
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
  server,
  serverName,
  channels,
  activeChannelId,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen
}: ChannelListProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [contextMenu, setContextMenu] = useState<{
    channel: any
    position: { x: number; y: number }
  } | null>(null)
  const [textChannelsCollapsed, setTextChannelsCollapsed] = useState(false)
  const [voiceChannelsCollapsed, setVoiceChannelsCollapsed] = useState(false)
  const [showServerMenu, setShowServerMenu] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // Voice users store
  const getUsersInChannel = useVoiceUsersStore((state) => state.getUsersInChannel)

  // Voice state for background calls
  const isConnected = useVoiceStore((state) => state.isConnected)
  const currentChannelName = useVoiceStore((state) => state.currentChannelName)
  const setDisconnected = useVoiceStore((state) => state.setDisconnected)

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
  const taskChannels = channels.filter((c) => c.type === 'task')

  const handleChannelClick = (channelId: string) => {
    if (serverId) {
      navigate(`/server/${serverId}/${channelId}`)
    } else {
      navigate(`/dm/${channelId}`)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, channelId: string, type: string) => {
    e.preventDefault()
    setContextMenu({
      channel: { id: channelId, type: type }, // Adapt to existing contextMenu state structure
      position: { x: e.pageX, y: e.pageY }
    })
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
    <div className="w-60 h-full flex flex-col bg-black/20 backdrop-blur-md border-r border-white/5">
      {/* Header do Servidor */}
      <div className="relative">
        <button
          onClick={() => setShowServerMenu(!showServerMenu)}
          className="w-full h-12 px-4 flex items-center justify-between border-b border-white/5 shadow-sm hover:bg-white/5 transition-colors"
        >
          <h2 className="font-semibold text-white/90 truncate tracking-wide text-sm uppercase">{serverName || 'Direct Messages'}</h2>
          <div className="flex items-center gap-2">
            {serverId && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCreateChannel(true)
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors group/plus"
              >
                <Plus className="w-4 h-4 text-white/50 group-hover/plus:text-white transition-colors" />
              </button>
            )}
            {serverId && (
              <ChevronDown className={`w-4 h-4 text-white/50 transition-transform duration-300 ${showServerMenu ? 'rotate-180' : ''}`} />
            )}
          </div>
        </button>

        {/* Dropdown Menu do Servidor */}
        {showServerMenu && serverId && (
          <div
            className="absolute top-full left-2 right-2 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 animate-scale-in overflow-hidden backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowInviteModal(true)
                setShowServerMenu(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-purple-400 hover:bg-purple-500/10 transition-colors flex items-center gap-2 font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Convidar Pessoas
            </button>
            <button
              onClick={() => {
                setShowCreateChannel(true)
                setShowServerMenu(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Criar Canal
            </button>
            <div className="h-px bg-white/10 my-1 mx-2" />
            <button
              onClick={() => {
                setShowSettingsModal(true)
                setShowServerMenu(false)
              }}
              className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Configurações
            </button>
          </div>
        )}
      </div>

      {/* Lista de Canais */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
        {/* Canais de Texto */}
        {textChannels.length > 0 && (
          <div>
            <button
              onClick={() => setTextChannelsCollapsed(!textChannelsCollapsed)}
              className="w-full flex items-center justify-between px-2 py-1 mb-1 hover:text-white text-white/50 transition-colors group"
            >
              <div className="flex items-center gap-1">
                {textChannelsCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <h3 className="text-[10px] font-bold uppercase tracking-wider">
                  Canais de Texto
                </h3>
              </div>
              {serverId && (
                <Plus
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateChannel(true)
                  }}
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 hover:text-white transition-all"
                />
              )}
            </button>

            <div className={`space-y-[2px] overflow-hidden transition-all duration-300 ${textChannelsCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
              {!textChannelsCollapsed && textChannels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => handleChannelClick(channel.id)}
                  onContextMenu={(e) => handleChannelRightClick(e, channel)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-0.5 transition-all duration-200 group ${channel.id === activeChannelId
                    ? 'bg-white/10 text-white shadow-sm backdrop-blur-sm'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/90'
                    }`}
                >
                  <div className={`opacity-70 ${channel.id === activeChannelId ? 'text-purple-400' : ''}`}>
                    {getChannelIcon(channel)}
                  </div>
                  <span className="truncate text-sm flex-1 text-left font-medium">{channel.name}</span>
                  {/* Ícones de ação ao hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Settings className="w-3.5 h-3.5 hover:text-white" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Canais de Tarefas */}
        {taskChannels.length > 0 && (
          <div className="mb-2">
            <button
              onClick={() => setVoiceChannelsCollapsed(!voiceChannelsCollapsed)} // Reusing collapse state for now or create new one
              className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-white/40 hover:text-white/60 transition-colors uppercase tracking-wider w-full group"
            >
              <ChevronDown className="w-3 h-3 transition-transform" />
              {t('taskChannels')}
            </button>

            <div className="space-y-[2px] mt-1">
              {taskChannels.map((channel) => (
                <div key={channel.id}>
                  <button
                    onClick={() => handleChannelClick(channel.id)}
                    onContextMenu={(e) => handleContextMenu(e, channel.id, 'task')}
                    className={`w-full flex items-center gap-2 px-2 py-[6px] rounded-lg transition-all group relative ${activeChannelId === channel.id
                      ? 'bg-primary-600/20 text-white shadow-[0_0_15px_rgba(124,58,237,0.1)]'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                      }`}
                  >
                    <ClipboardList className={`w-4 h-4 flex-shrink-0 ${activeChannelId === channel.id ? 'text-primary-400' : 'text-white/30 group-hover:text-white/50'
                      }`} />
                    <span className={`truncate font-medium text-[15px] ${activeChannelId === channel.id ? 'text-white' : 'text-white/70 group-hover:text-white/90'
                      }`}>
                      {channel.name}
                    </span>
                    {channel.isPrivate && (
                      <Lock className="w-3 h-3 ml-auto text-white/20" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Canais de Voz */}
        {voiceChannels.length > 0 && (
          <div>
            <button
              onClick={() => setVoiceChannelsCollapsed(!voiceChannelsCollapsed)}
              className="w-full flex items-center justify-between px-2 py-1 mb-1 hover:text-white text-white/50 transition-colors group"
            >
              <div className="flex items-center gap-1">
                {voiceChannelsCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <h3 className="text-[10px] font-bold uppercase tracking-wider">
                  Canais de Voz
                </h3>
              </div>
              {serverId && (
                <Plus
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateChannel(true)
                  }}
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 hover:text-white transition-all"
                />
              )}
            </button>

            <div className={`space-y-[2px] overflow-hidden transition-all duration-300 ${voiceChannelsCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
              {!voiceChannelsCollapsed && voiceChannels.map((channel) => {
                const usersInChannel = getUsersInChannel(channel.id)
                return (
                  <div key={channel.id}>
                    <button
                      onClick={() => handleChannelClick(channel.id)}
                      onContextMenu={(e) => handleChannelRightClick(e, channel)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg mb-0.5 transition-all duration-200 group ${channel.id === activeChannelId
                        ? 'bg-white/10 text-white shadow-sm backdrop-blur-sm'
                        : 'text-white/50 hover:bg-white/5 hover:text-white/90'
                        }`}
                    >
                      <div className={`opacity-70 ${channel.id === activeChannelId ? 'text-purple-400' : ''}`}>
                        {getChannelIcon(channel)}
                      </div>
                      <span className="truncate text-sm flex-1 text-left font-medium">{channel.name}</span>
                      {/* Contador de usuários */}
                      {usersInChannel.length > 0 && (
                        <span className="text-xs bg-black/40 px-1.5 rounded text-white/70">
                          {usersInChannel.length}
                        </span>
                      )}
                      {/* Ícones de ação ao hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Settings className="w-3.5 h-3.5 hover:text-white" />
                      </div>
                    </button>

                    {/* Lista de usuários no canal de voz */}
                    <div className="pl-4">
                      <VoiceChannelUsers
                        users={usersInChannel}
                        channelId={channel.id}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Mensagem quando não há canais */}
        {channels.length === 0 && serverId && (
          <div className="flex flex-col items-center justify-center h-32 text-white/20 p-4 border border-dashed border-white/10 rounded-xl mx-2">
            <Hash className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs text-center">Nenhum canal ainda</p>
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

      {/* Modal de Convite */}
      {showInviteModal && serverId && (
        <ServerInviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          server={{
            id: serverId,
            name: server?.name || serverName || '',
            inviteCode: server?.inviteCode || 'LOADING...'
          }}
          mode="invite"
        />
      )}

      {/* Modal de Configurações */}
      {showSettingsModal && serverId && (
        <ServerSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          server={{
            id: serverId,
            name: server?.name || serverName || '',
            ownerId: server?.ownerId || '',
            description: server?.description || '',
            icon: server?.iconUrl || ''
          }}
          onUpdate={handleUpdateChannels}
        />
      )}

      {/* Voice Status (Background Call UI) */}
      {isConnected && currentChannelName && (
        <VoiceStatus
          channelName={currentChannelName}
          onDisconnect={() => {
            webrtcService.leaveVoiceChannel()
            setDisconnected()
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
