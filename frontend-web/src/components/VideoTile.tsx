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
      className={`video-tile ${getSizeClass()} ${isScreenSharing ? 'video-tile-screen-share' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video Element - Always render for audio, hide if video disabled */}
      {/* Implements Requirement 3.3: Video element with stream rendering */}
      <video
        ref={videoRef}
        autoPlay
        muted={isLocal}
        playsInline
        className={isVideoEnabled ? '' : 'hidden'}
      />

      {/* Avatar Fallback - Show when video is disabled */}
      {/* Implements Requirement 8.2: Avatar fallback for disabled video */}
      {!isVideoEnabled && (
        <div className="video-tile-avatar">
          <div className="video-tile-avatar-circle">
            {getAvatarInitial()}
          </div>
          <div className={`font-medium ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-xl' : 'text-lg'}`}>
            {username}
          </div>
        </div>
      )}

      {/* Speaking Indicator - Border animation */}
      {/* Implements Requirement 8.3: Speaking indicator with visual feedback */}
      {isSpeaking && !isMuted && (
        <div className="video-tile-speaking"></div>
      )}

      {/* Participant Name Overlay */}
      {/* Implements Requirement 3.3: Participant name overlay */}
      <div className="video-tile-name">
        <span>{username}</span>
        {isLocal && <span className="text-dark-400">(you)</span>}
      </div>

      {/* Status Indicators - Top Right */}
      {/* Implements Requirements 8.1, 8.3, 8.4, 8.5 */}
      <div className="video-tile-indicators">
        {/* Muted Indicator */}
        {/* Implements Requirement 8.1: Muted microphone icon */}
        {isMuted && (
          <div className="video-tile-indicator video-tile-indicator-muted" title="Muted">
            <MicOff className="w-4 h-4" />
          </div>
        )}

        {/* Screen Sharing Indicator */}
        {/* Implements Requirement 8.5: Screen share indicator */}
        {isScreenSharing && (
          <div className="video-tile-indicator video-tile-indicator-screen-share" title="Sharing screen">
            <Monitor className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Connection Quality Indicator - Top Left */}
      {/* Implements Requirement 8.4: Connection quality indicator */}
      {!isLocal && connectionQuality && (
        <div className="video-tile-connection">
          <ConnectionQualityIndicator
            userId={userId}
            quality={connectionQuality}
            showDetails={isHovered && showControls}
          />
        </div>
      )}

      {/* Hover Controls Overlay */}
      {/* Implements Requirement 3.3: Participant controls on hover */}
      {showControls && isHovered && (
        <div className="video-tile-hover-overlay">
          {/* Additional controls can be added here in the future */}
        </div>
      )}
    </div>
  )
}
