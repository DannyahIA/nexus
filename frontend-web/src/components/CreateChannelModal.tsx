import { useState } from 'react'
import { X, Hash, Volume2, Video } from 'lucide-react'

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
    { id: 'text', label: 'Text', icon: Hash, description: 'Send messages, images, and files' },
    { id: 'voice', label: 'Voice', icon: Volume2, description: 'Voice chat with others' },
    { id: 'video', label: 'Video', icon: Video, description: 'Video conference' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <h2 className="text-xl font-semibold">Create Channel</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Channel Type */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-3">
              Channel Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {channelTypes.map((channelType) => {
                const Icon = channelType.icon
                return (
                  <button
                    key={channelType.id}
                    type="button"
                    onClick={() => setType(channelType.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                      type === channelType.id
                        ? 'border-primary-600 bg-primary-600/10'
                        : 'border-dark-700 hover:border-dark-600'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{channelType.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-dark-300 mb-2">
              Channel Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
              placeholder="awesome-channel"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-dark-300 mb-2">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-600"
              placeholder="What's this channel about?"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
