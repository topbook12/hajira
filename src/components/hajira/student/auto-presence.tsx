'use client'

import * as React from 'react'

import { AlertTriangle, CheckCircle2, Loader2, MapPin, Radar, ScanLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  api,
  getDeviceId,
  getSocket,
  getPosition,
  type ActiveSessionInfo,
  type HajiraUser,
} from '@/lib/hajira-client'
import { useCountdown, useHajiraToasts } from '@/components/hajira/shared'

type BeaconState =
  | { kind: 'locating' }
  | { kind: 'counted'; distanceM: number | null }
  | { kind: 'outside'; distanceM: number | null }
  | { kind: 'nogps' }
  | { kind: 'error'; message: string }

/**
 * AUTO PRESENCE — the student side of the passive attendance engine.
 *
 * While the teacher's auto window is live and the student keeps the app
 * open, this component beacons the device location every 15 seconds. The
 * server decides inside/outside the fence; the student just watches the
 * status settle — no tap, no QR, no PIN. A manual check-in stays one tap
 * away as a safety net (GPS denied, airplane-mode, etc.).
 */
export default function AutoPresenceBeacon({
  session,
  user,
  onManual,
  onRecorded,
}: {
  session: ActiveSessionInfo
  user: HajiraUser
  /** opens the regular check-in dialog as the manual fallback */
  onManual: () => void
  /** first time a record lands (PRESENT/FLAGGED) — refresh the hero stats */
  onRecorded?: () => void
}) {
  const { ok } = useHajiraToasts()
  const { remainingSec } = useCountdown(session.endsAt)
  const [state, setState] = React.useState<BeaconState>({ kind: 'locating' })
  const busy = React.useRef(false)
  const announced = React.useRef(false)

  const beacon = React.useCallback(async () => {
    if (busy.current) return
    // never send a doomed request — once the window is over the server
    // would only answer 410 (the early-close case is handled by the 410
    // path below; this guard covers the natural expiry)
    if (Date.now() >= new Date(session.endsAt).getTime() - 500) return
    busy.current = true
    try {
      const pos = await getPosition()
      const res = await api<{
        checkIn?: { status: string; distanceM: number | null; gpsOk: boolean; flags?: string[] }
        message?: string
        error?: string
      }>(`/api/sessions/${session.id}/beacon`, {
        method: 'POST',
        body: { lat: pos?.lat, lng: pos?.lng, deviceId: getDeviceId() },
      })

      if (res.checkIn?.status === 'PRESENT') {
        setState({ kind: 'counted', distanceM: res.checkIn.distanceM ?? null })
        if (!announced.current) {
          announced.current = true
          ok('Attendance recorded automatically', res.message ?? 'You were inside the classroom range')
          onRecorded?.()
          /* announce to the teacher's live screen */
          getSocket().emit('checkin:new', {
            sessionId: session.id,
            checkIn: {
              status: 'PRESENT',
              method: 'AUTO',
              distanceM: res.checkIn.distanceM ?? null,
              bioVerified: false,
              gpsOk: true,
              flags: [],
              id: `rt-${Date.now()}`,
              studentId: user.id,
              studentName: user.name,
              studentPhone: user.phone,
              sessionId: session.id,
              createdAt: new Date().toISOString(),
            },
          })
        }
      } else if (res.checkIn?.status === 'FLAGGED' || res.checkIn?.status === 'ABSENT') {
        const hasFix = res.checkIn.distanceM != null
        setState(hasFix ? { kind: 'outside', distanceM: res.checkIn.distanceM } : { kind: 'nogps' })
        if (!announced.current) {
          announced.current = true
          onRecorded?.()
        }
      } else if (res.error) {
        setState({ kind: 'error', message: res.error })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach Hajira'
      // the teacher ended the window (or it expired) while a beacon was in
      // flight — that is the normal way this screen ends, not an error
      if (/window has ended|attendance window/i.test(msg)) {
        setState({ kind: 'error', message: 'The auto-attendance window has ended.' })
      } else {
        setState({ kind: 'error', message: msg })
      }
    } finally {
      busy.current = false
    }
  }, [session.id, user, ok, onRecorded])

  React.useEffect(() => {
    if (remainingSec <= 0) return
    beacon()
    const iv = setInterval(() => {
      // "app open" is the contract — a backgrounded tab stops beacons
      if (typeof document === 'undefined' || document.visibilityState === 'visible') beacon()
    }, 15_000)
    return () => clearInterval(iv)
  }, [beacon, remainingSec > 0])

  if (remainingSec <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5">
        <Radar className="h-4 w-4 shrink-0 text-label" aria-hidden />
        <p className="text-sm text-label">Window closed — open Analysis to see the result.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {state.kind === 'locating' ? (
        <div className="flex items-center gap-2 rounded-lg bg-green/10 px-3 py-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-green" aria-hidden />
          <p className="text-sm font-medium text-green">Finding you — attendance counting automatically…</p>
        </div>
      ) : state.kind === 'counted' ? (
        <div className="flex items-start gap-2 rounded-lg bg-green/10 px-3 py-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold text-green">Counted automatically — you are in range</p>
            <p className="mt-0.5 text-xs text-label">
              Keep the app open. Nothing else to do.
              {state.distanceM != null ? ` (~${Math.round(state.distanceM)} m from the room)` : ''}
            </p>
          </div>
        </div>
      ) : state.kind === 'outside' ? (
        <div className="flex items-start gap-2 rounded-lg bg-gold/15 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm font-medium text-amber-700">
            You are outside the classroom range
            {state.distanceM != null ? ` (~${Math.round(state.distanceM)} m away)` : ''} — marked for
            your teacher to review.
          </p>
        </div>
      ) : state.kind === 'nogps' ? (
        <div className="flex items-start gap-2 rounded-lg bg-gold/15 px-3 py-2.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm font-medium text-amber-700">
            Location unavailable — allow location permission, or check in manually below.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-rust/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rust" aria-hidden />
          <p className="text-sm text-rust">{state.message}</p>
        </div>
      )}

      <Button
        variant="ghost"
        onClick={onManual}
        className="h-9 w-fit gap-1.5 text-label hover:text-heading"
      >
        <ScanLine className="h-3.5 w-3.5" aria-hidden />
        Check in manually instead
      </Button>
    </div>
  )
}
