import { useState, useRef, ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, Loader2, AlertCircle } from 'lucide-react'

export interface ImageUploadProps {
  currentImageUrl?: string
  onUpload: (file: File) => Promise<string>
  maxSizeMB?: number
  acceptedFormats?: string[]
  shape?: 'circle' | 'square'
  className?: string
}

const DEFAULT_MAX_SIZE_MB = 5
const DEFAULT_ACCEPTED_FORMATS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export default function ImageUpload({
  currentImageUrl,
  onUpload,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
  shape = 'circle',
  className = '',
}: ImageUploadProps) {
  const { t } = useTranslation('profile')
  const { t: tCommon } = useTranslation('common')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(currentImageUrl)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const validateFile = (file: File): string | null => {
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

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Clear previous error
    setError(null)

    // Validate file
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
      setSelectedFile(file)
    }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setIsUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      const imageUrl = await onUpload(selectedFile)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      // Update preview with uploaded URL
      setPreviewUrl(imageUrl)
      setSelectedFile(null)
      
      // Reset progress after a short delay
      setTimeout(() => {
        setUploadProgress(0)
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
      // Revert to previous image on error
      setPreviewUrl(currentImageUrl)
      setSelectedFile(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = () => {
    setPreviewUrl(undefined)
    setSelectedFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const shapeClasses = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Preview Area */}
      <div className="flex flex-col items-center gap-4">
        <div className={`relative w-32 h-32 ${shapeClasses} overflow-hidden bg-dark-700 border-2 border-dark-600 flex items-center justify-center`}>
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
              {!isUploading && (
                <button
                  onClick={handleRemove}
                  className="absolute top-2 right-2 p-1 bg-dark-900/80 hover:bg-dark-900 rounded-full transition-colors"
                  title={t('removeAvatar')}
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </>
          ) : (
            <Upload className="w-8 h-8 text-dark-400" />
          )}
          
          {/* Upload Progress Overlay */}
          {isUploading && (
            <div className="absolute inset-0 bg-dark-900/80 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-2" />
              <span className="text-sm text-white font-medium">{uploadProgress}%</span>
            </div>
          )}
        </div>

        {/* File Input (Hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleButtonClick}
            disabled={isUploading}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 disabled:bg-dark-800 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium"
          >
            {previewUrl ? t('changeAvatar') : t('uploadAvatar')}
          </button>
          
          {selectedFile && !isUploading && (
            <button
              onClick={handleUpload}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors text-sm font-medium"
            >
              {tCommon('save')}
            </button>
          )}
        </div>

        {/* File Info */}
        {selectedFile && !isUploading && (
          <div className="text-xs text-dark-300 text-center">
            <p>{selectedFile.name}</p>
            <p>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-400 max-w-md">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Help Text */}
        {!error && !isUploading && (
          <p className="text-xs text-dark-400 text-center max-w-xs">
            Max size: {maxSizeMB}MB. Accepted formats: {acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}
