import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { validateEnvironmentConfig } from './environment'

/**
 * Property-Based Tests for Environment Configuration
 * 
 * Feature: webrtc-stability-improvements, Property 27: Clear missing config errors
 * Validates: Requirements 8.3
 * 
 * These tests verify that missing or invalid environment variables
 * produce clear, actionable error messages.
 */

describe('Environment Configuration Property Tests', () => {
  // Store original env values
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_WS_URL: import.meta.env.VITE_WS_URL,
      VITE_TURN_URL: import.meta.env.VITE_TURN_URL,
      VITE_TURN_USERNAME: import.meta.env.VITE_TURN_USERNAME,
      VITE_TURN_PASSWORD: import.meta.env.VITE_TURN_PASSWORD,
    }
  })

  afterEach(() => {
    // Restore original environment
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] !== undefined) {
        import.meta.env[key] = originalEnv[key]
      } else {
        delete import.meta.env[key]
      }
    })
  })

  /**
   * Property 27: Clear missing config errors
   * For any missing required environment variable, the validation should
   * return a clear error message that indicates what is needed
   */
  it('Property 27: should provide clear error messages for missing required variables', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('VITE_API_URL', 'VITE_WS_URL'),
        (missingVar) => {
          // Set up valid environment
          import.meta.env.VITE_API_URL = 'http://localhost:8000'
          import.meta.env.VITE_WS_URL = 'ws://localhost:8080'

          // Remove the variable we're testing
          delete import.meta.env[missingVar]

          const result = validateEnvironmentConfig()

          // Should not be valid
          expect(result.isValid).toBe(false)

          // Should have at least one error
          expect(result.errors.length).toBeGreaterThan(0)

          // Error message should mention the missing variable
          const hasRelevantError = result.errors.some(error =>
            error.includes(missingVar)
          )
          expect(hasRelevantError).toBe(true)

          // Error message should provide guidance (mention .env file)
          const hasGuidance = result.errors.some(error =>
            error.toLowerCase().includes('.env') ||
            error.toLowerCase().includes('set') ||
            error.toLowerCase().includes('required')
          )
          expect(hasGuidance).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Invalid URL formats should produce clear error messages
   * For any invalid URL format, the error message should indicate
   * what format is expected
   */
  it('should provide clear error messages for invalid URL formats', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
          // Generate strings that are NOT valid URLs
          try {
            new URL(s)
            return false
          } catch {
            return true
          }
        }),
        (invalidUrl) => {
          // Set up environment with invalid API URL
          import.meta.env.VITE_API_URL = invalidUrl
          import.meta.env.VITE_WS_URL = 'ws://localhost:8080'

          const result = validateEnvironmentConfig()

          // Should not be valid
          expect(result.isValid).toBe(false)

          // Should have error about invalid URL
          const hasUrlError = result.errors.some(error =>
            error.includes('VITE_API_URL') &&
            (error.toLowerCase().includes('valid') ||
             error.toLowerCase().includes('url'))
          )
          expect(hasUrlError).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: WebSocket URLs with wrong protocol should produce clear errors
   * For any WebSocket URL that doesn't start with ws:// or wss://,
   * the error should clearly indicate the expected format
   */
  it('should provide clear error messages for invalid WebSocket URL protocols', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http://', 'https://', 'ftp://', 'tcp://'),
        fc.string({ minLength: 5, maxLength: 20 }),
        (protocol, domain) => {
          // Set up environment with invalid WebSocket URL
          import.meta.env.VITE_API_URL = 'http://localhost:8000'
          import.meta.env.VITE_WS_URL = protocol + domain

          const result = validateEnvironmentConfig()

          // Should not be valid
          expect(result.isValid).toBe(false)

          // Should have error about WebSocket protocol
          const hasWsError = result.errors.some(error =>
            error.includes('VITE_WS_URL') &&
            (error.includes('ws://') || error.includes('wss://'))
          )
          expect(hasWsError).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: TURN URL with wrong protocol should produce clear warnings/errors
   * For any TURN URL that doesn't start with turn: or turns:,
   * the error should clearly indicate the expected format
   */
  it('should provide clear error messages for invalid TURN URL protocols', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http://', 'https://', 'ws://', 'tcp://'),
        fc.string({ minLength: 5, maxLength: 20 }),
        (protocol, domain) => {
          // Set up environment with invalid TURN URL
          import.meta.env.VITE_API_URL = 'http://localhost:8000'
          import.meta.env.VITE_WS_URL = 'ws://localhost:8080'
          import.meta.env.VITE_TURN_URL = protocol + domain

          const result = validateEnvironmentConfig()

          // Should not be valid
          expect(result.isValid).toBe(false)

          // Should have error about TURN protocol
          const hasTurnError = result.errors.some(error =>
            error.includes('VITE_TURN_URL') &&
            (error.includes('turn:') || error.includes('turns:'))
          )
          expect(hasTurnError).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: Valid configuration should have no errors
   * For any valid configuration, validation should pass with no errors
   */
  it('should have no errors for valid configuration', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.integer({ min: 1000, max: 65535 }),
        (apiDomain, wsPort) => {
          // Set up valid environment
          import.meta.env.VITE_API_URL = apiDomain
          import.meta.env.VITE_WS_URL = `ws://localhost:${wsPort}`
          import.meta.env.VITE_TURN_URL = 'turn:localhost:3478'
          import.meta.env.VITE_TURN_USERNAME = 'testuser'
          import.meta.env.VITE_TURN_PASSWORD = 'testpass'

          const result = validateEnvironmentConfig()

          // Should be valid
          expect(result.isValid).toBe(true)

          // Should have no errors
          expect(result.errors.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Missing TURN configuration should produce warnings, not errors
   * For any configuration missing TURN settings, validation should warn
   * but not fail (TURN is optional but recommended)
   */
  it('should warn but not error for missing TURN configuration', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        (apiUrl) => {
          // Set up environment without TURN
          import.meta.env.VITE_API_URL = apiUrl
          import.meta.env.VITE_WS_URL = 'ws://localhost:8080'
          delete import.meta.env.VITE_TURN_URL
          delete import.meta.env.VITE_TURN_USERNAME
          delete import.meta.env.VITE_TURN_PASSWORD

          const result = validateEnvironmentConfig()

          // Should still be valid (TURN is optional)
          expect(result.isValid).toBe(true)

          // Should have warnings about TURN
          const hasTurnWarning = result.warnings.some(warning =>
            warning.includes('TURN') || warning.includes('turn')
          )
          expect(hasTurnWarning).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Property: Error messages should be actionable
   * For any validation error, the message should contain actionable guidance
   * (e.g., "set", "configure", "add", "check", etc.)
   */
  it('should provide actionable guidance in all error messages', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { VITE_API_URL: undefined, VITE_WS_URL: 'ws://localhost:8080' },
          { VITE_API_URL: 'http://localhost:8000', VITE_WS_URL: undefined },
          { VITE_API_URL: 'invalid-url', VITE_WS_URL: 'ws://localhost:8080' },
          { VITE_API_URL: 'http://localhost:8000', VITE_WS_URL: 'http://localhost:8080' }
        ),
        (envConfig) => {
          // Set up environment
          if (envConfig.VITE_API_URL !== undefined) {
            import.meta.env.VITE_API_URL = envConfig.VITE_API_URL
          } else {
            delete import.meta.env.VITE_API_URL
          }

          if (envConfig.VITE_WS_URL !== undefined) {
            import.meta.env.VITE_WS_URL = envConfig.VITE_WS_URL
          } else {
            delete import.meta.env.VITE_WS_URL
          }

          const result = validateEnvironmentConfig()

          if (!result.isValid) {
            // Every error should contain actionable words
            const actionableWords = ['set', 'configure', 'add', 'check', 'ensure', 'must', 'should', 'required']
            
            result.errors.forEach(error => {
              const hasActionableGuidance = actionableWords.some(word =>
                error.toLowerCase().includes(word)
              )
              expect(hasActionableGuidance).toBe(true)
            })
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
