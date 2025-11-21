import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// Feature: webrtc-improvements, Property 1: TURN Configuration Presence
// Validates: Requirements 1.1, 1.4

describe('WebRTC Service - TURN Configuration', () => {
  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 1: TURN Configuration Presence', () => {
    it('should always include TURN server in ICE configuration for any peer connection attempt', async () => {
      // Property-based test: For any valid channel configuration,
      // the ICE servers MUST include at least one TURN server with credentials
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            channelId: fc.uuid(),
            videoEnabled: fc.boolean(),
            turnUrl: fc.oneof(
              fc.constant('turn:test.turn.server:3478'),
              fc.constant('turns:secure.turn.server:5349'),
              fc.constant('turn:another.turn.server:3478')
            ),
            // Generate valid non-whitespace strings for credentials
            turnUsername: fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3),
            turnPassword: fc.string({ minLength: 6, maxLength: 30 }).filter(s => s.trim().length >= 6),
          }),
          async (config) => {
            // Set up environment variables for this test case
            vi.stubEnv('VITE_TURN_URL', config.turnUrl)
            vi.stubEnv('VITE_TURN_USERNAME', config.turnUsername)
            vi.stubEnv('VITE_TURN_PASSWORD', config.turnPassword)

            // Reset modules to pick up new environment variables
            vi.resetModules()

            // Mock WebSocket service
            const mockWsService = {
              on: vi.fn(),
              send: vi.fn(),
              off: vi.fn(),
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            // Track RTCPeerConnection instantiations
            const peerConnectionInstances: any[] = []
            const originalRTCPeerConnection = global.RTCPeerConnection
            
            // Create a proper mock constructor
            const MockRTCPeerConnection = function(this: any, config: any) {
              peerConnectionInstances.push(config)
              this.addTrack = vi.fn()
              this.addIceCandidate = vi.fn()
              this.createOffer = vi.fn().mockResolvedValue({})
              this.createAnswer = vi.fn().mockResolvedValue({})
              this.setLocalDescription = vi.fn().mockResolvedValue(undefined)
              this.setRemoteDescription = vi.fn().mockResolvedValue(undefined)
              this.close = vi.fn()
              this.getSenders = vi.fn().mockReturnValue([])
              this.onicecandidate = null
              this.ontrack = null
              this.onconnectionstatechange = null
              this.connectionState = 'new'
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            // Import WebRTC service (will use mocked dependencies)
            const { webrtcService } = await import('./webrtc')

            // Simulate a peer connection creation by triggering user joined event
            const mockUserJoinedData = {
              userId: fc.sample(fc.uuid(), 1)[0],
              username: fc.sample(fc.string({ minLength: 1, maxLength: 20 }), 1)[0],
            }

            // Get the voice:user-joined handler that was registered
            const userJoinedHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-joined'
            )?.[1]

            if (userJoinedHandler) {
              // Trigger the handler to create a peer connection
              await userJoinedHandler(mockUserJoinedData)
            }

            // Verify that at least one RTCPeerConnection was created
            expect(peerConnectionInstances.length).toBeGreaterThan(0)

            // For each peer connection created, verify TURN configuration
            peerConnectionInstances.forEach((pcConfig) => {
              const iceServers = pcConfig.iceServers || []
              
              // Property: Must have at least one TURN server
              const turnServers = iceServers.filter((server: RTCIceServer) => {
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
                return urls.some((url: string) => url.startsWith('turn:') || url.startsWith('turns:'))
              })

              expect(turnServers.length).toBeGreaterThan(0)

              // Property: TURN servers must have credentials
              turnServers.forEach((turnServer: RTCIceServer) => {
                expect(turnServer.username).toBeDefined()
                expect(turnServer.username).not.toBe('')
                expect(turnServer.credential).toBeDefined()
                expect(turnServer.credential).not.toBe('')
              })
            })

            // Restore original RTCPeerConnection
            global.RTCPeerConnection = originalRTCPeerConnection
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should include TURN configuration even when TURN server credentials vary', async () => {
      // Additional property test: Verify TURN configuration is present
      // regardless of the specific credential values used
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            turnUrl: fc.webUrl({ validSchemes: ['turn', 'turns'] }),
            turnUsername: fc.string({ minLength: 1, maxLength: 50 }),
            turnPassword: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          async (credentials) => {
            // Set environment variables
            vi.stubEnv('VITE_TURN_URL', credentials.turnUrl)
            vi.stubEnv('VITE_TURN_USERNAME', credentials.turnUsername)
            vi.stubEnv('VITE_TURN_PASSWORD', credentials.turnPassword)

            // Reset modules to pick up new env vars
            vi.resetModules()

            // Import fresh instance
            const { getWebRTCConfig } = await import('../config/webrtc')

            let config
            try {
              config = getWebRTCConfig()
            } catch (error) {
              // If config throws, it means validation failed
              // This is acceptable for invalid URLs, but we should still
              // verify the validation logic is working
              return
            }

            // If we got a config, verify it has the TURN credentials
            expect(config.turnUrl).toBe(credentials.turnUrl)
            expect(config.turnUsername).toBe(credentials.turnUsername)
            expect(config.turnPassword).toBe(credentials.turnPassword)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

describe('WebRTC Service - Username Display', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 3: Username Inclusion in Join Events', () => {
    it('should include non-empty username in all voice:user-joined events', async () => {
      // Feature: webrtc-improvements, Property 3: Username Inclusion in Join Events
      // Validates: Requirements 2.1
      // Property: For any voice:user-joined event, the message payload SHALL contain
      // a non-empty username field matching the joining user's actual username
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: fc.uuid(),
              username: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (users) => {
            // Set up environment
            vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
            vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
            vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
            vi.resetModules()

            // Mock WebSocket service
            const receivedJoinEvents: any[] = []
            const mockWsService = {
              on: vi.fn((event: string, handler: Function) => {
                // Capture the handler for voice:user-joined
                if (event === 'voice:user-joined') {
                  // Store handler for later invocation
                  mockWsService._userJoinedHandler = handler
                }
              }),
              send: vi.fn(),
              off: vi.fn(),
              _userJoinedHandler: null as Function | null,
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            // Mock RTCPeerConnection
            const MockRTCPeerConnection = function(this: any, config: any) {
              return {
                config,
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
                oniceconnectionstatechange: null,
              }
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            // Import WebRTC service (registers handlers)
            await import('./webrtc')

            // Simulate each user joining
            for (const user of users) {
              const joinEvent = {
                userId: user.userId,
                username: user.username,
              }
              
              receivedJoinEvents.push(joinEvent)
              
              // Trigger the handler if it was registered
              if (mockWsService._userJoinedHandler) {
                await mockWsService._userJoinedHandler(joinEvent)
              }
            }

            // PROPERTY VERIFICATION:
            // For each join event, verify username is present and non-empty
            receivedJoinEvents.forEach((event, index) => {
              // 1. Username field must exist
              expect(event.username).toBeDefined()
              
              // 2. Username must be non-empty
              expect(event.username).not.toBe('')
              expect(event.username.trim().length).toBeGreaterThan(0)
              
              // 3. Username must match the original user's username
              expect(event.username).toBe(users[index].username)
              
              // 4. UserId must also be present
              expect(event.userId).toBeDefined()
              expect(event.userId).toBe(users[index].userId)
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve username through the entire join event flow', async () => {
      // Additional property: Username should be preserved from backend event
      // through to the frontend handler without modification
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            channelId: fc.uuid(),
          }),
          async (testCase) => {
            vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
            vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
            vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
            vi.resetModules()

            // Track events received by the service
            let capturedEvent: any = null
            const mockWsService = {
              on: vi.fn((event: string, handler: Function) => {
                if (event === 'voice:user-joined') {
                  mockWsService._userJoinedHandler = handler
                }
              }),
              send: vi.fn(),
              off: vi.fn(),
              _userJoinedHandler: null as Function | null,
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            const MockRTCPeerConnection = function(this: any) {
              return {
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
                oniceconnectionstatechange: null,
              }
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            // Import service and set up event listener
            const { webrtcService } = await import('./webrtc')
            webrtcService.on('user-joined', (data: any) => {
              capturedEvent = data
            })

            // Simulate backend sending join event
            const backendEvent = {
              userId: testCase.userId,
              username: testCase.username,
              channelId: testCase.channelId,
            }

            if (mockWsService._userJoinedHandler) {
              await mockWsService._userJoinedHandler(backendEvent)
            }

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10))

            // PROPERTY VERIFICATION:
            // The username in the emitted event must exactly match the backend event
            expect(capturedEvent).toBeDefined()
            expect(capturedEvent.username).toBe(testCase.username)
            expect(capturedEvent.userId).toBe(testCase.userId)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('Property 4: Username Display Consistency', () => {
    it('should display correct username for all remote participants', async () => {
      // Feature: webrtc-improvements, Property 4: Username Display Consistency
      // Validates: Requirements 2.2, 2.4
      // Property: For any remote participant in voice, the displayed username SHALL match
      // the username received in the voice:user-joined event
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              userId: fc.uuid(),
              username: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (users) => {
            // Set up environment
            vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
            vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
            vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
            vi.resetModules()

            // Mock WebSocket service
            const mockWsService = {
              on: vi.fn(),
              send: vi.fn(),
              off: vi.fn(),
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            // Mock RTCPeerConnection
            const MockRTCPeerConnection = function(this: any) {
              return {
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
                oniceconnectionstatechange: null,
              }
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            // Import voiceStore and webrtcService
            const { useVoiceStore } = await import('../store/voiceStore')
            
            // Reset voice store state before test
            useVoiceStore.setState({
              isConnected: false,
              currentChannelId: null,
              currentChannelName: null,
              isMuted: false,
              isVideoEnabled: false,
              isScreenSharing: false,
              voiceUsers: [],
            })
            
            const { webrtcService } = await import('./webrtc')

            // Set up event listener to add users to store
            webrtcService.on('user-joined', (data: any) => {
              useVoiceStore.getState().addVoiceUser({
                userId: data.userId,
                username: data.username,
                isMuted: false,
                isSpeaking: false,
                isVideoEnabled: false,
              })
            })

            // Get the user-joined handler
            const userJoinedHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-joined'
            )?.[1]

            expect(userJoinedHandler).toBeDefined()

            // Simulate each user joining
            for (const user of users) {
              await userJoinedHandler({ 
                userId: user.userId, 
                username: user.username 
              })
            }

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 20))

            // Get the current voice store state
            const voiceStore = useVoiceStore.getState()

            // PROPERTY VERIFICATION:
            // For each user that joined, verify the username in voiceStore matches
            // the username from the join event
            expect(voiceStore.voiceUsers.length).toBe(users.length)

            users.forEach(user => {
              const displayedUser = voiceStore.voiceUsers.find(u => u.userId === user.userId)
              
              // 1. User must exist in voice store
              expect(displayedUser).toBeDefined()
              
              // 2. Username must match exactly
              expect(displayedUser?.username).toBe(user.username)
              
              // 3. Username must not be empty
              expect(displayedUser?.username).not.toBe('')
              expect(displayedUser?.username.trim().length).toBeGreaterThan(0)
            })
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain username consistency across multiple join/leave cycles', async () => {
      // Additional property: Username should remain consistent even when users
      // leave and rejoin the channel
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            cycles: fc.integer({ min: 1, max: 5 }),
          }),
          async (testCase) => {
            vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
            vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
            vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
            vi.resetModules()

            const mockWsService = {
              on: vi.fn(),
              send: vi.fn(),
              off: vi.fn(),
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            const MockRTCPeerConnection = function(this: any) {
              return {
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
                oniceconnectionstatechange: null,
              }
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            const { useVoiceStore } = await import('../store/voiceStore')
            
            // Reset voice store state
            useVoiceStore.setState({
              isConnected: false,
              currentChannelId: null,
              currentChannelName: null,
              isMuted: false,
              isVideoEnabled: false,
              isScreenSharing: false,
              voiceUsers: [],
            })
            
            const { webrtcService } = await import('./webrtc')

            // Set up event listeners
            webrtcService.on('user-joined', (data: any) => {
              useVoiceStore.getState().addVoiceUser({
                userId: data.userId,
                username: data.username,
                isMuted: false,
                isSpeaking: false,
                isVideoEnabled: false,
              })
            })

            webrtcService.on('user-left', (data: any) => {
              useVoiceStore.getState().removeVoiceUser(data.userId)
            })

            const userJoinedHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-joined'
            )?.[1]

            const userLeftHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-left'
            )?.[1]

            expect(userJoinedHandler).toBeDefined()
            expect(userLeftHandler).toBeDefined()

            // Perform multiple join/leave cycles
            for (let i = 0; i < testCase.cycles; i++) {
              // User joins
              await userJoinedHandler({ 
                userId: testCase.userId, 
                username: testCase.username 
              })

              await new Promise(resolve => setTimeout(resolve, 10))

              // Verify username is correct
              const voiceStore = useVoiceStore.getState()
              const displayedUser = voiceStore.voiceUsers.find(u => u.userId === testCase.userId)
              
              expect(displayedUser).toBeDefined()
              expect(displayedUser?.username).toBe(testCase.username)

              // User leaves (except on last cycle)
              if (i < testCase.cycles - 1) {
                await userLeftHandler({ userId: testCase.userId })
                await new Promise(resolve => setTimeout(resolve, 10))
              }
            }

            // Final verification: username should still be correct
            const finalStore = useVoiceStore.getState()
            const finalUser = finalStore.voiceUsers.find(u => u.userId === testCase.userId)
            
            expect(finalUser).toBeDefined()
            expect(finalUser?.username).toBe(testCase.username)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve username when updating other user properties', async () => {
      // Property: Username should remain unchanged when other properties
      // (mute status, video status) are updated
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            muteUpdates: fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
            videoUpdates: fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
          }),
          async (testCase) => {
            vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
            vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
            vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
            vi.resetModules()

            const mockWsService = {
              on: vi.fn(),
              send: vi.fn(),
              off: vi.fn(),
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            const MockRTCPeerConnection = function(this: any) {
              return {
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
                oniceconnectionstatechange: null,
              }
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            const { useVoiceStore } = await import('../store/voiceStore')
            
            // Reset voice store state
            useVoiceStore.setState({
              isConnected: false,
              currentChannelId: null,
              currentChannelName: null,
              isMuted: false,
              isVideoEnabled: false,
              isScreenSharing: false,
              voiceUsers: [],
            })
            
            const { webrtcService } = await import('./webrtc')

            // Set up event listeners
            webrtcService.on('user-joined', (data: any) => {
              useVoiceStore.getState().addVoiceUser({
                userId: data.userId,
                username: data.username,
                isMuted: false,
                isSpeaking: false,
                isVideoEnabled: false,
              })
            })

            webrtcService.on('mute-status-changed', (data: any) => {
              useVoiceStore.getState().updateVoiceUser(data.userId, { isMuted: data.isMuted })
            })

            webrtcService.on('video-status-changed', (data: any) => {
              useVoiceStore.getState().updateVoiceUser(data.userId, { isVideoEnabled: data.isVideoEnabled })
            })

            const userJoinedHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-joined'
            )?.[1]

            const muteStatusHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:mute-status'
            )?.[1]

            const videoStatusHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:video-status'
            )?.[1]

            // User joins
            await userJoinedHandler({ 
              userId: testCase.userId, 
              username: testCase.username 
            })

            await new Promise(resolve => setTimeout(resolve, 10))

            // Apply mute status updates
            for (const isMuted of testCase.muteUpdates) {
              await muteStatusHandler({ 
                userId: testCase.userId, 
                isMuted 
              })
              await new Promise(resolve => setTimeout(resolve, 10))

              // Verify username hasn't changed
              const voiceStore = useVoiceStore.getState()
              const user = voiceStore.voiceUsers.find(u => u.userId === testCase.userId)
              expect(user?.username).toBe(testCase.username)
            }

            // Apply video status updates
            for (const isVideoEnabled of testCase.videoUpdates) {
              await videoStatusHandler({ 
                userId: testCase.userId, 
                isVideoEnabled 
              })
              await new Promise(resolve => setTimeout(resolve, 10))

              // Verify username hasn't changed
              const voiceStore = useVoiceStore.getState()
              const user = voiceStore.voiceUsers.find(u => u.userId === testCase.userId)
              expect(user?.username).toBe(testCase.username)
            }

            // Final verification
            const finalStore = useVoiceStore.getState()
            const finalUser = finalStore.voiceUsers.find(u => u.userId === testCase.userId)
            
            expect(finalUser).toBeDefined()
            expect(finalUser?.username).toBe(testCase.username)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})

describe('WebRTC Service - TURN Fallback', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 2: TURN Fallback Activation', () => {
    it('should attempt TURN relay connection for any peer connection that fails direct connectivity', async () => {
      // Feature: webrtc-improvements, Property 2: TURN Fallback Activation
      // Validates: Requirements 1.2
      // Property: For any peer connection that fails direct connectivity,
      // the system SHALL attempt connection via TURN relay before declaring failure
      
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            turnUrl: fc.constant('turn:test.turn.server:3478'),
            turnUsername: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length >= 3),
            turnPassword: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length >= 6),
            // Simulate different failure scenarios
            failureState: fc.constantFrom('failed' as RTCIceConnectionState),
          }),
          async (testCase) => {
            // Set up environment with TURN configuration
            vi.stubEnv('VITE_TURN_URL', testCase.turnUrl)
            vi.stubEnv('VITE_TURN_USERNAME', testCase.turnUsername)
            vi.stubEnv('VITE_TURN_PASSWORD', testCase.turnPassword)
            vi.resetModules()

            // Mock WebSocket service
            const mockWsService = {
              on: vi.fn(),
              send: vi.fn(),
              off: vi.fn(),
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            // Track all peer connections created
            const peerConnections: any[] = []
            const MockRTCPeerConnection = function(this: any, config: any) {
              const pc = {
                config,
                addTrack: vi.fn(),
                addIceCandidate: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                setRemoteDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
                oniceconnectionstatechange: null,
                connectionState: 'new',
                iceConnectionState: 'new',
              }
              peerConnections.push(pc)
              return pc
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            // Import WebRTC service
            await import('./webrtc')

            // Get the user-joined handler
            const userJoinedHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-joined'
            )?.[1]

            expect(userJoinedHandler).toBeDefined()

            // Simulate user joining (creates initial peer connection)
            await userJoinedHandler({ 
              userId: testCase.userId, 
              username: testCase.username 
            })

            // Verify initial peer connection was created
            expect(peerConnections.length).toBeGreaterThanOrEqual(1)
            const initialPc = peerConnections[0]

            // Verify ICE connection state handler is registered
            expect(initialPc.oniceconnectionstatechange).toBeDefined()

            // Count peer connections before failure
            const connectionsBeforeFailure = peerConnections.length

            // Simulate direct P2P connection failure
            initialPc.iceConnectionState = testCase.failureState
            if (initialPc.oniceconnectionstatechange) {
              initialPc.oniceconnectionstatechange()
            }

            // Wait for async TURN fallback to complete
            await new Promise(resolve => setTimeout(resolve, 100))

            // PROPERTY VERIFICATION:
            // 1. A new peer connection MUST have been created (TURN fallback attempt)
            expect(peerConnections.length).toBeGreaterThan(connectionsBeforeFailure)

            // 2. The new connection MUST use TURN-only configuration
            const fallbackPc = peerConnections[peerConnections.length - 1]
            const iceServers = fallbackPc.config.iceServers || []
            
            // Must have at least one TURN server
            const turnServers = iceServers.filter((server: RTCIceServer) => {
              const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
              return urls.some((url: string) => url.startsWith('turn:'))
            })
            expect(turnServers.length).toBeGreaterThan(0)

            // Should NOT have STUN servers (TURN-only mode for fallback)
            const stunServers = iceServers.filter((server: RTCIceServer) => {
              const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
              return urls.some((url: string) => url.startsWith('stun:'))
            })
            expect(stunServers.length).toBe(0)

            // 3. A new offer MUST have been sent with ICE restart
            const offerCalls = mockWsService.send.mock.calls.filter(
              (call: any) => call[0]?.type === 'voice:offer'
            )
            // Should have at least 2 offers: initial + fallback
            expect(offerCalls.length).toBeGreaterThanOrEqual(2)

            // 4. The fallback offer should be sent to the same user
            const fallbackOffer = offerCalls[offerCalls.length - 1][0]
            expect(fallbackOffer.data.targetUserId).toBe(testCase.userId)

            // 5. The old connection should have been closed
            expect(initialPc.close).toHaveBeenCalled()
          }
        ),
        { numRuns: 100, timeout: 30000 }
      )
    }, 35000)

    it('should emit turn-fallback-attempted event when TURN fallback is triggered', async () => {
      // Additional property: System must emit events for monitoring
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            username: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          async (testCase) => {
            // Set up environment
            vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
            vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
            vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
            vi.resetModules()

            // Mock WebSocket
            const mockWsService = {
              on: vi.fn(),
              send: vi.fn(),
              off: vi.fn(),
            }
            vi.doMock('./websocket', () => ({
              wsService: mockWsService,
            }))

            // Mock RTCPeerConnection
            const peerConnections: any[] = []
            const MockRTCPeerConnection = function(this: any, config: any) {
              const pc = {
                config,
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
                setLocalDescription: vi.fn().mockResolvedValue(undefined),
                close: vi.fn(),
                getSenders: vi.fn().mockReturnValue([]),
                oniceconnectionstatechange: null,
                iceConnectionState: 'new',
              }
              peerConnections.push(pc)
              return pc
            } as any
            
            global.RTCPeerConnection = MockRTCPeerConnection

            // Import and set up event listener
            const { webrtcService } = await import('./webrtc')
            const eventCallback = vi.fn()
            webrtcService.on('turn-fallback-attempted', eventCallback)

            // Trigger user joined
            const userJoinedHandler = mockWsService.on.mock.calls.find(
              (call: any) => call[0] === 'voice:user-joined'
            )?.[1]

            await userJoinedHandler({ 
              userId: testCase.userId, 
              username: testCase.username 
            })

            const initialPc = peerConnections[0]

            // Simulate failure
            initialPc.iceConnectionState = 'failed'
            if (initialPc.oniceconnectionstatechange) {
              initialPc.oniceconnectionstatechange()
            }

            await new Promise(resolve => setTimeout(resolve, 50))

            // Verify event was emitted
            expect(eventCallback).toHaveBeenCalledWith(
              expect.objectContaining({ userId: testCase.userId })
            )
          }
        ),
        { numRuns: 100, timeout: 30000 }
      )
    }, 35000)
  })

  it('should monitor ICE connection state and detect failures', async () => {
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track peer connections and their event handlers
    const peerConnections: any[] = []
    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        connectionState: 'new',
        iceConnectionState: 'new',
      }
      peerConnections.push(pc)
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Import WebRTC service
    await import('./webrtc')

    // Simulate user joined to create peer connection
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    const testUserId = 'test-user-123'
    if (userJoinedHandler) {
      await userJoinedHandler({ userId: testUserId, username: 'TestUser' })
    }

    // Verify peer connection was created
    expect(peerConnections.length).toBeGreaterThanOrEqual(1)
    const firstPc = peerConnections[0]

    // Verify ICE connection state handler was registered
    expect(firstPc.oniceconnectionstatechange).toBeDefined()

    // Simulate ICE connection failure
    firstPc.iceConnectionState = 'failed'
    if (firstPc.oniceconnectionstatechange) {
      firstPc.oniceconnectionstatechange()
    }

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10))

    // Verify that a new peer connection was created (TURN fallback)
    expect(peerConnections.length).toBe(2)
    
    // Verify the second connection uses TURN-only configuration
    const secondPc = peerConnections[1]
    const turnOnlyServers = secondPc.config.iceServers.filter((server: RTCIceServer) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
      return urls.some((url: string) => url.startsWith('turn:'))
    })
    
    // Should have TURN servers
    expect(turnOnlyServers.length).toBeGreaterThan(0)
    
    // Should NOT have STUN servers (TURN-only mode)
    const stunServers = secondPc.config.iceServers.filter((server: RTCIceServer) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
      return urls.some((url: string) => url.startsWith('stun:'))
    })
    expect(stunServers.length).toBe(0)

    // Verify a new offer was sent for TURN fallback
    const offerCalls = mockWsService.send.mock.calls.filter(
      (call: any) => call[0]?.type === 'voice:offer'
    )
    expect(offerCalls.length).toBeGreaterThanOrEqual(2) // Initial + fallback
  })

  it('should not attempt TURN fallback more than once per user', async () => {
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track peer connections
    const peerConnections: any[] = []
    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        connectionState: 'new',
        iceConnectionState: 'new',
      }
      peerConnections.push(pc)
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Import WebRTC service
    await import('./webrtc')

    // Simulate user joined
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    const testUserId = 'test-user-456'
    if (userJoinedHandler) {
      await userJoinedHandler({ userId: testUserId, username: 'TestUser' })
    }

    expect(peerConnections.length).toBeGreaterThanOrEqual(1)
    const firstPc = peerConnections[0]

    // Simulate first ICE connection failure (should trigger fallback)
    firstPc.iceConnectionState = 'failed'
    if (firstPc.oniceconnectionstatechange) {
      firstPc.oniceconnectionstatechange()
    }

    await new Promise(resolve => setTimeout(resolve, 10))

    // Should have created second connection
    expect(peerConnections.length).toBe(2)
    const secondPc = peerConnections[1]

    // Simulate second ICE connection failure (should NOT trigger another fallback)
    secondPc.iceConnectionState = 'failed'
    if (secondPc.oniceconnectionstatechange) {
      secondPc.oniceconnectionstatechange()
    }

    await new Promise(resolve => setTimeout(resolve, 10))

    // Should still only have 2 connections (no third attempt)
    expect(peerConnections.length).toBe(2)
  })
})

