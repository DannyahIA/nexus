import { useState } from 'react'
import { X, Upload, Hash } from 'lucide-react'

interface CreateServerModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: { name: string; description: string; icon?: string }) => Promise<void>
}

export default function CreateServerModal({ isOpen, onClose, onCreate }: CreateServerModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) return

    setLoading(true)
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        icon: icon.trim() || undefined,
      })
      
      // Limpar formulário
      setName('')
      setDescription('')
      setIcon('')
      onClose()
    } catch (error) {
      console.error('Failed to create server:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-800 rounded-lg w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <h2 className="text-xl font-bold text-white">Criar Servidor</h2>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors p-1 rounded hover:bg-dark-700"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Icon Upload */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 bg-dark-700 rounded-full flex items-center justify-center mb-3 border-2 border-dashed border-dark-600 hover:border-primary-600 transition-colors cursor-pointer group">
              {icon ? (
                <img src={icon} alt="Server icon" className="w-full h-full rounded-full object-cover" />
              ) : (
                <Upload className="w-8 h-8 text-dark-500 group-hover:text-primary-600 transition-colors" />
              )}
            </div>
            <p className="text-xs text-dark-400 text-center">
              Clique para fazer upload de um ícone
              <br />
              <span className="text-dark-500">(ou cole uma URL abaixo)</span>
            </p>
          </div>

          {/* Icon URL */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              URL do Ícone <span className="text-dark-500">(opcional)</span>
            </label>
            <input
              type="url"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="https://exemplo.com/icone.png"
              className="w-full px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Nome do Servidor */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nome do Servidor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Meu Servidor Incrível"
              maxLength={100}
              required
              className="w-full px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-dark-500 mt-1">
              {name.length}/100 caracteres
            </p>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Descrição <span className="text-dark-500">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sobre o que é seu servidor?"
              maxLength={500}
              rows={3}
              className="w-full px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none"
              disabled={loading}
            />
            <p className="text-xs text-dark-500 mt-1">
              {description.length}/500 caracteres
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-primary-600/10 border border-primary-600/30 rounded-lg p-4">
            <div className="flex gap-3">
              <Hash className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-primary-400 mb-1">
                  Dica
                </p>
                <p className="text-xs text-dark-300">
                  Após criar o servidor, você poderá adicionar canais de texto, voz e categorias para organizá-lo.
                </p>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors font-medium"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
            >
              {loading ? 'Criando...' : 'Criar Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
