'use client'

import * as React from 'react'

/**
 * Registers the Hajira service worker once, after mount.
 * Silent no-op when unsupported (older browsers) or when it fails —
 * the app is fully functional without it; the SW only adds offline shell
 * + installability.
 */
export default function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW is an enhancement — ignore registration failures */
      })
    }
    if (document.readyState === 'complete') onLoad()
    else {
      window.addEventListener('load', onLoad)
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])
  return null
}
