import { format, formatDistance, formatRelative, isToday } from 'date-fns'
import { getDateLocale } from './dateLocale'
import i18n from './config'

/**
 * Get the current date-fns locale based on i18n language
 */
function getCurrentLocale() {
  return getDateLocale(i18n.language)
}

/**
 * Format a timestamp as a time string (HH:MM)
 * Uses locale-specific formatting
 */
export function formatTime(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return format(date, 'p', { locale })
}

/**
 * Format a timestamp as a short date string
 * Uses locale-specific formatting (e.g., MM/DD/YYYY or DD/MM/YYYY)
 */
export function formatDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return format(date, 'P', { locale })
}

/**
 * Format a timestamp as a full date and time string
 * Uses locale-specific formatting
 */
export function formatDateTime(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return format(date, 'Pp', { locale })
}

/**
 * Format a timestamp as a long date string (e.g., "January 1, 2024")
 * Uses locale-specific formatting
 */
export function formatLongDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return format(date, 'PPPP', { locale })
}

/**
 * Format a timestamp for message display
 * - Today: shows time only (HH:MM)
 * - Other days: shows date and time
 */
export function formatMessageTime(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  if (isToday(date)) {
    return format(date, 'p', { locale })
  } else {
    return format(date, 'Pp', { locale })
  }
}

/**
 * Format a timestamp as a date separator (e.g., "January 1, 2024")
 * Used for separating messages by date
 */
export function formatDateSeparator(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return format(date, 'PPPP', { locale })
}

/**
 * Format a relative time string (e.g., "2 hours ago", "in 3 days")
 * Uses locale-specific formatting
 */
export function formatRelativeTime(timestamp: number | Date, baseDate: Date = new Date()): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return formatDistance(date, baseDate, { addSuffix: true, locale })
}

/**
 * Format a relative date string (e.g., "today at 3:00 PM", "yesterday at 10:00 AM")
 * Uses locale-specific formatting
 */
export function formatRelativeDate(timestamp: number | Date, baseDate: Date = new Date()): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const locale = getCurrentLocale()
  
  return formatRelative(date, baseDate, { locale })
}

/**
 * Format a number according to locale conventions
 */
export function formatNumber(value: number): string {
  return value.toLocaleString(i18n.language)
}

/**
 * Format a number as a compact string (e.g., 1.2K, 3.4M)
 */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(i18n.language, {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value)
}

/**
 * Format a number as currency
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat(i18n.language, {
    style: 'currency',
    currency,
  }).format(value)
}

/**
 * Format a number as a percentage
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat(i18n.language, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
