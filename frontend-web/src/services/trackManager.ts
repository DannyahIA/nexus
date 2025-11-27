// Track Manager Service for robust media track management
// Implements Requirements 6.4 (operation queuing), 7.1 (state tracking)

export type TrackType = 'camera' | 'screen' | 'none'

export interface TrackState {
  type: TrackType
  track: MediaStreamTrack | null
  isActive: boolean
  timestamp: number
}

interface TrackOperation {
  id: string
  type: 'add-video' | 'remove-video' | 'start-screen-share' | 'stop-screen-share' | 'replace-track'
  execute: () => Promise<boolean>
  resolve: (value: boolean) => void
  reject: (error: Error) => void
}

/**
 * TrackManager handles media track lifecycle and prevents race conditions
 * through operation queuing.
 */
export class TrackManager {
  private currentVideoTrack: TrackState
  private operationQueue: TrackOperation[] = []
  private isProcessing: boolean = false
  private operationIdCounter: number = 0

  constructor() {
    this.currentVideoTrack = {
      type: 'none',
      track: null,
      isActive: false,
      timestamp: Date.now(),
    }
  }

  /**
   * Queue an operation to prevent race conditions
   * Implements Requirement 6.4: Queue operations to prevent race conditions
   * 
   * @param operationType - Type of operation being queued
   * @param operation - Async function to execute
   * @returns Promise that resolves when operation completes
   */
  async queueOperation(
    operationType: TrackOperation['type'],
    operation: () => Promise<boolean>
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const operationId = `op-${++this.operationIdCounter}-${Date.now()}`
      
      const trackOperation: TrackOperation = {
        id: operationId,
        type: operationType,
        execute: operation,
        resolve,
        reject,
      }

      this.operationQueue.push(trackOperation)
      console.log(`📋 Queued operation ${operationId} (${operationType}), queue length: ${this.operationQueue.length}`)

      // Always try to start processing (processQueue will check if already processing)
      // Use setTimeout to ensure this runs asynchronously
      setTimeout(() => this.processQueue(), 0)
    })
  }

  /**
   * Process queued operations sequentially
   * Implements Requirement 7.5: Proper error handling for async operations
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('📋 Already processing queue, skipping')
      return
    }
    
    if (this.operationQueue.length === 0) {
      console.log('📋 Queue is empty, nothing to process')
      return
    }

    this.isProcessing = true
    console.log(`📋 Starting queue processing, ${this.operationQueue.length} operation(s) in queue`)

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift()!
      
      console.log(`⚙️ Processing operation ${operation.id} (${operation.type})`)

      try {
        // Add timeout to prevent hanging operations
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timeout after 30 seconds')), 30000)
        })
        
        const result = await Promise.race([
          operation.execute(),
          timeoutPromise
        ])
        
        operation.resolve(result)
        console.log(`✅ Operation ${operation.id} completed successfully`)
      } catch (error) {
        console.error(`❌ Operation ${operation.id} failed:`, error)
        
        // Ensure error is properly handled (Requirement 7.5)
        if (error instanceof Error) {
          operation.reject(error)
        } else {
          operation.reject(new Error(`Operation failed: ${String(error)}`))
        }
      }
    }

    this.isProcessing = false
    console.log('📋 Operation queue empty, processing complete')
  }

  /**
   * Get current video track
   * Implements Requirement 7.1: Maintain clear state of current active tracks
   * 
   * @returns Current video track or null
   */
  getCurrentVideoTrack(): MediaStreamTrack | null {
    return this.currentVideoTrack.track
  }

  /**
   * Get current track type
   * Implements Requirement 7.1: Maintain clear state of current active tracks
   * 
   * @returns Current track type
   */
  getCurrentTrackType(): TrackType {
    return this.currentVideoTrack.type
  }

  /**
   * Get current track state
   * Implements Requirement 7.1: Maintain clear state of current active tracks
   * 
   * @returns Complete track state
   */
  getCurrentTrackState(): TrackState {
    return { ...this.currentVideoTrack }
  }

  /**
   * Check if video is currently active
   * 
   * @returns True if video track is active
   */
  isVideoActive(): boolean {
    return this.currentVideoTrack.isActive && this.currentVideoTrack.track !== null
  }

  /**
   * Update track state
   * Implements Requirement 7.1: Maintain clear state of current active tracks
   * 
   * @param type - Type of track
   * @param track - Media stream track
   * @param isActive - Whether track is active
   */
  updateTrackState(type: TrackType, track: MediaStreamTrack | null, isActive: boolean): void {
    // Clean up old track if it exists and is different from new track
    if (this.currentVideoTrack.track && this.currentVideoTrack.track !== track) {
      this.cleanupTrack(this.currentVideoTrack.track)
    }

    this.currentVideoTrack = {
      type,
      track,
      isActive,
      timestamp: Date.now(),
    }

    console.log(`📊 Track state updated: type=${type}, active=${isActive}, trackId=${track?.id || 'none'}`)
  }

  /**
   * Clean up a media track
   * Implements Requirement 7.2: Properly stop all tracks
   * 
   * @param track - Track to clean up
   */
  cleanupTrack(track: MediaStreamTrack): void {
    if (!track) {
      return
    }

    try {
      // Check if track is still live before stopping
      if (track.readyState === 'live') {
        track.stop()
        console.log(`🧹 Cleaned up track: ${track.kind} (${track.id})`)
      } else {
        console.log(`🧹 Track already stopped: ${track.kind} (${track.id})`)
      }
    } catch (error) {
      console.error('❌ Error cleaning up track:', error)
    }
  }

  /**
   * Clean up current video track
   * Implements Requirement 7.2: Properly stop all tracks
   */
  cleanupCurrentTrack(): void {
    if (this.currentVideoTrack.track) {
      this.cleanupTrack(this.currentVideoTrack.track)
      this.currentVideoTrack = {
        type: 'none',
        track: null,
        isActive: false,
        timestamp: Date.now(),
      }
      console.log('🧹 Current track cleaned up and state reset')
    }
  }

  /**
   * Reset track manager state
   * Useful for cleanup when leaving voice channel
   */
  reset(): void {
    console.log('🔄 Resetting track manager')
    
    // Clean up current track
    this.cleanupCurrentTrack()
    
    // Clear operation queue
    this.operationQueue.forEach(op => {
      op.reject(new Error('Track manager reset'))
    })
    this.operationQueue = []
    this.isProcessing = false
    
    console.log('✅ Track manager reset complete')
  }

  /**
   * Get queue status for debugging
   * 
   * @returns Queue status information
   */
  getQueueStatus(): { queueLength: number; isProcessing: boolean; currentTrackType: TrackType } {
    return {
      queueLength: this.operationQueue.length,
      isProcessing: this.isProcessing,
      currentTrackType: this.currentVideoTrack.type,
    }
  }

  /**
   * Save current track state snapshot for recovery
   * Implements Requirement 6.5: Track replacement failure recovery
   * 
   * @returns Snapshot of current track state
   */
  saveStateSnapshot(): TrackState {
    return { ...this.currentVideoTrack }
  }

  /**
   * Restore track state from snapshot
   * Implements Requirement 6.5: Track replacement failure recovery
   * 
   * @param snapshot - Previously saved track state
   */
  restoreStateSnapshot(snapshot: TrackState): void {
    console.log('🔄 Restoring track state from snapshot', {
      from: { type: this.currentVideoTrack.type, trackId: this.currentVideoTrack.track?.id },
      to: { type: snapshot.type, trackId: snapshot.track?.id },
    })
    
    this.currentVideoTrack = {
      ...snapshot,
      timestamp: Date.now(), // Update timestamp to current time
    }
    
    console.log('✅ Track state restored from snapshot')
  }
}
