# Implementation Plan - WebRTC Voice/Video Improvements

## Phase 1: Critical Improvements (Foundation)

- [ ] 0. Fix Video Toggle Renegotiation Issues (URGENT)
- [x] 0.1 Fix video track renegotiation to prevent ICE restart conflicts
  - Remove automatic offer creation when adding video track
  - Use replaceTrack() instead of addTrack() for existing connections
  - Only send renegotiation offer when necessary
  - Coordinate renegotiation properly between peers
  - _Requirements: Bug fix for video toggle breaking connections_

- [x] 0.2 Update addVideoTrack method to use track replacement
  - Check if video sender already exists in peer connection
  - Use sender.replaceTrack() if sender exists
  - Only use addTrack() for new connections
  - Avoid unnecessary renegotiation
  - _Requirements: Bug fix for video toggle_

- [x] 0.3 Fix handleOffer to handle renegotiation correctly
  - Check if remote description is being set during active connection
  - Avoid ICE restart conflicts
  - Handle offer collisions properly
  - _Requirements: Bug fix for ICE restart errors_

- [ ] 0.4 Test video toggle with multiple users
  - Test enabling video after joining
  - Test disabling and re-enabling video
  - Test with multiple peers simultaneously
  - Verify no ICE restart errors occur
  - _Requirements: Bug fix verification_

- [x] 1. TURN Server Integration
- [x] 1.1 Configure TURN server credentials in environment
  - Update `.env` files with TURN server URL, username, and password
  - Add configuration validation on startup
  - _Requirements: 1.1, 1.4_

- [x] 1.2 Update WebRTC service to include TURN in ICE servers
  - Modify `webrtcService.ts` to read TURN config from environment
  - Add TURN servers to ICE configuration array
  - Ensure credentials are properly formatted
  - _Requirements: 1.1, 1.4_

- [x] 1.3 Write property test for TURN configuration presence
  - **Property 1: TURN Configuration Presence**
  - **Validates: Requirements 1.1, 1.4**

- [x] 1.4 Implement TURN fallback logic
  - Add connection state monitoring
  - Detect when direct P2P fails
  - Trigger TURN relay attempt
  - _Requirements: 1.2_

- [x] 1.5 Write property test for TURN fallback activation
  - **Property 2: TURN Fallback Activation**
  - **Validates: Requirements 1.2**

- [x] 1.6 Add connection statistics logging
  - Log ICE candidate types used (host, srflx, relay)
  - Log connection establishment time
  - Log TURN usage for analytics
  - _Requirements: 1.5_

- [x] 2. Fix Username Display Issues
- [x] 2.1 Update backend to include username in voice:user-joined events
  - Modify WebSocket handler in `backend/cmd/ws/main.go`
  - Fetch username from user ID before broadcasting
  - Include username in event payload
  - _Requirements: 2.1_

- [x] 2.2 Write property test for username inclusion in join events
  - **Property 3: Username Inclusion in Join Events**
  - **Validates: Requirements 2.1**

- [x] 2.3 Update frontend to use username from events
  - Modify `webrtcService.ts` to extract username from voice:user-joined
  - Update `voiceStore.ts` to store username with user ID
  - Update `VoiceChannel.tsx` to display correct usernames
  - _Requirements: 2.2, 2.4_

- [x] 2.4 Write property test for username display consistency
  - **Property 4: Username Display Consistency**
  - **Validates: Requirements 2.2, 2.4**

- [x] 2.5 Handle username display when video is disabled
  - Show username with avatar when video track is disabled
  - Update UI to display username overlay on video
  - _Requirements: 2.3_

- [-] 3. Connection Quality Monitoring
- [x] 3.1 Create ConnectionMonitor module
  - Create `frontend-web/src/services/connectionMonitor.ts`
  - Implement connection state tracking
  - Implement stats collection (latency, packet loss, bandwidth)
  - Add quality calculation logic
  - _Requirements: 4.1_

