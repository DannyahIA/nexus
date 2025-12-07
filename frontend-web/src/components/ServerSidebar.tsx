import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useServerStore } from '../store/serverStore'
import { Plus, Users, UserPlus } from 'lucide-react'
import CreateServerModal from './CreateServerModal'
import ServerContextMenu from './ServerContextMenu'
import ServerInviteModal from './ServerInviteModal'
import { api } from '../services/api'

export default function ServerSidebar() {
  const navigate = useNavigate()
  const servers = useServerStore((state) => state.servers)
  const activeServerId = useServerStore((state) => state.activeServerId)
  const setActiveServer = useServerStore((state) => state.setActiveServer)
  const addServer = useServerStore((state) => state.addServer)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    server: any
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

  const handleServerClick = (serverId: string) => {
    setActiveServer(serverId)
    navigate(`/server/${serverId}`)
  }

  const handleHomeClick = () => {
    setActiveServer(null)
    navigate('/home')
  }

  const handleCreateServer = async (data: { name: string; description: string; icon?: string }) => {
    try {
      const response = await api.createServer(data)
      addServer(response.data)
      navigate(`/server/${response.data.id}`)
    } catch (error) {
      console.error('Failed to create server:', error)
      throw error
    }
  }

  const handleServerRightClick = (e: React.MouseEvent, server: any) => {
    e.preventDefault()
    setContextMenu({
      server,
      position: { x: e.clientX, y: e.clientY }
    })
  }

  const handleUpdateServers = () => {
    // Recarregar servidores após mudança
    window.location.reload()
  }

  return (
    <div className="w-[72px] h-full flex flex-col items-center py-3 gap-2 overflow-y-auto no-scrollbar">
      {/* Home Button (DMs e Amigos) */}
      <button
        onClick={handleHomeClick}
        className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-300 flex items-center justify-center shadow-lg group relative ${activeServerId === null
          ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-500/30'
          : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        title="Home"
      >
        <Users className="w-6 h-6 transition-transform duration-300 group-hover:scale-110" />
        {activeServerId === null && (
          <div className="absolute -left-4 w-1 h-8 bg-white rounded-r-full" />
        )}
      </button>

      {/* Separador */}
      <div className="w-8 h-[2px] bg-white/10 rounded-full my-1" />

      {/* Lista de Servidores */}
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => handleServerClick(server.id)}
          onContextMenu={(e) => handleServerRightClick(e, server)}
          className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-300 flex items-center justify-center text-white font-semibold shadow-lg relative group ${activeServerId === server.id
            ? 'bg-gradient-to-br from-purple-600 to-indigo-600 shadow-purple-500/30'
            : 'bg-white/5 hover:bg-white/10'
            }`}
          title={server.name}
        >
          {server.iconUrl ? (
            <img
              src={server.iconUrl}
              alt={server.name}
              className="w-full h-full rounded-[inherit] object-cover"
            />
          ) : (
            <span className="text-sm font-bold group-hover:scale-110 transition-transform duration-300">
              {server.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </span>
          )}
          {activeServerId === server.id && (
            <div className="absolute -left-4 w-1 h-8 bg-white rounded-r-full" />
          )}
        </button>
      ))}

      {/* Botão Adicionar Servidor */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-300 bg-white/5 hover:bg-green-500/20 text-green-500 hover:text-green-400 flex items-center justify-center group border border-dashed border-green-500/30 hover:border-green-500/50"
        title="Criar Servidor"
      >
        <Plus className="w-6 h-6 transition-transform duration-300 group-hover:rotate-90" />
      </button>

      {/* Botão Entrar em Servidor */}
      <button
        onClick={() => setShowJoinModal(true)}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-300 bg-white/5 hover:bg-blue-500/20 text-blue-500 hover:text-blue-400 flex items-center justify-center group border border-dashed border-blue-500/30 hover:border-blue-500/50"
        title="Entrar em Servidor"
      >
        <UserPlus className="w-6 h-6 transition-transform duration-300 group-hover:scale-110" />
      </button>

      {/* Modal de Criar Servidor */}
      <CreateServerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateServer}
      />

      {/* Modal de Entrar em Servidor */}
      <ServerInviteModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        mode="join"
      />

      {/* Menu de Contexto */}
      {contextMenu && (
        <ServerContextMenu
          server={contextMenu.server}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onUpdate={handleUpdateServers}
        />
      )}
    </div>
  )
}
