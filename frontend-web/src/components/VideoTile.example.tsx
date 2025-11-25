/**
 * Example usage of VideoTile component
 * This file demonstrates how to use the VideoTile component
 */

import VideoTile from './VideoTile'

// Example 1: Local user with video enabled
export function LocalUserExample() {
  const mockStream = new MediaStream()
  
  return (
    <VideoTile
      userId="local-user"
      username="John Doe"
      stream={mockStream}
      isLocal={true}
      isMuted={false}
      isVideoEnabled={true}
      isSpeaking={false}
      isScreenSharing={false}
      connectionQuality={null}
      size="medium"
    />
  )
}

// Example 2: Remote user with video disabled (avatar fallback)
export function RemoteUserAvatarExample() {
  return (
    <VideoTile
      userId="remote-user-1"
      username="Jane Smith"
      stream={null}
      isLocal={false}
      isMuted={false}
      isVideoEnabled={false}
      isSpeaking={false}
      isScreenSharing={false}
      connectionQuality={null}
      size="medium"
    />
  )
}

// Example 3: Remote user speaking
export function SpeakingUserExample() {
  const mockStream = new MediaStream()
  
  return (
    <VideoTile
      userId="remote-user-2"
      username="Bob Johnson"
      stream={mockStream}
      isLocal={false}
      isMuted={false}
      isVideoEnabled={true}
      isSpeaking={true}
      isScreenSharing={false}
      connectionQuality={null}
      size="medium"
    />
  )
}

// Example 4: User sharing screen
export function ScreenSharingExample() {
  const mockStream = new MediaStream()
  
  return (
    <VideoTile
      userId="remote-user-3"
      username="Alice Williams"
      stream={mockStream}
      isLocal={false}
      isMuted={false}
      isVideoEnabled={true}
      isSpeaking={false}
      isScreenSharing={true}
      connectionQuality={null}
      size="large"
    />
  )
}

// Example 5: Muted user
export function MutedUserExample() {
  const mockStream = new MediaStream()
  
  return (
    <VideoTile
      userId="remote-user-4"
      username="Charlie Brown"
      stream={mockStream}
      isLocal={false}
      isMuted={true}
      isVideoEnabled={true}
      isSpeaking={false}
      isScreenSharing={false}
      connectionQuality={null}
      size="medium"
    />
  )
}

// Example 6: User with poor connection quality
export function PoorConnectionExample() {
  const mockStream = new MediaStream()
  const poorQuality = {
    state: 'connected' as RTCPeerConnectionState,
    quality: 'poor' as const,
    latency: 250,
    packetLoss: 0.15,
    bandwidth: 500,
    jitter: 50,
  }
  
  return (
    <VideoTile
      userId="remote-user-5"
      username="David Lee"
      stream={mockStream}
      isLocal={false}
      isMuted={false}
      isVideoEnabled={true}
      isSpeaking={false}
      isScreenSharing={false}
      connectionQuality={poorQuality}
      size="medium"
    />
  )
}

// Example 7: Small size tile
export function SmallTileExample() {
  const mockStream = new MediaStream()
  
  return (
    <VideoTile
      userId="remote-user-6"
      username="Eve Martinez"
      stream={mockStream}
      isLocal={false}
      isMuted={false}
      isVideoEnabled={true}
      isSpeaking={false}
      isScreenSharing={false}
      connectionQuality={null}
      size="small"
    />
  )
}
