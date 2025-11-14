import { useNavigate } from 'react-router-dom'
import { Hash, Volume2, Lock, Plus, ChevronDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import ChannelContextMenu from './ChannelContextMenu'

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
}

export default function ChannelList({ serverId, serverName, channels, activeChannelId }: ChannelListProps) {
  const navigate = useNavigate()
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    channel: any
    position: { x: number; y: number }
  } | null>(null)
  
  // Fechar menu de contexto ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

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
      <div className="h-12 px-4 flex items-center justify-between border-b border-dark-700 shadow-md">
        <h2 className="font-semibold text-white truncate">{serverName || 'Direct Messages'}</h2>
        {serverId && (
          <button className="p-1 hover:bg-dark-700 rounded">
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lista de Canais */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Canais de Texto */}
        {textChannels.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <h3 className="text-xs font-semibold text-dark-400 uppercase">
                Canais de Texto
              </h3>
              {serverId && (
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="p-0.5 hover:bg-dark-700 rounded text-dark-400 hover:text-white"
                  title="Criar Canal"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleChannelClick(channel.id)}
                onContextMenu={(e) => handleChannelRightClick(e, channel)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 transition-colors ${
                  channel.id === activeChannelId
                    ? 'bg-dark-600 text-white'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                {getChannelIcon(channel)}
                <span className="truncate text-sm">{channel.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Canais de Voz */}
        {voiceChannels.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <h3 className="text-xs font-semibold text-dark-400 uppercase">
                Canais de Voz
              </h3>
              {serverId && (
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="p-0.5 hover:bg-dark-700 rounded text-dark-400 hover:text-white"
                  title="Criar Canal de Voz"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            {voiceChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleChannelClick(channel.id)}
                onContextMenu={(e) => handleChannelRightClick(e, channel)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded mb-0.5 transition-colors ${
                  channel.id === activeChannelId
                    ? 'bg-dark-600 text-white'
                    : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                }`}
              >
                {getChannelIcon(channel)}
                <span className="truncate text-sm">{channel.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mensagem quando não há canais */}
        {channels.length === 0 && serverId && (
          <div className="flex flex-col items-center justify-center h-full text-dark-400 p-4">
            <p className="text-sm text-center mb-2">Nenhum canal ainda</p>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded text-white text-sm"
            >
              Criar Canal
            </button>
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
    </div>
  )
}
