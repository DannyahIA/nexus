import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '../i18n/config'

describe('ChatScreen Translations', () => {
  /**
   * Test ChatScreen translation keys and language switching
   * Implements Requirements 6.4, 2.1, 2.4
   */

  beforeEach(async () => {
    // Reset to English before each test
    await i18n.changeLanguage('en-US')
  })

  it('should have all required translation keys in English', () => {
    const requiredKeys = [
      'selectChannel',
      'selectChannelDescription',
      'directMessage',
      'dmStartMessage',
      'online',
      'offline',
      'idle',
      'dnd',
      'messagePlaceholder',
      'characterCount',
      'deleteMessageError',
      'editMessageError',
      'sendMessageError',
      'voiceJoinError',
    ]

    // Check English translations exist and are not just the key
    requiredKeys.forEach((key) => {
      const translation = i18n.t(`chat:${key}`, { lng: 'en-US' })
      expect(translation).not.toBe(key)
      expect(translation).not.toBe(`chat:${key}`)
      expect(translation.length).toBeGreaterThan(0)
    })
  })

  it('should have all required translation keys in Portuguese', () => {
    const requiredKeys = [
      'selectChannel',
      'selectChannelDescription',
      'directMessage',
      'dmStartMessage',
      'online',
      'offline',
      'idle',
      'dnd',
      'messagePlaceholder',
      'characterCount',
      'deleteMessageError',
      'editMessageError',
      'sendMessageError',
      'voiceJoinError',
    ]

    // Check Portuguese translations exist and are not just the key
    requiredKeys.forEach((key) => {
      const translation = i18n.t(`chat:${key}`, { lng: 'pt-BR' })
      expect(translation).not.toBe(key)
      expect(translation).not.toBe(`chat:${key}`)
      expect(translation.length).toBeGreaterThan(0)
    })
  })

  it('should return correct English translations', () => {
    i18n.changeLanguage('en-US')

    expect(i18n.t('chat:selectChannel')).toBe('Select a channel')
    expect(i18n.t('chat:directMessage')).toBe('Direct Message')
    expect(i18n.t('chat:online')).toBe('Online')
    expect(i18n.t('chat:offline')).toBe('Offline')
    expect(i18n.t('chat:idle')).toBe('Idle')
    expect(i18n.t('chat:dnd')).toBe('Do Not Disturb')
  })

  it('should return correct Portuguese translations', () => {
    i18n.changeLanguage('pt-BR')

    expect(i18n.t('chat:selectChannel')).toBe('Selecione um canal')
    expect(i18n.t('chat:directMessage')).toBe('Mensagem Direta')
    expect(i18n.t('chat:online')).toBe('Online')
    expect(i18n.t('chat:offline')).toBe('Offline')
    expect(i18n.t('chat:idle')).toBe('Ausente')
    expect(i18n.t('chat:dnd')).toBe('Não Perturbe')
  })

  it('should support variable interpolation in translations', () => {
    // Test English
    i18n.changeLanguage('en-US')
    const enMessage = i18n.t('chat:messagePlaceholder', { channelName: 'general' })
    expect(enMessage).toBe('Message general')
    expect(enMessage).toContain('general')

    // Test Portuguese
    i18n.changeLanguage('pt-BR')
    const ptMessage = i18n.t('chat:messagePlaceholder', { channelName: 'geral' })
    expect(ptMessage).toBe('Mensagem para geral')
    expect(ptMessage).toContain('geral')
  })

  it('should support variable interpolation for character count', () => {
    // Test English
    i18n.changeLanguage('en-US')
    const enCount = i18n.t('chat:characterCount', { count: 1500 })
    expect(enCount).toBe('1500/2000')
    expect(enCount).toContain('1500')

    // Test Portuguese
    i18n.changeLanguage('pt-BR')
    const ptCount = i18n.t('chat:characterCount', { count: 1500 })
    expect(ptCount).toBe('1500/2000')
    expect(ptCount).toContain('1500')
  })

  it('should support variable interpolation for DM start message', () => {
    // Test English
    i18n.changeLanguage('en-US')
    const enDM = i18n.t('chat:dmStartMessage', { username: 'john' })
    expect(enDM).toContain('john')
    expect(enDM).toContain('direct conversation')

    // Test Portuguese
    i18n.changeLanguage('pt-BR')
    const ptDM = i18n.t('chat:dmStartMessage', { username: 'joão' })
    expect(ptDM).toContain('joão')
    expect(ptDM).toContain('conversa direta')
  })

  it('should switch between languages correctly', async () => {
    // Start with English
    await i18n.changeLanguage('en-US')
    expect(i18n.t('chat:selectChannel')).toBe('Select a channel')

    // Switch to Portuguese
    await i18n.changeLanguage('pt-BR')
    expect(i18n.t('chat:selectChannel')).toBe('Selecione um canal')

    // Switch back to English
    await i18n.changeLanguage('en-US')
    expect(i18n.t('chat:selectChannel')).toBe('Select a channel')
  })

  it('should have different translations for each language', () => {
    const enTranslation = i18n.t('chat:selectChannel', { lng: 'en-US' })
    const ptTranslation = i18n.t('chat:selectChannel', { lng: 'pt-BR' })

    // Translations should be different
    expect(enTranslation).not.toBe(ptTranslation)
  })

  it('should have locale identifier for date formatting', () => {
    // Test English locale
    const enLocale = i18n.t('chat:_locale', { lng: 'en-US' })
    expect(enLocale).toBe('en-US')

    // Test Portuguese locale
    const ptLocale = i18n.t('chat:_locale', { lng: 'pt-BR' })
    expect(ptLocale).toBe('pt-BR')
  })
})
