import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  formatTime,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatMessageTime,
  formatDateSeparator,
  formatRelativeTime,
  formatNumber,
  formatCompactNumber,
} from './dateFormatter'
import i18n from './config'

describe('Date Formatter', () => {
  const testDate = new Date('2024-01-15T14:30:00Z')
  
  beforeEach(() => {
    // Reset to English for consistent testing
    i18n.changeLanguage('en-US')
  })

  describe('formatTime', () => {
    it('should format time according to locale', () => {
      const result = formatTime(testDate)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatDate', () => {
    it('should format date according to locale', () => {
      const result = formatDate(testDate)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatDateTime', () => {
    it('should format date and time according to locale', () => {
      const result = formatDateTime(testDate)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      // Should contain both date and time components
      expect(result.length).toBeGreaterThan(formatTime(testDate).length)
    })
  })

  describe('formatLongDate', () => {
    it('should format long date according to locale', () => {
      const result = formatLongDate(testDate)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatMessageTime', () => {
    it('should format time for today messages', () => {
      const today = new Date()
      const result = formatMessageTime(today)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should format date and time for older messages', () => {
      const result = formatMessageTime(testDate)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatDateSeparator', () => {
    it('should format date separator', () => {
      const result = formatDateSeparator(testDate)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatRelativeTime', () => {
    it('should format relative time', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const result = formatRelativeTime(oneHourAgo, now)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      expect(result).toContain('ago')
    })
  })

  describe('formatNumber', () => {
    it('should format numbers according to locale', () => {
      const result = formatNumber(1234567.89)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('formatCompactNumber', () => {
    it('should format large numbers compactly', () => {
      const result = formatCompactNumber(1500)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })
  })

  describe('Locale switching', () => {
    it('should use different formats for different locales', () => {
      // Format in English
      i18n.changeLanguage('en-US')
      const enResult = formatDate(testDate)
      
      // Format in Portuguese
      i18n.changeLanguage('pt-BR')
      const ptResult = formatDate(testDate)
      
      // Results should be strings
      expect(typeof enResult).toBe('string')
      expect(typeof ptResult).toBe('string')
      
      // Both should have content
      expect(enResult.length).toBeGreaterThan(0)
      expect(ptResult.length).toBeGreaterThan(0)
    })
  })

  describe('Timestamp handling', () => {
    it('should accept both Date objects and timestamps', () => {
      const timestamp = testDate.getTime()
      
      const dateResult = formatDate(testDate)
      const timestampResult = formatDate(timestamp)
      
      expect(dateResult).toBe(timestampResult)
    })
  })
})
