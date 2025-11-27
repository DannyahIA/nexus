import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, AlertTriangle, Signal, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ConnectionQuality } from '../services/connectionMonitor'

interface ConnectionQualityIndicatorProps {
  userId: string
  quality: ConnectionQuality | null
  showDetails?: boolean
}

interface QualityHistory {
  timestamp: number
  quality: string
  latency: number
  packetLoss: number
}

export default function ConnectionQualityIndicator({
  userId: _userId,
  quality,
  showDetails = false
}: ConnectionQualityIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [qualityHistory, setQualityHistory] = useState<QualityHistory[]>([])
  const [showWarning, setShowWarning] = useState(false)
  const previousQualityRef = useRef<string | null>(null)

  // Track quality history and trends (Requirement 9.2)
  useEffect(() => {
    if (!quality) return

    // Add current quality to history
    setQualityHistory(prev => {
      const newHistory = [
        ...prev,
        {
          timestamp: Date.now(),
          quality: quality.quality,
          latency: quality.latency,
          packetLoss: quality.packetLoss,
        }
      ]
      
      // Keep only last 10 entries for trend analysis
      return newHistory.slice(-10)
    })

    // Check for quality degradation and show warning (Requirement 9.2)
    if (previousQualityRef.current) {
      const qualityLevels = ['excellent', 'good', 'poor', 'critical']
      const prevLevel = qualityLevels.indexOf(previousQualityRef.current)
      const currentLevel = qualityLevels.indexOf(quality.quality)
      
      // Show warning if quality degraded
      if (currentLevel > prevLevel && (quality.quality === 'poor' || quality.quality === 'critical')) {
        setShowWarning(true)
        
        // Auto-hide warning after 5 seconds
        setTimeout(() => {
          setShowWarning(false)
        }, 5000)
      }
    }

    previousQualityRef.current = quality.quality
  }, [quality])

  // Calculate quality trend from history (Requirement 9.2)
  const getQualityTrend = (): 'improving' | 'degrading' | 'stable' => {
    if (qualityHistory.length < 3) return 'stable'

    const recent = qualityHistory.slice(-3)
    const qualityLevels = ['excellent', 'good', 'poor', 'critical']
    
    const levels = recent.map(h => qualityLevels.indexOf(h.quality))
    
    // Check if consistently improving
    if (levels[0] > levels[1] && levels[1] > levels[2]) {
      return 'improving'
    }
    
    // Check if consistently degrading
    if (levels[0] < levels[1] && levels[1] < levels[2]) {
      return 'degrading'
    }
    
    return 'stable'
  }

  // Get average latency from recent history
  const getAverageLatency = (): number => {
    if (qualityHistory.length === 0) return 0
    
    const recent = qualityHistory.slice(-5)
    const sum = recent.reduce((acc, h) => acc + h.latency, 0)
    return sum / recent.length
  }

  // Get average packet loss from recent history
  const getAveragePacketLoss = (): number => {
    if (qualityHistory.length === 0) return 0
    
    const recent = qualityHistory.slice(-5)
    const sum = recent.reduce((acc, h) => acc + h.packetLoss, 0)
    return sum / recent.length
  }

  if (!quality) {
    return null
  }

  // Determine icon and color based on connection state and quality
  const getIndicatorInfo = () => {
    // Connection state takes priority
    if (quality.state === 'failed' || quality.state === 'closed') {
      return {
        icon: WifiOff,
        color: 'text-red-500',
        bgColor: 'bg-red-500/10',
        label: 'Disconnected',
        description: 'Connection failed'
      }
    }

    if (quality.state === 'connecting' || quality.state === 'new') {
      return {
        icon: Signal,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        label: 'Connecting',
        description: 'Establishing connection...'
      }
    }

    if (quality.state === 'disconnected') {
      return {
        icon: AlertTriangle,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        label: 'Disconnected',
        description: 'Connection lost'
      }
    }

    // If connected, show quality level
    switch (quality.quality) {
      case 'excellent':
        return {
          icon: Wifi,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          label: 'Excellent',
          description: 'Connection quality is excellent'
        }
      case 'good':
        return {
          icon: Wifi,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          label: 'Good',
          description: 'Connection quality is good'
        }
      case 'poor':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          label: 'Poor',
          description: 'Connection quality is degraded'
        }
      case 'critical':
        return {
          icon: WifiOff,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          label: 'Critical',
          description: 'Connection quality is very poor'
        }
      default:
        return {
          icon: Wifi,
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
          label: 'Unknown',
          description: 'Connection status unknown'
        }
    }
  }

  const info = getIndicatorInfo()
  const Icon = info.icon
  const trend = getQualityTrend()
  const avgLatency = getAverageLatency()
  const avgPacketLoss = getAveragePacketLoss()

  // Get trend icon (Requirement 9.2)
  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'degrading' ? TrendingDown : Minus

  return (
    <div className="relative inline-block">
      {/* Quality Warning Banner (Requirement 9.2) */}
      {showWarning && quality && (quality.quality === 'poor' || quality.quality === 'critical') && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-yellow-600 border border-yellow-500 rounded-lg shadow-lg z-50 animate-pulse">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold mb-1">Connection Quality Degraded</div>
              <div className="text-xs opacity-90">
                {quality.quality === 'critical' 
                  ? 'Connection is very poor. You may experience audio/video issues.'
                  : 'Connection quality has decreased. Consider reducing video quality.'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex items-center gap-1 px-2 py-1 rounded ${info.bgColor} cursor-pointer`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Icon className={`w-4 h-4 ${info.color}`} />
        {showDetails && (
          <>
            <span className={`text-xs font-medium ${info.color}`}>
              {info.label}
            </span>
            {/* Show trend indicator (Requirement 9.2) */}
            {quality && quality.state === 'connected' && qualityHistory.length >= 3 && (
              <TrendIcon className={`w-3 h-3 ${
                trend === 'improving' ? 'text-green-500' : 
                trend === 'degrading' ? 'text-red-500' : 
                'text-gray-500'
              }`} />
            )}
          </>
        )}
      </div>

      {/* Tooltip with detailed stats and trends (Requirement 9.2) */}
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 p-3 bg-dark-800 border border-dark-700 rounded-lg shadow-lg">
          <div className="text-sm font-semibold mb-2">{info.description}</div>
          
          <div className="space-y-1 text-xs text-dark-300">
            <div className="flex justify-between">
              <span>State:</span>
              <span className="font-medium text-white capitalize">{quality.state}</span>
            </div>
            
            {quality.state === 'connected' && (
              <>
                <div className="flex justify-between">
                  <span>Quality:</span>
                  <span className={`font-medium ${info.color} capitalize`}>
                    {quality.quality}
                  </span>
                </div>

                {/* Quality Trend (Requirement 9.2) */}
                {qualityHistory.length >= 3 && (
                  <div className="flex justify-between">
                    <span>Trend:</span>
                    <span className={`font-medium flex items-center gap-1 ${
                      trend === 'improving' ? 'text-green-500' : 
                      trend === 'degrading' ? 'text-red-500' : 
                      'text-gray-400'
                    }`}>
                      <TrendIcon className="w-3 h-3" />
                      {trend === 'improving' ? 'Improving' : 
                       trend === 'degrading' ? 'Degrading' : 
                       'Stable'}
                    </span>
                  </div>
                )}
                
                {/* Current Metrics */}
                <div className="border-t border-dark-700 my-2 pt-2">
                  <div className="text-xs font-semibold text-dark-400 mb-1">Current Metrics</div>
                  
                  <div className="flex justify-between">
                    <span>Latency:</span>
                    <span className="font-medium text-white">
                      {quality.latency.toFixed(0)}ms
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Packet Loss:</span>
                    <span className="font-medium text-white">
                      {(quality.packetLoss * 100).toFixed(1)}%
                    </span>
                  </div>
                  
                  {quality.bandwidth > 0 && (
                    <div className="flex justify-between">
                      <span>Bandwidth:</span>
                      <span className="font-medium text-white">
                        {quality.bandwidth.toFixed(0)} kbps
                      </span>
                    </div>
                  )}
                  
                  {quality.jitter > 0 && (
                    <div className="flex justify-between">
                      <span>Jitter:</span>
                      <span className="font-medium text-white">
                        {quality.jitter.toFixed(1)}ms
                      </span>
                    </div>
                  )}
                </div>

                {/* Average Metrics (Requirement 9.2) */}
                {qualityHistory.length >= 2 && (
                  <div className="border-t border-dark-700 my-2 pt-2">
                    <div className="text-xs font-semibold text-dark-400 mb-1">
                      Average (last {Math.min(5, qualityHistory.length)} samples)
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Avg Latency:</span>
                      <span className="font-medium text-white">
                        {avgLatency.toFixed(0)}ms
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span>Avg Packet Loss:</span>
                      <span className="font-medium text-white">
                        {(avgPacketLoss * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Quality Warnings (Requirement 9.2) */}
                {(quality.quality === 'poor' || quality.quality === 'critical') && (
                  <div className="border-t border-dark-700 my-2 pt-2">
                    <div className="flex items-start gap-2 text-yellow-500">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="text-xs">
                        {quality.quality === 'critical' ? (
                          <>
                            <div className="font-semibold mb-1">Critical Quality</div>
                            <div className="text-yellow-400">
                              Connection is very poor. Consider:
                              <ul className="list-disc list-inside mt-1 space-y-0.5">
                                <li>Disabling video</li>
                                <li>Checking network connection</li>
                                <li>Moving closer to router</li>
                              </ul>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-semibold mb-1">Poor Quality</div>
                            <div className="text-yellow-400">
                              Connection quality is degraded. Consider reducing video quality or checking network.
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-dark-800"></div>
          </div>
        </div>
      )}
    </div>
  )
}
