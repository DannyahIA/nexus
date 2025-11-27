/**
 * ReconnectionManager
 * 
 * Manages automatic reconnection for WebRTC peer connections with exponential backoff.
 * Implements Requirements 2.4
 * 
 * Features:
 * - Exponential backoff strategy (1s, 2s, 4s)
 * - Maximum reconnection attempts limit
 * - Reconnection attempt tracking per peer
 * - Timeout management for scheduled reconnections
 * - Event emission for reconnection state changes
 */

export interface ReconnectionConfig {
  maxAttempts: number
  backoffDelays: number[]
}

export interface ReconnectionState {
  attempts: number
  timeout: NodeJS.Timeout | null
  lastAttemptTime: number
}

export type ReconnectionCallback = (userId: string, attempt: number) => Promise<void>

export class ReconnectionManager {
  private maxAttempts: number
  private backoffDelays: number[]
  private reconnectionStates: Map<string, ReconnectionState> = new Map()
  private reconnectionCallback: ReconnectionCallback | null = null

  constructor(config?: Partial<ReconnectionConfig>) {
    this.maxAttempts = config?.maxAttempts ?? 3
    this.backoffDelays = config?.backoffDelays ?? [1000, 2000, 4000]
    
    console.log('🔄 ReconnectionManager initialized:', {
      maxAttempts: this.maxAttempts,
      backoffDelays: this.backoffDelays,
    })
  }

  /**
   * Set the callback function to be called when reconnection is attempted
   * 
   * @param callback - Function to call for reconnection
   */
  setReconnectionCallback(callback: ReconnectionCallback): void {
    this.reconnectionCallback = callback
  }

  /**
   * Attempt reconnection for a user with exponential backoff
   * Implements Requirement 2.4
   * 
   * @param userId - User ID to reconnect to
   * @returns Promise that resolves when reconnection is scheduled or rejected
   */
  async attemptReconnection(userId: string): Promise<void> {
    // Check if already reconnecting
    const state = this.reconnectionStates.get(userId)
    if (state?.timeout) {
      console.log(`⚠️ Already attempting reconnection for ${userId}`)
      return
    }

    // Get current attempt count
    const attempts = state?.attempts ?? 0

    // Check if max attempts reached
    if (attempts >= this.maxAttempts) {
      console.error(`❌ Max reconnection attempts (${this.maxAttempts}) reached for ${userId}`)
      this.cleanupReconnectionState(userId)
      throw new Error(`Max reconnection attempts reached for ${userId}`)
    }

    // Calculate backoff delay
    const delay = this.calculateBackoff(attempts)

    console.log(`🔄 Scheduling reconnection attempt ${attempts + 1}/${this.maxAttempts} for ${userId} in ${delay}ms`)

    // Schedule reconnection
    const timeout = setTimeout(async () => {
      try {
        console.log(`🔄 Executing reconnection attempt ${attempts + 1} for ${userId}`)

        // Update state
        const currentState = this.reconnectionStates.get(userId)
        if (currentState) {
          currentState.attempts = attempts + 1
          currentState.timeout = null
          currentState.lastAttemptTime = Date.now()
        }

        // Execute reconnection callback
        if (this.reconnectionCallback) {
          await this.reconnectionCallback(userId, attempts + 1)
          console.log(`✅ Reconnection attempt ${attempts + 1} completed for ${userId}`)
        } else {
          console.error('❌ No reconnection callback set')
          throw new Error('No reconnection callback set')
        }

      } catch (error) {
        console.error(`❌ Reconnection attempt ${attempts + 1} failed for ${userId}:`, error)

        // Clear timeout reference
        const currentState = this.reconnectionStates.get(userId)
        if (currentState) {
          currentState.timeout = null
        }

        // Try again if we haven't reached max attempts
        if (attempts + 1 < this.maxAttempts) {
          await this.attemptReconnection(userId)
        } else {
          console.error(`❌ All reconnection attempts exhausted for ${userId}`)
          this.cleanupReconnectionState(userId)
          throw error
        }
      }
    }, delay)

    // Store reconnection state
    this.reconnectionStates.set(userId, {
      attempts: attempts,
      timeout: timeout,
      lastAttemptTime: Date.now(),
    })
  }

  /**
   * Calculate exponential backoff delay for reconnection attempt
   * Implements Requirement 2.4
   * 
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  calculateBackoff(attempt: number): number {
    // Use configured delay for this attempt, or last delay if attempt exceeds array length
    const delay = this.backoffDelays[attempt] ?? this.backoffDelays[this.backoffDelays.length - 1]
    return delay
  }

  /**
   * Check if reconnection should be attempted for a user
   * 
   * @param userId - User ID to check
   * @returns True if reconnection should be attempted
   */
  shouldAttemptReconnection(userId: string): boolean {
    const state = this.reconnectionStates.get(userId)
    if (!state) {
      return true // No previous attempts, should attempt
    }

    return state.attempts < this.maxAttempts
  }

  /**
   * Get current reconnection attempt count for a user
   * 
   * @param userId - User ID to check
   * @returns Current attempt count
   */
  getAttemptCount(userId: string): number {
    return this.reconnectionStates.get(userId)?.attempts ?? 0
  }

  /**
   * Cancel pending reconnection for a user
   * 
   * @param userId - User ID to cancel reconnection for
   */
  cancelReconnection(userId: string): void {
    const state = this.reconnectionStates.get(userId)
    if (state?.timeout) {
      console.log(`🚫 Canceling reconnection for ${userId}`)
      clearTimeout(state.timeout)
      state.timeout = null
    }
  }

  /**
   * Reset reconnection state for a user
   * 
   * @param userId - User ID to reset
   */
  resetReconnectionState(userId: string): void {
    console.log(`🔄 Resetting reconnection state for ${userId}`)
    this.cancelReconnection(userId)
    this.reconnectionStates.delete(userId)
  }

  /**
   * Clean up reconnection state for a user
   * 
   * @param userId - User ID to clean up
   */
  private cleanupReconnectionState(userId: string): void {
    console.log(`🧹 Cleaning up reconnection state for ${userId}`)
    this.cancelReconnection(userId)
    this.reconnectionStates.delete(userId)
  }

  /**
   * Clean up all reconnection states
   */
  cleanupAll(): void {
    console.log(`🧹 Cleaning up all reconnection states (${this.reconnectionStates.size} users)`)
    
    this.reconnectionStates.forEach((state, userId) => {
      if (state.timeout) {
        console.log(`  Canceling reconnection timeout for ${userId}`)
        clearTimeout(state.timeout)
      }
    })
    
    this.reconnectionStates.clear()
  }

  /**
   * Get all users with active reconnection attempts
   * 
   * @returns Array of user IDs with active reconnections
   */
  getActiveReconnections(): string[] {
    return Array.from(this.reconnectionStates.keys())
  }

  /**
   * Get reconnection state for a user
   * 
   * @param userId - User ID to get state for
   * @returns Reconnection state or null if not found
   */
  getReconnectionState(userId: string): ReconnectionState | null {
    return this.reconnectionStates.get(userId) ?? null
  }
}
