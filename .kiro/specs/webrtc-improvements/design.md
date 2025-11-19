# Design Document - WebRTC Voice/Video Improvements

## Overview

This design document outlines the architecture and implementation approach for improving the existing WebRTC voice and video chat system in Nexus. The current implementation provides basic peer-to-peer communication with WebSocket signaling. This design focuses on production-readiness, user experience enhancements, and scalability improvements.

The improvements are organized into three phases:
1. **Phase 1 (Critical)**: TURN integration, username fixes, connection quality, auto-reconnection
2. **Phase 2 (Enhanced UX)**: Voice activity detection, device selection, volume controls, keyboard shortcuts
3. **Phase 3 (Advanced)**: Screen sharing layouts, push-to-talk, bandwidth optimization, mobile support

## Architecture

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│  webrtcService.ts          │  VoiceChannel.tsx              │
│  - Peer connections        │  - Video grid UI               │
│  - Media streams           │  - Control bar                 │
│  - ICE handling            │  - User list                   │
├─────────────────────────────────────────────────────────────┤
│  websocket.ts              │  voiceStore.ts                 │
│  - Signaling messages      │  - Voice state                 │
│  - Event emitter           │  - User management             │
└─────────────────────────────────────────────────────────────┘
                              ↕
                    WebSocket Connection
                              ↕
┌─────────────────────────────────────────────────────────────┐
│              Backend (Go) - WebSocket Server                │
├─────────────────────────────────────────────────────────────┤
│  - Voice event routing                                      │
│  - User-to-user message forwarding                          │
│  - Channel broadcasting                                     │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    STUN/TURN Servers                        │
│  - Google STUN (current)                                    │
│  - coturn TURN (to be integrated)                           │
└─────────────────────────────────────────────────────────────┘
```

### Enhanced Architecture (After Improvements)

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
├──────────────────────┬──────────────────────────────────────┤
│  webrtcService.ts    │  New Modules                         │
│  - Peer connections  │  - connectionMonitor.ts              │
│  - Media streams     │  - audioProcessor.ts                 │
│  - ICE handling      │  - deviceManager.ts                  │
│  - TURN integration  │  - voiceActivityDetector.ts          │
│                      │  - bandwidthOptimizer.ts             │
├──────────────────────┼──────────────────────────────────────┤
│  VoiceChannel.tsx    │  New Components                      │
│  - Video grid        │  - ConnectionQualityIndicator.tsx    │
│  - Control bar       │  - DeviceSelector.tsx                │
│  - User list         │  - VolumeControl.tsx                 │
│                      │  - VoiceSettings.tsx                 │
│                      │  - ScreenShareLayout.tsx             │
├──────────────────────┴──────────────────────────────────────┤
│  voiceStore.ts (Enhanced)                                   │
│  - Connection state tracking                                │
│  - Device preferences                                       │
│  - Volume settings per user                                 │
│  - Keyboard shortcut bindings                               │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Enhanced WebRTC Service

**File**: `frontend-web/src/services/webrtc.ts`

**New Methods**:
```typescript
interface WebRTCService {
  // Existing methods...
  
  // TURN Integration
  configureTURNServer(config: TURNConfig): void
  
  // Connection Monitoring
  getConnectionStats(userId: string): Promise<RTCStatsReport>
  onConnectionStateChange(callback: (state: ConnectionState) => void): void
  
  // Device Management
  enumerateDevices(): Promise<MediaDeviceInfo[]>
  switchAudioDevice(deviceId: string): Promise<void>
  switchVideoDevice(deviceId: string): Promise<void>
  
  // Audio Processing
  enableNoiseSuppression(enabled: boolean): void
  enableEchoCancellation(enabled: boolean): void
  setAudioGain(userId: string, gain: number): void
  
  // Reconnection
  reconnect(): Promise<void>
  
  // Persistence
  saveState(): void
  restoreState(): Promise<boolean>
}

interface TURNConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

