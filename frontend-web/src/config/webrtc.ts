// WebRTC Configuration and Validation

export interface WebRTCConfig {
  turnUrl: string
  turnUsername: string
  turnPassword: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates WebRTC configuration from environment variables
 * @returns ValidationResult with validation status and any errors/warnings
 */
export function validateWebRTCConfig(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check TURN URL
  const turnUrl = import.meta.env.VITE_TURN_URL
  if (!turnUrl) {
    errors.push('VITE_TURN_URL is not configured')
  } else if (!turnUrl.startsWith('turn:') && !turnUrl.startsWith('turns:')) {
    errors.push('VITE_TURN_URL must start with "turn:" or "turns:"')
  }

  // Check TURN username
  const turnUsername = import.meta.env.VITE_TURN_USERNAME
  if (!turnUsername) {
    errors.push('VITE_TURN_USERNAME is not configured')
  } else if (turnUsername.length < 3) {
    warnings.push('VITE_TURN_USERNAME is very short, consider using a longer username')
  }

  // Check TURN password
  const turnPassword = import.meta.env.VITE_TURN_PASSWORD
  if (!turnPassword) {
    errors.push('VITE_TURN_PASSWORD is not configured')
  } else if (turnPassword.length < 6) {
    warnings.push('VITE_TURN_PASSWORD is weak, consider using a stronger password')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Gets WebRTC configuration from environment variables
 * @throws Error if configuration is invalid
 * @returns WebRTCConfig object
 */
export function getWebRTCConfig(): WebRTCConfig {
  const validation = validateWebRTCConfig()

  if (!validation.isValid) {
    const errorMessage = `WebRTC configuration is invalid:\n${validation.errors.join('\n')}`
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  if (validation.warnings.length > 0) {
    console.warn('WebRTC configuration warnings:', validation.warnings)
  }

  return {
    turnUrl: import.meta.env.VITE_TURN_URL,
    turnUsername: import.meta.env.VITE_TURN_USERNAME,
    turnPassword: import.meta.env.VITE_TURN_PASSWORD,
  }
}

/**
 * Logs WebRTC configuration status (without exposing sensitive data)
 */
export function logWebRTCConfigStatus(): void {
  const validation = validateWebRTCConfig()

  if (validation.isValid) {
    console.log('✅ WebRTC configuration is valid')
    console.log('📡 TURN server configured:', import.meta.env.VITE_TURN_URL)
    console.log('👤 TURN username configured:', import.meta.env.VITE_TURN_USERNAME ? '✓' : '✗')
    console.log('🔑 TURN password configured:', import.meta.env.VITE_TURN_PASSWORD ? '✓' : '✗')
  } else {
    console.error('❌ WebRTC configuration is invalid:')
    validation.errors.forEach(error => console.error(`  - ${error}`))
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️ WebRTC configuration warnings:')
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }
}
