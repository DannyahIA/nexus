import { ptBR, enUS } from 'date-fns/locale'
import { Locale } from 'date-fns'

// Map i18n language codes to date-fns locales
const dateLocales: Record<string, Locale> = {
  'pt-BR': ptBR,
  'en-US': enUS,
}

/**
 * Get the date-fns locale for the current i18n language
 */
export function getDateLocale(language: string): Locale {
  return dateLocales[language] || enUS
}

export default dateLocales
