import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { ConnectionMonitor, ConnectionQuality } from './connectionMonitor'

// Feature: webrtc-improvements, Property 5: Connection State Monitoring
// Validates: Requirements 4.1

describe('ConnectionMonitor - Property Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Property 5: Connection State Monitoring', () => {
    it('should continuously monitor and update connection state at intervals not exceeding 2 seconds for any established peer connection', async () => {
      // Property: For any established peer connection, the system SHALL continuously
      // monitor and update connection state at intervals not exceeding 2 seconds
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            // Generate different connection states to test
            connectionStates: fc.array(
              fc.constantFrom(
                'new' as RTCPeerConnectionState,
                'connecting' as RTCPeerConnectionState,
                'connected' as RTCPeerConnectionState,
                'disconnected' as RTCPeerConnectionState,
                'failed' as RTCPeerConnectionState,
                'closed' as RTCPeerConnectionState
              ),
              { minLength: 1, maxLength: 5 }
            ),
            // Generate realistic stats values
            latency: fc.integer({ min: 0, max: 1000 }),
            packetLoss: fc.double({ min: 0, max: 0.5 }),
            bandwidth: fc.integer({ min: 0, max: 10000 }),
            jitter: fc.integer({ min: 0, max: 100 }),
          }),
          async (testCase) => {
            const monitor = new ConnectionMonitor()
            
            // Track quality change callbacks
            const qualityChanges: Array<{ userId: string; quality: ConnectionQuality }> = []
            monitor.onQualityChange((userId, quality) => {
              qualityChanges.push({ userId, quality })
            })

            // Create mock peer connection
            const mockStats = new Map()
            
            // Add inbound-rtp stats for audio
            mockStats.set('inbound-rtp-audio', {
              type: 'inbound-rtp',
              kind: 'audio',
              packetsLost: Math.floor(testCase.packetLoss * 1000),
              packetsReceived: 1000,
              jitter: testCase.jitter / 1000, // Convert to seconds
              timestamp: Date.now(),
              bytesReceived: 50000,
              ssrc: 12345,
            })

            // Add candidate-pair stats for latency
            mockStats.set('candidate-pair', {
              type: 'candidate-pair',
              state: 'succeeded',
              currentRoundTripTime: testCase.latency / 1000, // Convert to seconds
              timestamp: Date.now(),
            })

            const mockPeerConnection = {
              connectionState: testCase.connectionStates[0],
              getStats: vi.fn().mockResolvedValue(mockStats),
              onconnectionstatechange: null as (() => void) | null,
            } as unknown as RTCPeerConnection

            // Start monitoring
            monitor.startMonitoring(testCase.userId, mockPeerConnection)

            // PROPERTY VERIFICATION 1: Initial quality should be set immediately
            const initialQuality = monitor.getConnectionQuality(testCase.userId)
            expect(initialQuality).toBeDefined()
            expect(initialQuality?.state).toBe(testCase.connectionStates[0])

            // PROPERTY VERIFICATION 2: Stats should be collected at intervals not exceeding 2 seconds
            // We'll verify by advancing time and checking that stats are collected
            
            // Advance time by 1 second (within the 2-second requirement)
            await vi.advanceTimersByTimeAsync(1000)
            
            // Stats should have been collected at least once
            expect(mockPeerConnection.getStats).toHaveBeenCalled()
            const statsCallCount1 = mockPeerConnection.getStats.mock.calls.length

            // Advance time by another 1 second
            await vi.advanceTimersByTimeAsync(1000)
            
            // Stats should have been collected again
            const statsCallCount2 = mockPeerConnection.getStats.mock.calls.length
            expect(statsCallCount2).toBeGreaterThan(statsCallCount1)

            // PROPERTY VERIFICATION 3: The interval should not exceed 2 seconds
            // If we advance by 2 seconds, we should see at least 2 collections
            const initialCallCount = mockPeerConnection.getStats.mock.calls.length
            await vi.advanceTimersByTimeAsync(2000)
            const finalCallCount = mockPeerConnection.getStats.mock.calls.length
            
            // Should have collected stats at least twice in 2 seconds
            expect(finalCallCount - initialCallCount).toBeGreaterThanOrEqual(2)

            // PROPERTY VERIFICATION 4: Connection state changes should be monitored
            // Simulate connection state changes
            for (let i = 1; i < testCase.connectionStates.length; i++) {
              mockPeerConnection.connectionState = testCase.connectionStates[i]
              if (mockPeerConnection.onconnectionstatechange) {
                mockPeerConnection.onconnectionstatechange()
              }
              
              // Quality should be updated with new state
              const updatedQuality = monitor.getConnectionQuality(testCase.userId)
              expect(updatedQuality?.state).toBe(testCase.connectionStates[i])
            }

            // PROPERTY VERIFICATION 5: Quality changes should trigger callbacks
            // We should have received at least one quality change notification
            // (initial quality is always set, and connection state changes trigger callbacks)
            if (testCase.connectionStates.length > 1) {
              // If there were state changes, we should have callbacks
              expect(qualityChanges.length).toBeGreaterThan(0)
            }
            
            // All quality changes should be for the correct user
            qualityChanges.forEach(change => {
              expect(change.userId).toBe(testCase.userId)
              expect(change.quality).toBeDefined()
            })

            // Clean up
            monitor.stopMonitoring(testCase.userId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should monitor multiple peer connections independently with intervals not exceeding 2 seconds', async () => {
      // Property: Each peer connection should be monitored independently
      // at intervals not exceeding 2 seconds
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: fc.uuid(),
              connectionState: fc.constantFrom(
                'new' as RTCPeerConnectionState,
                'connecting' as RTCPeerConnectionState,
                'connected' as RTCPeerConnectionState
              ),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (users) => {
            const monitor = new ConnectionMonitor()
            const peerConnections = new Map<string, any>()

            // Create and start monitoring for each user
            for (const user of users) {
              const mockStats = new Map()
              mockStats.set('inbound-rtp-audio', {
                type: 'inbound-rtp',
                kind: 'audio',
                packetsLost: 10,
                packetsReceived: 1000,
                jitter: 0.01,
                timestamp: Date.now(),
                bytesReceived: 50000,
                ssrc: Math.random() * 100000,
              })

              const mockPeerConnection = {
                connectionState: user.connectionState,
                getStats: vi.fn().mockResolvedValue(mockStats),
                onconnectionstatechange: null,
              } as unknown as RTCPeerConnection

              peerConnections.set(user.userId, mockPeerConnection)
              monitor.startMonitoring(user.userId, mockPeerConnection)
            }

            // PROPERTY VERIFICATION: All connections should have initial quality
            for (const user of users) {
              const quality = monitor.getConnectionQuality(user.userId)
              expect(quality).toBeDefined()
              expect(quality?.state).toBe(user.connectionState)
            }

            // Advance time by 2 seconds
            await vi.advanceTimersByTimeAsync(2000)

            // PROPERTY VERIFICATION: All connections should have been monitored
            // (stats collected at least twice in 2 seconds)
            for (const user of users) {
              const pc = peerConnections.get(user.userId)
              expect(pc.getStats).toHaveBeenCalled()
              expect(pc.getStats.mock.calls.length).toBeGreaterThanOrEqual(2)
            }

            // Clean up
            for (const user of users) {
              monitor.stopMonitoring(user.userId)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should calculate quality metrics correctly from WebRTC stats for any connection', async () => {
      // Property: Quality metrics should be calculated correctly from stats
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            packetsLost: fc.integer({ min: 0, max: 100 }),
            packetsReceived: fc.integer({ min: 100, max: 10000 }),
            jitter: fc.double({ min: 0, max: 0.1, noNaN: true }), // in seconds
            latency: fc.double({ min: 0, max: 1, noNaN: true }), // in seconds
            bytesReceived: fc.integer({ min: 1000, max: 1000000 }),
          }),
          async (testCase) => {
            const monitor = new ConnectionMonitor()

            // Create mock stats
            const mockStats = new Map()
            mockStats.set('inbound-rtp-audio', {
              type: 'inbound-rtp',
              kind: 'audio',
              packetsLost: testCase.packetsLost,
              packetsReceived: testCase.packetsReceived,
              jitter: testCase.jitter,
              timestamp: Date.now(),
              bytesReceived: testCase.bytesReceived,
              ssrc: 12345,
            })

            mockStats.set('candidate-pair', {
              type: 'candidate-pair',
              state: 'succeeded',
              currentRoundTripTime: testCase.latency,
              timestamp: Date.now(),
            })

            const mockPeerConnection = {
              connectionState: 'connected' as RTCPeerConnectionState,
              getStats: vi.fn().mockResolvedValue(mockStats),
              onconnectionstatechange: null,
            } as unknown as RTCPeerConnection

            monitor.startMonitoring(testCase.userId, mockPeerConnection)

            // Advance time to trigger stats collection
            await vi.advanceTimersByTimeAsync(1000)

            const quality = monitor.getConnectionQuality(testCase.userId)
            expect(quality).toBeDefined()

            // PROPERTY VERIFICATION: Metrics should be calculated correctly
            
            // 1. Packet loss should be calculated as a ratio
            const expectedPacketLoss = testCase.packetsLost / (testCase.packetsReceived + testCase.packetsLost)
            expect(quality?.packetLoss).toBeCloseTo(expectedPacketLoss, 5)

            // 2. Jitter should be converted to milliseconds
            const expectedJitter = testCase.jitter * 1000
            expect(quality?.jitter).toBeCloseTo(expectedJitter, 1)

            // 3. Latency should be converted to milliseconds
            const expectedLatency = testCase.latency * 1000
            expect(quality?.latency).toBeCloseTo(expectedLatency, 1)

            // 4. Quality level should be determined by metrics
            if (expectedPacketLoss > 0.1 || expectedLatency > 500) {
              expect(quality?.quality).toBe('critical')
            } else if (expectedPacketLoss > 0.05 || expectedLatency > 300) {
              expect(quality?.quality).toBe('poor')
            } else if (expectedPacketLoss > 0.01 || expectedLatency > 150) {
              expect(quality?.quality).toBe('good')
            } else {
              expect(quality?.quality).toBe('excellent')
            }

            monitor.stopMonitoring(testCase.userId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should stop monitoring when requested and not collect stats after stopping', async () => {
      // Property: After stopping monitoring, stats collection should cease
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            monitorDuration: fc.integer({ min: 1000, max: 5000 }), // milliseconds
          }),
          async (testCase) => {
            const monitor = new ConnectionMonitor()

            const mockStats = new Map()
            mockStats.set('inbound-rtp-audio', {
              type: 'inbound-rtp',
              kind: 'audio',
              packetsLost: 10,
              packetsReceived: 1000,
              jitter: 0.01,
              timestamp: Date.now(),
              bytesReceived: 50000,
              ssrc: 12345,
            })

            const mockPeerConnection = {
              connectionState: 'connected' as RTCPeerConnectionState,
              getStats: vi.fn().mockResolvedValue(mockStats),
              onconnectionstatechange: null,
            } as unknown as RTCPeerConnection

            monitor.startMonitoring(testCase.userId, mockPeerConnection)

            // Monitor for the specified duration
            await vi.advanceTimersByTimeAsync(testCase.monitorDuration)
            
            const statsCallsWhileMonitoring = mockPeerConnection.getStats.mock.calls.length
            expect(statsCallsWhileMonitoring).toBeGreaterThan(0)

            // Stop monitoring
            monitor.stopMonitoring(testCase.userId)

            // PROPERTY VERIFICATION: After stopping, no more stats should be collected
            const statsCallsAfterStop = mockPeerConnection.getStats.mock.calls.length

            // Advance time significantly
            await vi.advanceTimersByTimeAsync(5000)

            // Stats call count should not have increased
            expect(mockPeerConnection.getStats.mock.calls.length).toBe(statsCallsAfterStop)

            // Quality should no longer be available
            const quality = monitor.getConnectionQuality(testCase.userId)
            expect(quality).toBeNull()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
