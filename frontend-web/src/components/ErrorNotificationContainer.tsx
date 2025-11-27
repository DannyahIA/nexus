import { useState, useEffect, useCallback } from 'react'
import ErrorNotification, { ErrorNotificationData } from './ErrorNotification'
import { webrtcService } from '../services/webrtc'

export default function ErrorNotificationContainer() {
  const [notifications, setNotifications] = useState<ErrorNotificationData[]>([])

  // Add notification helper
  const addNotification = useCallback((notification: Omit<ErrorNotificationData, 'id'>) => {
    const id = `notification-${Date.now()}-${Math.random()}`
    setNotifications(prev => [...prev, { ...notification, id }])
  }, [])

  // Remove notification helper
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // Listen for WebRTC errors (Requirement 6.3)
  useEffect(() => {
    const handleVideoError = (data: any) => {
      addNotification({
        error: data.error || 'Video error occurred',
        severity: data.severity || 'error',
        action: data.action || 'dismiss',
        guidance: data.guidance,
        technicalDetails: data.technicalDetails || data.details,
        autoHide: data.severity === 'info',
        autoHideDelay: 5000,
      })
    }

    const handleReconnecting = (data: { userId: string; attempt: number; maxAttempts: number }) => {
      addNotification({
        error: 'Connection Lost',
        severity: 'warning',
        action: 'dismiss',
        guidance: `Attempting to reconnect (${data.attempt}/${data.maxAttempts})...`,
        autoHide: true,
        autoHideDelay: 3000,
      })
    }

    const handleReconnectionFailed = (data: { userId: string; attempts: number }) => {
      addNotification({
        error: 'Reconnection Failed',
        severity: 'error',
        action: 'reconnect',
        guidance: 'Unable to reconnect after multiple attempts. Please try reconnecting manually.',
        onReconnect: () => {
          webrtcService.manualReconnect(data.userId)
        },
      })
    }

    const handleNetworkOffline = (data: { message: string }) => {
      addNotification({
        error: 'Network Offline',
        severity: 'error',
        action: 'dismiss',
        guidance: data.message || 'Network connection lost. Waiting for connection to be restored...',
      })
    }

    const handleNetworkChange = (data: { eventType: string; online: boolean }) => {
      if (data.eventType === 'online') {
        addNotification({
          error: 'Network Restored',
          severity: 'info',
          action: 'dismiss',
          guidance: 'Network connection has been restored. Reconnecting...',
          autoHide: true,
          autoHideDelay: 3000,
        })
      }
    }

    const handleTurnFallbackAttempted = (_data: { userId: string }) => {
      addNotification({
        error: 'Connection Fallback',
        severity: 'warning',
        action: 'dismiss',
        guidance: 'Direct connection failed. Attempting to connect via relay server...',
        autoHide: true,
        autoHideDelay: 4000,
      })
    }

    const handleStunFallbackAttempted = (data: { userId: string; warning: string; limitations: string[] }) => {
      addNotification({
        error: 'Limited Connection Mode',
        severity: 'warning',
        action: 'dismiss',
        guidance: data.warning,
        technicalDetails: `Limitations:\n${data.limitations.join('\n')}`,
        autoHide: false,
      })
    }

    const handleStunFallbackFailed = (data: { userId: string; reason: string; message: string }) => {
      addNotification({
        error: 'Connection Failed',
        severity: 'error',
        action: 'reconnect',
        guidance: data.message,
        technicalDetails: `Reason: ${data.reason}`,
        onReconnect: () => {
          webrtcService.manualReconnect(data.userId)
        },
      })
    }

    const handleUnexpectedDisconnect = (_data: { userId: string }) => {
      addNotification({
        error: 'User Disconnected',
        severity: 'warning',
        action: 'dismiss',
        guidance: 'A user has disconnected unexpectedly. Attempting to reconnect...',
        autoHide: true,
        autoHideDelay: 4000,
      })
    }

    // Register event listeners
    webrtcService.on('video-error', handleVideoError)
    webrtcService.on('reconnecting', handleReconnecting)
    webrtcService.on('reconnection-failed', handleReconnectionFailed)
    webrtcService.on('network-offline', handleNetworkOffline)
    webrtcService.on('network-change', handleNetworkChange)
    webrtcService.on('turn-fallback-attempted', handleTurnFallbackAttempted)
    webrtcService.on('stun-fallback-attempted', handleStunFallbackAttempted)
    webrtcService.on('stun-fallback-failed', handleStunFallbackFailed)
    webrtcService.on('unexpected-disconnect', handleUnexpectedDisconnect)

    return () => {
      webrtcService.off('video-error', handleVideoError)
      webrtcService.off('reconnecting', handleReconnecting)
      webrtcService.off('reconnection-failed', handleReconnectionFailed)
      webrtcService.off('network-offline', handleNetworkOffline)
      webrtcService.off('network-change', handleNetworkChange)
      webrtcService.off('turn-fallback-attempted', handleTurnFallbackAttempted)
      webrtcService.off('stun-fallback-attempted', handleStunFallbackAttempted)
      webrtcService.off('stun-fallback-failed', handleStunFallbackFailed)
      webrtcService.off('unexpected-disconnect', handleUnexpectedDisconnect)
    }
  }, [addNotification])

  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
      <div className="space-y-3 pointer-events-auto">
        {notifications.map(notification => (
          <ErrorNotification
            key={notification.id}
            notification={notification}
            onClose={removeNotification}
          />
        ))}
      </div>
    </div>
  )
}
