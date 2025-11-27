import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { Settings, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import UserProfileModal from './UserProfileModal'
import LanguageSelector from './LanguageSelector'

interface UserProfilePanelProps {
  isMuted?: boolean
  isDeafened?: boolean
  onToggleMute?: () => void
  onToggleDeafen?: () => void
}

export default function UserProfilePanel({
  isMuted = false,
  isDeafened = false,
  onToggleMute,
  onToggleDeafen,
}: UserProfilePanelProps) {
  const user = useAuthStore((state) => state.user)
  const [showProfileModal, setShowProfileModal] = useState(false)

  if (!user) return null

  const getStatusColor = () => {
    // TODO: Integrar com sistema de presença
    return 'bg-green-500'
  }

  // Fallback para usuários sem discriminador (compatibilidade)
  const fullUsername = user.discriminator 
    ? `${user.username}#${user.discriminator}` 
    : user.username || 'User'
  
  const displayName = user.displayName || user.username || 'User'
  const avatarLetter = displayName.charAt(0).toUpperCase()

  return (
    <>
      <div className="h-14 bg-dark-850 border-t border-dark-700 flex items-center px-2 gap-2">
        {/* Avatar e Info */}
        <button
          onClick={() => setShowProfileModal(true)}
          className="flex items-center gap-2 flex-1 hover:bg-dark-800 rounded p-1 transition-colors"
        >
          <div className="relative">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-sm font-semibold">
              {avatarLetter}
            </div>
            <div
              className={`absolute bottom-0 right-0 w-3 h-3 ${getStatusColor()} rounded-full border-2 border-dark-850`}
            />
          </div>
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-sm font-medium text-white truncate">
              {displayName}
            </p>
            <p className="text-xs text-dark-400 truncate">
              {fullUsername}
            </p>
          </div>
        </button>

        {/* Controles de Áudio */}
        <div className="flex items-center gap-1">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className={`p-2 rounded hover:bg-dark-700 transition-colors ${
                isMuted ? 'text-red-400' : 'text-dark-300 hover:text-white'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {onToggleDeafen && (
            <button
              onClick={onToggleDeafen}
              className={`p-2 rounded hover:bg-dark-700 transition-colors ${
                isDeafened ? 'text-red-400' : 'text-dark-300 hover:text-white'
              }`}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}

          <LanguageSelector />

          <button
            onClick={() => setShowProfileModal(true)}
            className="p-2 rounded hover:bg-dark-700 text-dark-300 hover:text-white transition-colors"
            title="User Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showProfileModal && (
        <UserProfileModal onClose={() => setShowProfileModal(false)} />
      )}
    </>
  )
}
