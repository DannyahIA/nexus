import { useState, useEffect, useRef } from 'react'
import { sfuWebRTCService } from '../services/sfuWebrtc'

interface SFUTestProps {
  roomId: string
  userId: string
}

interface RemoteStream {
  streamId: string
  stream: MediaStream
}

export default function SFUTest({ roomId, userId }: SFUTestProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [connectionStats, setConnectionStats] = useState<any>(null)
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())

  useEffect(() => {
    // Event listeners
    const handleRoomJoined = (data: any) => {
      console.log('✅ Room joined:', data)
      setIsConnected(true)
      setError(null)
    }

    const handleLocalStream = (stream: MediaStream) => {
      console.log('🎥 Local stream received')
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
    }

    const handleRemoteStream = (data: { streamId: string; stream: MediaStream }) => {
      console.log('🎬 Remote stream received:', data.streamId)
      setRemoteStreams(prev => [...prev, data])
    }

    const handleConnectionStateChange = (data: any) => {
      console.log('🔗 Connection state changed:', data.state)
      setConnectionStats(sfuWebRTCService.getConnectionStats())
    }

    const handleConnectionFailed = () => {
      console.error('❌ SFU connection failed')
      setError('Connection to SFU server failed')
      setIsConnected(false)
    }

    const handleSFUError = (error: any) => {
      console.error('❌ SFU error:', error)
      setError('SFU error occurred')
    }

    // Registrar event listeners
    sfuWebRTCService.on('room-joined', handleRoomJoined)
    sfuWebRTCService.on('local-stream', handleLocalStream)
    sfuWebRTCService.on('remote-stream', handleRemoteStream)
    sfuWebRTCService.on('connection-state-change', handleConnectionStateChange)
    sfuWebRTCService.on('connection-failed', handleConnectionFailed)
    sfuWebRTCService.on('sfu-error', handleSFUError)

    return () => {
      // Limpar event listeners
      sfuWebRTCService.off('room-joined', handleRoomJoined)
      sfuWebRTCService.off('local-stream', handleLocalStream)
      sfuWebRTCService.off('remote-stream', handleRemoteStream)
      sfuWebRTCService.off('connection-state-change', handleConnectionStateChange)
      sfuWebRTCService.off('connection-failed', handleConnectionFailed)
      sfuWebRTCService.off('sfu-error', handleSFUError)
    }
  }, [])

  // Atualizar videos remotos quando streams chegam
  useEffect(() => {
    remoteStreams.forEach(({ streamId, stream }) => {
      const videoElement = remoteVideosRef.current.get(streamId)
      if (videoElement) {
        videoElement.srcObject = stream
      }
    })
  }, [remoteStreams])

  const handleJoinRoom = async () => {
    try {
      setError(null)
      console.log(`🚪 Joining SFU room: ${roomId}`)
      await sfuWebRTCService.joinRoom(roomId, userId)
    } catch (error) {
      console.error('❌ Failed to join room:', error)
      setError('Failed to join room')
    }
  }

  const handleLeaveRoom = () => {
    console.log('🚪 Leaving SFU room')
    sfuWebRTCService.leaveRoom()
    setIsConnected(false)
    setRemoteStreams([])
    setConnectionStats(null)
  }

  const handleToggleVideo = async () => {
    try {
      const newState = await sfuWebRTCService.toggleVideo()
      setIsVideoEnabled(newState)
      console.log(`📹 Video ${newState ? 'enabled' : 'disabled'}`)
    } catch (error) {
      console.error('❌ Failed to toggle video:', error)
      setError('Failed to toggle video')
    }
  }

  const handleToggleAudio = async () => {
    try {
      const newState = await sfuWebRTCService.toggleAudio()
      setIsAudioEnabled(newState)
      console.log(`🎤 Audio ${newState ? 'enabled' : 'disabled'}`)
    } catch (error) {
      console.error('❌ Failed to toggle audio:', error)
      setError('Failed to toggle audio')
    }
  }

  const updateStats = () => {
    setConnectionStats(sfuWebRTCService.getConnectionStats())
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">SFU WebRTC Test</h1>
      
      {/* Status */}
      <div className="mb-6 p-4 rounded-lg bg-gray-100">
        <h2 className="text-lg font-semibold mb-2">Status</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Connected:</span>{' '}
            <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
              {isConnected ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div>
            <span className="font-medium">Room ID:</span> {roomId}
          </div>
          <div>
            <span className="font-medium">User ID:</span> {userId}
          </div>
          <div>
            <span className="font-medium">Remote Streams:</span> {remoteStreams.length}
          </div>
        </div>
        
        {error && (
          <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mb-6 p-4 rounded-lg bg-gray-100">
        <h2 className="text-lg font-semibold mb-3">Controls</h2>
        <div className="flex gap-2 flex-wrap">
          {!isConnected ? (
            <button
              onClick={handleJoinRoom}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Join Room
            </button>
          ) : (
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Leave Room
            </button>
          )}
          
          {isConnected && (
            <>
              <button
                onClick={handleToggleVideo}
                className={`px-4 py-2 rounded ${
                  isVideoEnabled 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                }`}
              >
                📹 Video {isVideoEnabled ? 'On' : 'Off'}
              </button>
              
              <button
                onClick={handleToggleAudio}
                className={`px-4 py-2 rounded ${
                  isAudioEnabled 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                }`}
              >
                🎤 Audio {isAudioEnabled ? 'On' : 'Off'}
              </button>
              
              <button
                onClick={updateStats}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
              >
                📊 Update Stats
              </button>
            </>
          )}
        </div>
      </div>

      {/* Connection Stats */}
      {connectionStats && (
        <div className="mb-6 p-4 rounded-lg bg-gray-100">
          <h2 className="text-lg font-semibold mb-3">Connection Statistics</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Connection State:</span>{' '}
              <span className={connectionStats.isConnected ? 'text-green-600' : 'text-red-600'}>
                {connectionStats.connectionState}
              </span>
            </div>
            <div>
              <span className="font-medium">ICE State:</span> {connectionStats.iceConnectionState}
            </div>
            <div>
              <span className="font-medium">Signaling State:</span> {connectionStats.signalingState}
            </div>
            <div>
              <span className="font-medium">Uptime:</span> {Math.round(connectionStats.uptime / 1000)}s
            </div>
          </div>
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Local Video */}
        <div className="bg-black rounded-lg overflow-hidden">
          <div className="bg-gray-800 text-white p-2 text-sm">
            Local Video ({userId})
          </div>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-48 object-cover"
          />
        </div>

        {/* Remote Videos */}
        {remoteStreams.map(({ streamId }) => (
          <div key={streamId} className="bg-black rounded-lg overflow-hidden">
            <div className="bg-gray-800 text-white p-2 text-sm">
              Remote Video ({streamId})
            </div>
            <video
              ref={(el) => {
                if (el) {
                  remoteVideosRef.current.set(streamId, el)
                }
              }}
              autoPlay
              playsInline
              className="w-full h-48 object-cover"
            />
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="mt-6 p-4 rounded-lg bg-blue-50">
        <h2 className="text-lg font-semibold mb-2">Instructions</h2>
        <ol className="list-decimal list-inside text-sm space-y-1">
          <li>Click "Join Room" to connect to the SFU server</li>
          <li>Allow camera and microphone permissions when prompted</li>
          <li>Toggle video and audio using the controls</li>
          <li>Open this page in another browser tab/window with different User ID to test multi-user functionality</li>
          <li>Check browser console for detailed logs</li>
        </ol>
      </div>
    </div>
  )
}
