/**
 * ConnectionMonitor - Monitors WebRTC peer connection quality and statistics
 * 
 * Tracks connection state, latency, packet loss, bandwidth, and jitter
 * for each peer connection and calculates overall connection quality.
 */

export interface ConnectionQuality {
  state: RTCPeerConnectionState
  latency: number // milliseconds
  packetLoss: number // percentage (0-1)
  bandwidth: number // kbps
  jitter: number // milliseconds
  quality: 'excellent' | 'good' | 'poor' | 'critical'
}

type QualityChangeCallback = (userId: string, quality: ConnectionQuality) => void

export class ConnectionMonitor {
  private connections: Map<string, RTCPeerConnection> = new Map()
  private statsIntervals: Map<string, number> = new Map()
  private previousStats: Map<string, RTCStatsReport> = new Map()
  private currentQuality: Map<string, ConnectionQuality> = new Map()
  private qualityChangeCallbacks: Set<QualityChangeCallback> = new Set()
  private statsInterval: number = 1000 // 1 second

  /**
   * Start monitoring a peer connection
   */
  startMonitoring(userId: string, connection: RTCPeerConnection): void {
    console.log('📊 Starting connection monitoring for', userId)
    
    // Store connection
    this.connections.set(userId, connection)
    
    // Initialize quality
    this.currentQuality.set(userId, {
      state: connection.connectionState,
      latency: 0,
      packetLoss: 0,
      bandwidth: 0,
      jitter: 0,
      quality: 'excellent'
    })
    
    // Start periodic stats collection
    const intervalId = window.setInterval(async () => {
      await this.collectStats(userId)
    }, this.statsInterval)
    
    this.statsIntervals.set(userId, intervalId)
    
    // Monitor connection state changes
    connection.onconnectionstatechange = () => {
      this.handleConnectionStateChange(userId, connection.connectionState)
    }
  }

  /**
   * Stop monitoring a peer connection
   */
  stopMonitoring(userId: string): void {
    console.log('📊 Stopping connection monitoring for', userId)
    
    // Clear interval
    const intervalId = this.statsIntervals.get(userId)
    if (intervalId) {
      clearInterval(intervalId)
      this.statsIntervals.delete(userId)
    }
    
    // Clean up data
    this.connections.delete(userId)
    this.previousStats.delete(userId)
    this.currentQuality.delete(userId)
  }

  /**
   * Get current connection quality for a user
   */
  getConnectionQuality(userId: string): ConnectionQuality | null {
    return this.currentQuality.get(userId) || null
  }

  /**
   * Register callback for quality changes
   */
  onQualityChange(callback: QualityChangeCallback): void {
    this.qualityChangeCallbacks.add(callback)
  }

  /**
   * Unregister callback for quality changes
   */
  offQualityChange(callback: QualityChangeCallback): void {
    this.qualityChangeCallbacks.delete(callback)
  }

  /**
   * Collect statistics from peer connection
   */
  private async collectStats(userId: string): Promise<void> {
    const connection = this.connections.get(userId)
    if (!connection) return

    try {
      const stats = await connection.getStats()
      const previousStats = this.previousStats.get(userId)
      
      // Calculate metrics
      const metrics = this.calculateMetrics(stats, previousStats)
      
      // Store current stats for next comparison
      this.previousStats.set(userId, stats)
      
      // Update quality
      const quality: ConnectionQuality = {
        state: connection.connectionState,
        latency: metrics.latency,
        packetLoss: metrics.packetLoss,
        bandwidth: metrics.bandwidth,
        jitter: metrics.jitter,
        quality: this.calculateQualityLevel(metrics)
      }
      
      // Check if quality changed
      const previousQuality = this.currentQuality.get(userId)
      const qualityChanged = !previousQuality || 
        previousQuality.quality !== quality.quality ||
        previousQuality.state !== quality.state
      
      // Update stored quality
      this.currentQuality.set(userId, quality)
      
      // Emit quality change event if changed
      if (qualityChanged) {
        this.emitQualityChange(userId, quality)
      }
    } catch (error) {
      console.error('Failed to collect stats for', userId, error)
    }
  }

  /**
   * Calculate metrics from WebRTC stats
   */
  private calculateMetrics(
    stats: RTCStatsReport,
    previousStats?: RTCStatsReport
  ): {
    latency: number
    packetLoss: number
    bandwidth: number
    jitter: number
  } {
    let latency = 0
    let packetLoss = 0
    let bandwidth = 0
    let jitter = 0

    // Iterate through stats to find relevant metrics
    stats.forEach((report) => {
      // Inbound RTP stream stats (receiving)
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        // Calculate packet loss
        if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
          const totalPackets = report.packetsReceived + report.packetsLost
          if (totalPackets > 0) {
            packetLoss = report.packetsLost / totalPackets
          }
        }
        
        // Get jitter
        if (report.jitter !== undefined) {
          jitter = report.jitter * 1000 // Convert to milliseconds
        }
      }
      
      // Candidate pair stats (for latency)
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (report.currentRoundTripTime !== undefined) {
          latency = report.currentRoundTripTime * 1000 // Convert to milliseconds
        }
      }
      
      // Calculate bandwidth from inbound-rtp
      if (report.type === 'inbound-rtp' && previousStats) {
        const previousReport = Array.from(previousStats.values()).find(
          (r: any) => r.type === 'inbound-rtp' && r.ssrc === report.ssrc
        )
        
        if (previousReport && report.bytesReceived && previousReport.bytesReceived) {
          const bytesDiff = report.bytesReceived - previousReport.bytesReceived
          const timeDiff = (report.timestamp - previousReport.timestamp) / 1000 // Convert to seconds
          
          if (timeDiff > 0) {
            bandwidth = (bytesDiff * 8) / timeDiff / 1000 // Convert to kbps
          }
        }
      }
    })

    return { latency, packetLoss, bandwidth, jitter }
  }

  /**
   * Calculate overall quality level from metrics
   */
  private calculateQualityLevel(metrics: {
    latency: number
    packetLoss: number
    bandwidth: number
    jitter: number
  }): 'excellent' | 'good' | 'poor' | 'critical' {
    // Critical: High packet loss or very high latency
    if (metrics.packetLoss > 0.1 || metrics.latency > 500) {
      return 'critical'
    }
    
    // Poor: Moderate packet loss or high latency
    if (metrics.packetLoss > 0.05 || metrics.latency > 300) {
      return 'poor'
    }
    
    // Good: Low packet loss and moderate latency
    if (metrics.packetLoss > 0.01 || metrics.latency > 150) {
      return 'good'
    }
    
    // Excellent: Very low packet loss and low latency
    return 'excellent'
  }

  /**
   * Handle connection state changes
   */
  private handleConnectionStateChange(userId: string, state: RTCPeerConnectionState): void {
    console.log('📊 Connection state changed for', userId, ':', state)
    
    const quality = this.currentQuality.get(userId)
    if (quality) {
      quality.state = state
      this.currentQuality.set(userId, quality)
      this.emitQualityChange(userId, quality)
    }
  }

  /**
   * Emit quality change event to all registered callbacks
   */
  private emitQualityChange(userId: string, quality: ConnectionQuality): void {
    this.qualityChangeCallbacks.forEach(callback => {
      try {
        callback(userId, quality)
      } catch (error) {
        console.error('Error in quality change callback:', error)
      }
    })
  }
}

// Export singleton instance
export const connectionMonitor = new ConnectionMonitor()
