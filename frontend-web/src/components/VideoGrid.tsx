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

  /**
   * Determine users with video (camera or screen share) for priority display
   * Priority: screen share > camera > voice only
   */
  const usersWithVideo = useMemo(() => {
    const users: Array<{
      userId: string
      username: string
      isLocal: boolean
      hasVideo: boolean
      isScreenSharing: boolean
      priority: number // 1 = screen share, 2 = camera, 3 = voice only
    }> = []

    // Add local user
    const localPriority = isLocalScreenSharing ? 1 : isLocalVideoEnabled ? 2 : 3
    users.push({
      userId: currentUserId,
      username: currentUsername,
      isLocal: true,
      hasVideo: isLocalVideoEnabled || isLocalScreenSharing,
      isScreenSharing: isLocalScreenSharing,
      priority: localPriority,
    })

    // Add remote users
    voiceUsers.forEach(voiceUser => {
      const isScreenSharing = screenShareUserId === voiceUser.userId
      const priority = isScreenSharing ? 1 : voiceUser.isVideoEnabled ? 2 : 3
      users.push({
        userId: voiceUser.userId,
        username: voiceUser.username,
        isLocal: false,
        hasVideo: voiceUser.isVideoEnabled || isScreenSharing,
        isScreenSharing,
        priority,
      })
    })

    // Sort by priority (lower number = higher priority)
    return users.sort((a, b) => a.priority - b.priority)
  }, [
    currentUserId,
    currentUsername,
    isLocalVideoEnabled,
    isLocalScreenSharing,
    voiceUsers,
    screenShareUserId,
  ])

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
   * Get sidebar users for spotlight mode
   * In spotlight mode, ALL users appear in sidebar (including the one in main view)
   * This ensures screen sharing user has both large view and sidebar presence
   * Implements Requirement 4.2: Spotlight mode with sidebar
   */
  const sidebarUsers = useMemo(() => {
    if (viewMode !== 'spotlight') return []

    const allUsers = [
      { userId: currentUserId, isLocal: true },
      ...voiceUsers.map(u => ({ userId: u.userId, isLocal: false })),
    ]

    // Return all users for sidebar (including main video user)
    return allUsers
  }, [viewMode, currentUserId, voiceUsers])

  /**
   * Render gallery mode layout with priority-based display (Google Meet style)
   * Priority: screen share > camera > voice only
   * 
   * Layout logic:
   * - If screen share: Large screen share + horizontal strip of other users at bottom
   * - If only cameras: Grid layout with all users
   * - Voice-only users: Small tiles at bottom
   */
  const renderGalleryMode = () => {
    // Separate users by capability
    const screenShareUser = usersWithVideo.find(u => u.isScreenSharing)
    const videoUsers = usersWithVideo.filter(u => u.hasVideo && !u.isScreenSharing)
    const voiceOnlyUsers = usersWithVideo.filter(u => !u.hasVideo)
    
    // Google Meet style: Screen share takes priority
    if (screenShareUser) {
      // For bottom strip: Show all users with cameras (excluding screen share itself)
      // If local user is sharing screen, we still want to show their camera if available
      const cameraUsers = usersWithVideo.filter(u => !u.isScreenSharing)
      const allVoiceOnly = voiceOnlyUsers
      
      // Add all users to bottom strip
      const bottomStripUsers = [...cameraUsers, ...allVoiceOnly]
      
      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-dark-900">
          {/* Main screen share area - ONLY shows the screen share */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            {screenShareUser.isLocal ? (
              <VideoTile
                key={`screen-${screenShareUser.userId}`}
                userId={currentUserId}
                username={currentUsername}
                stream={localStream}
                isLocal={true}
                isMuted={isLocalMuted}
                isVideoEnabled={true}
                isSpeaking={isLocalSpeaking}
                isScreenSharing={true}
                connectionQuality={null}
                size="large"
                showControls={true}
              />
            ) : (
              <VideoTile
                key={`screen-${screenShareUser.userId}`}
                userId={screenShareUser.userId}
                username={screenShareUser.username}
                stream={remoteStreams.get(screenShareUser.userId) || null}
                isLocal={false}
                isMuted={voiceUsers.find(v => v.userId === screenShareUser.userId)?.isMuted || false}
                isVideoEnabled={true}
                isSpeaking={voiceUsers.find(v => v.userId === screenShareUser.userId)?.isSpeaking || false}
                isScreenSharing={true}
                connectionQuality={connectionQualities.get(screenShareUser.userId) || null}
                size="large"
                showControls={true}
              />
            )}
          </div>
          
          {/* Bottom strip with ALL participants including screen sharer's camera (Google Meet style) */}
          {bottomStripUsers.length > 0 && (
            <div className="h-32 flex items-center gap-2 px-4 pb-4 overflow-x-auto">
              {bottomStripUsers.map(user => {
                if (user.isLocal) {
                  return (
                    <div key={user.userId} className="flex-shrink-0 w-40 h-28">
                      <VideoTile
                        userId={currentUserId}
                        username={currentUsername}
                        stream={localStream}
                        isLocal={true}
                        isMuted={isLocalMuted}
                        isVideoEnabled={isLocalVideoEnabled}
                        isSpeaking={isLocalSpeaking}
                        isScreenSharing={false}
                        connectionQuality={null}
                        size="small"
                        showControls={false}
                      />
                    </div>
                  )
                }

                const voiceUser = voiceUsers.find(v => v.userId === user.userId)
                if (!voiceUser) return null

                return (
                  <div key={user.userId} className="flex-shrink-0 w-40 h-28">
                    <VideoTile
                      userId={voiceUser.userId}
                      username={voiceUser.username}
                      stream={remoteStreams.get(voiceUser.userId) || null}
                      isLocal={false}
                      isMuted={voiceUser.isMuted}
                      isVideoEnabled={voiceUser.isVideoEnabled}
                      isSpeaking={voiceUser.isSpeaking}
                      isScreenSharing={false}
                      connectionQuality={connectionQualities.get(voiceUser.userId) || null}
                      size="small"
                      showControls={false}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // No screen share: Regular grid layout
    const allUsers = [...videoUsers, ...voiceOnlyUsers]
    const gridColumns = calculateGridColumns(allUsers.length)

    return (
      <div className="flex-1 flex overflow-hidden bg-dark-900">
        <div
          className="flex-1 video-grid-gallery"
          style={{
            gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
            gridAutoRows: 'minmax(0, 1fr)',
          }}
        >
          {allUsers.map(user => {
            if (user.isLocal) {
              return (
                <VideoTile
                  key={user.userId}
                  userId={currentUserId}
                  username={currentUsername}
                  stream={localStream}
                  isLocal={true}
                  isMuted={isLocalMuted}
                  isVideoEnabled={isLocalVideoEnabled}
                  isSpeaking={isLocalSpeaking}
                  isScreenSharing={false}
                  connectionQuality={null}
                  size="medium"
                  showControls={true}
                />
              )
            }

            const voiceUser = voiceUsers.find(v => v.userId === user.userId)
            if (!voiceUser) return null

            return (
              <VideoTile
                key={user.userId}
                userId={voiceUser.userId}
                username={voiceUser.username}
                stream={remoteStreams.get(voiceUser.userId) || null}
                isLocal={false}
                isMuted={voiceUser.isMuted}
                isVideoEnabled={voiceUser.isVideoEnabled}
                isSpeaking={voiceUser.isSpeaking}
                isScreenSharing={false}
                connectionQuality={connectionQualities.get(voiceUser.userId) || null}
                size="medium"
                showControls={true}
              />
            )
          })}
        </div>
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
