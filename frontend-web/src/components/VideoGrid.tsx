import { useMemo } from 'react'
import VideoTile from './VideoTile'
import { ViewMode, VoiceUser } from '../store/voiceStore'
import { ConnectionQuality } from '../services/connectionMonitor'

export interface VideoGridProps {
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  voiceUsers: VoiceUser[]
  currentUserId: string
  currentUsername: string
  viewMode: ViewMode
  activeSpeakerId: string | null
  screenShareUserId: string | null
  connectionQualities: Map<string, ConnectionQuality>
  isLocalMuted: boolean
  isLocalVideoEnabled: boolean
  isLocalSpeaking: boolean
  isLocalScreenSharing: boolean
}

/**
 * VideoGrid component for layout management
 * Implements Requirements 3.1, 3.5, 4.1, 4.2
 */
export default function VideoGrid({
  localStream,
  remoteStreams,
  voiceUsers,
  currentUserId,
  currentUsername,
  viewMode,
  activeSpeakerId,
  screenShareUserId,
  connectionQualities,
  isLocalMuted,
  isLocalVideoEnabled,
  isLocalSpeaking,
  isLocalScreenSharing,
}: VideoGridProps) {
  /**
   * Calculate grid columns based on participant count
   * Implements Requirement 3.1: Responsive grid layout
   */
  const calculateGridColumns = (participantCount: number): number => {
    if (participantCount === 1) return 1
    if (participantCount === 2) return 2
    if (participantCount <= 4) return 2
    if (participantCount <= 9) return 3
    if (participantCount <= 16) return 4
    return Math.ceil(Math.sqrt(participantCount))
  }

  // Total participants including local user
  const totalParticipants = voiceUsers.length + 1

  // Calculate grid columns for gallery mode
  const gridColumns = useMemo(
    () => calculateGridColumns(totalParticipants),
    [totalParticipants]
  )

  /**
   * Determine main video user for spotlight mode
   * Priority: screen share > active speaker > local user
   * Implements Requirement 4.2: Spotlight mode with main view
   */
  const mainVideoUserId = useMemo(() => {
    if (viewMode !== 'spotlight') return null

    // Priority 1: Screen share
    if (screenShareUserId) {
      return screenShareUserId
    }

    // Priority 2: Active speaker
    if (activeSpeakerId) {
      return activeSpeakerId
    }

    // Priority 3: Local user
    return currentUserId
  }, [viewMode, screenShareUserId, activeSpeakerId, currentUserId])

  /**
   * Get sidebar users for spotlight mode (all except main video)
   * Implements Requirement 4.2: Spotlight mode with sidebar
   */
  const sidebarUsers = useMemo(() => {
    if (viewMode !== 'spotlight') return []

    const allUsers = [
      { userId: currentUserId, isLocal: true },
      ...voiceUsers.map(u => ({ userId: u.userId, isLocal: false })),
    ]

    return allUsers.filter(u => u.userId !== mainVideoUserId)
  }, [viewMode, mainVideoUserId, currentUserId, voiceUsers])

  /**
   * Render gallery mode layout
   * Implements Requirement 4.1: Gallery mode with equal-sized grid
   */
  const renderGalleryMode = () => {
    return (
      <div
        className="video-grid-gallery"
        style={{
          gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
          gridAutoRows: 'minmax(0, 1fr)',
        }}
      >
        {/* Local user tile */}
        <VideoTile
          userId={currentUserId}
          username={currentUsername}
          stream={localStream}
          isLocal={true}
          isMuted={isLocalMuted}
          isVideoEnabled={isLocalVideoEnabled}
          isSpeaking={isLocalSpeaking}
          isScreenSharing={isLocalScreenSharing}
          connectionQuality={null}
          size="medium"
          showControls={true}
        />

        {/* Remote user tiles */}
        {voiceUsers.map(voiceUser => (
          <VideoTile
            key={voiceUser.userId}
            userId={voiceUser.userId}
            username={voiceUser.username}
            stream={remoteStreams.get(voiceUser.userId) || null}
            isLocal={false}
            isMuted={voiceUser.isMuted}
            isVideoEnabled={voiceUser.isVideoEnabled}
            isSpeaking={voiceUser.isSpeaking}
            isScreenSharing={screenShareUserId === voiceUser.userId}
            connectionQuality={connectionQualities.get(voiceUser.userId) || null}
            size="medium"
            showControls={true}
          />
        ))}
      </div>
    )
  }

  /**
   * Render spotlight mode layout
   * Implements Requirement 4.2: Spotlight mode with main view and sidebar
   */
  const renderSpotlightMode = () => {
    // Find the main video user data
    const isMainLocal = mainVideoUserId === currentUserId
    const mainVoiceUser = voiceUsers.find(u => u.userId === mainVideoUserId)

    return (
      <div className="video-grid-spotlight">
        {/* Main video view */}
        <div className="video-grid-spotlight-main">
          {isMainLocal ? (
            <VideoTile
              userId={currentUserId}
              username={currentUsername}
              stream={localStream}
              isLocal={true}
              isMuted={isLocalMuted}
              isVideoEnabled={isLocalVideoEnabled}
              isSpeaking={isLocalSpeaking}
              isScreenSharing={isLocalScreenSharing}
              connectionQuality={null}
              size="large"
              showControls={true}
            />
          ) : mainVoiceUser ? (
            <VideoTile
              userId={mainVoiceUser.userId}
              username={mainVoiceUser.username}
              stream={remoteStreams.get(mainVoiceUser.userId) || null}
              isLocal={false}
              isMuted={mainVoiceUser.isMuted}
              isVideoEnabled={mainVoiceUser.isVideoEnabled}
              isSpeaking={mainVoiceUser.isSpeaking}
              isScreenSharing={screenShareUserId === mainVoiceUser.userId}
              connectionQuality={connectionQualities.get(mainVoiceUser.userId) || null}
              size="large"
              showControls={true}
            />
          ) : null}
        </div>

        {/* Sidebar with other participants */}
        {/* Implements Requirement 3.5: Overflow handling with scrolling */}
        {sidebarUsers.length > 0 && (
          <div className="video-grid-spotlight-sidebar">
            {sidebarUsers.map(({ userId, isLocal }) => {
              if (isLocal) {
                return (
                  <VideoTile
                    key={userId}
                    userId={currentUserId}
                    username={currentUsername}
                    stream={localStream}
                    isLocal={true}
                    isMuted={isLocalMuted}
                    isVideoEnabled={isLocalVideoEnabled}
                    isSpeaking={isLocalSpeaking}
                    isScreenSharing={isLocalScreenSharing}
                    connectionQuality={null}
                    size="small"
                    showControls={false}
                  />
                )
              }

              const voiceUser = voiceUsers.find(u => u.userId === userId)
              if (!voiceUser) return null

              return (
                <VideoTile
                  key={userId}
                  userId={voiceUser.userId}
                  username={voiceUser.username}
                  stream={remoteStreams.get(voiceUser.userId) || null}
                  isLocal={false}
                  isMuted={voiceUser.isMuted}
                  isVideoEnabled={voiceUser.isVideoEnabled}
                  isSpeaking={voiceUser.isSpeaking}
                  isScreenSharing={screenShareUserId === voiceUser.userId}
                  connectionQuality={connectionQualities.get(voiceUser.userId) || null}
                  size="small"
                  showControls={false}
                />
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden">
      {viewMode === 'gallery' ? renderGalleryMode() : renderSpotlightMode()}
    </div>
  )
}
