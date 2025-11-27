/**
 * Unit tests for BackgroundModeHandler
 * 
 * Tests the basic functionality of the background mode handler including:
 * - Initialization
 * - Visibility change detection
 * - Event emission
 * - Background/foreground transitions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BackgroundModeHandler } from './backgroundModeHandler'

describe('BackgroundModeHandler', () => {
  let handler: BackgroundModeHandler
  let visibilityChangeEvent: Event

  beforeEach(() => {
    // Mock document.hidden property
    Object.defineProperty(document, 'hidden', {
      writable: true,
      configurable: true,
      value: false,
    })

    handler = new BackgroundModeHandler({
      maintainVideoInBackground: true,
      enableLogging: false, // Disable logging for tests
    })

    visibilityChangeEvent = new Event('visibilitychange')
  })

  afterEach(() => {
    handler.destroy()
  })

  it('should initialize successfully', () => {
    handler.initialize()
    expect(handler.isInBackground()).toBe(false)
    expect(handler.getVisibilityState()).toBe('visible')
  })

  it('should detect background mode when document becomes hidden', () => {
    handler.initialize()

    const backgroundCallback = vi.fn()
    handler.on('background-mode-entered', backgroundCallback)

    // Simulate tab going to background
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)

    expect(handler.isInBackground()).toBe(true)
    expect(handler.getVisibilityState()).toBe('hidden')
    expect(backgroundCallback).toHaveBeenCalledOnce()
  })

  it('should detect foreground mode when document becomes visible', () => {
    // Start in background
    Object.defineProperty(document, 'hidden', { value: true })
    handler.initialize()

    const foregroundCallback = vi.fn()
    handler.on('foreground-mode-entered', foregroundCallback)

    // Simulate tab coming to foreground
    Object.defineProperty(document, 'hidden', { value: false })
    document.dispatchEvent(visibilityChangeEvent)

    expect(handler.isInBackground()).toBe(false)
    expect(handler.getVisibilityState()).toBe('visible')
    expect(foregroundCallback).toHaveBeenCalledOnce()
  })

  it('should emit visibility-change event with correct data', () => {
    handler.initialize()

    const visibilityCallback = vi.fn()
    handler.on('visibility-change', visibilityCallback)

    // Simulate visibility change
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)

    expect(visibilityCallback).toHaveBeenCalledOnce()
    const eventData = visibilityCallback.mock.calls[0][0]
    expect(eventData.state).toBe('hidden')
    expect(eventData.previousState).toBe('visible')
    expect(eventData.timestamp).toBeTypeOf('number')
  })

  it('should handle multiple visibility changes correctly', () => {
    handler.initialize()

    const backgroundCallback = vi.fn()
    const foregroundCallback = vi.fn()
    handler.on('background-mode-entered', backgroundCallback)
    handler.on('foreground-mode-entered', foregroundCallback)

    // Go to background
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)
    expect(handler.isInBackground()).toBe(true)

    // Return to foreground
    Object.defineProperty(document, 'hidden', { value: false })
    document.dispatchEvent(visibilityChangeEvent)
    expect(handler.isInBackground()).toBe(false)

    // Go to background again
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)
    expect(handler.isInBackground()).toBe(true)

    expect(backgroundCallback).toHaveBeenCalledTimes(2)
    expect(foregroundCallback).toHaveBeenCalledTimes(1)
  })

  it('should allow event listener removal', () => {
    handler.initialize()

    const callback = vi.fn()
    handler.on('background-mode-entered', callback)

    // Remove listener
    handler.off('background-mode-entered', callback)

    // Trigger event
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should clean up event listeners on destroy', () => {
    handler.initialize()

    const callback = vi.fn()
    handler.on('background-mode-entered', callback)

    handler.destroy()

    // Trigger event after destroy
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)

    expect(callback).not.toHaveBeenCalled()
  })

  it('should maintain connections in background when requested', () => {
    handler.initialize()

    const maintenanceCallback = vi.fn()
    handler.on('background-maintenance', maintenanceCallback)

    // Go to background
    Object.defineProperty(document, 'hidden', { value: true })
    document.dispatchEvent(visibilityChangeEvent)

    // Call maintenance
    handler.maintainConnectionsInBackground()

    expect(maintenanceCallback).toHaveBeenCalledOnce()
  })

  it('should not trigger maintenance when in foreground', () => {
    handler.initialize()

    const maintenanceCallback = vi.fn()
    handler.on('background-maintenance', maintenanceCallback)

    // Ensure we're in foreground
    Object.defineProperty(document, 'hidden', { value: false })

    // Call maintenance
    handler.maintainConnectionsInBackground()

    // Should not emit event when in foreground
    expect(maintenanceCallback).not.toHaveBeenCalled()
  })
})
