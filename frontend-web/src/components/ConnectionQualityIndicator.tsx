import { useState, useEffect } from 'react'
import { Wifi, WifiOff, AlertTriangle, Signal } from 'lucide-react'
import { ConnectionQuality } from '../services/connectionMonitor'

interface ConnectionQualityIndicatorProps {
  userId: string
  quality: ConnectionQuality | null
  showDetails?: boolean
}

export default function ConnectionQualityIndicator({
  userId,
  quality,
  showDetails = false
}: ConnectionQualityIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)

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

  return (
    <div className="relative inline-block">
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded ${info.bgColor} cursor-pointer`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Icon className={`w-4 h-4 ${info.color}`} />
        {showDetails && (
          <span className={`text-xs font-medium ${info.color}`}>
            {info.label}
          </span>
        )}
      </div>

      {/* Tooltip with detailed stats */}
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-dark-800 border border-dark-700 rounded-lg shadow-lg">
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
