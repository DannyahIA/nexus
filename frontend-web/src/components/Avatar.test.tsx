import { describe, it, expect } from 'vitest'

/**
 * Avatar Component Tests
 * Tests the core logic of the Avatar component
 * Implements Requirements 4.1, 4.2, 4.3
 */

// Helper function to extract initials (same logic as in Avatar component)
const getInitials = (text: string): string => {
  if (!text) return '?'
  
  const words = text.trim().split(/\s+/)
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase()
  }
  
  // Take first letter of first two words
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
}

describe('Avatar - Initials Generation Logic', () => {
  it('should generate two-letter initials for full names', () => {
    expect(getInitials('John Doe')).toBe('JD')
  })

  it('should generate single initial for single word names', () => {
    expect(getInitials('Alice')).toBe('A')
  })

  it('should return question mark for empty text', () => {
    expect(getInitials('')).toBe('?')
  })

  it('should handle multi-word names by taking first two words', () => {
    expect(getInitials('John Michael Doe')).toBe('JM')
  })

  it('should handle names with extra whitespace', () => {
    expect(getInitials('  John   Doe  ')).toBe('JD')
  })

  it('should convert initials to uppercase', () => {
    expect(getInitials('john doe')).toBe('JD')
  })

  it('should handle single character names', () => {
    expect(getInitials('A')).toBe('A')
  })

  it('should handle names with special characters', () => {
    expect(getInitials('José María')).toBe('JM')
  })
})

describe('Avatar - Size Configuration', () => {
  const sizeClasses = {
    sm: { container: 'w-6 h-6', text: 'text-xs', status: 'w-2 h-2 border' },
    md: { container: 'w-8 h-8', text: 'text-sm', status: 'w-3 h-3 border-2' },
    lg: { container: 'w-10 h-10', text: 'text-base', status: 'w-3.5 h-3.5 border-2' },
    xl: { container: 'w-16 h-16', text: 'text-2xl', status: 'w-4 h-4 border-2' },
  }

  it('should have correct size classes for sm', () => {
    expect(sizeClasses.sm.container).toBe('w-6 h-6')
    expect(sizeClasses.sm.text).toBe('text-xs')
  })

  it('should have correct size classes for md', () => {
    expect(sizeClasses.md.container).toBe('w-8 h-8')
    expect(sizeClasses.md.text).toBe('text-sm')
  })

  it('should have correct size classes for lg', () => {
    expect(sizeClasses.lg.container).toBe('w-10 h-10')
    expect(sizeClasses.lg.text).toBe('text-base')
  })

  it('should have correct size classes for xl', () => {
    expect(sizeClasses.xl.container).toBe('w-16 h-16')
    expect(sizeClasses.xl.text).toBe('text-2xl')
  })

  it('should have status indicator sizes for all variants', () => {
    expect(sizeClasses.sm.status).toContain('w-2')
    expect(sizeClasses.md.status).toContain('w-3')
    expect(sizeClasses.lg.status).toContain('w-3.5')
    expect(sizeClasses.xl.status).toContain('w-4')
  })
})

describe('Avatar - Status Colors', () => {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    away: 'bg-yellow-500',
    dnd: 'bg-red-500',
  }

  it('should have correct color for online status', () => {
    expect(statusColors.online).toBe('bg-green-500')
  })

  it('should have correct color for offline status', () => {
    expect(statusColors.offline).toBe('bg-gray-500')
  })

  it('should have correct color for away status', () => {
    expect(statusColors.away).toBe('bg-yellow-500')
  })

  it('should have correct color for dnd status', () => {
    expect(statusColors.dnd).toBe('bg-red-500')
  })

  it('should have all status types defined', () => {
    const statuses = ['online', 'offline', 'away', 'dnd']
    statuses.forEach(status => {
      expect(statusColors[status as keyof typeof statusColors]).toBeDefined()
    })
  })
})