interface ConnectionState {
  userId: string
  state: 'connecting' | 'connected' | 'disconnected' | 'failed'
  quality: 'excellent' | 'good' | 'poor' | 'critical'
  stats: {
    latency: number
    packetLoss: number
    bandwidth: number
  }
}
```

### 2. Connection Monitor Module

**File**: `frontend-web/src/services/connectionMonitor.ts`

```typescript
class ConnectionMonitor {
  private connections: Map<string, RTCPeerConnection>
  private statsInterval: number = 1000 // 1 second
  
  startMonitoring(userId: string, connection: RTCPeerConnection): void
  stopMonitoring(userId: string): void
  getConnectionQuality(userId: string): ConnectionQuality
  onQualityChange(callback: (userId: string, quality: ConnectionQuality) => void): void
}

interface ConnectionQuality {
  state: RTCPeerConnectionState
  latency: number
  packetLoss: number
  bandwidth: number
  jitter: number
  quality: 'excellent' | 'good' | 'poor' | 'critical'
}
```

### 3. Voice Activity Detector

**File**: `frontend-web/src/services/voiceActivityDetector.ts`

```typescript
class VoiceActivityDetector {
  private audioContext: AudioContext
  private analyser: AnalyserNode
  private threshold: number = -50 // dB
  private smoothingFactor: number = 0.8
  
  attachToStream(stream: MediaStream): void
  detach(): void
  onVoiceActivity(callback: (isActive: boolean, level: number) => void): void
  setThreshold(threshold: number): void
}
```

### 4. Device Manager

**File**: `frontend-web/src/services/deviceManager.ts`

```typescript
class DeviceManager {
  async getAudioInputDevices(): Promise<MediaDeviceInfo[]>
  async getVideoInputDevices(): Promise<MediaDeviceInfo[]>
  async getAudioOutputDevices(): Promise<MediaDeviceInfo[]>
  
  async testAudioDevice(deviceId: string): Promise<MediaStream>
  async testVideoDevice(deviceId: string): Promise<MediaStream>
  
  getDefaultDevice(kind: MediaDeviceKind): MediaDeviceInfo | null
  saveDevicePreference(kind: MediaDeviceKind, deviceId: string): void
  getDevicePreference(kind: MediaDeviceKind): string | null
}
```

### 5. Bandwidth Optimizer

**File**: `frontend-web/src/services/bandwidthOptimizer.ts`

```typescript
class BandwidthOptimizer {
  private currentBandwidth: number
  private targetBandwidth: number
  private qualityLevels: QualityLevel[]
  
  monitorBandwidth(connection: RTCPeerConnection): void
  adjustQuality(stats: RTCStatsReport): void
  getCurrentQuality(): QualityLevel
  onQualityChange(callback: (level: QualityLevel) => void): void
}

interface QualityLevel {
  name: string
  maxWidth: number
  maxHeight: number
  maxFrameRate: number
  maxBitrate: number
}
```

### 6. New UI Components

#### ConnectionQualityIndicator.tsx
```typescript
interface ConnectionQualityIndicatorProps {
  userId: string
  quality: ConnectionQuality
  showDetails?: boolean
}
```

#### DeviceSelector.tsx
```typescript
interface DeviceSelectorProps {
  deviceKind: 'audioinput' | 'videoinput' | 'audiooutput'
  currentDeviceId: string
  onDeviceChange: (deviceId: string) => void
}
```

#### VolumeControl.tsx
```typescript
interface VolumeControlProps {
  userId: string
  username: string
  currentVolume: number
  onVolumeChange: (volume: number) => void
}
```

#### VoiceSettings.tsx
```typescript
interface VoiceSettingsProps {
  isOpen: boolean
  onClose: () => void
  currentSettings: VoiceSettings
  onSettingsChange: (settings: VoiceSettings) => void
}

interface VoiceSettings {
  audioDevice: string
  videoDevice: string
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
  pushToTalk: boolean
  pushToTalkKey: string
}
```

## Data Models

### Voice Store State (Enhanced)

```typescript
interface VoiceState {
  // Connection
  isConnected: boolean
  currentChannelId: string | null
  currentChannelName: string | null
  connectionState: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  
  // Controls
  isMuted: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  isPushToTalkMode: boolean
  isPushToTalkActive: boolean
  
  // Users
  voiceUsers: VoiceUser[]
  
