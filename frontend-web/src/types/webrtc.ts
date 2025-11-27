// WebRTC Type Definitions for Stability Improvements

/**
 * Environment configuration for the application
 */
export interface EnvironmentConfig {
  apiUrl: string
  wsUrl: string
  turnUrl: string
  turnUsername: string
  turnPassword: string
  environment: 'development' | 'production' | 'test'
}

/**
 * Validation result for configuration checks
 */
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * WebRTC configuration
 */
export interface WebRTCConfig {
  turnUrl: string
  turnUsername: string
  turnPassword: string
}

/**
 * Connection state for a peer
 */
export interface ConnectionState {
  userId: string
  peerConnection: RTCPeerConnection
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  signalingState: RTCSignalingState
  lastActivity: number
  reconnectionAttempts: number
  isUsingTURN: boolean
}

/**
 * Media state for local or remote user
 */
export interface MediaState {
  hasAudio: boolean
  hasVideo: boolean
  videoType: 'camera' | 'screen' | 'none'
  isAudioEnabled: boolean
  isVideoEnabled: boolean
  audioTrackId: string | null
  videoTrackId: string | null
}

/**
 * Health check result for a peer connection
 */
export interface HealthCheckResult {
  peerId: string
  isHealthy: boolean
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  signalingState: RTCSignalingState
  issues: string[]
  recommendations: string[]
  timestamp: number
}

/**
 * Connection statistics for monitoring
 */
export interface ConnectionStatistics {
  totalConnections: number
  activeConnections: number
  failedConnections: number
  averageEstablishmentTime: number
  turnUsageRate: number
  iceCandidateTypeDistribution: Record<string, number>
}

/**
 * Diagnostic report for troubleshooting
 */
export interface DiagnosticReport {
  timestamp: number
  channelId: string
  localState: MediaState
  peerStates: Map<string, ConnectionState>
  healthChecks: HealthCheckResult[]
  recentErrors: ErrorLog[]
  connectionStatistics: ConnectionStatistics
  browserInfo: BrowserInfo
}

/**
 * Error log entry
 */
export interface ErrorLog {
  timestamp: number
  errorType: string
  errorName: string
  errorMessage: string
  stack?: string
  context: {
    operation: string
    peerId?: string
    channelId?: string
    connectionState?: string
    [key: string]: any
  }
  recoveryAttempted: boolean
  recoverySuccessful?: boolean
}

/**
 * Browser information for diagnostics
 */
export interface BrowserInfo {
  userAgent: string
  browser: string
  version: string
  platform: string
  supportsWebRTC: boolean
  supportsPageVisibility: boolean
}

/**
 * State inconsistency detection
 */
export interface StateInconsistency {
  type: 'missing-sender' | 'wrong-track' | 'disabled-track' | 'stale-connection'
  peerId: string
  expected: any
  actual: any
  severity: 'critical' | 'warning' | 'info'
  recommendation: string
}

/**
 * State conflict resolution
 */
export interface StateConflict {
  type: string
  localState: any
  remoteState: any
  timestamp: number
}

/**
 * Resolution for state conflicts
 */
export interface Resolution {
  action: 'use-local' | 'use-remote' | 'merge' | 'reset'
  newState: any
  reason: string
}

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
  errorType: string
  automatic: boolean
  retryable: boolean
  fallback?: () => Promise<void>
  userAction?: string
}

/**
 * Connection quality metrics
 */
export interface ConnectionQuality {
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  rtt: number
  packetLoss: number
  jitter?: number
  bandwidth?: number
}

/**
 * ICE candidate information
 */
export interface ICECandidateInfo {
  type: 'host' | 'srflx' | 'relay' | 'prflx'
  protocol: 'udp' | 'tcp'
  address: string
  port: number
  priority: number
}

/**
 * Reconnection configuration
 */
export interface ReconnectionConfig {
  maxAttempts: number
  backoffDelays: number[]
  timeout: number
}

/**
 * Background mode state
 */
export interface BackgroundModeState {
  isBackground: boolean
  lastVisibilityChange: number
  connectionsMaintained: boolean
}

/**
 * Voice user information
 */
export interface VoiceUser {
  userId: string
  username: string
  isMuted: boolean
  isSpeaking: boolean
  isVideoEnabled: boolean
}

/**
 * Video state
 */
export interface VideoState {
  isEnabled: boolean
  type: 'camera' | 'screen' | 'none'
}

/**
 * Track type
 */
export type TrackType = 'camera' | 'screen' | 'none'

/**
 * Track state
 */
export interface TrackState {
  type: TrackType
  track: MediaStreamTrack | null
  enabled: boolean
}

/**
 * WebRTC event types
 */
export type WebRTCEventType =
  | 'user-joined'
  | 'user-left'
  | 'stream-added'
  | 'stream-removed'
  | 'mute-changed'
  | 'video-changed'
  | 'speaking-changed'
  | 'connection-state-changed'
  | 'connection-quality-change'
  | 'video-state-change'
  | 'video-state-synchronized'
  | 'reconnection-started'
  | 'reconnection-succeeded'
  | 'reconnection-failed'
  | 'background-mode-changed'
  | 'health-check-completed'
  | 'error'

/**
 * WebRTC event data
 */
export interface WebRTCEvent {
  type: WebRTCEventType
  data: any
  timestamp: number
}

/**
 * CORS configuration for backend
 */
export interface CORSConfig {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  allowCredentials: boolean
  maxAge: number
}

/**
 * Environment mode
 */
export type EnvironmentMode = 'development' | 'production' | 'test'

/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Signaling message types
 */
export type SignalingMessageType =
  | 'voice:join'
  | 'voice:leave'
  | 'voice:offer'
  | 'voice:answer'
  | 'voice:ice-candidate'
  | 'voice:mute-status'
  | 'voice:video-status'
  | 'voice:existing-users'
  | 'voice:user-joined'
  | 'voice:user-left'

/**
 * Signaling message
 */
export interface SignalingMessage {
  type: SignalingMessageType
  channelId?: string
  userId?: string
  data?: any
  timestamp?: number
}