- [x] 3.2 Write property test for connection state monitoring
  - **Property 5: Connection State Monitoring**
  - **Validates: Requirements 4.1**

- [x] 3.3 Integrate ConnectionMonitor with WebRTC service
  - Start monitoring when peer connection is established
  - Update connection stats every 1 second
  - Emit quality change events
  - _Requirements: 4.1_

- [x] 3.4 Create ConnectionQualityIndicator component
  - Create `frontend-web/src/components/ConnectionQualityIndicator.tsx`
  - Display connection state (connecting, connected, etc.)
  - Show quality indicator (excellent, good, poor, critical)
  - Show detailed stats on hover (latency, packet loss)
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 3.5 Write property test for connection state UI synchronization
  - **Property 6: Connection State UI Synchronization**
  - **Validates: Requirements 4.2**

- [x] 3.6 Add connection quality to VoiceChannel UI
  - Integrate ConnectionQualityIndicator into VoiceChannel
  - Display indicator for each participant
  - Show warning when quality degrades
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 3.7 Implement error state handling
  - Show error icon when connection fails
  - Display reconnection UI
  - Offer manual reconnect button
  - _Requirements: 4.5_

- [-] 4. Automatic Reconnection
- [x] 4.1 Implement reconnection logic in WebRTC service
  - Detect connection state changes to 'disconnected' or 'failed'
  - Trigger automatic reconnection attempt
  - Implement exponential backoff (1s, 2s, 4s)
  - Limit to 3 reconnection attempts
  - _Requirements: 5.1, 5.3_

- [x] 4.2 Write property test for automatic reconnection trigger
  - **Property 7: Automatic Reconnection Trigger**
  - **Validates: Requirements 5.1**

- [x] 4.3 Add reconnection UI state
  - Update voiceStore with 'reconnecting' state
  - Display "Reconnecting..." message in UI
  - Show reconnection attempt count
  - _Requirements: 5.2_

- [x] 4.4 Implement state preservation during reconnection
  - Save mute and video state before reconnection
  - Restore state after successful reconnection
  - _Requirements: 5.4_

- [x] 4.5 Write property test for reconnection state preservation
  - **Property 8: Reconnection State Preservation**
  - **Validates: Requirements 5.4**

- [x] 4.6 Implement WebSocket reconnection priority
  - Check WebSocket connection before peer reconnection
  - Reconnect WebSocket if needed
  - Wait for WebSocket ready before peer reconnection
  - _Requirements: 5.5_

- [x] 4.7 Write property test for WebSocket reconnection priority
  - **Property 9: WebSocket Reconnection Priority**
  - **Validates: Requirements 5.5**

- [x] 4.8 Add manual reconnect option
  - Show "Reconnect" button after failed attempts
  - Allow user to manually trigger reconnection
  - Clear failed state on manual reconnect
  - _Requirements: 5.3_

- [x] 5. Checkpoint - Ensure all Phase 1 tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Enhanced User Experience

- [-] 6. Voice Activity Detection
- [x] 6.1 Create VoiceActivityDetector module
  - Create `frontend-web/src/services/voiceActivityDetector.ts`
  - Implement audio context and analyser setup
  - Implement audio level monitoring
  - Add threshold-based detection logic
  - Add smoothing to prevent flickering
  - _Requirements: 3.1_

- [-] 6.2 Write property test for voice activity threshold detection
  - **Property 10: Voice Activity Threshold Detection**
  - **Validates: Requirements 3.1**

- [ ] 6.3 Integrate VAD with WebRTC service
  - Attach VAD to local audio stream
  - Attach VAD to remote audio streams
  - Emit voice activity events
  - _Requirements: 3.1_

- [ ] 6.4 Add speaking indicator to VoiceChannel UI
  - Add green border around video when speaking
  - Update UI within 100ms of voice activity detection
  - Remove indicator 500ms after voice stops
  - _Requirements: 3.2, 3.3_

