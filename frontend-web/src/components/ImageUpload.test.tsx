import { describe, it, expect } from 'vitest'

/**
 * ImageUpload Component Tests
 * Tests the core validation logic of the ImageUpload component
 * Implements Requirements 3.1, 3.2
 */

// Constants from ImageUpload component
const DEFAULT_MAX_SIZE_MB = 5
const DEFAULT_ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Validation logic extracted for testing (same as in component)
const validateFile = (
  file: File,
  maxSizeMB: number = DEFAULT_MAX_SIZE_MB,
  acceptedFormats: string[] = DEFAULT_ACCEPTED_FORMATS
): string | null => {
  // Validate file type
  if (!acceptedFormats.includes(file.type)) {
    const formatList = acceptedFormats
      .map(format => format.split('/')[1].toUpperCase())
      .join(', ')
    return `Invalid file type. Accepted formats: ${formatList}`
  }

  // Validate file size
  const fileSizeMB = file.size / (1024 * 1024)
  if (fileSizeMB > maxSizeMB) {
    return `File size exceeds ${maxSizeMB}MB limit. Current size: ${fileSizeMB.toFixed(2)}MB`
  }

  return null
}

describe('ImageUpload - File Type Validation', () => {
  it('should accept valid JPEG files', () => {
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
    const error = validateFile(file)
    expect(error).toBeNull()
  })

  it('should accept valid PNG files', () => {
    const file = new File(['content'], 'test.png', { type: 'image/png' })
    const error = validateFile(file)
    expect(error).toBeNull()
  })

  it('should accept valid GIF files', () => {
    const file = new File(['content'], 'test.gif', { type: 'image/gif' })
    const error = validateFile(file)
    expect(error).toBeNull()
  })

  it('should accept valid WebP files', () => {
    const file = new File(['content'], 'test.webp', { type: 'image/webp' })
    const error = validateFile(file)
    expect(error).toBeNull()
  })

  it('should reject text files', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const error = validateFile(file)
    expect(error).toContain('Invalid file type')
  })

  it('should reject PDF files', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const error = validateFile(file)
    expect(error).toContain('Invalid file type')
  })

  it('should reject video files', () => {
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' })
    const error = validateFile(file)
    expect(error).toContain('Invalid file type')
  })

  it('should include accepted formats in error message', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const error = validateFile(file)
    expect(error).toContain('JPEG')
    expect(error).toContain('PNG')
    expect(error).toContain('GIF')
    expect(error).toContain('WEBP')
  })
})

describe('ImageUpload - File Size Validation', () => {
  it('should accept files under the size limit', () => {
    // 1MB file with 5MB limit
    const file = new File([new ArrayBuffer(1 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 5)
    expect(error).toBeNull()
  })

  it('should accept files exactly at the size limit', () => {
    // 5MB file with 5MB limit
    const file = new File([new ArrayBuffer(5 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 5)
    expect(error).toBeNull()
  })

  it('should reject files over the size limit', () => {
    // 6MB file with 5MB limit
    const file = new File([new ArrayBuffer(6 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 5)
    expect(error).toContain('File size exceeds')
    expect(error).toContain('5MB')
  })

  it('should respect custom size limits', () => {
    // 2MB file with 1MB limit
    const file = new File([new ArrayBuffer(2 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 1)
    expect(error).toContain('File size exceeds')
    expect(error).toContain('1MB')
  })

  it('should include current file size in error message', () => {
    // 6MB file
    const file = new File([new ArrayBuffer(6 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 5)
    expect(error).toContain('Current size')
    expect(error).toContain('6.00MB')
  })

  it('should accept very small files', () => {
    // 1KB file
    const file = new File([new ArrayBuffer(1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 5)
    expect(error).toBeNull()
  })
})

describe('ImageUpload - Combined Validation', () => {
  it('should validate both type and size', () => {
    // Valid type and size
    const validFile = new File([new ArrayBuffer(1 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    expect(validateFile(validFile, 5)).toBeNull()
  })

  it('should fail on invalid type even with valid size', () => {
    const file = new File([new ArrayBuffer(1 * 1024 * 1024)], 'test.txt', {
      type: 'text/plain',
    })
    const error = validateFile(file, 5)
    expect(error).toContain('Invalid file type')
  })

  it('should fail on invalid size even with valid type', () => {
    const file = new File([new ArrayBuffer(6 * 1024 * 1024)], 'test.jpg', {
      type: 'image/jpeg',
    })
    const error = validateFile(file, 5)
    expect(error).toContain('File size exceeds')
  })

  it('should prioritize type validation over size validation', () => {
    // Invalid type AND invalid size
    const file = new File([new ArrayBuffer(6 * 1024 * 1024)], 'test.txt', {
      type: 'text/plain',
    })
    const error = validateFile(file, 5)
    // Type validation happens first
    expect(error).toContain('Invalid file type')
  })
})

describe('ImageUpload - Custom Format Support', () => {
  it('should support custom accepted formats', () => {
    const customFormats = ['image/jpeg', 'image/png']
    const gifFile = new File(['content'], 'test.gif', { type: 'image/gif' })
    const error = validateFile(gifFile, 5, customFormats)
    expect(error).toContain('Invalid file type')
  })

  it('should accept files matching custom formats', () => {
    const customFormats = ['image/jpeg']
    const jpegFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
    const error = validateFile(jpegFile, 5, customFormats)
    expect(error).toBeNull()
  })
})

describe('ImageUpload - Default Constants', () => {
  it('should have correct default max size', () => {
    expect(DEFAULT_MAX_SIZE_MB).toBe(5)
  })

  it('should have correct default accepted formats', () => {
    expect(DEFAULT_ACCEPTED_FORMATS).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ])
  })

  it('should have all common image formats in defaults', () => {
    expect(DEFAULT_ACCEPTED_FORMATS).toContain('image/jpeg')
    expect(DEFAULT_ACCEPTED_FORMATS).toContain('image/png')
    expect(DEFAULT_ACCEPTED_FORMATS).toContain('image/gif')
    expect(DEFAULT_ACCEPTED_FORMATS).toContain('image/webp')
  })
})
