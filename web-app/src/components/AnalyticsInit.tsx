'use client'

import { useEffect } from 'react'
import { cleanLocale, track } from '@/lib/analytics'

const SESSION_KEY = 'audexa-analytics-session'

/** Mount once in the root layout. Sends app_open once per browser tab session (not on every route change). */
export default function AnalyticsInit() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* no sessionStorage: send once per mount */
    }
    track('app_open', { locale: cleanLocale(navigator.language) })
  }, [])
  return null
}