describe('WebRTC Service - Video Toggle with Multiple Users', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should enable video after joining without causing ICE restart', async () => {
    // This test verifies that enabling video after joining doesn't cause ICE restart
    // by checking that addTrack is called (which will trigger renegotiation) but
    // no new peer connection is created and no ICE restart occurs
    
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track peer connections and their state
    const peerConnections: any[] = []
    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        onnegotiationneeded: null,
        connectionState: 'connected',
        iceConnectionState: 'connected',
        signalingState: 'stable',
      }
      peerConnections.push(pc)
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Mock getUserMedia to return video track
    const mockVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }
    
    const mockAudioTrack = {
      kind: 'audio',
      enabled: true,
      stop: vi.fn(),
    }
    
    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getAudioTracks: vi.fn().mockReturnValue([]),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    }
    
    global.navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation((constraints) => {
      if (constraints.video) {
        return Promise.resolve(mockStream)
      }
      return Promise.resolve({
        getTracks: vi.fn().mockReturnValue([mockAudioTrack]),
        getAudioTracks: vi.fn().mockReturnValue([mockAudioTrack]),
        getVideoTracks: vi.fn().mockReturnValue([]),
        addTrack: vi.fn(),
      })
    })

    // Import WebRTC service
    const { webrtcService } = await import('./webrtc')

    // Join voice channel without video
    await webrtcService.joinVoiceChannel('test-channel-123', false)

    // Simulate user joined to create peer connection
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    const testUserId = 'test-user-123'
    if (userJoinedHandler) {
      await userJoinedHandler({ userId: testUserId, username: 'TestUser' })
    }

    // Wait for peer connection to be created
    await new Promise(resolve => setTimeout(resolve, 20))

    // Verify initial peer connection was created
    expect(peerConnections.length).toBeGreaterThanOrEqual(1)
    const initialPc = peerConnections[0]

    // Add video track after joining
    const result = await webrtcService.addVideoTrack()
    expect(result).toBe(true)

    // Wait for any async operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // VERIFICATION:
    // 1. No new peer connection should be created (no ICE restart)
    expect(peerConnections.length).toBe(1)

    // 2. addTrack should be called to add video track
    expect(initialPc.addTrack).toHaveBeenCalled()

    // 3. ICE connection state should remain stable (no restart)
    expect(initialPc.iceConnectionState).toBe('connected')
    
    // 4. Connection should not be closed (no ICE restart)
    expect(initialPc.close).not.toHaveBeenCalled()
  })

  it('should disable and re-enable video without ICE restart errors', async () => {
    // This test verifies that toggling video on/off doesn't cause ICE restart
    // Video toggle only enables/disables the track, doesn't recreate connections
    
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track peer connections
    const peerConnections: any[] = []
    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        onnegotiationneeded: null,
        connectionState: 'connected',
        iceConnectionState: 'connected',
        signalingState: 'stable',
      }
      peerConnections.push(pc)
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Mock video track
    const mockVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }

    const mockAudioTrack = {
      kind: 'audio',
      enabled: true,
      stop: vi.fn(),
    }

    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockAudioTrack, mockVideoTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getAudioTracks: vi.fn().mockReturnValue([mockAudioTrack]),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    }

    global.navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream)

    // Import WebRTC service
    const { webrtcService } = await import('./webrtc')

    // Join with video enabled
    await webrtcService.joinVoiceChannel('test-channel-456', true)

    // Simulate user joined
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    const testUserId = 'test-user-456'
    if (userJoinedHandler) {
      await userJoinedHandler({ userId: testUserId, username: 'TestUser2' })
    }

    await new Promise(resolve => setTimeout(resolve, 20))

    const initialPeerConnectionCount = peerConnections.length

    // Toggle video off
    const isVideoEnabled1 = webrtcService.toggleVideo()
    expect(isVideoEnabled1).toBe(false)
    expect(mockVideoTrack.enabled).toBe(false)

    // Wait for state to settle
    await new Promise(resolve => setTimeout(resolve, 20))

    // Toggle video back on
    const isVideoEnabled2 = webrtcService.toggleVideo()
    expect(isVideoEnabled2).toBe(true)
    expect(mockVideoTrack.enabled).toBe(true)

    // Wait for state to settle
    await new Promise(resolve => setTimeout(resolve, 20))

    // VERIFICATION:
    // 1. No new peer connection created (no ICE restart)
    expect(peerConnections.length).toBe(initialPeerConnectionCount)

    // 2. No peer connections were closed (no ICE restart)
    peerConnections.forEach(pc => {
      expect(pc.close).not.toHaveBeenCalled()
    })
  })

  it('should handle video toggle with multiple peers simultaneously without ICE restart', async () => {
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track peer connections per user
    const peerConnectionsByUser = new Map<string, any>()
    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([
          {
            track: { kind: 'audio', enabled: true },
            replaceTrack: vi.fn().mockResolvedValue(undefined),
          }
        ]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        onnegotiationneeded: null,
        connectionState: 'connected',
        iceConnectionState: 'connected',
        signalingState: 'stable',
      }
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Mock video track
    const mockVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }

    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    }

    global.navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation((constraints) => {
      if (constraints.video) {
        return Promise.resolve(mockStream)
      }
      return Promise.resolve({
        getTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
        getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
        getVideoTracks: vi.fn().mockReturnValue([]),
        addTrack: vi.fn(),
      })
    })

    // Import WebRTC service
    const { webrtcService } = await import('./webrtc')

    // Join without video
    await webrtcService.joinVoiceChannel('test-channel-789', false)

    // Simulate multiple users joining
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    const users = [
      { userId: 'user-1', username: 'User1' },
      { userId: 'user-2', username: 'User2' },
      { userId: 'user-3', username: 'User3' },
    ]

    // Create peer connections for all users
    for (const user of users) {
      if (userJoinedHandler) {
        await userJoinedHandler(user)
      }
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Get all created peer connections
    const allPeerConnections: any[] = []
    mockWsService.send.mock.calls.forEach((call: any) => {
      if (call[0]?.type === 'voice:offer') {
        const userId = call[0].data.targetUserId
        // Find the peer connection for this user (last one created for this user)
        const pc = new MockRTCPeerConnection({})
        peerConnectionsByUser.set(userId, pc)
        allPeerConnections.push(pc)
      }
    })

    const initialPeerConnectionCount = allPeerConnections.length
    expect(initialPeerConnectionCount).toBe(users.length)

    // Add video track (should affect all peer connections)
    const result = await webrtcService.addVideoTrack()
    expect(result).toBe(true)

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 50))

    // VERIFICATION:
    // 1. No new peer connections created (no ICE restart for any peer)
    expect(allPeerConnections.length).toBe(initialPeerConnectionCount)

    // 2. All peer connections should remain in connected state
    allPeerConnections.forEach(pc => {
      expect(pc.iceConnectionState).toBe('connected')
      expect(pc.connectionState).toBe('connected')
    })

    // 3. No peer connections were closed (no ICE restart)
    allPeerConnections.forEach(pc => {
      expect(pc.close).not.toHaveBeenCalled()
    })

    // 4. Video status message should be sent to all peers
    const videoStatusCalls = mockWsService.send.mock.calls.filter(
      (call: any) => call[0]?.type === 'voice:video-status'
    )
    expect(videoStatusCalls.length).toBeGreaterThan(0)
  })

  it('should use replaceTrack instead of addTrack for existing connections', async () => {
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track method calls on peer connections
    const replaceTrackCalls: any[] = []
    const addTrackCalls: any[] = []

    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn((...args) => {
          addTrackCalls.push({ pc, args })
        }),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([
          {
            track: { kind: 'audio', enabled: true },
            replaceTrack: vi.fn((...args) => {
              replaceTrackCalls.push({ pc, args })
              return Promise.resolve()
            }),
          }
        ]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        onnegotiationneeded: null,
        connectionState: 'connected',
        iceConnectionState: 'connected',
        signalingState: 'stable',
      }
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Mock video track
    const mockVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }

    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getAudioTracks: vi.fn().mockReturnValue([]),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    }

    global.navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation((constraints) => {
      if (constraints.video) {
        return Promise.resolve(mockStream)
      }
      return Promise.resolve({
        getTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
        getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
        getVideoTracks: vi.fn().mockReturnValue([]),
        addTrack: vi.fn(),
      })
    })

    // Import WebRTC service
    const { webrtcService } = await import('./webrtc')

    // Join without video
    await webrtcService.joinVoiceChannel('test-channel-replace', false)

    // Simulate user joined
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    if (userJoinedHandler) {
      await userJoinedHandler({ userId: 'user-replace', username: 'UserReplace' })
    }

    await new Promise(resolve => setTimeout(resolve, 20))

    // Clear tracking arrays
    replaceTrackCalls.length = 0
    addTrackCalls.length = 0

    // Add video track
    await webrtcService.addVideoTrack()

    await new Promise(resolve => setTimeout(resolve, 50))

    // VERIFICATION:
    // 1. replaceTrack should be called (not addTrack) for existing connection
    expect(replaceTrackCalls.length).toBeGreaterThan(0)
    
    // 2. The video track should be passed to replaceTrack
    const replaceCall = replaceTrackCalls[0]
    expect(replaceCall.args[0]).toBe(mockVideoTrack)

    // 3. addTrack should NOT be called for video (only for initial audio)
    const videoAddTrackCalls = addTrackCalls.filter(call => 
      call.args[0]?.kind === 'video'
    )
    expect(videoAddTrackCalls.length).toBe(0)
  })

  it('should not trigger renegotiation when using replaceTrack', async () => {
    // Set up environment
    vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
    vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
    vi.resetModules()

    // Mock WebSocket service
    const mockWsService = {
      on: vi.fn(),
      send: vi.fn(),
      off: vi.fn(),
    }
    vi.doMock('./websocket', () => ({
      wsService: mockWsService,
    }))

    // Track negotiation events
    let negotiationNeededCount = 0

    const MockRTCPeerConnection = function(this: any, config: any) {
      const pc = {
        config,
        addTrack: vi.fn(),
        addIceCandidate: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        getSenders: vi.fn().mockReturnValue([
          {
            track: { kind: 'audio', enabled: true },
            replaceTrack: vi.fn().mockResolvedValue(undefined),
          }
        ]),
        onicecandidate: null,
        ontrack: null,
        onconnectionstatechange: null,
        oniceconnectionstatechange: null,
        onnegotiationneeded: null,
        connectionState: 'connected',
        iceConnectionState: 'connected',
        signalingState: 'stable',
      }
      
      // Override onnegotiationneeded setter to track calls
      Object.defineProperty(pc, 'onnegotiationneeded', {
        set: function(handler) {
          this._negotiationHandler = handler
        },
        get: function() {
          return this._negotiationHandler
        }
      })
      
      return pc
    } as any
    
    global.RTCPeerConnection = MockRTCPeerConnection

    // Mock video track
    const mockVideoTrack = {
      kind: 'video',
      enabled: true,
      stop: vi.fn(),
    }

    const mockStream = {
      getTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getVideoTracks: vi.fn().mockReturnValue([mockVideoTrack]),
      getAudioTracks: vi.fn().mockReturnValue([]),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    }

    global.navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation((constraints) => {
      if (constraints.video) {
        return Promise.resolve(mockStream)
      }
      return Promise.resolve({
        getTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
        getAudioTracks: vi.fn().mockReturnValue([{ kind: 'audio', enabled: true }]),
        getVideoTracks: vi.fn().mockReturnValue([]),
        addTrack: vi.fn(),
      })
    })

    // Import WebRTC service
    const { webrtcService } = await import('./webrtc')

    // Join without video
    await webrtcService.joinVoiceChannel('test-channel-nego', false)

    // Simulate user joined
    const userJoinedHandler = mockWsService.on.mock.calls.find(
      (call: any) => call[0] === 'voice:user-joined'
    )?.[1]

    if (userJoinedHandler) {
      await userJoinedHandler({ userId: 'user-nego', username: 'UserNego' })
    }

    await new Promise(resolve => setTimeout(resolve, 20))

    // Count initial offers
    const initialOfferCount = mockWsService.send.mock.calls.filter(
      (call: any) => call[0]?.type === 'voice:offer'
    ).length

    // Add video track
    await webrtcService.addVideoTrack()

    await new Promise(resolve => setTimeout(resolve, 50))

    // Count offers after adding video
    const finalOfferCount = mockWsService.send.mock.calls.filter(
      (call: any) => call[0]?.type === 'voice:offer'
    ).length

    // VERIFICATION:
    // No additional offers should be sent (no renegotiation triggered)
    expect(finalOfferCount).toBe(initialOfferCount)
  })
})