  // Connection Quality
  connectionQuality: Map<string, ConnectionQuality>
  
  // Device Settings
  selectedAudioDevice: string | null
  selectedVideoDevice: string | null
  availableDevices: MediaDeviceInfo[]
  
  // Volume Settings
  userVolumes: Map<string, number> // userId -> volume (0-200)
  
  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts
  
  // Notifications
  notificationsEnabled: boolean
  
  // Persistence
  persistedState: PersistedVoiceState | null
}

interface VoiceUser {
  userId: string
  username: string
  isMuted: boolean
  isVideoEnabled: boolean
  isScreenSharing: boolean
  isSpeaking: boolean
  stream: MediaStream | null
  connectionQuality: 'excellent' | 'good' | 'poor' | 'critical'
}

interface KeyboardShortcuts {
  toggleMute: string // default: 'M'
  toggleVideo: string // default: 'V'
  toggleScreenShare: string // default: 'S'
  disconnect: string // default: 'D'
  pushToTalk: string // default: 'Space'
}

interface PersistedVoiceState {
  channelId: string
  isMuted: boolean
  isVideoEnabled: boolean
  timestamp: number
}
```

### Backend Message Types (Enhanced)

```typescript
// Existing types remain, plus:

interface VoiceUserJoinedMessage {
  type: 'voice:user-joined'
  userId: string
  username: string // NEW: include username
  channelId: string
  timestamp: string
}

interface VoiceConnectionQualityMessage {
  type: 'voice:connection-quality'
  userId: string
  quality: ConnectionQuality
}

