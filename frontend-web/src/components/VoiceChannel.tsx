import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Volume2, Settings, Grid, User } from 'lucide-react'
import { webrtcService } from '../services/webrtc'
import { useAuthStore } from '../store/authStore'
import { useVoiceStore } from '../store/voiceStore'
import VideoGrid from './VideoGrid'
import { ViewMode } from '../store/voiceStore'

interface VoiceChannelProps {
  channelId: string
  channelName: string
  onLeave: () => void
}

export default function VoiceChannel({ channelId, channelName, onLeave }: VoiceChannelProps) {
  const user = useAuthStore((state) => state.user)
  const voiceStore = useVoiceStore()
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  
  // Track previous view mode before screen share (Requirement 4.5)
  const previousViewModeRef = useRef<ViewMode>('gallery')

  useEffect(() => {
    // Obter stream local já existente (foi criado no ChatScreen)
    const stream = webrtcService.getLocalStream()
    if (stream) {
      setLocalStream(stream)
      setIsConnected(true)
    }

    // Listeners para eventos WebRTC
    const handleLocalStream = (stream: MediaStream) => {
      setLocalStream(stream)
    }

    const handleRemoteStream = ({ userId, stream }: { userId: string; stream: MediaStream }) => {
      console.log('Remote stream received from', userId)

      // Store the stream separately from voiceStore
      setRemoteStreams(prev => {
        const newMap = new Map(prev)
        newMap.set(userId, stream)
        return newMap
      })
    }

    const handleUserJoined = ({ userId, username }: { userId: string; username: string }) => {
      console.log('User joined:', username, 'userId:', userId)
      console.log('Current voiceUsers before add:', voiceStore.voiceUsers)

      // Add user to voiceStore with username from event
      voiceStore.addVoiceUser({
        userId,
        username,
        isMuted: false,
        isSpeaking: false,
        isVideoEnabled: false,
      })

      console.log('Current voiceUsers after add:', voiceStore.voiceUsers)
    }

    const handleUserLeft = ({ userId }: { userId: string }) => {
      console.log('User left:', userId)

      // Remove user from voiceStore
      voiceStore.removeVoiceUser(userId)

      // Clean up remote stream
      setRemoteStreams(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId)
        return newMap
      })
    }

    const handleMuteStatusChanged = ({ userId, isMuted }: { userId: string; isMuted: boolean }) => {
      console.log('Mute status changed:', userId, isMuted)

      // Update user in voiceStore
      voiceStore.updateVoiceUser(userId, { isMuted })
    }

    const handleVideoStatusChanged = ({ userId, isVideoEnabled }: { userId: string; isVideoEnabled: boolean }) => {
      console.log('Video status changed:', userId, isVideoEnabled)

      // Update user in voiceStore
      voiceStore.updateVoiceUser(userId, { isVideoEnabled })
    }

    const handleVideoStateChange = (state: { isEnabled: boolean; type: 'camera' | 'screen' | 'none' }) => {
      console.log('Local video state changed:', state)

      // Update local video state
      setIsVideoEnabled(state.isEnabled)
      setIsScreenSharing(state.type === 'screen')

      // Update voice store with new video state
      voiceStore.setVideoState(state)

      // Update screen share user tracking
      if (state.type === 'screen') {
        voiceStore.setScreenShareUser(user?.id || null)
      } else if (isScreenSharing) {
        // Only clear if we were previously screen sharing
        voiceStore.setScreenShareUser(null)
      }
    }

    const handleScreenShareStarted = () => {
      console.log('Screen share started')
      setIsScreenSharing(true)
      if (user?.id) {
        voiceStore.setScreenShareUser(user.id)
      }
      
      // Requirement 4.4: Automatically switch to spotlight mode when screen share starts
      previousViewModeRef.current = voiceStore.viewMode
      if (voiceStore.viewMode !== 'spotlight') {
        console.log('📺 Switching to spotlight mode for screen share')
        voiceStore.setViewMode('spotlight')
      }
    }

    const handleScreenShareStopped = () => {
      console.log('Screen share stopped')
      setIsScreenSharing(false)
      voiceStore.setScreenShareUser(null)
      
      // Requirement 4.5: Return to previous view mode when screen share ends
      console.log('📺 Restoring previous view mode:', previousViewModeRef.current)
      voiceStore.setViewMode(previousViewModeRef.current)
    }

    const handleVideoError = ({ error }: { error: string }) => {
      console.error('Video error:', error)
      alert(error)
    }

    const handleConnectionQualityChange = ({ userId, quality }: { userId: string; quality: any }) => {
      console.log('Connection quality changed:', userId, quality.quality)

      // Update connection quality in voiceStore
      voiceStore.setConnectionQuality(userId, quality)
    }

    const handleReconnecting = ({ userId, attempt, maxAttempts }: { userId: string; attempt: number; maxAttempts: number }) => {
      console.log(`User ${userId} reconnecting: attempt ${attempt}/${maxAttempts}`)

      // Update reconnection state in voiceStore
      voiceStore.setUserReconnecting(userId, attempt, maxAttempts)
    }

    const handleReconnectionFailed = ({ userId }: { userId: string }) => {
      console.log(`User ${userId} reconnection failed`)

      // Clear reconnection state
      voiceStore.clearUserReconnecting(userId)
    }

    const handleVoiceActivity = ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      if (userId === 'local') {
        // Only show speaking indicator if not muted
        setIsLocalSpeaking(isActive && !isMuted)
      } else {
        // Only show speaking indicator if remote user is not muted
        const voiceUser = voiceStore.voiceUsers.find(u => u.userId === userId)
        const shouldShowSpeaking = isActive && !voiceUser?.isMuted
        voiceStore.updateVoiceUser(userId, { isSpeaking: shouldShowSpeaking })
      }
    }

    const handleActiveSpeakerChange = ({ activeSpeaker }: { previousSpeaker: string | null; activeSpeaker: string | null }) => {
      console.log('Active speaker changed to:', activeSpeaker)
      
      // Convert 'local' to actual user ID for consistency
      const speakerId = activeSpeaker === 'local' ? (user?.id || null) : activeSpeaker
      
      // Update voice store with new active speaker
      voiceStore.setActiveSpeaker(speakerId)
    }

    const handleMuteStateChange = ({ isMuted }: { isMuted: boolean }) => {
      console.log('Local mute state changed:', isMuted)
      
      // Update local mute state
      setIsMuted(isMuted)
    }

    webrtcService.on('local-stream', handleLocalStream)
    webrtcService.on('remote-stream', handleRemoteStream)
    webrtcService.on('user-joined', handleUserJoined)
    webrtcService.on('user-left', handleUserLeft)
    webrtcService.on('mute-status-changed', handleMuteStatusChanged)
    webrtcService.on('video-status-changed', handleVideoStatusChanged)
    webrtcService.on('video-state-change', handleVideoStateChange)
    webrtcService.on('screen-share-started', handleScreenShareStarted)
    webrtcService.on('screen-share-stopped', handleScreenShareStopped)
    webrtcService.on('video-error', handleVideoError)
    webrtcService.on('connection-quality-change', handleConnectionQualityChange)
    webrtcService.on('reconnecting', handleReconnecting)
    webrtcService.on('reconnection-failed', handleReconnectionFailed)
    webrtcService.on('voice-activity', handleVoiceActivity)
    webrtcService.on('active-speaker-change', handleActiveSpeakerChange)
    webrtcService.on('mute-state-change', handleMuteStateChange)

    return () => {
      webrtcService.off('local-stream', handleLocalStream)
      webrtcService.off('remote-stream', handleRemoteStream)
      webrtcService.off('user-joined', handleUserJoined)
      webrtcService.off('user-left', handleUserLeft)
      webrtcService.off('mute-status-changed', handleMuteStatusChanged)
      webrtcService.off('video-status-changed', handleVideoStatusChanged)
      webrtcService.off('video-state-change', handleVideoStateChange)
      webrtcService.off('screen-share-started', handleScreenShareStarted)
      webrtcService.off('screen-share-stopped', handleScreenShareStopped)
      webrtcService.off('video-error', handleVideoError)
      webrtcService.off('connection-quality-change', handleConnectionQualityChange)
      webrtcService.off('reconnecting', handleReconnecting)
      webrtcService.off('reconnection-failed', handleReconnectionFailed)
      webrtcService.off('voice-activity', handleVoiceActivity)
      webrtcService.off('active-speaker-change', handleActiveSpeakerChange)
      webrtcService.off('mute-state-change', handleMuteStateChange)
      // NÃO chamar leaveVoiceChannel aqui - deixar o ChatScreen gerenciar
    }
  }, [channelId, user?.id])

  const handleToggleMute = () => {
    const newMuted = webrtcService.toggleMute()
    setIsMuted(newMuted)
  }

  const handleToggleVideo = async () => {
    try {
      // Requirement 5.1: Video toggle button reflects camera/screen state
      // State is managed by WebRTC Service and synced via events
      await webrtcService.toggleVideo()
      
      // Update stream local
      const stream = webrtcService.getLocalStream()
      setLocalStream(stream)
    } catch (error) {
      console.error('Failed to toggle video:', error)
      // Error will be handled by video-error event listener
    }
  }

  const handleShareScreen = async () => {
    try {
      // Requirement 5.2, 5.3: Screen share button with distinct active state
      // State is managed by WebRTC Service and synced via events
      if (isScreenSharing) {
        // Stop screen sharing and return to camera
        await webrtcService.stopScreenShare()
        // State will be updated by screen-share-stopped and video-state-change events
      } else {
        await webrtcService.shareScreen()
        // State will be updated by screen-share-started and video-state-change events
      }
    } catch (error) {
      console.error('Failed to toggle screen share:', error)
      // Error will be handled by video-error event listener
    }
  }

  const handleLeave = () => {
    webrtcService.leaveVoiceChannel()
    onLeave()
  }

  const handleViewModeToggle = () => {
    // Toggle between gallery and spotlight modes
    const newMode: ViewMode = voiceStore.viewMode === 'gallery' ? 'spotlight' : 'gallery'
    console.log('📺 Toggling view mode to:', newMode)
    
    // Update previous view mode ref if not currently screen sharing
    if (!isScreenSharing) {
      previousViewModeRef.current = newMode
    }
    
    voiceStore.setViewMode(newMode)
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-dark-400">Conectando ao canal de voz...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-900">
      {/* Header */}
      <div className="h-14 bg-dark-800 border-b border-dark-700 flex items-center px-4">
        <Volume2 className="w-5 h-5 text-green-500 mr-3" />
        <h2 className="font-semibold">{channelName}</h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-dark-400">
            {voiceStore.voiceUsers.length + 1} {voiceStore.voiceUsers.length === 0 ? 'pessoa' : 'pessoas'}
          </span>
        </div>
      </div>

      {/* Video Grid - Using new VideoGrid component */}
      <VideoGrid
        localStream={localStream}
        remoteStreams={remoteStreams}
        voiceUsers={voiceStore.voiceUsers}
        currentUserId={user?.id || ''}
        currentUsername={user?.username || 'User'}
        viewMode={voiceStore.viewMode}
        activeSpeakerId={voiceStore.activeSpeakerId}
        screenShareUserId={voiceStore.screenShareUserId}
        connectionQualities={voiceStore.connectionQualities}
        isLocalMuted={isMuted}
        isLocalVideoEnabled={isVideoEnabled}
        isLocalSpeaking={isLocalSpeaking}
        isLocalScreenSharing={isScreenSharing}
      />

      {/* Controls - Requirements 5.1, 5.2, 5.3 */}
      <div className="h-20 bg-dark-800 border-t border-dark-700 flex items-center justify-center gap-4 px-4">
        {/* Mute Toggle */}
        <button
          onClick={handleToggleMute}
          className={`control-button ${isMuted ? 'control-button-muted' : 'bg-dark-700 hover:bg-dark-600'}`}
          title={isMuted ? 'Unmute microphone (Ctrl+D)' : 'Mute microphone (Ctrl+D)'}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle - Requirement 5.1: Reflects camera/screen state */}
        <button
          onClick={handleToggleVideo}
          className={`control-button ${
            !isVideoEnabled
              ? 'control-button-video-off'
              : voiceStore.videoState.type === 'screen'
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-dark-700 hover:bg-dark-600'
            }`}
          title={
            voiceStore.videoState.type === 'screen'
              ? 'Turn off screen share (Ctrl+E)'
              : isVideoEnabled
              ? 'Turn off camera (Ctrl+E)'
              : 'Turn on camera (Ctrl+E)'
          }
          aria-label={
            voiceStore.videoState.type === 'screen'
              ? 'Screen sharing active'
              : isVideoEnabled
              ? 'Camera on'
              : 'Camera off'
          }
        >
          {voiceStore.videoState.type === 'screen' ? (
            <Monitor className="w-5 h-5" />
          ) : isVideoEnabled ? (
            <Video className="w-5 h-5" />
          ) : (
            <VideoOff className="w-5 h-5" />
          )}
          {/* Visual indicator for screen share via video button */}
          {voiceStore.videoState.type === 'screen' && (
            <span className="indicator-dot bg-blue-400" />
          )}
        </button>

        {/* Screen Share Toggle - Requirements 5.2, 5.3: Distinct active state */}
        <button
          onClick={handleShareScreen}
          className={`control-button ${isScreenSharing ? 'control-button-screen-sharing' : 'bg-dark-700 hover:bg-dark-600'}`}
          title={
            isScreenSharing 
              ? 'Stop sharing screen' 
              : 'Share your screen'
          }
          aria-label={
            isScreenSharing 
              ? 'Stop screen sharing' 
              : 'Start screen sharing'
          }
        >
          <Monitor className="w-5 h-5" />
          {/* Pulsing indicator when screen sharing is active */}
          {isScreenSharing && (
            <span className="indicator-dot bg-green-400" />
          )}
        </button>

        {/* View Mode Toggle */}
        <button
          onClick={handleViewModeToggle}
          disabled={isScreenSharing}
          className={`view-mode-toggle ${voiceStore.viewMode === 'spotlight' && !isScreenSharing ? 'view-mode-toggle-active' : ''}`}
          title={
            isScreenSharing 
              ? 'View mode locked during screen share'
              : voiceStore.viewMode === 'gallery' 
              ? 'Switch to Spotlight mode' 
              : 'Switch to Gallery mode'
          }
          aria-label={
            isScreenSharing 
              ? 'View mode locked'
              : voiceStore.viewMode === 'gallery' 
              ? 'Switch to Spotlight mode' 
              : 'Switch to Gallery mode'
          }
        >
          {voiceStore.viewMode === 'gallery' ? (
            <User className="w-5 h-5" />
          ) : (
            <Grid className="w-5 h-5" />
          )}
        </button>

        {/* Settings */}
        <button
          className="control-button bg-dark-700 hover:bg-dark-600"
          title="Audio and video settings"
          aria-label="Audio and video settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Disconnect */}
        <button
          onClick={handleLeave}
          className="control-button bg-red-600 hover:bg-red-700 ml-4"
          title="Leave voice channel"
          aria-label="Leave voice channel"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
