/**
 * Media Error Handler
 * Provides user-friendly error messages and guidance for media device errors
 * Implements Requirement 6.1: User-friendly error messages
 */

export interface MediaErrorInfo {
  error: string
  severity: 'error' | 'warning' | 'info'
  action: 'check-permissions' | 'check-device' | 'retry' | 'reconnect'
  technicalDetails?: string
}

/**
 * Get user-friendly error message for media device errors
 * @param error - The error object from getUserMedia or related operations
 * @param context - Additional context about the operation (e.g., 'camera', 'microphone', 'both')
 * @returns MediaErrorInfo with user-friendly message and guidance
 */
export function getMediaErrorInfo(error: unknown, context: 'camera' | 'microphone' | 'both' = 'both'): MediaErrorInfo {
  if (!(error instanceof Error)) {
    return {
      error: 'An unexpected error occurred while accessing media devices.',
      severity: 'error',
      action: 'retry',
      technicalDetails: String(error),
    }
  }

  const errorName = error.name
  const errorMessage = error.message

  switch (errorName) {
    case 'NotAllowedError':
      return {
        error: getPermissionDeniedMessage(context),
        severity: 'error',
        action: 'check-permissions',
        technicalDetails: errorMessage,
      }

    case 'NotFoundError':
      return {
        error: getDeviceNotFoundMessage(context),
        severity: 'error',
        action: 'check-device',
        technicalDetails: errorMessage,
      }

    case 'NotReadableError':
      return {
        error: getDeviceInUseMessage(context),
        severity: 'error',
        action: 'check-device',
        technicalDetails: errorMessage,
      }

    case 'OverconstrainedError':
      return {
        error: getConstraintsNotSupportedMessage(context),
        severity: 'warning',
        action: 'retry',
        technicalDetails: errorMessage,
      }

    case 'AbortError':
      return {
        error: 'Media device access was aborted. This may be due to a hardware issue or browser restriction.',
        severity: 'error',
        action: 'retry',
        technicalDetails: errorMessage,
      }

    case 'SecurityError':
      return {
        error: 'Media device access was blocked due to security restrictions. Please ensure you are using HTTPS or localhost.',
        severity: 'error',
        action: 'check-permissions',
        technicalDetails: errorMessage,
      }

    case 'TypeError':
      return {
        error: 'Invalid media device configuration. Please try again.',
        severity: 'error',
        action: 'retry',
        technicalDetails: errorMessage,
      }

    default:
      // Check for specific error messages
      if (errorMessage.includes('permission')) {
        return {
          error: getPermissionDeniedMessage(context),
          severity: 'error',
          action: 'check-permissions',
          technicalDetails: errorMessage,
        }
      } else if (errorMessage.includes('not found') || errorMessage.includes('no device')) {
        return {
          error: getDeviceNotFoundMessage(context),
          severity: 'error',
          action: 'check-device',
          technicalDetails: errorMessage,
        }
      } else if (errorMessage.includes('in use') || errorMessage.includes('already')) {
        return {
          error: getDeviceInUseMessage(context),
          severity: 'error',
          action: 'check-device',
          technicalDetails: errorMessage,
        }
      } else {
        return {
          error: `Failed to access ${getDeviceLabel(context)}. Please check your devices and try again.`,
          severity: 'error',
          action: 'retry',
          technicalDetails: errorMessage,
        }
      }
  }
}

/**
 * Get permission denied message based on context
 */
function getPermissionDeniedMessage(context: 'camera' | 'microphone' | 'both'): string {
  switch (context) {
    case 'camera':
      return 'Camera permission denied. Please allow camera access in your browser settings and reload the page.'
    case 'microphone':
      return 'Microphone permission denied. Please allow microphone access in your browser settings and reload the page.'
    case 'both':
      return 'Microphone and camera permissions denied. Please allow access in your browser settings and reload the page.'
  }
}

/**
 * Get device not found message based on context
 */
function getDeviceNotFoundMessage(context: 'camera' | 'microphone' | 'both'): string {
  switch (context) {
    case 'camera':
      return 'No camera found. Please connect a camera and try again.'
    case 'microphone':
      return 'No microphone found. Please connect a microphone and try again.'
    case 'both':
      return 'No microphone or camera found. Please connect audio/video devices and try again.'
  }
}

/**
 * Get device in use message based on context
 */
function getDeviceInUseMessage(context: 'camera' | 'microphone' | 'both'): string {
  switch (context) {
    case 'camera':
      return 'Camera is already in use by another application. Please close other apps using the camera and try again.'
    case 'microphone':
      return 'Microphone is already in use by another application. Please close other apps using the microphone and try again.'
    case 'both':
      return 'Microphone or camera is already in use by another application. Please close other apps using these devices and try again.'
  }
}

/**
 * Get constraints not supported message based on context
 */
function getConstraintsNotSupportedMessage(context: 'camera' | 'microphone' | 'both'): string {
  switch (context) {
    case 'camera':
      return 'Your camera does not support the requested video quality. Trying with default settings.'
    case 'microphone':
      return 'Your microphone does not support the requested audio settings. Trying with default settings.'
    case 'both':
      return 'Your camera or microphone does not support the requested settings. Trying with default settings.'
  }
}

/**
 * Get device label for generic messages
 */
function getDeviceLabel(context: 'camera' | 'microphone' | 'both'): string {
  switch (context) {
    case 'camera':
      return 'camera'
    case 'microphone':
      return 'microphone'
    case 'both':
      return 'microphone/camera'
  }
}

/**
 * Get detailed guidance for resolving media device errors
 * @param errorInfo - The error info from getMediaErrorInfo
 * @returns Array of step-by-step guidance strings
 */
export function getErrorGuidance(errorInfo: MediaErrorInfo): string[] {
  switch (errorInfo.action) {
    case 'check-permissions':
      return [
        'Click the camera/microphone icon in your browser\'s address bar',
        'Select "Always allow" for this site',
        'Reload the page and try again',
        'If the issue persists, check your system settings to ensure the browser has permission to access your devices',
      ]

    case 'check-device':
      return [
        'Ensure your camera and microphone are properly connected',
        'Check if other applications are using your devices and close them',
        'Try unplugging and reconnecting your devices',
        'Restart your browser and try again',
        'If using external devices, check they are selected as default in system settings',
      ]

    case 'retry':
      return [
        'Wait a moment and try again',
        'Refresh the page if the issue persists',
        'Check your internet connection',
        'Try using a different browser if the problem continues',
      ]

    case 'reconnect':
      return [
        'Leave the voice channel and rejoin',
        'Check your internet connection',
        'Refresh the page if the issue persists',
        'Contact support if the problem continues',
      ]

    default:
      return ['Please try again or contact support if the issue persists']
  }
}
