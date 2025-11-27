import { useState } from 'react'
import { Settings, Trash2, Plus, Hash } from 'lucide-react'
import { api } from '../services/api'
import ServerInviteModal from './ServerInviteModal'

interface ServerContextMenuProps {
  server: {
    id: string
    name: string
    description?: string
    iconUrl?: string
    inviteCode?: string
  }
  position: { x: number; y: number }
  onClose: () => void
  onUpdate: () => void
}

export default function ServerContextMenu({
  server,
  position,
  onClose,
  onUpdate,
}: ServerContextMenuProps) {
  const [showRename, setShowRename] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [newName, setNewName] = useState(server.name)
  const [newDescription, setNewDescription] = useState(server.description || '')
  const [loading, setLoading] = useState(false)

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    setLoading(true)
    try {
      await api.updateServer(server.id, {
        name: newName.trim(),
        description: newDescription.trim(),
      })
      onUpdate()
      onClose()
    } catch (error) {
      console.error('Failed to rename server:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Tem certeza que deseja excluir o servidor "${server.name}"? Esta ação não pode ser desfeita.`)) {
      return
    }

    setLoading(true)
    try {
      await api.deleteServer(server.id)
      onUpdate()
      onClose()
    } catch (error) {
      console.error('Failed to delete server:', error)
    } finally {
      setLoading(false)
    }
  }

  if (showRename) {
    return (
      <div
        className="fixed bg-dark-900 border border-dark-600 rounded-lg shadow-xl z-50 p-4 min-w-80"
        style={{ left: position.x, top: position.y }}
      >
        <form onSubmit={handleRename} className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-dark-400" />
            <h3 className="font-medium">Configurações do Servidor</h3>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              NOME DO SERVIDOR
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              maxLength={100}
              autoFocus
            />
            <div className="text-xs text-dark-500 mt-1">
              {newName.length}/100
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              DESCRIÇÃO DO SERVIDOR
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
              maxLength={500}
              rows={3}
              placeholder="Descreva seu servidor..."
            />
            <div className="text-xs text-dark-500 mt-1">
              {newDescription.length}/500
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRename(false)}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !newName.trim()}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded text-sm transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div
      className="fixed bg-dark-900 border border-dark-600 rounded-lg shadow-xl z-50 py-2 min-w-48"
      style={{ left: position.x, top: position.y }}
    >
      <button
        onClick={() => setShowRename(true)}
        className="w-full px-4 py-2 text-left hover:bg-dark-800 flex items-center gap-3 text-sm"
      >
        <Settings className="w-4 h-4" />
        Configurações do Servidor
      </button>
      
      <button
        onClick={() => {
          setShowInviteModal(true)
          onClose()
        }}
        className="w-full px-4 py-2 text-left hover:bg-dark-800 flex items-center gap-3 text-sm"
      >
        <Plus className="w-4 h-4" />
        Convidar Pessoas
      </button>
      
      {/* Modal de Convite */}
      <ServerInviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        server={server}
        mode="invite"
      />
      
      <button
        onClick={() => {/* TODO: Implementar criação de canal */}}
        className="w-full px-4 py-2 text-left hover:bg-dark-800 flex items-center gap-3 text-sm"
      >
        <Hash className="w-4 h-4" />
        Criar Canal
      </button>
      
      <div className="h-px bg-dark-700 my-1" />
      
      <button
        onClick={handleDelete}
        disabled={loading}
        className="w-full px-4 py-2 text-left hover:bg-red-600/20 text-red-400 flex items-center gap-3 text-sm disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        {loading ? 'Excluindo...' : 'Excluir Servidor'}
      </button>
    </div>
  )
}
