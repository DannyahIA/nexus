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
      <div className="h-14 bg-black/40 backdrop-blur-md border-t border-white/5 flex items-center px-2 gap-2">
        {/* Avatar e Info */}
        <button
          onClick={() => setShowProfileModal(true)}
          className="flex items-center gap-2 flex-1 hover:bg-white/5 rounded-lg p-1.5 transition-all duration-200 group"
        >
          <div className="relative">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-sm font-semibold shadow-lg group-hover:shadow-purple-500/20 transition-all">
              {avatarLetter}
            </div>
            <div
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${getStatusColor()} rounded-full border-2 border-[#1a1a1a]`}
            />
          </div>
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
              {displayName}
            </p>
            <p className="text-[10px] text-white/40 truncate font-medium">
              {fullUsername}
            </p>
          </div>
        </button>

        {/* Controles de Áudio */}
        <div className="flex items-center gap-0.5">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors relative group ${isMuted ? 'text-red-400' : 'text-white/60 hover:text-white'
                }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isMuted && <div className="absolute inset-0 bg-red-500/10 rounded-lg animate-pulse" />}
            </button>
          )}

          {onToggleDeafen && (
            <button
              onClick={onToggleDeafen}
              className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors relative group ${isDeafened ? 'text-red-400' : 'text-white/60 hover:text-white'
                }`}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {isDeafened && <div className="absolute inset-0 bg-red-500/10 rounded-lg animate-pulse" />}
            </button>
          )}

          <div className="scale-90">
            <LanguageSelector />
          </div>

          <button
            onClick={() => setShowProfileModal(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors hover:rotate-90 duration-300"
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
