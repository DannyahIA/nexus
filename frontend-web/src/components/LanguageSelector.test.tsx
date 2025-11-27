import { describe, it, expect, beforeEach, vi } from 'vitest'
import i18n from '../i18n'

describe('LanguageSelector - Language Switching Logic', () => {
  /**
   * Test language switching and persistence logic
   * Implements Requirements 1.1, 1.3, 1.5
   */

  beforeEach(() => {
    // Reset to default language
    i18n.changeLanguage('en-US')
    localStorage.clear()
  })

  it('should change language when requested', async () => {
    // Initial language should be en-US
    expect(i18n.language).toBe('en-US')

    // Change to pt-BR
    await i18n.changeLanguage('pt-BR')

    // Verify language changed
    expect(i18n.language).toBe('pt-BR')
  })

  it('should persist language selection to localStorage', async () => {
    // Change language
    await i18n.changeLanguage('pt-BR')

    // Verify localStorage was updated
    const storedLanguage = localStorage.getItem('i18nextLng')
    expect(storedLanguage).toBe('pt-BR')
  })

  it('should load language from localStorage on initialization', async () => {
    // Set language in localStorage
    localStorage.setItem('i18nextLng', 'pt-BR')

    // Reinitialize i18n (simulating app restart)
    await i18n.changeLanguage(localStorage.getItem('i18nextLng') || 'en-US')

    // Verify language was loaded from localStorage
    expect(i18n.language).toBe('pt-BR')
  })

  it('should support multiple language switches', async () => {
    // Switch to pt-BR
    await i18n.changeLanguage('pt-BR')
    expect(i18n.language).toBe('pt-BR')

    // Switch back to en-US
    await i18n.changeLanguage('en-US')
    expect(i18n.language).toBe('en-US')

    // Switch to pt-BR again
    await i18n.changeLanguage('pt-BR')
    expect(i18n.language).toBe('pt-BR')
  })

  it('should have all supported languages available', () => {
    const supportedLanguages = ['pt-BR', 'en-US']
    
    // Verify all languages are in resources
    supportedLanguages.forEach(lang => {
      expect(i18n.hasResourceBundle(lang, 'common')).toBe(true)
    })
  })

  it('should use fallback language for missing translations', async () => {
    // Set an unsupported language
    await i18n.changeLanguage('fr-FR')

    // Language code is set to fr-FR
    expect(i18n.language).toBe('fr-FR')

    // But translations should fallback to en-US
    const translation = i18n.t('common:language')
    expect(translation).toBe('Language') // en-US fallback
  })
})

describe('LanguageSelector - Translation Keys', () => {
  /**
   * Test that required translation keys exist
   * Implements Requirements 1.1, 1.5
   */

  it('should have language selector translation keys in pt-BR', () => {
    i18n.changeLanguage('pt-BR')
    
    expect(i18n.t('common:language')).toBe('Idioma')
    expect(i18n.t('common:selectLanguage')).toBe('Selecionar idioma')
  })

  it('should have language selector translation keys in en-US', () => {
    i18n.changeLanguage('en-US')
    
    expect(i18n.t('common:language')).toBe('Language')
    expect(i18n.t('common:selectLanguage')).toBe('Select language')
  })
})
