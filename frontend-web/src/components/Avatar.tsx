import { useState } from 'react'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'
export type AvatarStatus = 'online' | 'offline' | 'away' | 'dnd'

interface AvatarProps {
  imageUrl?: string
  fallbackText: string
  size?: AvatarSize
  status?: AvatarStatus
  showStatus?: boolean
  className?: string
  alt?: string
}

const sizeClasses: Record<AvatarSize, { container: string; text: string; status: string }> = {
  sm: {
    container: 'w-6 h-6',
    text: 'text-xs',
    status: 'w-2 h-2 border',
  },
  md: {
    container: 'w-8 h-8',
    text: 'text-sm',
    status: 'w-3 h-3 border-2',
  },
  lg: {
    container: 'w-10 h-10',
    text: 'text-base',
    status: 'w-3.5 h-3.5 border-2',
  },
  xl: {
    container: 'w-16 h-16',
    text: 'text-2xl',
    status: 'w-4 h-4 border-2',
  },
}

const statusColors: Record<AvatarStatus, string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-500',
  away: 'bg-yellow-500',
  dnd: 'bg-red-500',
}

export default function Avatar({
  imageUrl,
  fallbackText,
  size = 'md',
  status,
  showStatus = false,
  className = '',
  alt,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const sizeConfig = sizeClasses[size]
  
  // Extract initials from fallback text (up to 2 characters)
  const getInitials = (text: string): string => {
    if (!text) return '?'
    
    const words = text.trim().split(/\s+/)
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase()
    }
    
    // Take first letter of first two words
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
  }

  const initials = getInitials(fallbackText)
  const shouldShowImage = imageUrl && !imageError
  const altText = alt || fallbackText

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Avatar container */}
      <div
        className={`${sizeConfig.container} rounded-full flex items-center justify-center font-semibold overflow-hidden bg-primary-600 text-white relative`}
      >
        {shouldShowImage ? (
          <>
            {/* Loading state - show initials while image loads */}
            {!imageLoaded && (
              <div className={`absolute inset-0 flex items-center justify-center ${sizeConfig.text}`}>
                {initials}
              </div>
            )}
            
            {/* Image */}
            <img
              src={imageUrl}
              alt={altText}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageError(true)
                setImageLoaded(false)
              }}
            />
          </>
        ) : (
          /* Fallback initials */
          <span className={sizeConfig.text}>{initials}</span>
        )}
      </div>

      {/* Status indicator */}
      {showStatus && status && (
        <div
          className={`absolute bottom-0 right-0 ${sizeConfig.status} ${statusColors[status]} rounded-full border-dark-850`}
          title={status}
        />
      )}
    </div>
  )
}
