/**
 * ImageUpload Component Usage Examples
 * 
 * This file demonstrates how to use the ImageUpload component
 * in different scenarios.
 */

import { useState } from 'react'
import ImageUpload from './ImageUpload'

// Example 1: Basic usage with circle shape (for user avatars)
export function BasicCircleExample() {
  const [avatarUrl, setAvatarUrl] = useState<string>()

  const handleUpload = async (file: File): Promise<string> => {
    // Simulate API call
    const formData = new FormData()
    formData.append('avatar', file)
    
    // Replace with actual API call
    const response = await fetch('/api/users/avatar', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    const data = await response.json()
    setAvatarUrl(data.url)
    return data.url
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-4">User Avatar Upload</h2>
      <ImageUpload
        currentImageUrl={avatarUrl}
        onUpload={handleUpload}
        shape="circle"
        maxSizeMB={5}
      />
    </div>
  )
}

// Example 2: Square shape with custom size limit (for server icons)
export function SquareServerIconExample() {
  const [iconUrl, setIconUrl] = useState<string>()

  const handleUpload = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('icon', file)
    
    // Replace with actual API call
    const response = await fetch('/api/servers/123/icon', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    const data = await response.json()
    setIconUrl(data.url)
    return data.url
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-4">Server Icon Upload</h2>
      <ImageUpload
        currentImageUrl={iconUrl}
        onUpload={handleUpload}
        shape="square"
        maxSizeMB={2}
      />
    </div>
  )
}

// Example 3: Custom accepted formats (JPEG and PNG only)
export function CustomFormatsExample() {
  const handleUpload = async (file: File): Promise<string> => {
    console.log('Uploading:', file.name)
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 2000))
    return 'https://example.com/uploaded-image.jpg'
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-4">Custom Formats (JPEG/PNG only)</h2>
      <ImageUpload
        onUpload={handleUpload}
        acceptedFormats={['image/jpeg', 'image/png']}
        maxSizeMB={3}
      />
    </div>
  )
}

// Example 4: With error handling
export function ErrorHandlingExample() {
  const handleUpload = async (file: File): Promise<string> => {
    // Simulate random failure for demonstration
    if (Math.random() > 0.5) {
      throw new Error('Network error: Failed to upload image')
    }
    
    await new Promise(resolve => setTimeout(resolve, 1500))
    return 'https://example.com/uploaded-image.jpg'
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-4">With Error Handling</h2>
      <p className="text-sm text-dark-300 mb-4">
        This example randomly fails to demonstrate error handling
      </p>
      <ImageUpload
        onUpload={handleUpload}
        shape="circle"
      />
    </div>
  )
}

// Example 5: Integration with UserProfileModal
export function UserProfileIntegrationExample() {
  const [user, setUser] = useState({
    id: '123',
    username: 'johndoe',
    avatar: 'https://example.com/avatar.jpg',
  })

  const handleAvatarUpload = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('avatar', file)
    
    const response = await fetch(`/api/users/${user.id}/avatar`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    })
    
    if (!response.ok) {
      throw new Error('Failed to upload avatar')
    }
    
    const data = await response.json()
    
    // Update user state
    setUser(prev => ({ ...prev, avatar: data.url }))
    
    return data.url
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold mb-4">User Profile Integration</h2>
      <div className="bg-dark-800 rounded-lg p-6 max-w-md">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-primary-600">
            {user.avatar ? (
              <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold">
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold">{user.username}</h3>
            <p className="text-sm text-dark-300">User ID: {user.id}</p>
          </div>
        </div>
        
        <ImageUpload
          currentImageUrl={user.avatar}
          onUpload={handleAvatarUpload}
          shape="circle"
          maxSizeMB={5}
        />
      </div>
    </div>
  )
}
