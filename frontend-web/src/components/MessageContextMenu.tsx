import { useState, useEffect, useRef } from 'react'
import { Trash2, Edit, Reply } from 'lucide-react'

interface MessageContextMenuProps {
  messageId: string
  authorId: string
  currentUserId: string
  isServerOwner?: boolean
  isServerAdmin?: boolean
  content: string
  onClose: () => void
  position: { x: number; y: number }
  onDelete: (messageId: string) => void
  onEdit?: (messageId: string, newContent: string) => void
  onReply?: (messageId: string) => void
}

export default function MessageContextMenu({
  messageId,
  authorId,
  currentUserId,
  isServerOwner = false,
  isServerAdmin = false,
  content,
  onClose,
  position,
  onDelete,
  onEdit,
  onReply,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)

  // Verificar se o usuário pode deletar a mensagem
  const canDelete = authorId === currentUserId || isServerOwner || isServerAdmin
  const canEdit = authorId === currentUserId

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Ajustar posição do menu para não sair da tela
  const adjustedPosition = { ...position }
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - rect.width - 10
    }
    if (rect.bottom > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - rect.height - 10
    }
  }

  const handleDelete = () => {
    if (window.confirm('Tem certeza que deseja deletar esta mensagem?')) {
      onDelete(messageId)
      onClose()
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(messageId, editContent.trim())
      onClose()
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent(content)
  }

  if (isEditing) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 bg-dark-900 rounded-lg shadow-xl border border-dark-700 p-4 min-w-[300px]"
        style={{
          top: adjustedPosition.y,
          left: adjustedPosition.x,
        }}
      >
        <div className="mb-2">
          <label className="text-xs text-dark-400 uppercase font-semibold">
            Editar Mensagem
          </label>
        </div>
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full bg-dark-800 text-white rounded px-3 py-2 mb-3 resize-none"
          rows={3}
          maxLength={2000}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancelEdit}
            className="px-3 py-1 text-sm text-dark-300 hover:underline"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveEdit}
            className="px-3 py-1 text-sm bg-primary-600 hover:bg-primary-700 rounded"
            disabled={!editContent.trim()}
          >
            Salvar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-dark-900 rounded-lg shadow-xl border border-dark-700 py-2 min-w-[200px]"
      style={{
        top: adjustedPosition.y,
        left: adjustedPosition.x,
      }}
    >
      {onReply && (
        <button
          onClick={() => {
            onReply(messageId)
            onClose()
          }}
          className="w-full px-4 py-2 text-left text-dark-200 hover:bg-primary-600 hover:text-white transition-colors flex items-center gap-3"
        >
          <Reply className="w-4 h-4" />
          <span>Responder</span>
        </button>
      )}

      {canEdit && onEdit && (
        <button
          onClick={handleEdit}
          className="w-full px-4 py-2 text-left text-dark-200 hover:bg-primary-600 hover:text-white transition-colors flex items-center gap-3"
        >
          <Edit className="w-4 h-4" />
          <span>Editar</span>
        </button>
      )}

      {canDelete && (
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600 hover:text-white transition-colors flex items-center gap-3"
        >
          <Trash2 className="w-4 h-4" />
          <span>Deletar Mensagem</span>
        </button>
      )}

      {!canEdit && !canDelete && !onReply && (
        <div className="px-4 py-2 text-dark-500 text-sm">
          Nenhuma ação disponível
        </div>
      )}
    </div>
  )
}