- [ ] 6.5 Write property test for speaking indicator display
  - **Property 11: Speaking Indicator Display**
  - **Validates: Requirements 3.2**

- [ ] 6.6 Write property test for speaking indicator removal timing
  - **Property 12: Speaking Indicator Removal Timing**
  - **Validates: Requirements 3.3**

- [ ] 6.7 Handle multiple simultaneous speakers
  - Show indicators for all active speakers
  - Test with multiple users speaking at once
  - _Requirements: 3.4_

- [ ] 6.8 Suppress speaking indicator when muted
  - Check mute state before showing indicator
  - Never show indicator for muted users
  - _Requirements: 3.5_

- [ ] 6.9 Write property test for mute suppresses speaking indicator
  - **Property 13: Mute Suppresses Speaking Indicator**
  - **Validates: Requirements 3.5**

- [ ] 7. Device Selection
- [ ] 7.1 Create DeviceManager module
  - Create `frontend-web/src/services/deviceManager.ts`
  - Implement device enumeration methods
  - Implement device testing methods
  - Add device preference storage
  - _Requirements: 7.1, 7.2_

- [ ] 7.2 Write property test for device enumeration completeness
  - **Property 14: Device Enumeration Completeness**
  - **Validates: Requirements 7.1, 7.2**

- [ ] 7.3 Create DeviceSelector component
  - Create `frontend-web/src/components/DeviceSelector.tsx`
  - Display dropdown with available devices
  - Show current device selection
  - Handle device change events
  - _Requirements: 7.1, 7.2_

- [ ] 7.4 Implement device switching in WebRTC service
  - Add switchAudioDevice method
  - Add switchVideoDevice method
  - Replace tracks without disconnecting
  - _Requirements: 7.3, 7.4_

- [ ] 7.5 Write property test for device switch preserves connection
  - **Property 15: Device Switch Preserves Connection**
  - **Validates: Requirements 7.3, 7.4**

- [ ] 7.6 Handle device unavailability
  - Detect when selected device is unavailable
  - Fall back to default device
  - Notify user of fallback
  - _Requirements: 7.5_

- [ ] 8. Voice Settings Modal
- [ ] 8.1 Create VoiceSettings component
  - Create `frontend-web/src/components/VoiceSettings.tsx`
  - Add device selection sections
  - Add audio processing toggles (noise suppression, echo cancellation)
  - Add test microphone/camera buttons
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 8.2 Implement microphone testing
  - Capture audio from selected device
  - Display real-time audio level visualization
  - Release device when test ends
  - _Requirements: 8.2_

- [ ] 8.3 Implement camera testing
  - Capture video from selected device
  - Display video preview
  - Release device when test ends
  - _Requirements: 8.3_

- [ ] 8.4 Add device cleanup logic
  - Stop all tracks when testing completes
  - Release media devices properly
  - _Requirements: 8.4_

- [ ] 8.5 Add helpful error messages
  - Show specific error for permission denied
  - Show specific error for device not found
  - Provide troubleshooting steps
  - _Requirements: 8.5_

- [ ] 9. Individual Volume Controls
- [ ] 9.1 Create VolumeControl component
  - Create `frontend-web/src/components/VolumeControl.tsx`
  - Add volume slider (0-200%)
  - Display current volume percentage
  - Add mute button for individual user
  - _Requirements: 9.1_

- [ ] 9.2 Implement audio gain control in WebRTC service
  - Add setAudioGain method
  - Apply gain to specific user's audio stream
  - Use Web Audio API GainNode
  - _Requirements: 9.2_

- [ ] 9.3 Write property test for volume control isolation
  - **Property 16: Volume Control Isolation**
  - **Validates: Requirements 9.2**

- [ ] 9.4 Add volume persistence to voiceStore
  - Store volume settings per user ID
  - Save to localStorage
  - Load on user join
  - _Requirements: 9.4, 9.5_

- [ ] 9.5 Write property test for volume persistence round-trip
  - **Property 17: Volume Persistence Round-Trip**
  - **Validates: Requirements 9.4**

