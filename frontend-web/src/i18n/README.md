# i18n Setup

This directory contains the internationalization (i18n) configuration for the Nexus application.

## Structure

```
i18n/
├── config.ts           # Main i18n configuration
├── dateLocale.ts       # Date-fns locale integration
├── index.ts            # Main export
└── locales/
    ├── pt-BR/          # Portuguese (Brazil) translations
    │   ├── common.json
    │   ├── auth.json
    │   ├── chat.json
    │   ├── profile.json
    │   └── index.ts
    └── en-US/          # English (US) translations
        ├── common.json
        ├── auth.json
        ├── chat.json
        ├── profile.json
        └── index.ts
```

## Features

- **Language Detection**: Automatically detects browser language
- **Persistence**: Saves language preference to localStorage
- **Fallback**: Falls back to en-US if translation is missing
- **Variable Interpolation**: Supports dynamic values in translations
- **Date Formatting**: Integrates with date-fns for locale-specific date formatting

## Usage

### In Components

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t, i18n } = useTranslation()
  
  // Simple translation
  const saveText = t('common:save')
  
  // With namespace shorthand
  const loginText = t('auth:login')
  
  // With variable interpolation
  const typingText = t('chat:typing', { user: 'John' })
  
  // Change language
  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang)
  }
  
  return (
    <div>
      <button onClick={() => changeLanguage('pt-BR')}>PT</button>
      <button onClick={() => changeLanguage('en-US')}>EN</button>
      <p>{saveText}</p>
    </div>
  )
}
```

### Date Formatting

```tsx
import { format } from 'date-fns'
import { getDateLocale } from '@/i18n/dateLocale'
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  
  const formattedDate = format(new Date(), 'PPP', { locale: dateLocale })
  
  return <p>{formattedDate}</p>
}
```

## Adding New Translations

1. Add the key to both `locales/pt-BR/*.json` and `locales/en-US/*.json`
2. Use the translation in your component with `t('namespace:key')`

## Supported Languages

- `pt-BR` - Portuguese (Brazil)
- `en-US` - English (United States)

## Configuration

The i18n system is configured in `config.ts` with:
- Default language: Detected from browser or fallback to `en-US`
- Fallback language: `en-US`
- Default namespace: `common`
- Storage: `localStorage` with key `i18nextLng`
