import { describe, it, expect, beforeEach } from 'vitest'
import i18n from '../i18n/config'

describe('LoginScreen Translations', () => {
  /**
   * Test LoginScreen translation keys and language switching
   * Implements Requirements 6.1, 2.1
   */

  beforeEach(async () => {
    // Reset to English before each test
    await i18n.changeLanguage('en-US')
  })

  it('should have all required translation keys in English', () => {
    const requiredKeys = [
      'welcomeToNexus',
      'tagline',
      'email',
      'enterYourEmail',
      'password',
      'enterYourPassword',
      'loggingIn',
      'logIn',
      'dontHaveAccount',
      'signUp',
      'madeWithLove',
      'loginError',
    ]

    // Check English translations exist and are not just the key
    requiredKeys.forEach((key) => {
      const translation = i18n.t(`auth:${key}`, { lng: 'en-US' })
      expect(translation).not.toBe(key)
      expect(translation).not.toBe(`auth:${key}`)
      expect(translation.length).toBeGreaterThan(0)
    })
  })

  it('should have all required translation keys in Portuguese', () => {
    const requiredKeys = [
      'welcomeToNexus',
      'tagline',
      'email',
      'enterYourEmail',
      'password',
      'enterYourPassword',
      'loggingIn',
      'logIn',
      'dontHaveAccount',
      'signUp',
      'madeWithLove',
      'loginError',
    ]

    // Check Portuguese translations exist and are not just the key
    requiredKeys.forEach((key) => {
      const translation = i18n.t(`auth:${key}`, { lng: 'pt-BR' })
      expect(translation).not.toBe(key)
      expect(translation).not.toBe(`auth:${key}`)
      expect(translation.length).toBeGreaterThan(0)
    })
  })

  it('should return correct English translations', () => {
    i18n.changeLanguage('en-US')

    expect(i18n.t('auth:welcomeToNexus')).toBe('Welcome to Nexus')
    expect(i18n.t('auth:tagline')).toBe('Connect, collaborate, and communicate')
    expect(i18n.t('auth:email')).toBe('Email')
    expect(i18n.t('auth:password')).toBe('Password')
    expect(i18n.t('auth:logIn')).toBe('Log In')
    expect(i18n.t('auth:dontHaveAccount')).toBe("Don't have an account?")
    expect(i18n.t('auth:signUp')).toBe('Sign up')
  })

  it('should return correct Portuguese translations', () => {
    i18n.changeLanguage('pt-BR')

    expect(i18n.t('auth:welcomeToNexus')).toBe('Bem-vindo ao Nexus')
    expect(i18n.t('auth:tagline')).toBe('Conecte-se, colabore e comunique-se')
    expect(i18n.t('auth:email')).toBe('E-mail')
    expect(i18n.t('auth:password')).toBe('Senha')
    expect(i18n.t('auth:logIn')).toBe('Entrar')
    expect(i18n.t('auth:dontHaveAccount')).toBe('Não tem uma conta?')
    expect(i18n.t('auth:signUp')).toBe('Criar conta')
  })

  it('should switch between languages correctly', async () => {
    // Start with English
    await i18n.changeLanguage('en-US')
    expect(i18n.t('auth:welcomeToNexus')).toBe('Welcome to Nexus')

    // Switch to Portuguese
    await i18n.changeLanguage('pt-BR')
    expect(i18n.t('auth:welcomeToNexus')).toBe('Bem-vindo ao Nexus')

    // Switch back to English
    await i18n.changeLanguage('en-US')
    expect(i18n.t('auth:welcomeToNexus')).toBe('Welcome to Nexus')
  })

  it('should have different translations for each language', () => {
    const enTranslation = i18n.t('auth:welcomeToNexus', { lng: 'en-US' })
    const ptTranslation = i18n.t('auth:welcomeToNexus', { lng: 'pt-BR' })

    // Translations should be different
    expect(enTranslation).not.toBe(ptTranslation)
  })
})
