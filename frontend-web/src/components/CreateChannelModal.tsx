import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Hash, Volume2, ClipboardList } from 'lucide-react'

interface CreateChannelModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: { name: string; description: string; type: string }) => void
}

export default function CreateChannelModal({
  isOpen,
  onClose,
  onCreate,
}: CreateChannelModalProps) {
  const { t } = useTranslation('chat')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('text')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    onCreate({ name, description, type })

    // Reset form
    setName('')
    setDescription('')
    setType('text')
    onClose()
  }

  const channelTypes = [
    { id: 'text', label: t('textChannel'), icon: Hash, description: t('textChannelDescription') },
    { id: 'voice', label: t('voiceChannel'), icon: Volume2, description: t('voiceChannelDescription') },
    { id: 'task', label: t('taskChannel'), icon: ClipboardList, description: t('taskChannelDescription') },
  ]

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div className="bg-[#121214]/80 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-xl font-bold text-white tracking-tight">{t('createChannelTitle')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Channel Type */}
          <div>
            <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
              {t('channelType')}
            </label>
            <div className="grid grid-cols-1 gap-3">
              {channelTypes.map((channelType) => {
                const Icon = channelType.icon
                const isSelected = type === channelType.id
                return (
                  <button
                    key={channelType.id}
                    type="button"
                    onClick={() => setType(channelType.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left group ${isSelected
                      ? 'bg-primary-600/20 border-primary-500/50 shadow-[0_0_15px_rgba(124,58,237,0.2)]'
                      : 'bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10'
                      }`}
                  >
                    <div className={`p-2.5 rounded-lg transition-colors ${isSelected ? 'bg-primary-500 text-white' : 'bg-white/5 text-white/50 group-hover:text-white'
                      }`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <span className={`block font-semibold text-base mb-0.5 transition-colors ${isSelected ? 'text-white' : 'text-white/70 group-hover:text-white'
                        }`}>
                        {channelType.label}
                      </span>
                      <span className="text-xs text-white/40">
                        {channelType.description}
                      </span>
                    </div>
                    <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-primary-500' : 'border-white/10'
                      }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label htmlFor="name" className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
              {t('channelNameRequired')}
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-primary-400 transition-colors">
                <Hash className="w-5 h-5" />
              </div>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
                placeholder={t('channelPlaceholder')}
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
              {t('channelDescription')}
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all resize-none"
              placeholder={t('channelDescriptionPlaceholder')}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-xl transition-all font-medium shadow-lg shadow-primary-900/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {t('createChannelButton')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
