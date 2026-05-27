'use client'

import { useEffect } from 'react'

export default function PwaRegistration() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      (window as any).workbox !== undefined
    ) {
      // Register service worker
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('💚 Service worker registered with scope:', reg.scope)
        })
        .catch((err) => {
          console.error('❌ Service worker registration failed:', err)
        })
    } else if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Fallback register if workbox variable undefined
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('💚 Fallback service worker registered:', reg.scope)
        })
        .catch((err) => {
          console.error('❌ Fallback service worker registration failed:', err)
        })
    }
  }, [])

  return null
}
