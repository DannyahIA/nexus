import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Example property-based tests to verify fast-check setup with Vitest
 * These tests demonstrate that fast-check is properly configured and working
 */

describe('Fast-check Setup Verification', () => {
  it('should verify fast-check is working with basic property', () => {
    // Property: reversing a string twice should return the original string
    fc.assert(
      fc.property(fc.string(), (str) => {
        const reversed = str.split('').reverse().join('')
        const doubleReversed = reversed.split('').reverse().join('')
        expect(doubleReversed).toBe(str)
      }),
      { numRuns: 100 }
    )
  })

  it('should verify fast-check works with arrays', () => {
    // Property: array length should be preserved after mapping
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const mapped = arr.map(x => x * 2)
        expect(mapped.length).toBe(arr.length)
      }),
      { numRuns: 100 }
    )
  })

  it('should verify fast-check works with objects', () => {
    // Property: adding a property to an object should increase its key count by 1
    fc.assert(
      fc.property(
        fc.record({ name: fc.string(), age: fc.integer() }),
        fc.string(),
        (obj, newKey) => {
          const originalKeys = Object.keys(obj).length
          const newObj = { ...obj, [newKey]: 'value' }
          const newKeys = Object.keys(newObj).length
          
          // If the key already existed in own properties, count stays the same, otherwise increases by 1
          if (Object.prototype.hasOwnProperty.call(obj, newKey)) {
            expect(newKeys).toBe(originalKeys)
          } else {
            expect(newKeys).toBe(originalKeys + 1)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should verify fast-check works with async properties', async () => {
    // Property: async operations should maintain data integrity
    await fc.assert(
      fc.asyncProperty(fc.integer(), async (num) => {
        const result = await Promise.resolve(num * 2)
        expect(result).toBe(num * 2)
      }),
      { numRuns: 100 }
    )
  })

  it('should verify fast-check can generate complex data structures', () => {
    // Property: complex nested structures should be handled correctly
    const userArbitrary = fc.record({
      id: fc.string(),
      name: fc.string(),
      email: fc.emailAddress(),
      age: fc.integer({ min: 0, max: 120 }),
      active: fc.boolean(),
    })

    fc.assert(
      fc.property(userArbitrary, (user) => {
        // Verify all required properties exist
        expect(user).toHaveProperty('id')
        expect(user).toHaveProperty('name')
        expect(user).toHaveProperty('email')
        expect(user).toHaveProperty('age')
        expect(user).toHaveProperty('active')
        
        // Verify age constraint
        expect(user.age).toBeGreaterThanOrEqual(0)
        expect(user.age).toBeLessThanOrEqual(120)
        
        // Verify email format (basic check)
        expect(user.email).toContain('@')
      }),
      { numRuns: 100 }
    )
  })
})
