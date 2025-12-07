import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit3, Trash2, Hash } from 'lucide-react'
import { api } from '../services/api'

interface ChannelContextMenuProps {
  channel: {
    id: string
    name: string
    description?: string
    type: string
  }
  serverId?: string
  position: { x: number; y: number }
  onClose: () => void
  onUpdate: () => void
}

export default function ChannelContextMenu({
  channel,
  serverId: _serverId,
  position,
  onClose,
  onUpdate,
}: ChannelContextMenuProps) {
  const { t } = useTranslation('chat')
  const [showRename, setShowRename] = useState(false)
  const [newName, setNewName] = useState(channel.name)
  const [newDescription, setNewDescription] = useState(channel.description || '')
  const [loading, setLoading] = useState(false)

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return

    setLoading(true)
    try {
      await api.updateChannel(channel.id, {
        name: newName.trim(),
        description: newDescription.trim(),
        type: channel.type,
      })
      onUpdate()
      onClose()
    } catch (error) {
      console.error('Failed to rename channel:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('deleteChannelConfirm', { channelName: channel.name }))) {
      return
    }

    setLoading(true)
    try {
      await api.deleteChannel(channel.id)
      onUpdate()
      onClose()
    } catch (error) {
      console.error('Failed to delete channel:', error)
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
            <Hash className="w-4 h-4 text-dark-400" />
            <h3 className="font-medium">{t('renameChannel')}</h3>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-2">
              {t('channelNameLabel')}
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
              {t('channelDescriptionLabel')}
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              maxLength={1024}
              placeholder={t('optional')}
            />
            <div className="text-xs text-dark-500 mt-1">
              {newDescription.length}/1024
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowRename(false)}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded text-sm transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !newName.trim()}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded text-sm transition-colors"
            >
              {loading ? t('saving') : t('save')}
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
        <Edit3 className="w-4 h-4" />
        {t('renameChannel')}
      </button>
      
      <div className="h-px bg-dark-700 my-1" />
      
      <button
        onClick={handleDelete}
        disabled={loading}
        className="w-full px-4 py-2 text-left hover:bg-red-600/20 text-red-400 flex items-center gap-3 text-sm disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        {loading ? t('deleting') : t('deleteChannel')}
      </button>
    </div>
  )
}
