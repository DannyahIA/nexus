import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { X, Copy, Check, Edit2, Camera } from 'lucide-react'

interface UserProfileModalProps {
  onClose: () => void
}

export default function UserProfileModal({ onClose }: UserProfileModalProps) {
  const user = useAuthStore((state) => state.user)
  const [copied, setCopied] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '')
  const [bio, setBio] = useState(user?.bio || '')

  if (!user) return null

  // Fallback para usuários sem discriminador (compatibilidade)
  const fullUsername = user.discriminator 
    ? `${user.username}#${user.discriminator}` 
    : user.username || 'User'
  
  const currentDisplayName = user.displayName || user.username || 'User'
  const avatarLetter = currentDisplayName.charAt(0).toUpperCase()

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(fullUsername)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveProfile = async () => {
    // TODO: Implementar API para atualizar perfil
    console.log('Saving profile:', { displayName, bio })
    setIsEditingProfile(false)
  }

  const getStatusColor = () => {
    return 'bg-green-500'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg w-full max-w-md overflow-hidden">
        {/* Header com Banner */}
        <div className="relative">
          <div className="h-24 bg-gradient-to-r from-primary-600 to-purple-600" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 bg-dark-900/50 hover:bg-dark-900 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Avatar e Info Principal */}
        <div className="px-6 pb-6">
          <div className="relative -mt-12 mb-4">
            <div className="relative inline-block">
              <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center text-2xl font-bold border-4 border-dark-800">
                {avatarLetter}
              </div>
              <div
                className={`absolute bottom-1 right-1 w-5 h-5 ${getStatusColor()} rounded-full border-4 border-dark-800`}
              />
              <button className="absolute bottom-0 right-0 p-1.5 bg-dark-700 hover:bg-dark-600 rounded-full transition-colors">
                <Camera className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Display Name e Username */}
          <div className="bg-dark-900 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-white">
                {currentDisplayName}
              </h2>
              <button
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                className="p-2 hover:bg-dark-700 rounded transition-colors"
              >
                <Edit2 className="w-4 h-4 text-dark-300" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-dark-300">{fullUsername}</span>
              <button
                onClick={handleCopyUsername}
                className="p-1 hover:bg-dark-700 rounded transition-colors"
                title="Copy username"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 text-dark-400" />
                )}
              </button>
            </div>

            {!isEditingProfile && user.bio && (
              <p className="text-sm text-dark-300">{user.bio}</p>
            )}
          </div>

          {/* Edição de Perfil */}
          {isEditingProfile && (
            <div className="bg-dark-900 rounded-lg p-4 mb-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600"
                  placeholder="Your display name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
                  placeholder="Tell us about yourself..."
                  rows={3}
                  maxLength={190}
                />
                <p className="text-xs text-dark-400 mt-1">{bio.length}/190</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfile}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditingProfile(false)
                    setDisplayName(user.displayName || user.username || '')
                    setBio(user.bio || '')
                  }}
                  className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="bg-dark-900 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-dark-300 mb-3">Status</h3>
            <div className="space-y-2">
              {['online', 'idle', 'dnd', 'offline'].map((status) => (
                <button
                  key={status}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-dark-800 rounded transition-colors"
                >
                  <div
                    className={`w-3 h-3 rounded-full ${
                      status === 'online'
                        ? 'bg-green-500'
                        : status === 'idle'
                        ? 'bg-yellow-500'
                        : status === 'dnd'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                    }`}
                  />
                  <span className="text-sm capitalize">{status === 'dnd' ? 'Do Not Disturb' : status}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="mt-4 space-y-2">
            <button className="w-full px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors text-left">
              Switch Account
            </button>
            <button className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-left">
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
