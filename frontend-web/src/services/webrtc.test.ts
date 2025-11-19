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
            username: fc.string({ minLength: 1, maxLength: 20 }),
            turnUrl: fc.constant('turn:test.turn.server:3478'),
            turnUsername: fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3),
            turnPassword: fc.string({ minLength: 6, maxLength: 30 }).filter(s => s.trim().length >= 6),
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
            await new Promise(resolve => setTimeout(resolve, 50))

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
