import { useRef, useEffect, useState } from 'react'
import { MicOff, Monitor } from 'lucide-react'
import { ConnectionQuality } from '../services/connectionMonitor'
import ConnectionQualityIndicator from './ConnectionQualityIndicator'

export interface VideoTileProps {
  userId: string
  username: string
  stream: MediaStream | null
  isLocal: boolean
  isMuted: boolean
  isVideoEnabled: boolean
  isSpeaking: boolean
  isScreenSharing: boolean
  connectionQuality: ConnectionQuality | null
  size?: 'small' | 'medium' | 'large'
  showControls?: boolean
}

/**
 * VideoTile component for individual participant display
 * Implements Requirements 3.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */
export default function VideoTile({
  userId,
  username,
  stream,
  isLocal,
  isMuted,
  isVideoEnabled,
  isSpeaking,
  isScreenSharing,
  connectionQuality,
  size = 'medium',
  showControls = true,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Get avatar initial
  const getAvatarInitial = () => {
    return username?.charAt(0).toUpperCase() || 'U'
  }

  // Get size class
  const getSizeClass = () => {
    switch (size) {
      case 'small':
        return 'video-tile-small'
      case 'large':
        return 'video-tile-large'
      case 'medium':
      default:
        return 'video-tile-medium'
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md transition-all duration-300 group ${getSizeClass()} ${isScreenSharing ? 'ring-2 ring-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : ''
        } ${isSpeaking && !isMuted ? 'ring-2 ring-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        muted={isLocal}
        playsInline
        className={`w-full h-full object-cover ${isVideoEnabled ? '' : 'hidden'}`}
      />

      {/* Avatar Fallback */}
      {!isVideoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent">
          <div className={`${size === 'small' ? 'w-12 h-12' : size === 'large' ? 'w-32 h-32' : 'w-20 h-20'
            } rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-900/40 transition-all duration-300`}>
            <span className={`${size === 'small' ? 'text-lg' : size === 'large' ? 'text-5xl' : 'text-3xl'
              } font-bold text-white`}>{getAvatarInitial()}</span>
          </div>
        </div>
      )}

      {/* Status Overlay (Top Right) */}
      <div className="absolute top-3 right-3 flex gap-2">
        {isMuted && (
          <div className="p-1.5 rounded-full bg-red-500/80 backdrop-blur-md text-white shadow-lg">
            <MicOff className="w-3 h-3" />
          </div>
        )}
        {isScreenSharing && (
          <div className="p-1.5 rounded-full bg-green-500/80 backdrop-blur-md text-white shadow-lg">
            <Monitor className="w-3 h-3" />
          </div>
        )}
      </div>

      {/* Connection Quality (Top Left) */}
      {!isLocal && connectionQuality && (
        <div className="absolute top-3 left-3">
          <ConnectionQualityIndicator
            userId={userId}
            quality={connectionQuality}
            showDetails={isHovered && showControls}
          />
        </div>
      )}

      {/* Name Tag (Bottom) */}
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm drop-shadow-md truncate">
            {username} {isLocal && <span className="text-white/60 font-normal">(You)</span>}
          </span>
        </div>
      </div>

      {/* Hover Overlay Controls (can be expanded later) */}
      {showControls && isHovered && (
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />
      )}
    </div>
  )
}
