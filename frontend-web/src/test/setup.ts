// Test setup file for Vitest
import { vi } from 'vitest'

// Mock environment variables for testing
vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
vi.stubEnv('VITE_TURN_PASSWORD', 'testpassword')

// Mock WebRTC APIs that are not available in jsdom
global.RTCPeerConnection = vi.fn().mockImplementation(() => ({
  addTrack: vi.fn(),
  addIceCandidate: vi.fn(),
  createOffer: vi.fn().mockResolvedValue({}),
  createAnswer: vi.fn().mockResolvedValue({}),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  getSenders: vi.fn().mockReturnValue([]),
  onicecandidate: null,
  ontrack: null,
  onconnectionstatechange: null,
  connectionState: 'new',
})) as any

global.RTCSessionDescription = vi.fn().mockImplementation((init) => init) as any
global.RTCIceCandidate = vi.fn().mockImplementation((init) => init) as any

// Mock navigator.mediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: vi.fn().mockReturnValue([]),
      getAudioTracks: vi.fn().mockReturnValue([]),
      getVideoTracks: vi.fn().mockReturnValue([]),
      addTrack: vi.fn(),
    }),
    getDisplayMedia: vi.fn().mockResolvedValue({
      getTracks: vi.fn().mockReturnValue([]),
      getVideoTracks: vi.fn().mockReturnValue([]),
    }),
  },
  writable: true,
})

// Mock VoiceActivityDetector
vi.mock('../services/voiceActivityDetector', () => {
  class MockVoiceActivityDetector {
    attachToStream = vi.fn()
    detach = vi.fn()
    onVoiceActivity = vi.fn()
    cleanup = vi.fn()
  }
  return {
    VoiceActivityDetector: MockVoiceActivityDetector,
  }
})

// Mock ConnectionMonitor
vi.mock('../services/connectionMonitor', () => {
  return {
    connectionMonitor: {
      startMonitoring: vi.fn(),
      stopMonitoring: vi.fn(),
      getQuality: vi.fn().mockReturnValue({ quality: 'good', rtt: 50, packetLoss: 0 }),
      onQualityChange: vi.fn(),
    },
    ConnectionQuality: {},
  }
})

// Mock TrackManager
vi.mock('../services/trackManager', () => {
  class MockTrackManager {
    queueOperation = vi.fn((fn: any) => {
      if (typeof fn === 'function') {
        return fn()
      }
      return Promise.resolve(true)
    })
    getCurrentVideoTrack = vi.fn().mockReturnValue(null)
    getCurrentTrackType = vi.fn().mockReturnValue('none')
    cleanupTrack = vi.fn()
    reset = vi.fn()
  }
  return {
    TrackManager: MockTrackManager,
    TrackType: {
      CAMERA: 'camera',
      SCREEN: 'screen',
      NONE: 'none',
    },
  }
})
