import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Check } from 'lucide-react'

interface LanguageSelectorProps {
  className?: string
}

interface Language {
  code: string
  name: string
  nativeName: string
}

const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)' },
]

export default function LanguageSelector({ className = '' }: LanguageSelectorProps) {
  const { i18n, t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleLanguageChange = async (languageCode: string) => {
    try {
      await i18n.changeLanguage(languageCode)
      // Persistence is handled automatically by i18next-browser-languagedetector
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to change language:', error)
    }
  }

  const currentLanguage = SUPPORTED_LANGUAGES.find(
    (lang) => lang.code === i18n.language
  ) || SUPPORTED_LANGUAGES[0]

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded hover:bg-dark-700 text-dark-300 hover:text-white transition-colors"
        title={t('common:selectLanguage')}
        aria-label={t('common:selectLanguage')}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-medium">{currentLanguage.nativeName}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-dark-800 rounded-lg shadow-xl border border-dark-700 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-dark-700">
            <p className="text-xs font-semibold text-dark-400 uppercase">
              {t('common:language')}
            </p>
          </div>
          <div className="py-1">
            {SUPPORTED_LANGUAGES.map((language) => {
              const isSelected = language.code === i18n.language
              
              return (
                <button
                  key={language.code}
                  onClick={() => handleLanguageChange(language.code)}
                  className={`w-full px-3 py-2 flex items-center justify-between hover:bg-dark-700 transition-colors ${
                    isSelected ? 'bg-dark-750' : ''
                  }`}
                  role="menuitem"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-white">
                      {language.nativeName}
                    </span>
                    <span className="text-xs text-dark-400">
                      {language.name}
                    </span>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
