'use client'

import * as React from 'react'

import jsQR from 'jsqr'
import { AnimatePresence, motion } from 'framer-motion'
import { CameraOff, ScanLine, SwitchCamera, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Extract a Hajira attendance payload from raw QR text.
 * Handles:
 *  - the plain payload  "ATT1.<sessionId>.<slot>.<sig>"
 *  - the payload embedded in a URL  "https://host/?code=ATT1...."
 * Returns null for QR codes that are not Hajira attendance codes.
 */
export function extractAttendanceCode(raw: string): string | null {
  const text = (raw || '').trim()
  if (!text) return null

  // URL form -> pull the ?code= query parameter
  if (/^https?:\/\//i.test(text)) {
    try {
      const q = new URL(text).searchParams.get('code')
      if (q && q.includes('ATT1.')) return q
    } catch {
      /* not a parseable URL */
    }
    return null
  }

  const i = text.indexOf('ATT1.')
  if (i === -1) return null
  // payload runs until whitespace (some scanners append a newline)
  const m = text.slice(i).match(/^ATT1\.[A-Za-z0-9-_]+\.\d+\.[A-Za-z0-9]+/)
  return m ? m[0] : text.slice(i).split(/\s/)[0]
}

type CamState = 'starting' | 'scanning' | 'denied' | 'unavailable'

/**
 * Full-screen, app-style camera QR scanner.
 *
 * Mobile-first premium overlay: dark backdrop, rounded viewport, gold
 * reticle with an animated scan line, haptic tick on decode. Decoding is
 * done fully on-device (jsQR) — no frame ever leaves the phone.
 */
export default function QrScanner({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once with the extracted attendance code, then the scanner closes */
  onResult: (code: string) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number>(0)
  const stopRef = React.useRef<(() => void) | null>(null)
  const onResultRef = React.useRef(onResult)

  const [cam, setCam] = React.useState<CamState>('starting')
  const [facing, setFacing] = React.useState<'environment' | 'user'>('environment')
  const [hint, setHint] = React.useState<string | null>(null)

  React.useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const stopCamera = React.useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
  }, [])

  /* camera lifecycle — start/stop with the overlay */
  React.useEffect(() => {
    if (!open) {
      stopCamera()
      setHint(null)
      return
    }
    let cancelled = false
    setCam('starting')
    setHint(null)

    const start = async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          if (!cancelled) setCam('unavailable')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play().catch(() => undefined)
        setCam('scanning')

        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        let lastDecode = 0
        let stopped = false

        const tick = (ts: number) => {
          if (stopped) return
          rafRef.current = requestAnimationFrame(tick)
          // decode at ~8 fps — plenty for a projector QR, easy on the battery
          if (ts - lastDecode < 120) return
          lastDecode = ts
          if (!video.videoWidth || !video.videoHeight) return

          const w = 480
          const h = Math.round((video.videoHeight / video.videoWidth) * 480)
          canvas.width = w
          canvas.height = h
          ctx.drawImage(video, 0, 0, w, h)
          const img = ctx.getImageData(0, 0, w, h)
          const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
          if (!found?.data) return

          const code = extractAttendanceCode(found.data)
          if (!code) {
            setHint('This is not a Hajira attendance code — point at the projector QR')
            return
          }
          // success: tick, return the code, close
          try {
            navigator.vibrate?.(35)
          } catch {
            /* vibration not supported */
          }
          stopped = true
          onResultRef.current(code)
          onOpenChange(false)
        }
        rafRef.current = requestAnimationFrame(tick)

        stopRef.current = () => {
          stopped = true
          cancelAnimationFrame(rafRef.current)
          stream.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
      } catch (e) {
        if (cancelled) return
        const name = (e as DOMException)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') setCam('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setCam('unavailable')
        else setCam('unavailable')
      }
    }
    start()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, facing, stopCamera, onOpenChange])

  /* Escape closes ONLY the scanner — capture phase + stopPropagation keeps
     the Radix check-in dialog underneath from also closing on the same key */
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onOpenChange])

  /* lock page scroll while the scanner is up */
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="qr-scanner"
          role="dialog"
          aria-modal="true"
          aria-label="Scan attendance QR code"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex flex-col bg-ink/97 text-cream backdrop-blur-sm"
        >
          {/* header */}
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.9rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold text-ink">
                <ScanLine className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="font-display text-lg leading-tight text-cream">Scan to check in</p>
                <p className="text-xs text-cream/60">Point at the projector QR</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Close scanner"
              className="h-10 w-10 shrink-0 rounded-full text-cream hover:bg-cream/10 hover:text-cream"
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </div>

          {/* camera viewport */}
          <div className="flex flex-1 items-center justify-center px-4 pb-2">
            <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-3xl border border-cream/15 bg-black shadow-2xl">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
                aria-label="Camera view"
              />
              <canvas ref={canvasRef} className="hidden" aria-hidden />

              {/* reticle */}
              {cam === 'scanning' ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                  <div className="relative h-56 w-56">
                    <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-xl border-l-[3px] border-t-[3px] border-gold" />
                    <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-xl border-r-[3px] border-t-[3px] border-gold" />
                    <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-xl border-b-[3px] border-l-[3px] border-gold" />
                    <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-xl border-b-[3px] border-r-[3px] border-gold" />
                    <motion.span
                      className="absolute left-2 right-2 h-0.5 rounded-full bg-gold shadow-[0_0_12px_rgba(255,224,27,0.8)]"
                      initial={{ top: '12%' }}
                      animate={{ top: ['12%', '86%', '12%'] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              ) : null}

              {/* starting shimmer */}
              {cam === 'starting' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60" role="status">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-cream/25 border-t-gold" aria-hidden />
                  <p className="text-sm text-cream/70">Starting camera…</p>
                </div>
              ) : null}

              {/* permission / availability errors */}
              {(cam === 'denied' || cam === 'unavailable') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream/10">
                    <CameraOff className="h-7 w-7 text-cream/80" aria-hidden />
                  </span>
                  <p className="text-base font-semibold text-cream">
                    {cam === 'denied' ? 'Camera permission blocked' : 'Camera not available'}
                  </p>
                  <p className="max-w-[260px] text-xs leading-relaxed text-cream/60">
                    {cam === 'denied'
                      ? 'Tap the 🔒 icon in your browser address bar → Permissions → Camera → Allow, then retry. You can still type the 6-digit code instead.'
                      : 'No camera was found on this device. You can still type the 6-digit code instead.'}
                  </p>
                  {cam === 'denied' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                      className="border-cream/25 bg-transparent text-cream hover:bg-cream/10 hover:text-cream"
                    >
                      Retry camera
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* footer: hint + camera flip */}
          <div className="flex flex-col items-center gap-3 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <p aria-live="polite" className="min-h-5 text-center text-xs font-medium text-cream/75">
              {hint ??
                (cam === 'scanning'
                  ? 'Hold steady — the code is detected automatically'
                  : ' ')}
            </p>
            {cam === 'scanning' ? (
              <Button
                variant="outline"
                onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                className="gap-2 rounded-full border-cream/25 bg-transparent text-cream hover:bg-cream/10 hover:text-cream"
              >
                <SwitchCamera className="h-4 w-4" aria-hidden />
                Flip camera
              </Button>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