- [ ] 9.6 Integrate VolumeControl into VoiceChannel
  - Add volume slider to each participant
  - Show on hover or in context menu
  - Apply saved preferences on join
  - _Requirements: 9.1, 9.5_

- [ ] 10. Keyboard Shortcuts
- [ ] 10.1 Add keyboard shortcut handling to VoiceChannel
  - Listen for keydown events
  - Implement M key for mute toggle
  - Implement V key for video toggle
  - Implement S key for screen share toggle
  - Implement D key for disconnect
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 10.2 Write property test for keyboard shortcut response
  - **Property 18: Keyboard Shortcut Response**
  - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

- [ ] 10.3 Add visual feedback for shortcuts
  - Show toast notification when shortcut is used
  - Animate button when triggered by shortcut
  - _Requirements: 10.5_

- [ ] 10.4 Add keyboard shortcut configuration
  - Allow users to customize shortcut keys
  - Store preferences in voiceStore
  - Display current shortcuts in settings
  - _Requirements: 10.1-10.4_

- [ ] 10.5 Handle keyboard shortcut conflicts
  - Prevent shortcuts when typing in input fields
  - Disable shortcuts when modals are open
  - Document shortcut keys in UI
  - _Requirements: 10.1-10.4_

- [ ] 11. Voice Channel Notifications
- [ ] 11.1 Add notification sound files
  - Add join sound effect (subtle, short)
  - Add leave sound effect (subtle, short)
  - Store in `frontend-web/public/sounds/`
  - _Requirements: 11.1, 11.2_

- [ ] 11.2 Implement notification sound playback
  - Play join sound when user joins
  - Play leave sound when user leaves
  - Use Web Audio API for mixing
  - _Requirements: 11.1, 11.2, 11.3_

- [ ] 11.3 Add notification preferences
  - Add toggle in voice settings
  - Store preference in voiceStore
  - Respect user preference
  - _Requirements: 11.4_

- [ ] 11.4 Implement notification throttling
  - Limit to 3 sounds per 2 seconds
  - Queue additional notifications
  - _Requirements: 11.5_

- [ ] 11.5 Write property test for notification sound throttling
  - **Property 19: Notification Sound Throttling**
  - **Validates: Requirements 11.5**

- [ ] 12. Checkpoint - Ensure all Phase 2 tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Advanced Features

- [ ] 13. Enhanced Screen Sharing Layout
- [ ] 13.1 Create ScreenShareLayout component
  - Create `frontend-web/src/components/ScreenShareLayout.tsx`
  - Implement large screen share area
  - Implement thumbnail grid for participants
  - Add layout switching logic
  - _Requirements: 6.1, 6.2_

- [ ] 13.2 Write property test for screen share layout transformation
  - **Property 20: Screen Share Layout Transformation**
  - **Validates: Requirements 6.1, 6.2**

- [ ] 13.3 Implement layout state management
  - Add layout mode to voiceStore ('grid' | 'screen-share')
  - Switch layout when screen sharing starts
  - Restore layout when screen sharing ends
  - _Requirements: 6.1, 6.2, 6.4_

- [ ] 13.4 Write property test for screen share layout restoration
  - **Property 21: Screen Share Layout Restoration**
  - **Validates: Requirements 6.4**

- [ ] 13.5 Handle multiple screen shares
  - Show tabs or dropdown to switch between shares
  - Highlight active screen share
  - _Requirements: 6.3_

- [ ] 13.6 Add system audio capture for screen sharing
  - Request system audio in getDisplayMedia
  - Add audio track to screen share stream
  - _Requirements: 6.5_

- [ ] 14. Push-to-Talk Mode
- [ ] 14.1 Add push-to-talk mode to voiceStore
  - Add isPushToTalkMode boolean
  - Add isPushToTalkActive boolean
  - Add pushToTalkKey string (default: 'Space')
  - _Requirements: 12.1_

