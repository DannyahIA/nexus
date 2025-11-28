import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translation files
import ptBR from './locales/pt-BR'
import enUS from './locales/en-US'

const resources = {
  'pt-BR': ptBR,
  'en-US': enUS,
}

i18n
  .use(LanguageDetector) // Detect browser language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: 'en-US',
    defaultNS: 'common',
    
    // Language detection options
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Enable debug in development
    debug: import.meta.env.DEV,
  })

// Listen for language changes to update date-fns locale
i18n.on('languageChanged', (lng) => {
  console.log('Language changed to:', lng)
  // The dateFormatter will automatically use the new locale
  // by calling getDateLocale(i18n.language) on each format call
})

export default i18n
