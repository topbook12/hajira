'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import QRCode from 'react-qr-code'
import {
  ArrowLeft,
  BarChart3,
  Check,
  Fingerprint,
  ListChecks,
  Loader2,
  MapPin,
  Square,
  X,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  api,
  getSocket,
  type LiveCheckInRow,
  type QrInfo,
  type TeacherSessionData,
} from '@/lib/hajira-client'
import {
  CheckStatusBadge,
  EmptyState,
  FlagList,
  MethodBadge,
  mmss,
  PulsingDot,
  ScrollList,
  useCountdown,
  useHajiraToasts,
} from '@/components/hajira/shared'

export default function TeacherLiveSession({
  sessionId,
  onBack,
  onViewReport,
}: {
  sessionId: string
  onBack: () => void
  onViewReport: (classId: string) => void
}) {
  const { ok, err } = useHajiraToasts()
  const [session, setSession] = React.useState<TeacherSessionData['session'] | null>(null)
  const [checkIns, setCheckIns] = React.useState<LiveCheckInRow[]>([])
  const [rosterCount, setRosterCount] = React.useState(0)
  const [qr, setQr] = React.useState<QrInfo | null>(null)
  const [closing, setClosing] = React.useState(false)
  const expiredHandled = React.useRef(false)

  const { remainingSec } = useCountdown(session?.endsAt ?? null)
  const ended = !session || session.status !== 'ACTIVE' || remainingSec <= 0

  const load = React.useCallback(async () => {
    try {
      const d = await api<TeacherSessionData>(`/api/sessions/${sessionId}`)
      setSession(d.session ?? null)
      setCheckIns(Array.isArray(d.checkIns) ? d.checkIns : [])
      setRosterCount(Number.isFinite(d.rosterCount) ? d.rosterCount : 0)
    } catch (e) {
      err('Could not load the session', e instanceof Error ? e.message : undefined)
    }
  }, [sessionId])

  /* initial load + realtime join */
  React.useEffect(() => {
    let alive = true
    load()
    const sock = getSocket()
    sock.emit('join-session', { sessionId })

    const onNew = (payload: unknown) => {
      if (!alive) return
      const ci = payload as Partial<LiveCheckInRow> & { sessionId?: string }
      if (ci.sessionId && ci.sessionId !== sessionId) return
      const row: LiveCheckInRow = {
        id: ci.id ?? `rt-${ci.studentId ?? Math.random()}`,
        studentId: ci.studentId ?? '',
        studentName: ci.studentName ?? 'Student',
        studentPhone: ci.studentPhone ?? '',
        status: ci.status ?? 'PRESENT',
        distanceM: ci.distanceM ?? null,
        method: ci.method ?? 'BUTTON',
        bioVerified: !!ci.bioVerified,
        gpsOk: !!ci.gpsOk,
        flags: Array.isArray(ci.flags) ? ci.flags : [],
        createdAt: ci.createdAt ?? new Date().toISOString(),
      }
      setCheckIns((prev) =>
        prev.some((p) => p.studentId === row.studentId) ? prev : [row, ...prev]
      )
    }
    const onClosed = (payload: unknown) => {
      const data = payload as { sessionId?: string }
      if (!data?.sessionId || data.sessionId === sessionId) load()
    }

    sock.on('checkin:new', onNew)
    sock.on('session:closed', onClosed)
    return () => {
      alive = false
      sock.emit('leave-session', { sessionId })
      sock.off('checkin:new', onNew)
      sock.off('session:closed', onClosed)
    }
  }, [sessionId, load])

  /* polling fallback — guarantees the count stays true even if the realtime
     relay blips; payload is a tiny JSON summary, so 5s is negligible */
  React.useEffect(() => {
    if (ended) return
    const iv = setInterval(() => {
      load()
    }, 5000)
    return () => clearInterval(iv)
  }, [ended, load])

  /* rotating QR / PIN poll — every 5s while live */
  React.useEffect(() => {
    if (ended) {
      setQr(null)
      return
    }
    let alive = true
    const pull = async () => {
      try {
        const q = await api<QrInfo>(`/api/sessions/${sessionId}/qr`)
        if (alive) setQr(q)
      } catch {
        /* QR poll failure is non-fatal */
      }
    }
    pull()
    const iv = setInterval(pull, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [sessionId, ended])

  /* refetch once when the time window expires (server marks effective CLOSED) */
  React.useEffect(() => {
    if (ended && !expiredHandled.current) {
      expiredHandled.current = true
      if (session?.status === 'ACTIVE') load()
    }
    if (!ended) expiredHandled.current = false
  }, [ended, session?.status, load])

  const presentCount = (checkIns ?? []).filter((c) => c.status === 'PRESENT').length
  const pct = rosterCount ? Math.round((presentCount / rosterCount) * 100) : 0

  const override = async (row: LiveCheckInRow, status: 'PRESENT' | 'ABSENT') => {
    try {
      const res = await api<{ checkIn: { status: string; method: string; distanceM: number | null; bioVerified: boolean; gpsOk: boolean; flags: string | string[] | null } }>(
        `/api/sessions/${sessionId}/override`,
        { method: 'POST', body: { studentId: row.studentId, status } }
      )
      const c = res.checkIn
      let flags: string[] = []
      if (typeof c.flags === 'string' && c.flags) {
        try {
          flags = JSON.parse(c.flags)
        } catch {
          flags = []
        }
      } else if (Array.isArray(c.flags)) {
        flags = c.flags
      }
      setCheckIns((prev) =>
        prev.map((p) =>
          p.studentId === row.studentId
            ? { ...p, status: c.status as LiveCheckInRow['status'], method: c.method, distanceM: c.distanceM ?? null, bioVerified: !!c.bioVerified, gpsOk: !!c.gpsOk, flags }
            : p
        )
      )
      ok(status === 'PRESENT' ? `${row.studentName} — marked present` : `${row.studentName} — marked absent`)
    } catch (e) {
      err('Could not update', e instanceof Error ? e.message : undefined)
    }
  }

  const closeSession = async () => {
    setClosing(true)
    try {
      const res = await api<{
        session: { id: string; classId: string }
        summary: { presentCount: number; rosterCount: number }
      }>(`/api/sessions/${sessionId}/close`, { method: 'POST' })
      getSocket().emit('session:closed', { classId: res.session.classId, sessionId })
      ok(
        `Session closed: ${res.summary.presentCount}/${res.summary.rosterCount} present`,
        'Open the report for details'
      )
      setQr(null)
      await load()
    } catch (e) {
      err('Could not close the session', e instanceof Error ? e.message : undefined)
    } finally {
      setClosing(false)
    }
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="h-8 w-8 animate-spin text-ink" aria-hidden />
      </div>
    )
  }

  return (
    <section aria-label="Live attendance session" className="flex flex-col gap-5">
      <Button
        variant="ghost"
        onClick={onBack}
        className="-ml-2 w-fit gap-2 text-label hover:text-heading"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Button>

      {/* Live header banner — Peppercorn ink with gold glow */}
      <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-cream shadow-lg shadow-ink/25">
        <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-gold/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold">
              {!ended ? (
                <>
                  <PulsingDot color="red" />
                  Live attendance running
                </>
              ) : (
                'Session ended'
              )}
            </div>
            <h2 className="mt-1 truncate font-display text-2xl text-cream">{session.className}</h2>
            <p className="mt-0.5 text-sm text-cream/70">
              Code: <span className="font-mono">{session.classCode}</span> •{' '}
              {session.requireGps
                ? `Radius: ${session.radiusM} m • GPS verification on`
                : 'Remote check-in — no GPS required'}
            </p>
          </div>
          <div className="text-left sm:text-right" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-cream/60">Time remaining</p>
            <p className="font-mono text-4xl font-bold tabular-nums text-gold">
              {ended ? <span className="text-2xl text-cream">Ended</span> : mmss(remainingSec)}
            </p>
          </div>
        </div>
      </div>

      {/* Ended summary */}
      {ended ? (
        <Card className="card-3d">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-sm font-medium text-label">Session result</p>
            <p className="font-display text-5xl text-heading">
              {presentCount}
              <span className="text-xl text-label"> / {rosterCount}</span>
            </p>
            <p className="text-sm text-body">students present</p>
            <Progress value={pct} className="h-2 max-w-xs [&>div]:bg-green" aria-label="Attendance rate" />
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={() => onViewReport(session.classId)} className="btn-3d btn-ink font-semibold">
                <BarChart3 className="h-4 w-4" aria-hidden />
                View report
              </Button>
              <Button variant="outline" onClick={onBack} className="border-border hover:bg-secondary">
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* QR + PIN (hidden when ended) */}
      {!ended && qr ? (
        <Card className="card-3d card-inner-glow corner-glow">
          <CardContent className="relative flex flex-col items-center gap-3 p-6">
            <p className="text-sm font-medium text-body">
              Show on the projector — students scan to check in instantly
            </p>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <QRCode value={qr.payload} size={220} />
            </div>
            <p className="mt-1 text-sm text-label">or type this code:</p>
            <p className="font-mono text-3xl font-bold tracking-[0.25em] text-ink" aria-label="PIN code">
              {qr.pin}
            </p>
            <div className="w-full max-w-[220px]">
              <Progress
                value={(qr.expiresInSec / 30) * 100}
                className="h-1.5 [&>div]:bg-gold-deep"
                aria-label="Code validity"
              />
              <p className="mt-1 text-center text-xs text-label">
                New code in {qr.expiresInSec} seconds
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <Card className="card-3d stat-card-premium">
        <CardContent className="relative p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-body">
              Present{' '}
              <span className="font-bold text-green">
                {presentCount}/{rosterCount}
              </span>
            </span>
            <span className="font-mono font-semibold text-body">{pct}%</span>
          </div>
          <Progress value={pct} className="mt-2 h-2 [&>div]:bg-green" aria-label="Attendance rate" />
        </CardContent>
      </Card>

      {/* Live check-in list */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <ListChecks className="h-4 w-4 text-ink" aria-hidden />
            Live check-ins
          </h3>

          {checkIns.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No check-ins yet"
              hint="Check-ins will appear here in real time."
            />
          ) : (
            <ScrollList>
              <ul className="flex flex-col gap-2">
                {checkIns.map((row) => (
                  <motion.li
                    key={`${row.studentId}-${row.id}`}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-cream-soft/60 p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-9 w-9 border border-gold/30">
                        <AvatarFallback className="bg-gold/25 text-sm font-bold text-ink">
                          {row.studentName.trim().charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-heading">
                          {row.studentName}
                          {row.bioVerified ? (
                            <Fingerprint
                              className="ml-1.5 inline h-4 w-4 text-green"
                              aria-label="Fingerprint verified"
                            />
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-label">{row.studentPhone}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <CheckStatusBadge status={row.status} />
                          <MethodBadge method={row.method} />
                          {row.distanceM != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-body">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {Math.round(row.distanceM)} m
                            </span>
                          ) : null}
                          <span
                            className={
                              row.gpsOk
                                ? 'inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green'
                                : 'inline-flex items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 text-xs font-medium text-ink'
                            }
                          >
                            {row.gpsOk ? 'GPS ✓' : 'GPS ✗'}
                          </span>
                        </div>
                        <FlagList flags={row.flags} />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => override(row, 'PRESENT')}
                        disabled={ended}
                        aria-label={`${row.studentName} — mark present`}
                        title="Mark present"
                        className="h-10 w-10 text-green hover:bg-green/10 hover:text-green sm:h-9 sm:w-9"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => override(row, 'ABSENT')}
                        disabled={ended}
                        aria-label={`${row.studentName} — mark absent`}
                        title="Mark absent"
                        className="h-10 w-10 text-rust hover:bg-rust/10 hover:text-rust sm:h-9 sm:w-9"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </ScrollList>
          )}
        </CardContent>
      </Card>

      {/* Close session */}
      {!ended ? (
        <Button
          onClick={closeSession}
          disabled={closing}
          variant="outline"
          className="w-full border-rust/40 font-semibold text-rust hover:bg-rust/10 hover:text-rust sm:w-fit sm:self-center"
        >
          {closing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
          End session
        </Button>
      ) : null}
    </section>
  )
}
