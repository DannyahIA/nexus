// Environment Configuration and Validation

export interface EnvironmentConfig {
  apiUrl: string
  wsUrl: string
  turnUrl: string
  turnUsername: string
  turnPassword: string
  environment: 'development' | 'production' | 'test'
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates all environment variables required by the application
 * @returns ValidationResult with validation status and any errors/warnings
 */
export function validateEnvironmentConfig(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check API URL
  const apiUrl = import.meta.env.VITE_API_URL
  if (!apiUrl) {
    errors.push('VITE_API_URL is required. Please set it in your .env file.')
  } else {
    try {
      new URL(apiUrl)
    } catch {
      errors.push(`VITE_API_URL is not a valid URL: ${apiUrl}`)
    }
  }

  // Check WebSocket URL
  const wsUrl = import.meta.env.VITE_WS_URL
  if (!wsUrl) {
    errors.push('VITE_WS_URL is required. Please set it in your .env file.')
  } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    errors.push('VITE_WS_URL must start with "ws://" or "wss://"')
  }

  // Check TURN URL
  const turnUrl = import.meta.env.VITE_TURN_URL
  if (!turnUrl) {
    warnings.push('VITE_TURN_URL is not configured. WebRTC may fail behind NAT/firewalls.')
  } else if (!turnUrl.startsWith('turn:') && !turnUrl.startsWith('turns:')) {
    errors.push('VITE_TURN_URL must start with "turn:" or "turns:"')
  }

  // Check TURN username
  const turnUsername = import.meta.env.VITE_TURN_USERNAME
  if (!turnUrl && !turnUsername) {
    // Only warn if TURN URL is also missing
  } else if (!turnUsername) {
    warnings.push('VITE_TURN_USERNAME is not configured. TURN server may not work.')
  } else if (turnUsername.length < 3) {
    warnings.push('VITE_TURN_USERNAME is very short. Consider using a longer username.')
  }

  // Check TURN password
  const turnPassword = import.meta.env.VITE_TURN_PASSWORD
  if (!turnUrl && !turnPassword) {
    // Only warn if TURN URL is also missing
  } else if (!turnPassword) {
    warnings.push('VITE_TURN_PASSWORD is not configured. TURN server may not work.')
  } else if (turnPassword.length < 6) {
    warnings.push('VITE_TURN_PASSWORD is weak. Consider using a stronger password.')
  }

  // Environment-specific checks
  const mode = import.meta.env.MODE
  if (mode === 'production') {
    if (apiUrl?.startsWith('http://localhost')) {
      warnings.push('Using localhost API URL in production mode')
    }
    if (wsUrl?.startsWith('ws://localhost')) {
      warnings.push('Using localhost WebSocket URL in production mode')
    }
    if (!wsUrl?.startsWith('wss://')) {
      warnings.push('Using insecure WebSocket (ws://) in production. Consider using wss://')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Gets environment configuration from environment variables
 * @throws Error if configuration is invalid
 * @returns EnvironmentConfig object
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const validation = validateEnvironmentConfig()

  if (!validation.isValid) {
    const errorMessage = [
      'Environment configuration is invalid:',
      '',
      ...validation.errors.map(e => `  ❌ ${e}`),
      '',
      'Please check your .env file and ensure all required variables are set.',
      'See .env.example for reference.',
    ].join('\n')
    
    console.error(errorMessage)
    throw new Error('Invalid environment configuration')
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️ Environment configuration warnings:')
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }

  const mode = import.meta.env.MODE
  const environment = mode === 'production' ? 'production' : mode === 'test' ? 'test' : 'development'

  return {
    apiUrl: import.meta.env.VITE_API_URL,
    wsUrl: import.meta.env.VITE_WS_URL,
    turnUrl: import.meta.env.VITE_TURN_URL || '',
    turnUsername: import.meta.env.VITE_TURN_USERNAME || '',
    turnPassword: import.meta.env.VITE_TURN_PASSWORD || '',
    environment,
  }
}

/**
 * Logs environment configuration status (without exposing sensitive data)
 */
export function logEnvironmentConfigStatus(): void {
  const validation = validateEnvironmentConfig()
  const mode = import.meta.env.MODE

  console.log('🔧 Environment Configuration Status')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📦 Mode: ${mode}`)
  console.log(`🌐 API URL: ${import.meta.env.VITE_API_URL || '❌ Not configured'}`)
  console.log(`🔌 WebSocket URL: ${import.meta.env.VITE_WS_URL || '❌ Not configured'}`)
  console.log(`📡 TURN Server: ${import.meta.env.VITE_TURN_URL || '⚠️ Not configured (STUN-only mode)'}`)
  console.log(`👤 TURN Username: ${import.meta.env.VITE_TURN_USERNAME ? '✓' : '⚠️ Not configured'}`)
  console.log(`🔑 TURN Password: ${import.meta.env.VITE_TURN_PASSWORD ? '✓' : '⚠️ Not configured'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (validation.isValid) {
    console.log('✅ Configuration is valid')
  } else {
    console.error('❌ Configuration is invalid:')
    validation.errors.forEach(error => console.error(`  - ${error}`))
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️ Warnings:')
    validation.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }
}

/**
 * Initializes and validates environment configuration on app startup
 * Call this early in your application initialization
 */
export function initializeEnvironment(): EnvironmentConfig {
  try {
    const config = getEnvironmentConfig()
    logEnvironmentConfigStatus()
    return config
  } catch (error) {
    console.error('Failed to initialize environment configuration:', error)
    throw error
  }
}
