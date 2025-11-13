import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useServerStore } from '../store/serverStore'
import { Plus, Users } from 'lucide-react'
import CreateServerModal from './CreateServerModal'
import { api } from '../services/api'

export default function ServerSidebar() {
  const navigate = useNavigate()
  const servers = useServerStore((state) => state.servers)
  const activeServerId = useServerStore((state) => state.activeServerId)
  const setActiveServer = useServerStore((state) => state.setActiveServer)
  const addServer = useServerStore((state) => state.addServer)
  const [showCreateModal, setShowCreateModal] = useState(false)

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

  return (
    <div className="w-[72px] bg-dark-900 flex flex-col items-center py-3 gap-2 overflow-y-auto">
      {/* Home Button (DMs e Amigos) */}
      <button
        onClick={handleHomeClick}
        className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center ${
          activeServerId === null
            ? 'bg-primary-600 rounded-[16px]'
            : 'bg-dark-700 hover:bg-primary-600'
        }`}
        title="Home"
      >
        <Users className="w-6 h-6" />
      </button>

      {/* Separador */}
      <div className="w-8 h-[2px] bg-dark-700 rounded-full" />

      {/* Lista de Servidores */}
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => handleServerClick(server.id)}
          className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center text-white font-semibold ${
            activeServerId === server.id
              ? 'bg-primary-600 rounded-[16px]'
              : 'bg-dark-700 hover:bg-primary-600'
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
            <span className="text-lg">
              {server.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </span>
          )}
        </button>
      ))}

      {/* Botão Adicionar Servidor */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 bg-dark-700 hover:bg-green-600 flex items-center justify-center group"
        title="Adicionar Servidor"
      >
        <Plus className="w-6 h-6 text-green-500 group-hover:text-white" />
      </button>

      {/* Modal de Criar Servidor */}
      <CreateServerModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateServer}
      />
    </div>
  )
}
