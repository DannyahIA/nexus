import { Mic, MicOff, VolumeX } from 'lucide-react'

interface VoiceUser {
  id: string
  username: string
  displayName?: string
  avatar?: string
  isMuted?: boolean
  isDeafened?: boolean
  isSpeaking?: boolean
}

interface VoiceChannelUsersProps {
  users: VoiceUser[]
  channelId: string
}

export default function VoiceChannelUsers({ users, channelId: _channelId }: VoiceChannelUsersProps) {
  if (users.length === 0) return null

  return (
    <div className="ml-6 mt-1 space-y-1">
      {users.map((user) => (
        <div
          key={user.id}
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-dark-750 transition-colors group"
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.displayName || user.username}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-xs font-semibold">
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            
            {/* Speaking indicator */}
            {user.isSpeaking && (
              <div className="absolute -inset-0.5 rounded-full border-2 border-green-500 animate-pulse-ring" />
            )}
          </div>

          {/* Username */}
          <span className="text-sm text-dark-300 truncate flex-1">
            {user.displayName || user.username}
          </span>

          {/* Status icons */}
          <div className="flex items-center gap-1">
            {user.isDeafened ? (
              <VolumeX className="w-3.5 h-3.5 text-red-400" />
            ) : user.isMuted ? (
              <MicOff className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-dark-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
