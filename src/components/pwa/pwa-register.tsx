'use client'

import * as React from 'react'

const HEALED_KEY = 'hajira-healed'

/**
 * Registers the Hajira service worker once, after mount.
 * Silent no-op when unsupported (older browsers) or when it fails —
 * the app is fully functional without it; the SW only adds offline shell
 * + installability.
 *
 * Also owns SELF-HEALING for the post-deploy trap: a device can be left
 * holding a cached HTML shell that points at hashed chunks which no longer
 * exist (every deploy retires the previous chunk set). The page then LOOKS
 * loaded but never hydrates — students experience it as "the platform won't
 * load": taps do nothing, spinners never end. When any app chunk fails to
 * load we purge every hajira cache + the SW registration and reload ONCE;
 * the next load is either the fresh app or the honest offline page. The
 * sessionStorage guard prevents a reload loop on genuinely dead networks.
 */
export default function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === 'undefined') return

    let healed = false
    const heal = (reason: string) => {
      if (healed) return
      try {
        if (sessionStorage.getItem(HEALED_KEY) === '1') return
        sessionStorage.setItem(HEALED_KEY, '1')
      } catch {
        /* storage blocked — heal anyway, the guard just won't persist */
      }
      healed = true
      console.warn(
        '[hajira] app assets failed to load (' + reason + ') — purging cached app and reloading'
      )
      void (async () => {
        try {
          if ('caches' in window) {
            const keys = await caches.keys()
            await Promise.all(
              keys.filter((k) => k.startsWith('hajira-')).map((k) => caches.delete(k))
            )
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations()
            await Promise.all(regs.map((r) => r.unregister()))
          }
        } catch {
          /* best effort — the reload below still breaks the trap */
        }
        window.location.reload()
      })()
    }

    // A <script> that fails to FETCH (404 purged chunk, dead network) raises
    // an error event on the element itself — it does NOT bubble, so capture.
    const onScriptError = (e: Event) => {
      const t = e.target as HTMLScriptElement | null
      if (
        t &&
        t.tagName === 'SCRIPT' &&
        typeof t.src === 'string' &&
        t.src.includes('/_next/static/')
      ) {
        heal('chunk')
      }
    }
    window.addEventListener('error', onScriptError, true)
    return () => window.removeEventListener('error', onScriptError, true)
  }, [])

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
