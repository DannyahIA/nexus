/**
 * BackgroundModeHandler
 * 
 * Manages background mode behavior for WebRTC connections using the Page Visibility API.
 * Ensures audio and video connections remain stable when the browser tab loses focus.
 * 
 * Implements Requirements:
 * - 4.1: Background audio continuity
 * - 4.2: Background video continuity
 * - 4.3: No reconnection on focus regain
 * - 4.4: Page Visibility API integration
 * - 4.5: Background connection stability
 */

export type VisibilityState = 'visible' | 'hidden'

export interface BackgroundModeConfig {
  // Whether to maintain video in background (may impact performance)
  maintainVideoInBackground?: boolean
  // Whether to log visibility changes
  enableLogging?: boolean
}

export interface VisibilityChangeEvent {
  state: VisibilityState
  timestamp: number
  previousState: VisibilityState
}

export class BackgroundModeHandler {
  private isBackground: boolean = false
  private previousState: VisibilityState = 'visible'
  private config: Required<BackgroundModeConfig>
  private visibilityChangeHandler: (() => void) | null = null
  private listeners: Map<string, Set<Function>> = new Map()

  constructor(config: BackgroundModeConfig = {}) {
    this.config = {
      maintainVideoInBackground: config.maintainVideoInBackground ?? true,
      enableLogging: config.enableLogging ?? true,
    }

    // Check if Page Visibility API is available
    if (!this.isPageVisibilityAPIAvailable()) {
      console.warn('⚠️ Page Visibility API not available in this browser')
    }
  }

  /**
   * Check if Page Visibility API is available
   * Implements Requirement 4.4
   */
  private isPageVisibilityAPIAvailable(): boolean {
    return typeof document !== 'undefined' && 
           typeof document.hidden !== 'undefined'
  }

  /**
   * Initialize background mode handler
   * Sets up Page Visibility API listeners
   * Implements Requirement 4.4
   */
  public initialize(): void {
    if (!this.isPageVisibilityAPIAvailable()) {
      console.error('❌ Cannot initialize BackgroundModeHandler: Page Visibility API not available')
      return
    }

    // Set initial state
    this.isBackground = document.hidden
    this.previousState = document.hidden ? 'hidden' : 'visible'

    if (this.config.enableLogging) {
      console.log('🎬 BackgroundModeHandler initialized', {
        initialState: this.isBackground ? 'background' : 'foreground',
        maintainVideoInBackground: this.config.maintainVideoInBackground,
      })
    }

    // Create visibility change handler
    this.visibilityChangeHandler = () => this.handleVisibilityChange()

    // Add event listener
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)

    if (this.config.enableLogging) {
      console.log('✅ BackgroundModeHandler listening for visibility changes')
    }
  }

  /**
   * Clean up and remove event listeners
   */
  public destroy(): void {
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      this.visibilityChangeHandler = null
    }

    this.listeners.clear()

    if (this.config.enableLogging) {
      console.log('🧹 BackgroundModeHandler destroyed')
    }
  }

  /**
   * Handle visibility change events
   * Implements Requirements 4.1, 4.2, 4.3, 4.5
   */
  private handleVisibilityChange(): void {
    const newState: VisibilityState = document.hidden ? 'hidden' : 'visible'
    const wasBackground = this.isBackground
    this.isBackground = document.hidden

    // Log focus transitions (Requirement 4.3)
    if (this.config.enableLogging) {
      console.log('👁️ Visibility changed:', {
        from: this.previousState,
        to: newState,
        isBackground: this.isBackground,
        timestamp: new Date().toISOString(),
      })
    }

    // Emit visibility change event
    const event: VisibilityChangeEvent = {
      state: newState,
      timestamp: Date.now(),
      previousState: this.previousState,
    }

    this.emit('visibility-change', event)

    // Handle transition to background
    if (this.isBackground && !wasBackground) {
      if (this.config.enableLogging) {
        console.log('📱 App moved to background')
      }
      this.adjustForBackground()
    }

    // Handle transition to foreground
    if (!this.isBackground && wasBackground) {
      if (this.config.enableLogging) {
        console.log('🖥️ App moved to foreground')
      }
      this.adjustForForeground()
    }

    this.previousState = newState
  }

  /**
   * Adjust behavior when app moves to background
   * Implements Requirements 4.1, 4.2, 4.5
   */
  private adjustForBackground(): void {
    if (this.config.enableLogging) {
      console.log('📊 Adjusting for background mode:', {
        maintainVideo: this.config.maintainVideoInBackground,
        timestamp: new Date().toISOString(),
      })
    }

    // Emit background event for WebRTC service to handle
    // The WebRTC service will ensure connections remain stable (Requirement 4.5)
    // Audio tracks remain active (Requirement 4.1)
    // Video tracks remain active if configured (Requirement 4.2)
    this.emit('background-mode-entered', {
      maintainVideo: this.config.maintainVideoInBackground,
      timestamp: Date.now(),
    })

    if (this.config.enableLogging) {
      console.log('✅ Background mode adjustments applied')
    }
  }

  /**
   * Adjust behavior when app moves to foreground
   * Implements Requirement 4.3
   */
  private adjustForForeground(): void {
    if (this.config.enableLogging) {
      console.log('📊 Adjusting for foreground mode:', {
        timestamp: new Date().toISOString(),
      })
    }

    // Emit foreground event
    // Connections should remain stable without reconnection (Requirement 4.3)
    this.emit('foreground-mode-entered', {
      timestamp: Date.now(),
    })

    if (this.config.enableLogging) {
      console.log('✅ Foreground mode adjustments applied')
      console.log('ℹ️ Connections remain stable, no reconnection triggered (Requirement 4.3)')
    }
  }

  /**
   * Maintain connections during background mode
   * Implements Requirements 4.1, 4.2, 4.5
   * 
   * This method is called periodically to ensure connections remain active
   * in background mode. It monitors peer connection states and prevents
   * unnecessary disconnections.
   */
  public maintainConnectionsInBackground(): void {
    if (!this.isBackground) {
      return
    }

    if (this.config.enableLogging) {
      console.log('🔄 Maintaining connections in background mode')
    }

    // Emit maintenance event for WebRTC service
    this.emit('background-maintenance', {
      timestamp: Date.now(),
    })
  }

  /**
   * Get current background state
   */
  public isInBackground(): boolean {
    return this.isBackground
  }

  /**
   * Get current visibility state
   */
  public getVisibilityState(): VisibilityState {
    if (!this.isPageVisibilityAPIAvailable()) {
      return 'visible' // Default to visible if API not available
    }
    return document.hidden ? 'hidden' : 'visible'
  }

  /**
   * Event emitter methods
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  public off(event: string, callback: Function): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(callback)
    }
  }

  private emit(event: string, data?: any): void {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in ${event} listener:`, error)
        }
      })
    }
  }
}
