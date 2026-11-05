'use client'

import * as React from 'react'

import {
  CheckCircle2,
  Download,
  GraduationCap,
  PlusSquare,
  Share,
  Smartphone,
  WifiOff,
  X,
  Zap,
} from 'lucide-react'

/* ---------------------------------------------------------------------------
 * Install Gate — the ONE install surface for Hajira.
 *
 *  • Android/Chrome/Edge  → captures `beforeinstallprompt` and fires Chrome's
 *    native install dialog from our own styled bottom sheet / dialog.
 *  • iOS Safari           → a 3-step "Share → Add to Home Screen" guide.
 *  • Other browsers       → short manual instructions.
 *
 *  Auto-popup policy (so it is easy, never annoying):
 *    - never inside the installed app (standalone)
 *    - never after the user installed or accepted
 *    - "Not now" snoozes for 3 days; after 2 dismissals we stop asking
 *      automatically (entry points in the header + login screen remain).
 * ------------------------------------------------------------------------- */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __hajiraInstallEvt?: InstallPromptEvent | null
  }
}

/** Exported helper — any button can open the gate with one call. */
export function openInstallGate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('hajira:install-open'))
  }
}

/* ---- module-level capture (runs before React mounts, event is never lost) - */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // suppress Chrome's mini-infobar — we own the moment
    window.__hajiraInstallEvt = e as InstallPromptEvent
    window.dispatchEvent(new Event('hajira:install-ready'))
  })
}

const SNOOZE_KEY = 'hajira-install-snooze'
const DISMISSALS_KEY = 'hajira-install-dismissals'
const INSTALLED_KEY = 'hajira-installed'
const LEGACY_DISMISS_KEY = 'hajira-install-dismissed' // old v1 banner key

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000 // ask again after 3 days
const MAX_AUTO_ASKS = 2 // after that, only manual entry points

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSLike = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ masquerades as desktop Safari
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document
  return iOSLike || iPadOS
}

function isInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1'
  } catch {
    return false
  }
}

function dismissals(): number {
  try {
    let n = Number(localStorage.getItem(DISMISSALS_KEY) ?? 0)
    if (localStorage.getItem(LEGACY_DISMISS_KEY) === '1') n = Math.max(n, 1)
    return n
  } catch {
    return MAX_AUTO_ASKS // storage blocked → don't nag
  }
}

function autoShowEligible(): boolean {
  if (isStandalone() || isInstalled()) return false
  if (dismissals() >= MAX_AUTO_ASKS) return false
  try {
    const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) ?? 0)
    if (snoozedAt && Date.now() - snoozedAt < SNOOZE_MS) return false
  } catch {
    return false
  }
  return true
}

function markInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, '1')
  } catch {
    /* ignore */
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    localStorage.setItem(DISMISSALS_KEY, String(dismissals() + 1))
    localStorage.removeItem(LEGACY_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

type Mode = 'native' | 'ios' | 'manual'
type Stage = 'offer' | 'success' | 'already'

/* ------------------------------- the gate -------------------------------- */

export default function InstallGate() {
  const [open, setOpen] = React.useState(false)
  const [stage, setStage] = React.useState<Stage>('offer')
  const [mode, setMode] = React.useState<Mode>('manual')
  const [promptEvt, setPromptEvt] = React.useState<InstallPromptEvent | null>(null)
  const [installing, setInstalling] = React.useState(false)

  const computeMode = React.useCallback((): Mode => {
    if (window.__hajiraInstallEvt) return 'native'
    if (isAppleMobile()) return 'ios'
    return 'manual'
  }, [])

  /* pick up an event captured before mount + listen for later ones */
  React.useEffect(() => {
    const syncEvt = () => {
      if (window.__hajiraInstallEvt) setPromptEvt(window.__hajiraInstallEvt)
    }
    syncEvt()
    setMode(computeMode())
    window.addEventListener('hajira:install-ready', syncEvt)
    return () => window.removeEventListener('hajira:install-ready', syncEvt)
  }, [computeMode])

  /* auto-open once per visit, shortly after load */
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (autoShowEligible()) {
        setMode(computeMode())
        // Only auto-interrupt when we have something genuinely useful to say
        const m = computeMode()
        if (m === 'native' || m === 'ios') setOpen(true)
      }
    }, 1600)
    return () => clearTimeout(t)
  }, [])

  /* manual entry points (header button, login pill) + install lifecycle */
  React.useEffect(() => {
    const onOpen = () => {
      if (isStandalone()) {
        setStage('already')
        setOpen(true)
        return
      }
      if (isInstalled()) {
        setStage('success')
        setOpen(true)
        return
      }
      setStage('offer')
      setMode(computeMode())
      setOpen(true)
    }
    const onNativeInstall = () => {
      markInstalled()
      setStage('success')
      setPromptEvt(null)
      setOpen(true) // confirm the good news, then it never comes back
    }
    window.addEventListener('hajira:install-open', onOpen)
    window.addEventListener('appinstalled', onNativeInstall)
    return () => {
      window.removeEventListener('hajira:install-open', onOpen)
      window.removeEventListener('appinstalled', onNativeInstall)
    }
  }, [computeMode])

  const close = () => setOpen(false)

  const notNow = () => {
    snooze()
    close()
  }

  const install = async () => {
    if (mode !== 'native' || !promptEvt) return
    setInstalling(true)
    try {
      await promptEvt.prompt()
      const choice = await promptEvt.userChoice
      if (choice.outcome === 'accepted') {
        markInstalled()
        setStage('success')
        window.__hajiraInstallEvt = null
        setPromptEvt(null)
      } else {
        snooze()
        close()
      }
    } catch {
      /* user aborted Chrome's dialog — stay quiet */
    } finally {
      setInstalling(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Install Hajira app">
      {/* overlay */}
      <button
        aria-label="Close install popup"
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/45 backdrop-blur-[2px] animate-in fade-in duration-200"
      />

      {/* sheet (mobile) / card (desktop) */}
      <div
        className={
          'dialog-sheet-gate fixed inset-x-0 bottom-0 z-[71] mx-auto w-full max-w-md animate-in slide-in-from-bottom duration-300 ' +
          'rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-ink/25 sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5'
        }
      >
        {/* grabber — mobile only */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2.5 h-1 w-9 -translate-x-1/2 rounded-full bg-border sm:hidden"
        />

        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-full text-label transition-colors hover:bg-secondary hover:text-heading"
        >
          <X className="h-4.5 w-4.5" aria-hidden />
        </button>

        {stage === 'offer' ? (
          <>
            {/* header */}
            <div className="flex items-center gap-3 pt-2 sm:pt-0">
              <span className="btn-3d flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink text-gold">
                <GraduationCap className="h-7 w-7" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-tight text-heading">Install Hajira</h2>
                <p className="text-xs text-label">
                  {mode === 'ios'
                    ? 'Takes 10 seconds on iPhone / iPad'
                    : mode === 'native'
                      ? 'One tap — no Play Store needed'
                      : 'Quick setup in your browser'}
                </p>
              </div>
            </div>

            {mode === 'ios' ? (
              /* ------------------------- iOS step guide ------------------------ */
              <ol className="mt-4 flex flex-col gap-2.5" aria-label="Installation steps">
                {[
                  { icon: Share, text: 'Tap the Share button in Safari’s toolbar' },
                  { icon: PlusSquare, text: 'Scroll and choose “Add to Home Screen”' },
                  { icon: CheckCircle2, text: 'Tap Add — Hajira joins your home screen' },
                ].map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-cream-soft/60 px-3.5 py-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/25 text-ink">
                      <s.icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-body">{s.text}</span>
                  </li>
                ))}
              </ol>
            ) : mode === 'native' ? (
              /* ---------------------- Android / Chrome / Edge ------------------- */
              <>
                <ul className="mt-4 flex flex-col gap-2.5" aria-label="Benefits">
                  {[
                    {
                      icon: Smartphone,
                      title: 'Real app icon',
                      text: 'Opens full-screen from your home screen',
                    },
                    {
                      icon: Zap,
                      title: 'Instant launch',
                      text: 'No browser bar, faster every time',
                    },
                    {
                      icon: WifiOff,
                      title: 'Never stuck',
                      text: 'Opens even when the internet drops',
                    },
                  ].map((b) => (
                    <li key={b.title} className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/25 text-ink">
                        <b.icon className="h-4.5 w-4.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-heading">{b.title}</p>
                        <p className="truncate text-xs text-label">{b.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              /* --------------------------- manual mode -------------------------- */
              <div className="mt-4 rounded-xl border border-border/70 bg-cream-soft/60 px-4 py-3.5 text-sm text-body">
                <p className="font-semibold text-heading">Install from your browser menu</p>
                <p className="mt-1 text-[13px] leading-relaxed">
                  Open Hajira in <strong>Chrome</strong>, tap the <strong>⋮ menu</strong> and choose{' '}
                  <strong>“Add to Home screen”</strong> (desktop: <strong>Install</strong> in the
                  address bar).
                </p>
              </div>
            )}

            {/* actions */}
            <div className="mt-5 flex flex-col gap-2">
              {mode === 'native' ? (
                <button
                  onClick={install}
                  disabled={installing}
                  className="btn-3d btn-gold flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold disabled:opacity-60"
                >
                  <Download className="h-5 w-5" aria-hidden />
                  {installing ? 'Opening installer…' : 'Install app'}
                </button>
              ) : null}
              <button
                onClick={stage === 'offer' ? notNow : close}
                className="flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-label transition-colors hover:bg-secondary hover:text-heading"
              >
                {mode === 'native' ? 'Not now' : 'Got it'}
              </button>
            </div>

            <p className="mt-2.5 text-center text-[11px] text-label">
              Free · under 1 MB · works alongside the browser
            </p>
          </>
        ) : (
          /* ------------------------ success / already ------------------------ */
          <div className="flex flex-col items-center gap-3 py-6 text-center sm:py-2">
            <CheckCircle2 className="h-14 w-14 text-green" aria-hidden />
            <h2 className="font-display text-xl text-heading">
              {stage === 'already' ? 'You’re using the installed app' : 'Hajira is installed!'}
            </h2>
            <p className="max-w-xs text-sm text-body">
              {stage === 'already'
                ? 'Enjoy the full-screen experience — attendance in one tap.'
                : 'Look for the Hajira icon on your home screen / app list.'}
            </p>
            <button
              onClick={close}
              className="btn-3d btn-ink mt-2 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold sm:w-auto sm:px-8"
            >
              {stage === 'already' ? 'Great' : 'Start using it'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
