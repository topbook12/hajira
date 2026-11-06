'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Globe,
  Loader2,
  MapPin,
  RefreshCw,
  ScanLine,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  api,
  bioSupported,
  fingerprintAssert,
  getBioStatus,
  getDeviceId,
  getSocket,
  getPosition,
  type CheckInInfo,
  type HajiraUser,
} from '@/lib/hajira-client'
import {
  methodLabel,
  useHajiraToasts,
} from '@/components/hajira/shared'
import QrScanner from '@/components/hajira/student/qr-scanner'

type CheckinSession = {
  id: string
  className: string
  teacherName?: string
  /** false = teacher allows remote check-in (e.g. from home) */
  requireGps?: boolean
  /** true = rotating QR / PIN is required */
  requireCode?: boolean
}

type BioState = 'idle' | 'verifying' | 'ok'

type Result =
  | { kind: 'present'; message: string; checkIn: CheckInInfo }
  | { kind: 'flagged'; message: string; checkIn: CheckInInfo }
  | { kind: 'already'; message: string }
  | { kind: 'error'; message: string }

export default function CheckinDialog({
  user,
  session,
  open,
  openScannerNow = false,
  onOpenChange,
  onChecked,
}: {
  user: HajiraUser
  session: CheckinSession | null
  open: boolean
  /** open the camera scanner immediately (Scan FAB deep-open) */
  openScannerNow?: boolean
  onOpenChange: (open: boolean) => void
  onChecked?: () => void
}) {
  const { ok, err } = useHajiraToasts()
  const remote = session ? session.requireGps === false : false
  const [locStatus, setLocStatus] = React.useState<'locating' | 'ok' | 'fail' | 'idle'>('locating')
  const [loc, setLoc] = React.useState<{ lat: number; lng: number; acc?: number } | null>(null)
  const [code, setCode] = React.useState('')
  const [bio, setBio] = React.useState<BioState>('idle')
  const [bioRequired, setBioRequired] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)
  const [scannerOpen, setScannerOpen] = React.useState(false)

  const locate = React.useCallback(async () => {
    setLocStatus('locating')
    const p = await getPosition()
    if (p) {
      setLoc(p)
      setLocStatus('ok')
    } else {
      setLoc(null)
      setLocStatus('fail')
    }
  }, [])

  /* reset + auto-locate (only when GPS is required) + URL ?code= prefill +
     fingerprint status (auto-prompt when the student requires the sensor) */
  React.useEffect(() => {
    if (!open) return
    setResult(null)
    setCode('')
    setBio('idle')
    setBioRequired(false)
    setSubmitting(false)
    try {
      const q = new URLSearchParams(window.location.search).get('code')
      if (q) setCode(q)
    } catch {
      /* ignore */
    }
    if (session?.requireGps === false) {
      // Remote check-in — location is optional, don't nag for permission
      setLoc(null)
      setLocStatus('idle')
    } else {
      locate()
    }

    // Load the fingerprint setting; when required, raise the sensor once
    // automatically so the student just touches it instead of hunting for
    // the button during a 2-minute window.
    let cancelled = false
    if (bioSupported()) {
      getBioStatus()
        .then((s) => {
          if (cancelled) return
          setBioRequired(s.biometricRequired)
          if (s.biometricRequired) {
            setBio('verifying')
            fingerprintAssert()
              .then(() => !cancelled && setBio('ok'))
              .catch(() => !cancelled && setBio('idle'))
          }
        })
        .catch(() => {
          /* status is optional — check-in proceeds without biometrics */
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, locate, session?.requireGps])

  /* deep-open the camera (Scan FAB) */
  React.useEffect(() => {
    if (open && openScannerNow && !result) setScannerOpen(true)
  }, [open, openScannerNow, result])

  const verifyFingerprint = async () => {
    setBio('verifying')
    try {
      await fingerprintAssert()
      setBio('ok')
      ok('Fingerprint verified', 'It is you — now confirm your attendance')
    } catch (e) {
      setBio('idle')
      err('Fingerprint not verified', e instanceof Error ? e.message : undefined)
    }
  }

  const submit = async (codeOverride?: string) => {
    if (!session) return
    const finalCode = (codeOverride ?? code).trim()
    setSubmitting(true)
    try {
      const res = await api<{
        already?: boolean
        checkIn?: CheckInInfo
        className?: string
        message?: string
      }>('/api/checkin', {
        method: 'POST',
        body: {
          sessionId: session.id,
          code: finalCode || undefined,
          lat: loc?.lat,
          lng: loc?.lng,
          deviceId: getDeviceId(),
          bioVerified: bio === 'ok',
          // Opted-in students who skip the sensor still get their attendance
          // recorded — honestly, as FLAGGED for the teacher to review.
          bioFallback: bioRequired && bio !== 'ok',
        },
      })

      if (res.already) {
        setResult({ kind: 'already', message: res.message ?? 'Your attendance was already recorded' })
      } else if (res.checkIn) {
        const ci: CheckInInfo = {
          status: res.checkIn.status,
          method: res.checkIn.method,
          distanceM: res.checkIn.distanceM,
          bioVerified: res.checkIn.bioVerified,
          gpsOk: res.checkIn.gpsOk,
          flags: Array.isArray(res.checkIn.flags) ? res.checkIn.flags : [],
          createdAt: res.checkIn.createdAt,
        }
        setResult({
          kind: ci.status === 'PRESENT' ? 'present' : 'flagged',
          message: res.message ?? '',
          checkIn: ci,
        })
        /* announce to the teacher's live screen */
        getSocket().emit('checkin:new', {
          sessionId: session.id,
          checkIn: { ...ci, id: `rt-${Date.now()}`, studentId: user.id, studentName: user.name, studentPhone: user.phone, sessionId: session.id },
        })
      } else {
        setResult({ kind: 'error', message: 'Something went wrong' })
      }
      onChecked?.()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong'
      setResult({ kind: 'error', message })
      err('Check-in failed', message)
    } finally {
      setSubmitting(false)
    }
  }

  /** scanner returned a code — fill, tick, and submit instantly */
  const handleScan = async (scanned: string) => {
    if (!session) return
    setCode(scanned)
    ok('QR scanned', 'Submitting your attendance…')
    await submit(scanned)
  }

  const locRequired = !remote
  const stepLabels = [
    locRequired ? 'Location' : 'Location (optional)',
    session?.requireCode === false ? 'Code (not needed)' : 'Code',
    'Confirm',
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="dialog-sheet max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{session?.className ?? 'Attendance'}</DialogTitle>
            <DialogDescription>
              {session?.teacherName ? `${session.teacherName} • ` : ''}
              {remote
                ? 'Remote check-in — confirm from anywhere'
                : 'Confirm your attendance in 3 steps'}
            </DialogDescription>
          </DialogHeader>

          {/* Remote check-in banner */}
          {remote ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-green/25 bg-green/10 px-3.5 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green/15">
                <Globe className="h-4 w-4 text-green" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-green">
                  Remote check-in allowed
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-body">
                  Your teacher turned location off for this session — you can check in from
                  anywhere, even from home. Adding your location is optional.
                </p>
              </div>
            </div>
          ) : null}

          {/* Stepper */}
          <ol className="flex items-center gap-1.5" aria-label="Check-in steps">
            {stepLabels.map((label, i) => (
              <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className={
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' +
                    (result
                      ? 'bg-green/15 text-green'
                      : 'bg-ink text-cream')
                  }
                >
                  {i + 1}
                </span>
                <span className="truncate text-[11px] font-medium text-label">{label}</span>
                {i < stepLabels.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
              </li>
            ))}
          </ol>

          {result ? (
            /* ------------------------- RESULT PANEL ------------------------- */
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-cream-soft/70 p-6 text-center"
            >
              {result.kind === 'present' ? (
                <>
                  <motion.span
                    initial={{ scale: 0.5, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-green/12"
                  >
                    <CheckCircle2 className="h-12 w-12 text-green" aria-hidden />
                  </motion.span>
                  <p className="text-lg font-bold text-green">Attendance confirmed!</p>
                  <p className="text-sm text-body">{result.message}</p>
                  <div className="mt-1 flex flex-wrap justify-center gap-1.5 text-xs">
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-body">
                      Method: {methodLabel(result.checkIn.method)}
                    </span>
                    {result.checkIn.distanceM != null ? (
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-body">
                        Distance: {Math.round(result.checkIn.distanceM)} m
                      </span>
                    ) : null}
                    {result.checkIn.bioVerified ? (
                      <span className="rounded-full bg-green/10 px-2.5 py-1 font-medium text-green">
                        Fingerprint ✓
                      </span>
                    ) : null}
                    <span
                      className={
                        result.checkIn.gpsOk
                          ? 'rounded-full bg-green/10 px-2.5 py-1 font-medium text-green'
                          : 'rounded-full bg-gold/25 px-2.5 py-1 font-medium text-ink'
                      }
                    >
                      GPS {result.checkIn.gpsOk ? '✓' : '✗'}
                    </span>
                  </div>
                </>
              ) : result.kind === 'flagged' ? (
                <>
                  <AlertTriangle className="h-14 w-14 text-amber-500" aria-hidden />
                  <p className="text-lg font-bold text-amber-700">Checked in — flagged for review</p>
                  <p className="text-sm text-body">{result.message}</p>
                  <ul className="w-full space-y-1 text-left" aria-label="Flag reasons">
                    {result.checkIn.flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-label">Your teacher will review and decide.</p>
                </>
              ) : result.kind === 'already' ? (
                <>
                  <CheckCircle2 className="h-14 w-14 text-green" aria-hidden />
                  <p className="text-lg font-bold text-green">Already recorded</p>
                  <p className="text-sm text-body">{result.message}</p>
                </>
              ) : (
                <>
                  <XCircle className="h-14 w-14 text-rust" aria-hidden />
                  <p className="text-lg font-bold text-rust">Check-in failed</p>
                  <p className="text-sm text-body">{result.message}</p>
                </>
              )}

              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="mt-2 w-full border-border hover:bg-secondary sm:w-auto"
              >
                Close
              </Button>
            </motion.div>
          ) : (
            /* --------------------------- FORM STEPS -------------------------- */
            <div className="flex flex-col gap-5">
              {/* Step 1 — location */}
              {locRequired ? (
                <div className="rounded-xl border border-border/60 bg-cream-soft/70 p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-heading">
                    <MapPin className="h-4 w-4" aria-hidden />
                    Location check
                  </p>
                  {locStatus === 'locating' ? (
                    <p className="flex items-center gap-2 text-sm text-label">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Finding your location…
                    </p>
                  ) : locStatus === 'ok' ? (
                    <p className="flex items-start gap-2 text-sm font-medium text-green">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      Location found
                      {loc?.acc != null ? (
                        <span className="font-normal text-label">(accuracy ~{Math.round(loc.acc)} m)</span>
                      ) : null}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-start gap-2 text-sm text-amber-700">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        Location unavailable — allow permission, or continue anyway (your check-in will be flagged)
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={locate}
                        className="w-fit border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        Try again
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border/60 bg-cream-soft/70 p-4">
                  <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-heading">
                    <MapPin className="h-4 w-4" aria-hidden />
                    Location (optional)
                  </p>
                  {locStatus === 'locating' ? (
                    <p className="flex items-center gap-2 text-sm text-label">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Finding your location…
                    </p>
                  ) : locStatus === 'ok' ? (
                    <p className="flex items-start gap-2 text-sm font-medium text-green">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      Location attached
                      {loc?.acc != null ? (
                        <span className="font-normal text-label">(accuracy ~{Math.round(loc.acc)} m)</span>
                      ) : null}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-label">
                        Not needed for remote check-in — add it only if you want.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={locate}
                        className="border-border text-ink hover:bg-secondary"
                      >
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        Add my location
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 — code: scan first, type as fallback */}
              <div className="flex flex-col gap-2.5">
                <Label htmlFor="checkin-code">
                  {session?.requireCode === false
                    ? 'QR / PIN code (not required this session)'
                    : 'Attendance code'}
                </Label>

                <Button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="btn-3d btn-ink h-13 w-full gap-2.5 py-3.5 text-base font-bold"
                >
                  <ScanLine className="h-5 w-5" aria-hidden />
                  Scan QR code
                </Button>

                <div className="flex items-center gap-2" aria-hidden>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-label">
                    or type the code
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Input
                  id="checkin-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code from the projector"
                  className="h-11 font-mono"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-label">
                  {session?.requireCode === false
                    ? 'The teacher made the code optional — you can skip it and just confirm.'
                    : 'The projector QR refreshes every 30 seconds — scanning is fastest.'}
                </p>
              </div>

              {/* Step 3 — fingerprint (server-verified WebAuthn) */}
              <div
                className={
                  'rounded-xl border p-4 ' +
                  (bioRequired ? 'border-gold/50 bg-gold/10' : 'border-border/60 bg-cream-soft/70')
                }
              >
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-heading">
                  <Fingerprint className="h-4 w-4" aria-hidden />
                  Fingerprint verification
                  {bioRequired ? (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
                      Required
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-label">(optional)</span>
                  )}
                </p>
                {bio === 'ok' ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-green">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Fingerprint verified — it&apos;s you
                  </p>
                ) : bio === 'verifying' ? (
                  <p className="flex items-center gap-2 text-sm text-label">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Use your device sensor to confirm it&apos;s you…
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={verifyFingerprint}
                        className={
                          bioRequired
                            ? 'btn-3d border-ink bg-ink font-semibold text-gold hover:bg-ink/90'
                            : 'border-border font-medium text-ink hover:bg-secondary'
                        }
                      >
                        <Fingerprint className="h-4 w-4" aria-hidden />
                        Verify with fingerprint
                      </Button>
                    </div>
                    {bioRequired ? (
                      <p className="text-xs text-amber-700">
                        You turned this on in your Profile. No sensor on this phone? Confirm
                        below — your teacher will see it needs review.
                      </p>
                    ) : (
                      <p className="text-xs text-label">
                        Add your fingerprint once from Profile → Fingerprint to prove it&apos;s
                        really you at every check-in.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Button
                onClick={() => submit()}
                disabled={submitting}
                className="btn-3d btn-gold h-12 w-full text-base font-bold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Sending…
                  </>
                ) : bioRequired && bio !== 'ok' ? (
                  'Confirm without fingerprint (flagged)'
                ) : (
                  'Confirm attendance'
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-screen camera scanner (outside the dialog so it can go edge-to-edge) */}
      <QrScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onResult={handleScan}
      />
    </>
  )
}