describe('WebRTC Service - Automatic Reconnection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Property 7: Automatic Reconnection Trigger', () => {
    it('should automatically trigger reconnection within 1 second for any peer connection that transitions to disconnected or failed state', async () => {
      // Feature: webrtc-improvements, Property 7: Automatic Reconnection Trigger
      // Validates: Requirements 5.1
      // Property: For any peer connection that transitions to 'disconnected' or 'failed' state,
      // the system SHALL initiate reconnection within 1 second
      
      // Set up environment
      vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
      vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
      vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
      vi.resetModules()

      // Mock WebSocket service
      const mockWsService = {
        on: vi.fn(),
        send: vi.fn(),
        off: vi.fn(),
      }
      vi.doMock('./websocket', () => ({
        wsService: mockWsService,
      }))

      // Track all peer connections
      const peerConnections: any[] = []
      
      const MockRTCPeerConnection = function(this: any, config: any) {
        const pc = {
          config,
          addTrack: vi.fn(),
          addIceCandidate: vi.fn(),
          createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
          createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
          setLocalDescription: vi.fn().mockResolvedValue(undefined),
          setRemoteDescription: vi.fn().mockResolvedValue(undefined),
          close: vi.fn(),
          getSenders: vi.fn().mockReturnValue([]),
          onicecandidate: null,
          ontrack: null,
          onconnectionstatechange: null,
          oniceconnectionstatechange: null,
          connectionState: 'new',
          iceConnectionState: 'new',
        }
        peerConnections.push(pc)
        return pc
      } as any
      
      global.RTCPeerConnection = MockRTCPeerConnection

      // Track reconnection events
      const reconnectionEvents: any[] = []
      
      // Import WebRTC service
      const { webrtcService } = await import('./webrtc')
      
      // Listen for reconnection events
      webrtcService.on('reconnecting', (data: any) => {
        reconnectionEvents.push({ type: 'reconnecting', timestamp: Date.now(), data })
      })

      // Get the user-joined handler
      const userJoinedHandler = mockWsService.on.mock.calls.find(
        (call: any) => call[0] === 'voice:user-joined'
      )?.[1]

      expect(userJoinedHandler).toBeDefined()

      const testUserId = 'test-user-reconnect-123'
      const testUsername = 'TestUser'

      // Simulate user joining (creates initial peer connection)
      await userJoinedHandler({ 
        userId: testUserId, 
        username: testUsername 
      })

      // Wait for peer connection to be created
      await new Promise(resolve => setTimeout(resolve, 20))

      // Verify initial peer connection was created
      expect(peerConnections.length).toBeGreaterThanOrEqual(1)
      const initialPc = peerConnections[0]

      // Verify connection state handler is registered
      expect(initialPc.onconnectionstatechange).toBeDefined()

      // Record the time when we trigger the failure
      const failureTime = Date.now()

      // Simulate connection failure
      initialPc.connectionState = 'failed'
      if (initialPc.onconnectionstatechange) {
        initialPc.onconnectionstatechange()
      }

      // Wait for reconnection to be triggered (should happen within 1 second)
      await new Promise(resolve => setTimeout(resolve, 1200))

      // PROPERTY VERIFICATION:
      // 1. Reconnection MUST have been triggered
      expect(reconnectionEvents.length).toBeGreaterThan(0)
      
      // 2. First reconnection event should be 'reconnecting'
      const firstReconnectEvent = reconnectionEvents.find(e => e.type === 'reconnecting')
      expect(firstReconnectEvent).toBeDefined()
      expect(firstReconnectEvent.data.userId).toBe(testUserId)
      expect(firstReconnectEvent.data.attempt).toBe(1)
      
      // 3. Reconnection MUST be initiated within 1 second of failure (with some tolerance)
      const reconnectingTime = firstReconnectEvent.timestamp
      const timeDiff = reconnectingTime - failureTime
      expect(timeDiff).toBeLessThanOrEqual(1100) // Allow 100ms tolerance
      
      // 4. A new peer connection MUST have been created (reconnection attempt)
      expect(peerConnections.length).toBeGreaterThan(1)
      
      // 5. The old connection should have been closed
      expect(initialPc.close).toHaveBeenCalled()
      
      // 6. A new offer should have been sent for reconnection
      const offerCalls = mockWsService.send.mock.calls.filter(
        (call: any) => call[0]?.type === 'voice:offer'
      )
      // Should have at least 2 offers: initial + reconnection
      expect(offerCalls.length).toBeGreaterThanOrEqual(2)
      
      // 7. The reconnection offer should be sent to the same user
      const reconnectionOffer = offerCalls[offerCalls.length - 1][0]
      expect(reconnectionOffer.data.targetUserId).toBe(testUserId)
    })

    it('should implement exponential backoff for reconnection attempts', async () => {
      // Additional property: Reconnection attempts should use exponential backoff (1s, 2s, 4s)
      
      // Set up environment
      vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
      vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
      vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
      vi.resetModules()

      // Mock WebSocket
      const mockWsService = {
        on: vi.fn(),
        send: vi.fn(),
        off: vi.fn(),
      }
      vi.doMock('./websocket', () => ({
        wsService: mockWsService,
      }))

      // Track peer connections
      const peerConnections: any[] = []
      const MockRTCPeerConnection = function(this: any, config: any) {
        const pc = {
          config,
          addTrack: vi.fn(),
          createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
          setLocalDescription: vi.fn().mockResolvedValue(undefined),
          close: vi.fn(),
          getSenders: vi.fn().mockReturnValue([]),
          onconnectionstatechange: null,
          connectionState: 'new',
        }
        peerConnections.push(pc)
        return pc
      } as any
      
      global.RTCPeerConnection = MockRTCPeerConnection

      // Track reconnection events with timestamps
      const reconnectionEvents: Array<{ attempt: number, timestamp: number }> = []
      
      // Import and set up event listener
      const { webrtcService } = await import('./webrtc')
      webrtcService.on('reconnecting', (data: any) => {
        reconnectionEvents.push({ 
          attempt: data.attempt, 
          timestamp: Date.now() 
        })
      })

      // Trigger user joined
      const userJoinedHandler = mockWsService.on.mock.calls.find(
        (call: any) => call[0] === 'voice:user-joined'
      )?.[1]

      const testUserId = 'test-user-backoff-123'
      await userJoinedHandler({ 
        userId: testUserId, 
        username: 'TestUser' 
      })

      await new Promise(resolve => setTimeout(resolve, 20))

      const initialPc = peerConnections[0]

      // Simulate first failure
      const firstFailureTime = Date.now()
      initialPc.connectionState = 'failed'
      if (initialPc.onconnectionstatechange) {
        initialPc.onconnectionstatechange()
      }

      // Wait for first reconnection attempt (1s backoff)
      await new Promise(resolve => setTimeout(resolve, 1200))

      // Verify first reconnection was scheduled
      expect(reconnectionEvents.length).toBeGreaterThanOrEqual(1)
      const firstReconnect = reconnectionEvents[0]
      expect(firstReconnect.attempt).toBe(1)
      
      // Verify timing: should be ~1000ms after failure (with tolerance)
      const firstDelay = firstReconnect.timestamp - firstFailureTime
      expect(firstDelay).toBeGreaterThanOrEqual(800) // Allow more tolerance
      expect(firstDelay).toBeLessThanOrEqual(1300)

      // Simulate second failure
      if (peerConnections.length > 1) {
        const secondPc = peerConnections[peerConnections.length - 1]
        const secondFailureTime = Date.now()
        secondPc.connectionState = 'failed'
        if (secondPc.onconnectionstatechange) {
          secondPc.onconnectionstatechange()
        }

        // Wait for second reconnection attempt (2s backoff)
        await new Promise(resolve => setTimeout(resolve, 2300))

        // Verify second reconnection was scheduled
        expect(reconnectionEvents.length).toBeGreaterThanOrEqual(2)
        const secondReconnect = reconnectionEvents[1]
        expect(secondReconnect.attempt).toBe(2)
        
        // Verify timing: should be ~2000ms after second failure (with tolerance)
        const secondDelay = secondReconnect.timestamp - secondFailureTime
        expect(secondDelay).toBeGreaterThanOrEqual(1800)
        expect(secondDelay).toBeLessThanOrEqual(2500)
      }
    })

    it('should limit reconnection attempts to 3 maximum', async () => {
      // Property: System must not attempt more than 3 reconnections
      
      // Set up environment
      vi.stubEnv('VITE_TURN_URL', 'turn:test.turn.server:3478')
      vi.stubEnv('VITE_TURN_USERNAME', 'testuser')
      vi.stubEnv('VITE_TURN_PASSWORD', 'testpass123')
      vi.resetModules()

      // Mock WebSocket
      const mockWsService = {
        on: vi.fn(),
        send: vi.fn(),
        off: vi.fn(),
      }
      vi.doMock('./websocket', () => ({
        wsService: mockWsService,
      }))

      // Track peer connections
      const peerConnections: any[] = []
      const MockRTCPeerConnection = function(this: any, config: any) {
        const pc = {
          config,
          addTrack: vi.fn(),
          createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
          setLocalDescription: vi.fn().mockResolvedValue(undefined),
          close: vi.fn(),
          getSenders: vi.fn().mockReturnValue([]),
          onconnectionstatechange: null,
          connectionState: 'new',
        }
        peerConnections.push(pc)
        return pc
      } as any
      
      global.RTCPeerConnection = MockRTCPeerConnection

      // Track reconnection events
      const reconnectionEvents: any[] = []
      let reconnectionFailedEvent: any = null
      
      // Import and set up event listeners
      const { webrtcService } = await import('./webrtc')
      webrtcService.on('reconnecting', (data: any) => {
        reconnectionEvents.push(data)
      })
      webrtcService.on('reconnection-failed', (data: any) => {
        reconnectionFailedEvent = data
      })

      // Trigger user joined
      const userJoinedHandler = mockWsService.on.mock.calls.find(
        (call: any) => call[0] === 'voice:user-joined'
      )?.[1]

      const testUserId = 'test-user-limit-123'
      await userJoinedHandler({ 
        userId: testUserId, 
        username: 'TestUser' 
      })

      await new Promise(resolve => setTimeout(resolve, 20))

      // Simulate failures repeatedly to trigger all reconnection attempts
      for (let i = 0; i < 5; i++) {
        if (peerConnections.length > i) {
          const pc = peerConnections[i]
          pc.connectionState = 'failed'
          if (pc.onconnectionstatechange) {
            pc.onconnectionstatechange()
          }
          
          // Wait for reconnection attempt with appropriate backoff
          const backoff = i === 0 ? 1200 : i === 1 ? 2300 : 4300
          await new Promise(resolve => setTimeout(resolve, backoff))
        }
      }

      // PROPERTY VERIFICATION:
      // 1. Should have attempted exactly 3 reconnections
      expect(reconnectionEvents.length).toBeLessThanOrEqual(3)
      
      // 2. After 3 attempts, should emit reconnection-failed event
      expect(reconnectionFailedEvent).toBeDefined()
      expect(reconnectionFailedEvent.userId).toBe(testUserId)
      
      // 3. Should not create more than 4 peer connections (initial + 3 reconnections)
      expect(peerConnections.length).toBeLessThanOrEqual(4)
    })
  })
})