- [ ] 14.2 Implement push-to-talk key handling
  - Listen for keydown on PTT key
  - Unmute on key press
  - Listen for keyup on PTT key
  - Mute on key release
  - _Requirements: 12.2, 12.3_

- [ ] 14.3 Write property test for push-to-talk key state mapping
  - **Property 22: Push-to-Talk Key State Mapping**
  - **Validates: Requirements 12.2, 12.3**

- [ ] 14.4 Add push-to-talk visual indicator
  - Show indicator when PTT is active
  - Highlight microphone button during PTT
  - _Requirements: 12.4_

- [ ] 14.5 Add push-to-talk configuration
  - Add PTT toggle in voice settings
  - Allow key customization
  - _Requirements: 12.5_

- [ ] 15. Noise Suppression and Echo Cancellation
- [ ] 15.1 Update audio constraints in WebRTC service
  - Add noiseSuppression: true to getUserMedia constraints
  - Add echoCancellation: true to constraints
  - Add autoGainControl: true to constraints
  - _Requirements: 13.1, 13.2, 13.3_

- [ ] 15.2 Write property test for noise suppression constraint application
  - **Property 23: Noise Suppression Constraint Application**
  - **Validates: Requirements 13.1**

- [ ] 15.3 Add audio processing toggles in settings
  - Add toggle for noise suppression
  - Add toggle for echo cancellation
  - Add toggle for auto gain control
  - _Requirements: 13.5_

- [ ] 15.4 Handle audio processing failures
  - Catch errors when constraints not supported
  - Log error and continue with standard audio
  - Notify user if processing unavailable
  - _Requirements: 13.4_

- [ ] 16. Bandwidth Optimization
- [ ] 16.1 Create BandwidthOptimizer module
  - Create `frontend-web/src/services/bandwidthOptimizer.ts`
  - Implement bandwidth monitoring
  - Define quality levels (1080p, 720p, 480p, 360p, audio-only)
  - Implement quality adjustment logic
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 16.2 Write property test for bandwidth adaptation trigger
  - **Property 24: Bandwidth Adaptation Trigger**
  - **Validates: Requirements 14.1**

- [ ] 16.3 Write property test for quality recovery gradual increase
  - **Property 25: Quality Recovery Gradual Increase**
  - **Validates: Requirements 14.3**

- [ ] 16.4 Integrate bandwidth optimizer with WebRTC service
  - Monitor connection stats
  - Adjust video constraints based on bandwidth
  - Emit quality change events
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 16.5 Add quality indicator to UI
  - Show current quality level
  - Show when quality is reduced
  - Explain why quality changed
  - _Requirements: 14.4_

- [ ] 16.6 Add audio-only fallback option
  - Detect critically low bandwidth
  - Offer to disable video
  - Switch to audio-only mode
  - _Requirements: 14.5_

- [ ] 17. Voice Channel Persistence
- [ ] 17.1 Implement state persistence in voiceStore
  - Save channel ID to sessionStorage when joining
  - Save mute and video state
  - Add timestamp to detect stale state
  - _Requirements: 16.1_

- [ ] 17.2 Write property test for session storage persistence
  - **Property 26: Session Storage Persistence**
  - **Validates: Requirements 16.1**

- [ ] 17.3 Implement automatic rejoin on page load
  - Check sessionStorage on app initialization
  - Attempt to rejoin if state exists and fresh (< 5 minutes)
  - Restore previous state
  - _Requirements: 16.2, 16.3_

- [ ] 17.4 Write property test for page refresh rejoin
  - **Property 27: Page Refresh Rejoin**
  - **Validates: Requirements 16.2**

- [ ] 17.5 Write property test for state restoration after refresh
  - **Property 28: State Restoration After Refresh**
  - **Validates: Requirements 16.3**

- [ ] 17.6 Handle rejoin failures
  - Clear sessionStorage if rejoin fails
  - Show error message to user
  - Offer manual rejoin option
  - _Requirements: 16.4_

