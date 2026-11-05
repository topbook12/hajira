'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  MapPin,
  RefreshCw,
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
  getDeviceId,
  getSocket,
  getPosition,
  tryFingerprint,
  type CheckInInfo,
  type HajiraUser,
} from '@/lib/hajira-client'
import {
  methodLabel,
  useHajiraToasts,
} from '@/components/hajira/shared'

type CheckinSession = { id: string; className: string; teacherName?: string }

type BioState = 'idle' | 'verifying' | 'ok' | 'unsupported' | 'skipped'

type Result =
  | { kind: 'present'; message: string; checkIn: CheckInInfo }
  | { kind: 'flagged'; message: string; checkIn: CheckInInfo }
  | { kind: 'already'; message: string }
  | { kind: 'error'; message: string }

const STEP_LABELS = ['Location', 'Code (optional)', 'Verify & confirm']

export default function CheckinDialog({
  user,
  session,
  open,
  onOpenChange,
  onChecked,
}: {
  user: HajiraUser
  session: CheckinSession | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChecked?: () => void
}) {
  const { err } = useHajiraToasts()
  const [locStatus, setLocStatus] = React.useState<'locating' | 'ok' | 'fail'>('locating')
  const [loc, setLoc] = React.useState<{ lat: number; lng: number; acc?: number } | null>(null)
  const [code, setCode] = React.useState('')
  const [bio, setBio] = React.useState<BioState>('idle')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)

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

  /* reset + auto-locate + URL ?code= prefill each time the dialog opens */
  React.useEffect(() => {
    if (!open) return
    setResult(null)
    setCode('')
    setBio('idle')
    setSubmitting(false)
    try {
      const q = new URLSearchParams(window.location.search).get('code')
      if (q) setCode(q)
    } catch {
      /* ignore */
    }
    locate()
  }, [open, locate])

  const verifyFingerprint = async () => {
    setBio('verifying')
    const okBio = await tryFingerprint(user.name)
    setBio(okBio ? 'ok' : 'unsupported')
  }

  const submit = async () => {
    if (!session) return
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
          code: code.trim() || undefined,
          lat: loc?.lat,
          lng: loc?.lng,
          deviceId: getDeviceId(),
          bioVerified: bio === 'ok',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-sheet max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{session?.className ?? 'Attendance'}</DialogTitle>
          <DialogDescription>
            {session?.teacherName ? `${session.teacherName} • ` : ''}Confirm your attendance in 3 steps
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-1.5" aria-label="Check-in steps">
          {STEP_LABELS.map((label, i) => (
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
              {i < STEP_LABELS.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
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
                <CheckCircle2 className="h-14 w-14 text-green" aria-hidden />
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

            {/* Step 2 — optional code */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkin-code">QR / PIN code (optional)</Label>
              <Input
                id="checkin-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code or QR payload"
                className="font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-label">
                Scanning the projector QR or typing the 6-digit code speeds up verification
              </p>
            </div>

            {/* Step 3 — fingerprint */}
            <div className="rounded-xl border border-border/60 bg-cream-soft/70 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-heading">
                <Fingerprint className="h-4 w-4" aria-hidden />
                Fingerprint verification (optional)
              </p>
              {bio === 'ok' ? (
                <p className="flex items-center gap-2 text-sm font-medium text-green">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Fingerprint verified
                </p>
              ) : bio === 'verifying' ? (
                <p className="flex items-center gap-2 text-sm text-label">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Verifying — use your device sensor…
                </p>
              ) : bio === 'unsupported' || bio === 'skipped' ? (
                <p className="text-sm text-label">
                  Fingerprint isn&apos;t available on this device — just tap Confirm attendance
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={verifyFingerprint}
                    className="border-border font-medium text-ink hover:bg-secondary"
                  >
                    <Fingerprint className="h-4 w-4" aria-hidden />
                    Verify with fingerprint
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBio('skipped')}
                    className="text-label"
                  >
                    Skip
                  </Button>
                </div>
              )}
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="btn-3d btn-ink h-12 w-full text-base font-bold"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                'Confirm attendance'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
