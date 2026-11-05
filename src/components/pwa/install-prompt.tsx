'use client'

import * as React from 'react'

import { Download, GraduationCap, X } from 'lucide-react'

type InstallEvent = Event & { prompt: () => Promise<void> }

const DISMISS_KEY = 'hajira-install-dismissed'

/**
 * "Install Hajira" banner — appears when the browser fires
 * beforeinstallprompt (Android/Chrome/Edge). Dismissible; remembered in
 * localStorage. Hidden entirely when already running as the installed app.
 * iOS Safari does not fire the event — Safari users install via the share
 * sheet, which the OPERATIONS guide covers.
 */
export default function InstallPrompt() {
  const [evt, setEvt] = React.useState<InstallEvent | null>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const onPrompt = (e: Event) => {
      e.preventDefault() // take over from the browser mini-infobar
      setEvt(e as InstallEvent)
      // small delay so it never fights the first paint
      setTimeout(() => setVisible(true), 1200)
    }
    const onInstalled = () => {
      setEvt(null)
      setVisible(false)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!visible || !evt) return null

  const install = async () => {
    setVisible(false)
    await evt.prompt().catch(() => {})
    setEvt(null)
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Install Hajira app"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-xl shadow-ink/10 backdrop-blur sm:inset-x-auto sm:right-6"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-gold">
        <GraduationCap className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-heading">Install Hajira</p>
        <p className="text-xs text-label">Full-screen, faster, on your home screen.</p>
      </div>
      <button
        onClick={install}
        className="btn-3d btn-ink flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      >
        <Download className="h-4 w-4" aria-hidden />
        Install
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label hover:bg-secondary"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
