import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VoiceActivityDetector } from './voiceActivityDetector'

// Mock AudioContext and related Web Audio API classes
const mockAnalyser = {
  fftSize: 2048,
  smoothingTimeConstant: 0.8,
  frequencyBinCount: 1024,
  getByteFrequencyData: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}

const mockSource = {
  connect: vi.fn(),
  disconnect: vi.fn(),
}

const mockAudioContext = {
  createAnalyser: vi.fn(() => mockAnalyser),
  createMediaStreamSource: vi.fn(() => mockSource),
  close: vi.fn(),
  state: 'running',
  resume: vi.fn(),
}

// Mock window.AudioContext
global.AudioContext = class {
  constructor() {
    return mockAudioContext as any
  }
} as any
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16)) as any
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id))

describe('VoiceActivityDetector', () => {
  let vad: VoiceActivityDetector
  let mockStream: MediaStream

  beforeEach(() => {
    vad = new VoiceActivityDetector()
    mockStream = {
      getTracks: () => [],
      getAudioTracks: () => [],
    } as any
    vi.clearAllMocks()
  })

  afterEach(() => {
    vad.detach()
  })

  it('should initialize with default threshold', () => {
    expect(vad.getThreshold()).toBe(-50)
    expect(vad.getIsActive()).toBe(false)
  })

  it('should allow setting threshold', () => {
    vad.setThreshold(-30)
    expect(vad.getThreshold()).toBe(-30)
  })

  it('should attach to stream and create audio nodes', () => {
    vad.attachToStream(mockStream)

    expect(mockAudioContext.createAnalyser).toHaveBeenCalled()
    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream)
    expect(mockSource.connect).toHaveBeenCalledWith(mockAnalyser)
  })

  it('should detect silence when audio level is below threshold', async () => {
    vad.attachToStream(mockStream)

    // Mock low audio level
    mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
      array.fill(0) // Silence
    })

    // Wait for monitoring loop
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should not be active (silence)
    expect(vad.getIsActive()).toBe(false)
  })

  it('should detect voice when audio level is above threshold', async () => {
    vad.attachToStream(mockStream)

    // Mock high audio level
    // 255 is max, so log10(1) = 0 dB, which is > -50 dB
    mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
      array.fill(200)
    })

    const callback = vi.fn()
    vad.onVoiceActivity(callback)

    // Wait for monitoring loop
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(callback).toHaveBeenCalled()
    const [isActive, level] = callback.mock.calls[callback.mock.calls.length - 1]
    expect(isActive).toBe(true)
    expect(level).toBeGreaterThan(-50)
  })

  it('should cleanup resources on detach', () => {
    vad.attachToStream(mockStream)
    vad.detach()

    expect(mockSource.disconnect).toHaveBeenCalled()
    expect(mockAudioContext.close).toHaveBeenCalled()
    expect(vad.getIsActive()).toBe(false)
  })

  it('checkLevel helper should work correctly', () => {
    vad.setThreshold(-40)
    expect(vad.checkLevel(-30)).toBe(true)
    expect(vad.checkLevel(-50)).toBe(false)
  })
})
