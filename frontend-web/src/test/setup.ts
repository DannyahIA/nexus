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
