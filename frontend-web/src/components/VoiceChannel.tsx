import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Volume2, Settings } from 'lucide-react'
import { webrtcService } from '../services/webrtc'
import { useAuthStore } from '../store/authStore'
import { useVoiceStore } from '../store/voiceStore'
import ConnectionQualityIndicator from './ConnectionQualityIndicator'

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
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())

  useEffect(() => {
    // Obter stream local já existente (foi criado no ChatScreen)
    const stream = webrtcService.getLocalStream()
    if (stream) {
      setLocalStream(stream)
      setIsConnected(true)
      
      // Exibir vídeo local
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
    }

    // Listeners para eventos WebRTC
    const handleLocalStream = (stream: MediaStream) => {
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
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

    webrtcService.on('local-stream', handleLocalStream)
    webrtcService.on('remote-stream', handleRemoteStream)
    webrtcService.on('user-joined', handleUserJoined)
    webrtcService.on('user-left', handleUserLeft)
    webrtcService.on('mute-status-changed', handleMuteStatusChanged)
    webrtcService.on('video-status-changed', handleVideoStatusChanged)
    webrtcService.on('connection-quality-change', handleConnectionQualityChange)
    webrtcService.on('reconnecting', handleReconnecting)
    webrtcService.on('reconnection-failed', handleReconnectionFailed)

    return () => {
      webrtcService.off('local-stream', handleLocalStream)
      webrtcService.off('remote-stream', handleRemoteStream)
      webrtcService.off('user-joined', handleUserJoined)
      webrtcService.off('user-left', handleUserLeft)
      webrtcService.off('mute-status-changed', handleMuteStatusChanged)
      webrtcService.off('video-status-changed', handleVideoStatusChanged)
      webrtcService.off('connection-quality-change', handleConnectionQualityChange)
      webrtcService.off('reconnecting', handleReconnecting)
      webrtcService.off('reconnection-failed', handleReconnectionFailed)
      // NÃO chamar leaveVoiceChannel aqui - deixar o ChatScreen gerenciar
    }
  }, [channelId])

  // Atualizar vídeos remotos quando streams mudarem
  useEffect(() => {
    remoteStreams.forEach((stream, userId) => {
      const videoElement = remoteVideosRef.current.get(userId)
      if (videoElement) {
        videoElement.srcObject = stream
      }
    })
  }, [remoteStreams])

  const handleToggleMute = () => {
    const newMuted = webrtcService.toggleMute()
    setIsMuted(newMuted)
  }

  const handleToggleVideo = async () => {
    if (!isVideoEnabled && !localStream?.getVideoTracks().length) {
      // Precisa obter permissão de vídeo
      try {
        const success = await webrtcService.addVideoTrack()
        if (success) {
          setIsVideoEnabled(true)
          // Atualizar stream local
          const stream = webrtcService.getLocalStream()
          setLocalStream(stream)
        }
      } catch (error) {
        console.error('Failed to enable video:', error)
        alert('Não foi possível acessar a câmera')
      }
    } else {
      const newVideoEnabled = webrtcService.toggleVideo()
      setIsVideoEnabled(newVideoEnabled)
    }
  }

  const handleShareScreen = async () => {
    if (isScreenSharing) {
      // Parar compartilhamento e voltar para câmera
      const success = await webrtcService.stopScreenShare()
      if (success) {
        setIsScreenSharing(false)
      }
    } else {
      const success = await webrtcService.shareScreen()
      if (success) {
        setIsScreenSharing(true)
      }
    }
  }

  const handleLeave = () => {
    webrtcService.leaveVoiceChannel()
    onLeave()
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

      {/* Video Grid */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Local Video */}
          <div className="relative bg-dark-800 rounded-lg overflow-hidden aspect-video">
            {isVideoEnabled ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-dark-700">
                <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center text-4xl font-bold mb-4">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="text-lg font-medium">{user?.username}</div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
              {user?.username} (você)
            </div>
            {isMuted && (
              <div className="absolute top-2 right-2 bg-red-600 p-2 rounded-full">
                <MicOff className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Remote Videos */}
          {voiceStore.voiceUsers.map(voiceUser => {
            const stream = remoteStreams.get(voiceUser.userId)
            const quality = voiceStore.connectionQualities.get(voiceUser.userId)
            return (
              <div key={voiceUser.userId} className="relative bg-dark-800 rounded-lg overflow-hidden aspect-video">
                {/* Always render video element for audio, but hide if video is disabled */}
                <video
                  ref={el => {
                    if (el) {
                      remoteVideosRef.current.set(voiceUser.userId, el)
                      // Set stream immediately when element is created
                      if (stream) {
                        el.srcObject = stream
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  className={voiceUser.isVideoEnabled ? "w-full h-full object-cover" : "hidden"}
                />
                {!voiceUser.isVideoEnabled && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-dark-700">
                    <div className="w-24 h-24 rounded-full bg-primary-600 flex items-center justify-center text-4xl font-bold mb-4">
                      {voiceUser.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="text-lg font-medium">{voiceUser.username}</div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
                  {voiceUser.username}
                </div>
                {voiceUser.isMuted && (
                  <div className="absolute top-2 right-2 bg-red-600 p-2 rounded-full">
                    <MicOff className="w-4 h-4" />
                  </div>
                )}
                {/* Connection Quality Indicator */}
                <div className="absolute top-2 left-2">
                  <ConnectionQualityIndicator
                    userId={voiceUser.userId}
                    quality={quality || null}
                    showDetails={false}
                  />
                </div>
                {voiceUser.isSpeaking && (
                  <div className="absolute inset-0 border-4 border-green-500 rounded-lg pointer-events-none"></div>
                )}
                {/* Warning for poor quality */}
                {quality && (quality.quality === 'poor' || quality.quality === 'critical') && (
                  <div className="absolute bottom-2 right-2 bg-yellow-600/90 px-2 py-1 rounded text-xs">
                    Poor connection
                  </div>
                )}
                {/* Error state - connection failed */}
                {quality && (quality.state === 'failed' || quality.state === 'closed') && !voiceStore.reconnectingUsers.has(voiceUser.userId) && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                    <div className="text-red-500 text-center">
                      <div className="text-lg font-semibold mb-1">Connection Lost</div>
                      <div className="text-sm text-dark-300">Unable to connect to {voiceUser.username}</div>
                    </div>
                    <button
                      onClick={() => {
                        console.log('Manual reconnect requested for', voiceUser.userId)
                        webrtcService.manualReconnect(voiceUser.userId)
                      }}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded text-sm font-medium transition-colors"
                    >
                      Reconnect
                    </button>
                  </div>
                )}
                {/* Reconnecting state */}
                {quality && quality.state === 'connecting' && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                      <div className="text-sm text-dark-300">Connecting...</div>
                    </div>
                  </div>
                )}
                {/* Disconnected state */}
                {quality && quality.state === 'disconnected' && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-center text-orange-500">
                      <div className="text-sm font-medium">Reconnecting...</div>
                    </div>
                  </div>
                )}
                {/* Reconnection attempt indicator */}
                {voiceStore.reconnectingUsers.has(voiceUser.userId) && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-2"></div>
                    <div className="text-center">
                      <div className="text-sm font-medium text-primary-400">Reconnecting...</div>
                      <div className="text-xs text-dark-400 mt-1">
                        Attempt {voiceStore.reconnectingUsers.get(voiceUser.userId)?.attempt} of {voiceStore.reconnectingUsers.get(voiceUser.userId)?.maxAttempts}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="h-20 bg-dark-800 border-t border-dark-700 flex items-center justify-center gap-4 px-4">
        {/* Mute */}
        <button
          onClick={handleToggleMute}
          className={`p-4 rounded-full transition-colors ${
            isMuted
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-dark-700 hover:bg-dark-600'
          }`}
          title={isMuted ? 'Desmutar' : 'Mutar'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video */}
        <button
          onClick={handleToggleVideo}
          className={`p-4 rounded-full transition-colors ${
            !isVideoEnabled
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-dark-700 hover:bg-dark-600'
          }`}
          title={isVideoEnabled ? 'Desligar câmera' : 'Ligar câmera'}
        >
          {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Screen Share */}
        <button
          onClick={handleShareScreen}
          className={`p-4 rounded-full transition-colors ${
            isScreenSharing
              ? 'bg-primary-600 hover:bg-primary-700'
              : 'bg-dark-700 hover:bg-dark-600'
          }`}
          title="Compartilhar tela"
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Settings */}
        <button
          className="p-4 rounded-full bg-dark-700 hover:bg-dark-600 transition-colors"
          title="Configurações"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Disconnect */}
        <button
          onClick={handleLeave}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-colors ml-4"
          title="Desconectar"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
