import { useState, useEffect } from 'react'
import { AlertCircle, X, RefreshCw, CheckCircle, Loader } from 'lucide-react'

export interface ErrorNotificationData {
  id: string
  error: string
  severity: 'error' | 'warning' | 'info'
  action?: 'retry' | 'reconnect' | 'dismiss'
  guidance?: string
  technicalDetails?: string
  onRetry?: () => Promise<void>
  onReconnect?: () => void
  onDismiss?: () => void
  autoHide?: boolean
  autoHideDelay?: number
}

interface ErrorNotificationProps {
  notification: ErrorNotificationData
  onClose: (id: string) => void
}

export default function ErrorNotification({ notification, onClose }: ErrorNotificationProps) {
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoverySuccess, setRecoverySuccess] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  // Auto-hide notification after delay (Requirement 6.3)
  useEffect(() => {
    if (notification.autoHide) {
      const delay = notification.autoHideDelay || 5000
      const timer = setTimeout(() => {
        onClose(notification.id)
      }, delay)

      return () => clearTimeout(timer)
    }
  }, [notification.autoHide, notification.autoHideDelay, notification.id, onClose])

  // Auto-close after successful recovery
  useEffect(() => {
    if (recoverySuccess) {
      const timer = setTimeout(() => {
        onClose(notification.id)
      }, 2000)

      return () => clearTimeout(timer)
    }
  }, [recoverySuccess, notification.id, onClose])

  const handleRetry = async () => {
    if (!notification.onRetry) return

    setIsRecovering(true)
    setRecoveryError(null)

    try {
      await notification.onRetry()
      setRecoverySuccess(true)
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Recovery failed')
    } finally {
      setIsRecovering(false)
    }
  }

  const handleReconnect = () => {
    if (!notification.onReconnect) return

    setIsRecovering(true)
    setRecoveryError(null)

    try {
      notification.onReconnect()
      setRecoverySuccess(true)
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Reconnection failed')
    } finally {
      setIsRecovering(false)
    }
  }

  const handleDismiss = () => {
    if (notification.onDismiss) {
      notification.onDismiss()
    }
    onClose(notification.id)
  }

  // Get color scheme based on severity
  const getColorScheme = () => {
    if (recoverySuccess) {
      return {
        bg: 'bg-green-600',
        border: 'border-green-500',
        icon: 'text-green-200',
        text: 'text-white',
      }
    }

    switch (notification.severity) {
      case 'error':
        return {
          bg: 'bg-red-600',
          border: 'border-red-500',
          icon: 'text-red-200',
          text: 'text-white',
        }
      case 'warning':
        return {
          bg: 'bg-yellow-600',
          border: 'border-yellow-500',
          icon: 'text-yellow-200',
          text: 'text-white',
        }
      case 'info':
        return {
          bg: 'bg-blue-600',
          border: 'border-blue-500',
          icon: 'text-blue-200',
          text: 'text-white',
        }
      default:
        return {
          bg: 'bg-dark-700',
          border: 'border-dark-600',
          icon: 'text-dark-300',
          text: 'text-white',
        }
    }
  }

  const colors = getColorScheme()

  return (
    <div
      className={`${colors.bg} ${colors.border} border rounded-lg shadow-lg p-4 min-w-[320px] max-w-md animate-slide-in`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 ${colors.icon}`}>
          {recoverySuccess ? (
            <CheckCircle className="w-6 h-6" />
          ) : isRecovering ? (
            <Loader className="w-6 h-6 animate-spin" />
          ) : (
            <AlertCircle className="w-6 h-6" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Error Message */}
          <div className={`font-semibold ${colors.text} mb-1`}>
            {recoverySuccess ? 'Recovery Successful' : notification.error}
          </div>

          {/* Guidance */}
          {notification.guidance && !recoverySuccess && (
            <div className={`text-sm ${colors.text} opacity-90 mb-2`}>
              {notification.guidance}
            </div>
          )}

          {/* Recovery Progress (Requirement 6.3) */}
          {isRecovering && (
            <div className={`text-sm ${colors.text} opacity-90 mb-2 flex items-center gap-2`}>
              <Loader className="w-4 h-4 animate-spin" />
              <span>Attempting recovery...</span>
            </div>
          )}

          {/* Recovery Success Message */}
          {recoverySuccess && (
            <div className={`text-sm ${colors.text} opacity-90 mb-2`}>
              The issue has been resolved successfully.
            </div>
          )}

          {/* Recovery Error */}
          {recoveryError && (
            <div className="text-sm text-red-200 bg-red-800/30 rounded p-2 mb-2">
              {recoveryError}
            </div>
          )}

          {/* Technical Details (collapsible) */}
          {notification.technicalDetails && !recoverySuccess && (
            <details className="mt-2">
              <summary className={`text-xs ${colors.text} opacity-75 cursor-pointer hover:opacity-100`}>
                Technical Details
              </summary>
              <div className={`text-xs ${colors.text} opacity-75 mt-1 font-mono bg-black/20 rounded p-2`}>
                {notification.technicalDetails}
              </div>
            </details>
          )}

          {/* Action Buttons (Requirement 6.3) */}
          {!recoverySuccess && (
            <div className="flex items-center gap-2 mt-3">
              {notification.action === 'retry' && notification.onRetry && (
                <button
                  onClick={handleRetry}
                  disabled={isRecovering}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
                  Retry
                </button>
              )}

              {notification.action === 'reconnect' && notification.onReconnect && (
                <button
                  onClick={handleReconnect}
                  disabled={isRecovering}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
                  Reconnect
                </button>
              )}

              {notification.action === 'dismiss' && (
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className={`flex-shrink-0 ${colors.icon} hover:opacity-75 transition-opacity`}
          aria-label="Close notification"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
