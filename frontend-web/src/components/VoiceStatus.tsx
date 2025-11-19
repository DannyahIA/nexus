import { useState } from 'react'
import { Mic, MicOff, PhoneOff, Settings } from 'lucide-react'
import { webrtcService } from '../services/webrtc'
import { useAuthStore } from '../store/authStore'

interface VoiceStatusProps {
  channelName: string
  onDisconnect: () => void
}

export default function VoiceStatus({ channelName, onDisconnect }: VoiceStatusProps) {
  const user = useAuthStore((state) => state.user)
  const [isMuted, setIsMuted] = useState(false)

  const handleToggleMute = () => {
    const newMuted = webrtcService.toggleMute()
    setIsMuted(newMuted)
  }

  const handleDisconnect = () => {
    webrtcService.leaveVoiceChannel()
    onDisconnect()
  }

  return (
    <div className="bg-dark-800 border-t border-dark-700 p-3">
      <div className="flex items-center gap-3">
        {/* User Avatar */}
        <div className="relative">
          <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
            {user?.username.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-dark-800"></div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{user?.username}</p>
          <p className="text-xs text-dark-400 truncate">Voz / {channelName}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleMute}
            className={`p-2 rounded hover:bg-dark-700 transition-colors ${
              isMuted ? 'text-red-500' : 'text-dark-300'
            }`}
            title={isMuted ? 'Desmutar' : 'Mutar'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            className="p-2 rounded hover:bg-dark-700 transition-colors text-dark-300"
            title="Configurações"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={handleDisconnect}
            className="p-2 rounded hover:bg-dark-700 transition-colors text-red-500"
            title="Desconectar"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
