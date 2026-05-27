import { create } from 'zustand'
import fr from '../i18n/fr.json'
import ar from '../i18n/ar.json'

export type Locale = 'fr' | 'ar'

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, replacementsOrFallback?: Record<string, string | number> | string) => string
}

const dictionaries: Record<Locale, Record<string, any>> = { fr, ar }

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: 'fr',
  setLocale: (locale) => {
    set({ locale })
    if (typeof window !== 'undefined') {
      document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = locale
    }
  },
  t: (key, replacementsOrFallback) => {
    const locale = get().locale
    const dict = dictionaries[locale]

    const parts = key.split('.')
    let current: any = dict

    for (const part of parts) {
      if (current === undefined || current === null) {
        return typeof replacementsOrFallback === 'string' ? replacementsOrFallback : key
      }
      current = current[part]
    }

    if (typeof current !== 'string') {
      return typeof replacementsOrFallback === 'string' ? replacementsOrFallback : key
    }

    let result = current
    if (replacementsOrFallback && typeof replacementsOrFallback === 'object') {
      Object.entries(replacementsOrFallback).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
      })
    }

    return result
  },
}))

// Hook helper for simple t() consumption
export function useI18n() {
  const { locale, setLocale, t } = useI18nStore()
  return { locale, setLocale, t }
}
