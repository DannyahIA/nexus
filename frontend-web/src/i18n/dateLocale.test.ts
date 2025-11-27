import { describe, it, expect } from 'vitest'
import { getDateLocale } from './dateLocale'
import { ptBR, enUS } from 'date-fns/locale'

describe('Date Locale Utility', () => {
  it('should return pt-BR locale for pt-BR language', () => {
    const locale = getDateLocale('pt-BR')
    expect(locale).toBe(ptBR)
  })

  it('should return en-US locale for en-US language', () => {
    const locale = getDateLocale('en-US')
    expect(locale).toBe(enUS)
  })

  it('should fallback to en-US for unknown language', () => {
    const locale = getDateLocale('unknown-lang')
    expect(locale).toBe(enUS)
  })

  it('should fallback to en-US for empty string', () => {
    const locale = getDateLocale('')
    expect(locale).toBe(enUS)
  })
})
