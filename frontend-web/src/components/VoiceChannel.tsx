                                                import { useState, useEffect, useRef, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Grid, User, Activity } from 'lucide-react'
import { webrtcService } from '../services/webrtc'
import { useAuthStore } from '../store/authStore'
import { useVoiceStore } from '../store/voiceStore'
import VideoGrid from './VideoGrid'
import HealthCheckPanel from './HealthCheckPanel'
import { ViewMode } from '../store/voiceStore'
import FloatingLines from './FloatingLinesBackground'

interface VoiceChannelProps {
  channelId: string
  channelName: string
  onLeave: () => void
}

const WAVES_CONFIG: ("top" | "middle" | "bottom")[] = ['top', 'middle', 'bottom'];

const BackgroundLayer = memo(() => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <FloatingLines
        enabledWaves={WAVES_CONFIG}
        lineCount={3}
        lineDistance={50}
        bendRadius={5.0}
        bendStrength={-0.5}
        interactive={false}
        parallax={true}
      />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/40 to-black pointer-events-none" />
    </div>
  )
});
BackgroundLayer.displayName = 'BackgroundLayer';

export default function VoiceChannel({ channelId, channelName: _channelName, onLeave }: VoiceChannelProps) {
  const { t } = useTranslation('chat')
  const user = useAuthStore((state) => state.user)
  const voiceStore = useVoiceStore()
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [showHealthCheck, setShowHealthCheck] = useState(false)

  // Track previous view mode before screen share
  const previousViewModeRef = useRef<ViewMode>('gallery')

  useEffect(() => {
    const stream = webrtcService.getLocalStream()
    if (stream) {
      setLocalStream(stream)
      setIsConnected(true)
    }

    const handleLocalStream = (stream: MediaStream) => setLocalStream(stream)
    const handleRemoteStream = ({ userId, stream }: { userId: string; stream: MediaStream }) => {
      setRemoteStreams(prev => {
        const newMap = new Map(prev)
        newMap.set(userId, stream)
        return newMap
      })
    }

    const handleUserJoined = ({ userId, username }: { userId: string; username: string }) => {
      voiceStore.addVoiceUser({
        userId,
        username,
        isMuted: false,
        isSpeaking: false,
        isVideoEnabled: false,
      })
    }

    const handleUserLeft = ({ userId }: { userId: string }) => {
      voiceStore.removeVoiceUser(userId)
      setRemoteStreams(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId)
        return newMap
      })
    }

    const handleMuteStatusChanged = ({ userId, isMuted }: { userId: string; isMuted: boolean }) => {
      voiceStore.updateVoiceUser(userId, { isMuted })
    }

    const handleVideoStatusChanged = ({ userId, isVideoEnabled }: { userId: string; isVideoEnabled: boolean }) => {
      voiceStore.updateVoiceUser(userId, { isVideoEnabled })
    }

    const handleVideoStateChange = (state: { isEnabled: boolean; type: 'camera' | 'screen' | 'none' }) => {
      setIsVideoEnabled(state.isEnabled)
      setIsScreenSharing(state.type === 'screen')
      voiceStore.setVideoState(state)
      if (state.type === 'screen') {
        voiceStore.setScreenShareUser(user?.id || null)
      } else if (isScreenSharing) {
        voiceStore.setScreenShareUser(null)
      }
    }

    const handleScreenShareStarted = () => {
      setIsScreenSharing(true)
      if (user?.id) voiceStore.setScreenShareUser(user.id)
      previousViewModeRef.current = voiceStore.viewMode
      if (voiceStore.viewMode !== 'spotlight') {
        voiceStore.setViewMode('spotlight')
      }
    }

    const handleScreenShareStopped = () => {
      setIsScreenSharing(false)
      voiceStore.setScreenShareUser(null)
      voiceStore.setViewMode(previousViewModeRef.current)
    }

    const handleVideoError = ({ error }: { error: string }) => alert(error)
    const handleConnectionQualityChange = ({ userId, quality }: { userId: string; quality: any }) => {
      voiceStore.setConnectionQuality(userId, quality)
    }
    const handleReconnecting = ({ userId, attempt, maxAttempts }: { userId: string; attempt: number; maxAttempts: number }) => {
      voiceStore.setUserReconnecting(userId, attempt, maxAttempts)
    }
    const handleReconnectionFailed = ({ userId }: { userId: string }) => {
      voiceStore.clearUserReconnecting(userId)
    }
    const handleVoiceActivity = ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      if (userId === 'local') {
        setIsLocalSpeaking(isActive && !isMuted)
      } else {
        const voiceUser = voiceStore.voiceUsers.find(u => u.userId === userId)
        const shouldShowSpeaking = isActive && !voiceUser?.isMuted
        voiceStore.updateVoiceUser(userId, { isSpeaking: shouldShowSpeaking })
      }
    }
    const handleActiveSpeakerChange = ({ activeSpeaker }: { previousSpeaker: string | null; activeSpeaker: string | null }) => {
      const speakerId = activeSpeaker === 'local' ? (user?.id || null) : activeSpeaker
      voiceStore.setActiveSpeaker(speakerId)
    }
    const handleMuteStateChange = ({ isMuted }: { isMuted: boolean }) => setIsMuted(isMuted)

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
    }
  }, [channelId, user?.id])

  const handleToggleMute = () => {
    const newMuted = webrtcService.toggleMute()
    setIsMuted(newMuted)
  }

  const handleToggleVideo = async () => {
    try {
      await webrtcService.toggleVideo()
      const stream = webrtcService.getLocalStream()
      setLocalStream(stream)
    } catch (error) {
      console.error('Failed to toggle video:', error)
    }
  }

  const handleShareScreen = async () => {
    try {
      if (isScreenSharing) {
        await webrtcService.stopScreenShare()
      } else {
        await webrtcService.shareScreen()
      }
    } catch (error) {
      console.error('Failed to toggle screen share:', error)
    }
  }

  const handleLeave = () => {
    webrtcService.leaveVoiceChannel()
    onLeave()
  }

  const handleViewModeToggle = () => {
    const newMode: ViewMode = voiceStore.viewMode === 'gallery' ? 'spotlight' : 'gallery'
    if (!isScreenSharing) {
      previousViewModeRef.current = newMode
    }
    voiceStore.setViewMode(newMode)
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white relative overflow-hidden">
        <BackgroundLayer />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white/60">{t('connectingToVoice')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-black relative overflow-hidden">
      {/* Background */}
      <BackgroundLayer />

      {/* Video Grid - Relative z-10 to stay above background */}
      <div className="flex-1 min-h-0 relative z-10 p-4 pb-24">
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
      </div>

      {/* Floating Control Bar - "Google Meet Dock" style */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center gap-3 px-6 py-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 hover:bg-black/70 hover:scale-[1.02]">
        {/* Mute Toggle */}
        <button
          onClick={handleToggleMute}
          className={`p-3.5 rounded-xl transition-all duration-200 border ${isMuted
            ? 'bg-red-500/20 text-red-500 border-red-500/30 hover:bg-red-500/30'
            : 'bg-white/10 text-white/90 border-white/5 hover:bg-white/20'
            }`}
          title={isMuted ? t('unmuteMicrophone') : t('muteMicrophone')}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle */}
        <button
          onClick={handleToggleVideo}
          className={`p-3.5 rounded-xl transition-all duration-200 border ${!isVideoEnabled
            ? 'bg-red-500/20 text-red-500 border-red-500/30 hover:bg-red-500/30'
            : voiceStore.videoState.type === 'screen'
              ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
              : 'bg-white/10 text-white/90 border-white/5 hover:bg-white/20'
            }`}
          title={!isVideoEnabled ? t('turnOnCamera') : t('turnOffCamera')}
        >
          {voiceStore.videoState.type === 'screen' ? (
            <Monitor className="w-5 h-5" />
          ) : isVideoEnabled ? (
            <Video className="w-5 h-5" />
          ) : (
            <VideoOff className="w-5 h-5" />
          )}
        </button>

        {/* Screen Share */}
        <button
          onClick={handleShareScreen}
          className={`p-3.5 rounded-xl transition-all duration-200 border ${isScreenSharing
            ? 'bg-green-600 text-white border-green-500 hover:bg-green-500 shadow-lg shadow-green-900/40'
            : 'bg-white/10 text-white/90 border-white/5 hover:bg-white/20'
            }`}
          title={t('shareYourScreen')}
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* View Mode Toggle */}
        <button
          onClick={handleViewModeToggle}
          disabled={isScreenSharing}
          className={`p-3.5 rounded-xl transition-all duration-200 border bg-white/10 text-white/90 border-white/5 hover:bg-white/20 ${isScreenSharing ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={voiceStore.viewMode === 'gallery' ? t('switchToSpotlightMode') : t('switchToGalleryMode')}
        >
          {voiceStore.viewMode === 'gallery' ? <User className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
        </button>

        <div className="w-[1px] h-8 bg-white/10 mx-2" />

        {/* End Call - Distinct styling */}
        <button
          onClick={handleLeave}
          className="p-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white border border-red-500 transition-all duration-200 shadow-lg shadow-red-900/40 flex items-center gap-2 font-medium"
          title={t('leaveVoiceChannel')}
        >
          <PhoneOff className="w-5 h-5" />
        </button>

        {/* Secondary Actions (Smaller) */}
        <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-0 hover:opacity-100 transition-opacity">
          {/* Placeholder for settings if needed, hidden for minimal look by default unless hovered */}
        </div>
      </div>

      {/* Top Info Bar (Channel Name, Health) */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-3">
        <div className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-white/90">{_channelName || "Voice Channel"}</span>
        </div>
        <button
          onClick={() => setShowHealthCheck(true)}
          className="p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white/60 hover:text-white transition-colors"
        >
          <Activity className="w-4 h-4" />
        </button>
      </div>

      {showHealthCheck && (
        <HealthCheckPanel onClose={() => setShowHealthCheck(false)} />
      )}
    </div>
  )
}