interface VoiceReconnectMessage {
  type: 'voice:reconnect'
  channelId: string
  previousState: {
    isMuted: boolean
    isVideoEnabled: boolean
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Phase 1: Critical Improvements

**Property 1: TURN Configuration Presence**
*For any* peer connection attempt, the ICE servers configuration SHALL include at least one TURN server entry with valid credentials
**Validates: Requirements 1.1, 1.4**

**Property 2: TURN Fallback Activation**
*For any* peer connection that fails direct connectivity, the system SHALL attempt connection via TURN relay before declaring failure
**Validates: Requirements 1.2**

**Property 3: Username Inclusion in Join Events**
*For any* voice:user-joined event, the message payload SHALL contain a non-empty username field matching the joining user's actual username
**Validates: Requirements 2.1**

**Property 4: Username Display Consistency**
*For any* remote participant in voice, the displayed username SHALL match the username received in the voice:user-joined event
**Validates: Requirements 2.2, 2.4**

**Property 5: Connection State Monitoring**
*For any* established peer connection, the system SHALL continuously monitor and update connection state at intervals not exceeding 2 seconds
**Validates: Requirements 4.1**

**Property 6: Connection State UI Synchronization**
*For any* connection state change, the UI SHALL reflect the new state within 100ms
**Validates: Requirements 4.2**

**Property 7: Automatic Reconnection Trigger**
*For any* peer connection that transitions to 'disconnected' or 'failed' state, the system SHALL initiate reconnection within 1 second
**Validates: Requirements 5.1**

**Property 8: Reconnection State Preservation**
*For any* successful reconnection, the mute and video states after reconnection SHALL equal the states before disconnection
**Validates: Requirements 5.4**

**Property 9: WebSocket Reconnection Priority**
*For any* reconnection attempt, WebSocket connection SHALL be established before any peer connection attempts
**Validates: Requirements 5.5**

### Phase 2: Enhanced UX

**Property 10: Voice Activity Threshold Detection**
*For any* audio stream, when audio level exceeds the configured threshold, voice activity SHALL be detected within 100ms
**Validates: Requirements 3.1**

**Property 11: Speaking Indicator Display**
*For any* user with detected voice activity, a visual speaking indicator SHALL be displayed within 100ms of detection
**Validates: Requirements 3.2**

**Property 12: Speaking Indicator Removal Timing**
*For any* user whose audio level drops below threshold, the speaking indicator SHALL be removed after exactly 500ms ± 50ms
**Validates: Requirements 3.3**

**Property 13: Mute Suppresses Speaking Indicator**
*For any* user who is muted, speaking indicators SHALL never be displayed regardless of audio levels
**Validates: Requirements 3.5**

**Property 14: Device Enumeration Completeness**
*For any* device enumeration request, the returned list SHALL include all devices of the requested kind that the browser reports as available
**Validates: Requirements 7.1, 7.2**

**Property 15: Device Switch Preserves Connection**
*For any* device switch operation, all existing peer connections SHALL remain in 'connected' state throughout the switch
**Validates: Requirements 7.3, 7.4**

**Property 16: Volume Control Isolation**
*For any* volume adjustment for user A, the audio levels of all other users SHALL remain unchanged
**Validates: Requirements 9.2**

**Property 17: Volume Persistence Round-Trip**
*For any* volume setting change, retrieving the setting immediately after SHALL return the same value
**Validates: Requirements 9.4**

**Property 18: Keyboard Shortcut Response**
*For any* configured keyboard shortcut, pressing the key SHALL trigger the associated action within 50ms
**Validates: Requirements 10.1, 10.2, 10.3, 10.4**

**Property 19: Notification Sound Throttling**
*For any* sequence of join/leave events occurring within 2 seconds, at most 3 notification sounds SHALL play
**Validates: Requirements 11.5**

### Phase 3: Advanced Features

**Property 20: Screen Share Layout Transformation**
*For any* active screen share, the layout SHALL display the screen share in an area at least 2x larger than participant videos
**Validates: Requirements 6.1, 6.2**

**Property 21: Screen Share Layout Restoration**
*For any* screen share session, ending the share SHALL restore the layout to the state before sharing began
**Validates: Requirements 6.4**

**Property 22: Push-to-Talk Key State Mapping**
*For any* push-to-talk key press, microphone mute state SHALL be false while key is held and true when released
**Validates: Requirements 12.2, 12.3**

**Property 23: Noise Suppression Constraint Application**
*For any* audio capture with noise suppression enabled, the getUserMedia constraints SHALL include noiseSuppression: true
**Validates: Requirements 13.1**

**Property 24: Bandwidth Adaptation Trigger**
*For any* connection where available bandwidth drops below 500 kbps, video resolution SHALL be reduced within 2 seconds
**Validates: Requirements 14.1**

**Property 25: Quality Recovery Gradual Increase**
*For any* connection where bandwidth improves, video quality SHALL increase in steps no larger than one quality level per 5 seconds
**Validates: Requirements 14.3**

**Property 26: Session Storage Persistence**
*For any* active voice connection, the channel ID SHALL be present in session storage
**Validates: Requirements 16.1**

**Property 27: Page Refresh Rejoin**
*For any* page refresh while in voice, the system SHALL attempt to rejoin the stored channel within 2 seconds of page load
**Validates: Requirements 16.2**

**Property 28: State Restoration After Refresh**
*For any* successful rejoin after refresh, the mute and video states SHALL match the states before refresh
**Validates: Requirements 16.3**

**Property 29: Manual Leave Cleanup**
*For any* manual voice channel leave, session storage SHALL not contain voice channel data after leave completes
**Validates: Requirements 16.5**

## Error Handling

### Connection Errors

1. **ICE Connection Failure**
   - Retry with TURN server
   - Display connection error to user
   - Log detailed error information
   - Offer manual reconnect option

2. **Media Device Errors**
   - Detect permission denied
   - Show helpful error message with instructions
   - Offer to retry with different device
   - Fall back to audio-only if video fails

3. **WebSocket Disconnection**
   - Attempt automatic reconnection (3 attempts)
   - Maintain peer connections during WebSocket reconnect
   - Notify user if reconnection fails
   - Clear voice state if unable to reconnect

4. **TURN Server Unavailable**
   - Log TURN server failure
   - Attempt connection with STUN only
   - Notify user of potential connectivity issues
   - Provide troubleshooting information

### User Errors

1. **Invalid Device Selection**
   - Validate device exists before switching
   - Fall back to default device if selected unavailable
   - Notify user of fallback
   - Update UI to show actual device in use

2. **Bandwidth Insufficient**
   - Automatically reduce quality
   - Notify user of quality reduction
   - Offer audio-only mode
   - Provide bandwidth requirements information

3. **Browser Compatibility**
   - Detect WebRTC support on page load
   - Show clear error if unsupported
   - Provide list of supported browsers
   - Offer alternative communication methods

## Testing Strategy

### Unit Testing

**Framework**: Vitest

**Test Coverage**:
- WebRTC service methods
- Connection monitor logic
- Voice activity detection algorithms
- Device manager operations
- Bandwidth optimizer calculations
- Store state mutations
- UI component rendering

**Example Unit Tests**:
```typescript
describe('ConnectionMonitor', () => {
  it('should detect poor quality when packet loss exceeds 5%', () => {
    const monitor = new ConnectionMonitor()
    const quality = monitor.calculateQuality({ packetLoss: 0.06 })
    expect(quality).toBe('poor')
  })
  
  it('should emit quality change event when quality degrades', () => {
    const monitor = new ConnectionMonitor()
    const callback = vi.fn()
    monitor.onQualityChange(callback)
    monitor.updateStats({ packetLoss: 0.1 })
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      quality: 'poor'
    }))
  })
})
```

### Property-Based Testing

**Framework**: fast-check (JavaScript property-based testing library)

**Configuration**: Each property test should run a minimum of 100 iterations

**Test Tagging**: Each property-based test MUST include a comment with the format:
```typescript
// Feature: webrtc-improvements, Property X: [property description]
```

**Property Tests**:

1. **TURN Configuration Property Test**
```typescript
// Feature: webrtc-improvements, Property 1: TURN Configuration Presence
it('should always include TURN server in ICE configuration', () => {
  fc.assert(
    fc.property(
      fc.record({
        channelId: fc.uuid(),
        videoEnabled: fc.boolean()
      }),
      async (config) => {
        const service = new WebRTCService()
        await service.joinVoiceChannel(config.channelId, config.videoEnabled)
        const iceServers = service.getICEServers()
        const hasTURN = iceServers.some(server => 
          server.urls.toString().includes('turn:')
        )
        expect(hasTURN).toBe(true)
      }
    ),
    { numRuns: 100 }
  )
})
```

2. **Username Display Property Test**
```typescript
// Feature: webrtc-improvements, Property 4: Username Display Consistency
it('should display correct username for all remote participants', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        userId: fc.uuid(),
        username: fc.string({ minLength: 1, maxLength: 20 })
      }), { minLength: 1, maxLength: 10 }),
      (users) => {
        const store = useVoiceStore.getState()
        users.forEach(user => {
          store.addVoiceUser(user)
        })
        
        users.forEach(user => {
          const displayedUser = store.voiceUsers.find(u => u.userId === user.userId)
          expect(displayedUser?.username).toBe(user.username)
        })
      }
    ),
    { numRuns: 100 }
  )
})
```

3. **Voice Activity Detection Property Test**
```typescript
// Feature: webrtc-improvements, Property 10: Voice Activity Threshold Detection
it('should detect voice activity when audio exceeds threshold', () => {
  fc.assert(
    fc.property(
      fc.record({
        threshold: fc.integer({ min: -60, max: -30 }),
        audioLevel: fc.integer({ min: -60, max: 0 })
      }),
      (config) => {
        const detector = new VoiceActivityDetector()
        detector.setThreshold(config.threshold)
        const isActive = detector.checkLevel(config.audioLevel)
        
        if (config.audioLevel > config.threshold) {
          expect(isActive).toBe(true)
        } else {
          expect(isActive).toBe(false)
        }
      }
    ),
    { numRuns: 100 }
  )
})
```

4. **Volume Control Isolation Property Test**
```typescript
// Feature: webrtc-improvements, Property 16: Volume Control Isolation
it('should only affect target user volume', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        userId: fc.uuid(),
        initialVolume: fc.integer({ min: 0, max: 200 })
      }), { minLength: 2, maxLength: 5 }),
      fc.integer({ min: 0, max: 200 }),
      (users, newVolume) => {
        const store = useVoiceStore.getState()
        
        // Set initial volumes
        users.forEach(user => {
          store.setUserVolume(user.userId, user.initialVolume)
        })
        
        // Change one user's volume
        const targetUser = users[0]
        store.setUserVolume(targetUser.userId, newVolume)
        
        // Verify only target changed
        expect(store.userVolumes.get(targetUser.userId)).toBe(newVolume)
        users.slice(1).forEach(user => {
          expect(store.userVolumes.get(user.userId)).toBe(user.initialVolume)
        })
      }
    ),
    { numRuns: 100 }
  )
})
```

5. **State Persistence Round-Trip Property Test**
```typescript
// Feature: webrtc-improvements, Property 8: Reconnection State Preservation
it('should preserve mute and video state through reconnection', () => {
  fc.assert(
    fc.property(
      fc.record({
        channelId: fc.uuid(),
        isMuted: fc.boolean(),
        isVideoEnabled: fc.boolean()
      }),
      async (initialState) => {
        const service = new WebRTCService()
        const store = useVoiceStore.getState()
        
        // Set initial state
        await service.joinVoiceChannel(initialState.channelId, initialState.isVideoEnabled)
        if (initialState.isMuted) service.toggleMute()
        
        // Simulate disconnection and reconnection
        service.simulateDisconnection()
        await service.reconnect()
        
        // Verify state preserved
        expect(store.isMuted).toBe(initialState.isMuted)
        expect(store.isVideoEnabled).toBe(initialState.isVideoEnabled)
      }
    ),
    { numRuns: 100 }
  )
})
```

### Integration Testing

**Test Scenarios**:
1. Full voice channel join flow with TURN fallback
2. Device switching during active call
3. Reconnection after network interruption
4. Screen sharing with layout changes
5. Multiple users with voice activity detection
6. Bandwidth adaptation under varying network conditions

### Manual Testing Checklist

- [ ] Test with two users on same network
- [ ] Test with two users on different networks
- [ ] Test behind restrictive firewall (verify TURN usage)
- [ ] Test device switching (mic, camera)
- [ ] Test screen sharing
- [ ] Test reconnection scenarios
- [ ] Test keyboard shortcuts
- [ ] Test volume controls
- [ ] Test on mobile devices
- [ ] Test with poor network conditions
- [ ] Test accessibility with screen reader
- [ ] Test with keyboard-only navigation

## Performance Considerations

### Optimization Targets

1. **Connection Establishment**: < 2 seconds from join to audio
2. **Audio Latency**: < 300ms end-to-end
3. **Video Latency**: < 500ms end-to-end
4. **UI Responsiveness**: < 100ms for all user interactions
5. **Memory Usage**: < 200MB per active voice connection
6. **CPU Usage**: < 30% on modern hardware for 4-person call

### Optimization Strategies

1. **Lazy Loading**: Load voice components only when needed
2. **Web Workers**: Offload audio processing to workers
3. **Canvas Optimization**: Use hardware acceleration for video rendering
4. **Connection Pooling**: Reuse peer connections when possible
5. **Adaptive Quality**: Automatically adjust based on device capabilities
6. **Efficient State Updates**: Batch state changes to minimize re-renders

## Security Considerations

1. **TURN Credentials**: Store securely, rotate regularly
2. **Media Permissions**: Request only when needed, explain why
3. **Data Privacy**: No recording without explicit consent
4. **Encryption**: All media streams encrypted via DTLS-SRTP
5. **Authentication**: Verify user identity before allowing voice access
6. **Rate Limiting**: Prevent abuse of signaling server

## Deployment Strategy

### Phase 1 Rollout (Week 1-2)
- Deploy TURN server configuration
- Fix username display issues
- Add connection quality monitoring
- Implement auto-reconnection

### Phase 2 Rollout (Week 3-4)
- Deploy voice activity detection
- Add device selection UI
- Implement volume controls
- Add keyboard shortcuts

### Phase 3 Rollout (Week 5-6)
- Enhanced screen sharing layouts
- Push-to-talk mode
- Bandwidth optimization
- Mobile optimizations

### Monitoring and Metrics

Track the following metrics post-deployment:
- Connection success rate
- TURN usage percentage
- Average connection time
- Reconnection frequency
- Audio/video quality scores
- User engagement (time in voice)
- Error rates by type

