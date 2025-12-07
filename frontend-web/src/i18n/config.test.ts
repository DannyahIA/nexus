import { describe, it, expect, beforeEach } from 'vitest'
import i18n from './config'

describe('i18n Configuration', () => {
  beforeEach(async () => {
    // Reset to default language before each test
    await i18n.changeLanguage('en-US')
  })

  it('should initialize with default configuration', () => {
    expect(i18n).toBeDefined()
    expect(i18n.language).toBeDefined()
  })

  it('should support pt-BR locale', () => {
    const resources = i18n.options.resources
    expect(resources).toHaveProperty('pt-BR')
    expect(resources?.['pt-BR']).toHaveProperty('common')
    expect(resources?.['pt-BR']).toHaveProperty('auth')
    expect(resources?.['pt-BR']).toHaveProperty('chat')
    expect(resources?.['pt-BR']).toHaveProperty('profile')
  })

  it('should support en-US locale', () => {
    const resources = i18n.options.resources
    expect(resources).toHaveProperty('en-US')
    expect(resources?.['en-US']).toHaveProperty('common')
    expect(resources?.['en-US']).toHaveProperty('auth')
    expect(resources?.['en-US']).toHaveProperty('chat')
    expect(resources?.['en-US']).toHaveProperty('profile')
  })

  it('should translate common keys in en-US', () => {
    const translation = i18n.t('common:save')
    expect(translation).toBe('Save')
  })

  it('should translate common keys in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR')
    const translation = i18n.t('common:save')
    expect(translation).toBe('Salvar')
  })

  it('should translate auth keys in en-US', () => {
    const translation = i18n.t('auth:login')
    expect(translation).toBe('Login')
  })

  it('should translate auth keys in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR')
    const translation = i18n.t('auth:login')
    expect(translation).toBe('Entrar')
  })

  it('should support variable interpolation', () => {
    const translation = i18n.t('chat:typing', { user: 'John' })
    expect(translation).toBe('John is typing...')
  })

  it('should support variable interpolation in pt-BR', async () => {
    await i18n.changeLanguage('pt-BR')
    const translation = i18n.t('chat:typing', { user: 'João' })
    expect(translation).toBe('João está digitando...')
  })

  it('should fallback to key when translation is missing', () => {
    const translation = i18n.t('nonexistent:key')
    // i18n returns just the key part when translation is missing
    expect(translation).toBe('key')
  })

  it('should change language dynamically', async () => {
    expect(i18n.language).toBe('en-US')
    
    await i18n.changeLanguage('pt-BR')
    expect(i18n.language).toBe('pt-BR')
    
    await i18n.changeLanguage('en-US')
    expect(i18n.language).toBe('en-US')
  })
})
