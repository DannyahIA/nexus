import { useState, useEffect } from 'react'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { webrtcService } from '../services/webrtc'
// import { useAuthStore } from '../store/authStore'

interface VoiceStatusProps {
  channelName: string
  onDisconnect: () => void
}

export default function VoiceStatus({ channelName, onDisconnect }: VoiceStatusProps) {
  // const user = useAuthStore((state) => state.user) (unused)
  const [isMuted, setIsMuted] = useState(false)

  // Subscribe to mute state changes (Requirement 7.4)
  useEffect(() => {
    const handleMuteStateChange = ({ isMuted }: { isMuted: boolean }) => {
      setIsMuted(isMuted)
    }

    webrtcService.on('mute-state-change', handleMuteStateChange)

    return () => {
      webrtcService.off('mute-state-change', handleMuteStateChange)
    }
  }, [])

  const handleToggleMute = () => {
    const newMuted = webrtcService.toggleMute()
    setIsMuted(newMuted)
  }

  const handleDisconnect = () => {
    webrtcService.leaveVoiceChannel()
    onDisconnect()
  }

  return (
    <div className="bg-black/20 backdrop-blur-md border-t border-white/5 p-2">
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2 flex items-center gap-3 group hover:border-green-500/30 transition-all">
        {/* Connection Status Indicator */}
        <div className="relative">
          <div className="w-9 h-9 bg-green-500/20 rounded-lg flex items-center justify-center text-green-400 group-hover:text-green-300 transition-colors">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-0.5">Connected</p>
          <p className="text-sm font-medium text-white/90 truncate">{channelName}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleMute}
            className={`p-1.5 rounded-lg transition-colors ${isMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'hover:bg-white/10 text-white/70 hover:text-white'
              }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={handleDisconnect}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-colors"
            title="Disconnect"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