- [ ] 17.7 Clear persistence on manual leave
  - Remove sessionStorage when user clicks disconnect
  - Clear on voice channel switch
  - _Requirements: 16.5_

- [ ] 17.8 Write property test for manual leave cleanup
  - **Property 29: Manual Leave Cleanup**
  - **Validates: Requirements 16.5**

- [ ] 18. Mobile Optimization
- [ ] 18.1 Add mobile detection
  - Detect mobile platform (iOS, Android)
  - Detect mobile browser
  - Store in app state
  - _Requirements: 17.1_

- [ ] 18.2 Implement mobile-specific video constraints
  - Limit resolution to 360p on mobile
  - Reduce frame rate to 15fps on mobile
  - Adjust bitrate for mobile networks
  - _Requirements: 17.2_

- [ ] 18.3 Add mobile-optimized UI
  - Adjust layout for mobile screens
  - Larger touch targets for controls
  - Simplified UI on small screens
  - _Requirements: 17.1_

- [ ] 18.4 Handle mobile orientation changes
  - Listen for orientation change events
  - Adjust layout for portrait/landscape
  - Maintain video aspect ratios
  - _Requirements: 17.3_

- [ ] 18.5 Implement background audio support
  - Keep audio connection when app backgrounds
  - Show notification when in background voice
  - Resume video when app returns to foreground
  - _Requirements: 17.4_

- [ ] 18.6 Add battery-saving mode
  - Detect low battery
  - Offer to disable video
  - Reduce quality automatically
  - _Requirements: 17.5_

- [ ] 19. Accessibility Improvements
- [ ] 19.1 Add ARIA labels to all voice controls
  - Label mute button with current state
  - Label video button with current state
  - Label screen share button
  - Label disconnect button
  - _Requirements: 20.1_

- [ ] 19.2 Ensure keyboard navigation
  - All controls focusable via Tab
  - Visible focus indicators
  - Logical tab order
  - _Requirements: 20.2_

- [ ] 19.3 Add text alternatives for visual indicators
  - Screen reader announcements for connection state
  - Announce when users join/leave
  - Announce when speaking indicator appears
  - _Requirements: 20.3_

- [ ] 19.4 Improve focus indicators
  - High contrast focus outlines
  - Visible in all themes
  - Clear indication of focused element
  - _Requirements: 20.5_

- [ ] 20. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Documentation and Cleanup

- [ ] 21. Update Documentation
- [ ] 21.1 Update WEBRTC_IMPLEMENTATION.md
  - Document new features
  - Update architecture diagrams
  - Add configuration examples

- [ ] 21.2 Update TESTING_WEBRTC.md
  - Add testing instructions for new features
  - Update troubleshooting guide
  - Add performance testing guide

- [ ] 21.3 Create user guide
  - Document keyboard shortcuts
  - Explain voice settings
  - Provide troubleshooting tips

- [ ] 21.4 Update README.md
  - Mark WebRTC improvements as complete
  - Update feature list
  - Add screenshots/demos

- [ ] 22. Code Cleanup
- [ ] 22.1 Remove deprecated code
  - Remove old implementations
  - Clean up commented code
  - Remove unused imports

- [ ] 22.2 Optimize bundle size
  - Lazy load voice components
  - Code split large modules
  - Optimize dependencies

- [ ] 22.3 Add TypeScript strict mode
  - Enable strict null checks
  - Fix any remaining type issues
  - Add missing type definitions

- [ ] 23. Performance Testing
- [ ] 23.1 Test with multiple users
  - Test 2-person call
  - Test 4-person call
  - Test 8-person call
  - Measure CPU and memory usage

- [ ] 23.2 Test network conditions
  - Test with good connection
  - Test with poor connection
  - Test with packet loss
  - Test with high latency

- [ ] 23.3 Test on different devices
  - Test on desktop (Windows, Mac, Linux)
  - Test on mobile (iOS, Android)
  - Test on different browsers (Chrome, Firefox, Safari, Edge)

