/**
 * Centralized Error Logging Utility
 * Implements Requirement 6.4: Error context logging
 * 
 * This utility provides consistent error logging with detailed context,
 * stack traces, and connection state information throughout the WebRTC service.
 */

export interface ErrorContext {
  operation: string
  peerId?: string
  channelId?: string
  connectionState?: string
  iceConnectionState?: string
  signalingState?: string
  [key: string]: any
}

export interface ErrorLog {
  timestamp: number
  errorType: string
  errorName: string
  errorMessage: string
  stack?: string
  context: ErrorContext
  recoveryAttempted: boolean
  recoverySuccessful?: boolean
}

/**
 * Enhanced error logger that captures detailed context
 */
export class ErrorLogger {
  private errorLogs: ErrorLog[] = []
  private maxLogs: number = 100 // Keep last 100 errors

  /**
   * Log an error with detailed context
   * 
   * @param error - The error object
   * @param context - Additional context about the operation
   * @param recoveryAttempted - Whether automatic recovery was attempted
   * @param recoverySuccessful - Whether recovery was successful (if attempted)
   */
  logError(
    error: unknown,
    context: ErrorContext,
    recoveryAttempted: boolean = false,
    recoverySuccessful?: boolean
  ): ErrorLog {
    const errorObj = error instanceof Error ? error : new Error(String(error))
    
    const errorLog: ErrorLog = {
      timestamp: Date.now(),
      errorType: this.categorizeError(errorObj),
      errorName: errorObj.name,
      errorMessage: errorObj.message,
      stack: errorObj.stack,
      context,
      recoveryAttempted,
      recoverySuccessful,
    }

    // Store error log
    this.errorLogs.push(errorLog)
    
    // Trim logs if exceeding max
    if (this.errorLogs.length > this.maxLogs) {
      this.errorLogs.shift()
    }

    // Log to console with full context
    console.error('❌ Error occurred:', {
      operation: context.operation,
      error: errorLog.errorMessage,
      errorName: errorLog.errorName,
      errorType: errorLog.errorType,
      peerId: context.peerId,
      channelId: context.channelId,
      connectionState: context.connectionState,
      iceConnectionState: context.iceConnectionState,
      signalingState: context.signalingState,
      recoveryAttempted,
      recoverySuccessful,
      timestamp: new Date(errorLog.timestamp).toISOString(),
      ...context,
    })

    // Log stack trace separately for readability
    if (errorLog.stack) {
      console.error('📚 Stack trace:', errorLog.stack)
    }

    return errorLog
  }

  /**
   * Log an error with peer connection state context
   * 
   * @param error - The error object
   * @param operation - The operation that failed
   * @param peerId - The peer connection ID
   * @param pc - The RTCPeerConnection object
   * @param additionalContext - Any additional context
   */
  logPeerConnectionError(
    error: unknown,
    operation: string,
    peerId: string,
    pc: RTCPeerConnection | null,
    additionalContext: Record<string, any> = {}
  ): ErrorLog {
    const context: ErrorContext = {
      operation,
      peerId,
      connectionState: pc?.connectionState,
      iceConnectionState: pc?.iceConnectionState,
      signalingState: pc?.signalingState,
      ...additionalContext,
    }

    return this.logError(error, context)
  }

  /**
   * Log an error with channel context
   * 
   * @param error - The error object
   * @param operation - The operation that failed
   * @param channelId - The channel ID
   * @param additionalContext - Any additional context
   */
  logChannelError(
    error: unknown,
    operation: string,
    channelId: string | null,
    additionalContext: Record<string, any> = {}
  ): ErrorLog {
    const context: ErrorContext = {
      operation,
      channelId: channelId || 'none',
      ...additionalContext,
    }

    return this.logError(error, context)
  }

  /**
   * Log an error with media device context
   * 
   * @param error - The error object
   * @param operation - The operation that failed
   * @param deviceType - The type of device (camera, microphone, etc.)
   * @param additionalContext - Any additional context
   */
  logMediaDeviceError(
    error: unknown,
    operation: string,
    deviceType: string,
    additionalContext: Record<string, any> = {}
  ): ErrorLog {
    const context: ErrorContext = {
      operation,
      deviceType,
      ...additionalContext,
    }

    return this.logError(error, context)
  }

  /**
   * Categorize error type for analytics
   */
  private categorizeError(error: Error): string {
    // Media device errors
    if (error.name === 'NotAllowedError') return 'permission-denied'
    if (error.name === 'NotFoundError') return 'device-not-found'
    if (error.name === 'NotReadableError') return 'device-in-use'
    if (error.name === 'OverconstrainedError') return 'constraints-not-supported'
    if (error.name === 'AbortError') return 'device-aborted'

    // WebRTC errors
    if (error.message.includes('ICE')) return 'ice-error'
    if (error.message.includes('signaling')) return 'signaling-error'
    if (error.message.includes('negotiation')) return 'negotiation-error'
    if (error.message.includes('connection')) return 'connection-error'
    if (error.message.includes('track')) return 'track-error'
    if (error.message.includes('sender')) return 'sender-error'

    // Network errors
    if (error.message.includes('network')) return 'network-error'
    if (error.message.includes('timeout')) return 'timeout-error'
    if (error.message.includes('WebSocket')) return 'websocket-error'

    // Configuration errors
    if (error.message.includes('TURN')) return 'turn-error'
    if (error.message.includes('STUN')) return 'stun-error'
    if (error.message.includes('config')) return 'configuration-error'

    return 'unknown-error'
  }

  /**
   * Get all error logs
   */
  getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs]
  }

  /**
   * Get recent error logs (last N errors)
   */
  getRecentErrors(count: number = 10): ErrorLog[] {
    return this.errorLogs.slice(-count)
  }

  /**
   * Get errors by type
   */
  getErrorsByType(errorType: string): ErrorLog[] {
    return this.errorLogs.filter(log => log.errorType === errorType)
  }

  /**
   * Get errors by peer
   */
  getErrorsByPeer(peerId: string): ErrorLog[] {
    return this.errorLogs.filter(log => log.context.peerId === peerId)
  }

  /**
   * Clear all error logs
   */
  clearLogs(): void {
    this.errorLogs = []
  }

  /**
   * Export error logs for diagnostics
   */
  exportLogs(): string {
    return JSON.stringify(this.errorLogs, null, 2)
  }
}

// Singleton instance
export const errorLogger = new ErrorLogger()
