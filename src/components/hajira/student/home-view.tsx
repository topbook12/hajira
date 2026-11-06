'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, Flame, Globe, Radio, ScanLine, TrendingUp, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  type ActiveSessionInfo,
  type HajiraUser,
  type StudentTotals,
  type TodaySlot,
} from '@/lib/hajira-client'
import {
  AttendanceRing,
  EmptyState,
  LoadErrorCard,
  mmss,
  PulsingDot,
  timeRange,
  useCountdown,
  useHajiraToasts,
} from '@/components/hajira/shared'
import CheckinDialog from '@/components/hajira/student/checkin-dialog'

/** Per-session ticking timer */
function SessionTimer({ endsAt }: { endsAt: string }) {
  const { remainingSec } = useCountdown(endsAt)
  if (remainingSec <= 0) {
    return (
      <Badge variant="secondary" className="bg-secondary text-label hover:bg-secondary">
        Time over
      </Badge>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-green">
      <PulsingDot color="green" />
      {mmss(remainingSec)}
    </span>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function StudentHomeView({
  user,
  reloadKey,
  scanSignal = 0,
  scanHandled = 0,
  onScanHandled,
  onOpenClass,
  onGoAnalysis,
}: {
  user: HajiraUser
  reloadKey: number
  /** bumped when the bottom-bar Scan FAB is tapped — deep-opens the scanner */
  scanSignal?: number
  /** highest scanSignal already processed (survives tab remounts, owned by parent) */
  scanHandled?: number
  /** parent marks a scan signal as consumed */
  onScanHandled?: (tick: number) => void
  onOpenClass: (classId: string) => void
  onGoAnalysis?: () => void
}) {
  const { err } = useHajiraToasts()
  const [totals, setTotals] = React.useState<StudentTotals | undefined>(undefined)
  const [meFailed, setMeFailed] = React.useState(false)
  const [meError, setMeError] = React.useState<string | undefined>(undefined)
  const [sessions, setSessions] = React.useState<ActiveSessionInfo[] | null>(null)
  const [today, setToday] = React.useState<TodaySlot[] | null>(null)
  const [checkedMap, setCheckedMap] = React.useState<Record<string, boolean>>({})
  const [checkinSession, setCheckinSession] = React.useState<ActiveSessionInfo | null>(null)
  const [openScannerNow, setOpenScannerNow] = React.useState(false)
  const loadedOnce = React.useRef(false)
  const scanSignalRef = React.useRef(scanSignal)
  const scanHandledRef = React.useRef(scanHandled)

  const load = React.useCallback(async () => {
    // FAST POLL — one cheap request. Sessions + "already checked in" arrive
    // together from /api/sessions/active (1 request replaced 3 + N).
    try {
      const r = await api<{
        sessions: ActiveSessionInfo[]
        checkedSessionIds?: string[]
      }>('/api/sessions/active')
      const list = r.sessions ?? []
      setSessions(list)
      setCheckedMap(Object.fromEntries((r.checkedSessionIds ?? []).map((id) => [id, true])))

      /* Scan FAB was tapped — open the first unchecked live session straight
         into the camera scanner. If nothing is live, say so honestly. */
      if (scanSignalRef.current > scanHandledRef.current) {
        scanHandledRef.current = scanSignalRef.current
        onScanHandled?.(scanSignalRef.current)
        const checked = new Set(r.checkedSessionIds ?? [])
        const target = list.find((s) => !checked.has(s.id))
        if (target) {
          setCheckinSession(target)
          setOpenScannerNow(true)
        } else if (list.length > 0) {
          err('Already checked in', 'You are checked in to every live session.')
        } else {
          err('No live session right now', 'When your teacher starts one, tap Scan again.')
        }
      }
    } catch (e) {
      // never blank the dashboard — keep the previous list on screen
      setSessions((prev) => prev ?? [])
      if (!loadedOnce.current) {
        err('Data did not load', e instanceof Error ? e.message : undefined)
      }
    }
    loadedOnce.current = true
  }, [err, onScanHandled])

  /** SLOW LOAD — the heavier identity/summary data, refreshed rarely:
      on mount, on manual reload, and after a check-in changes the numbers. */
  const loadSlow = React.useCallback(async () => {
    setMeFailed(false)
    // Each feed succeeds or fails INDEPENDENTLY — one flaky response must
    // never blank the whole dashboard (the mobile "data won't load" trap).
    const [meR, todayR] = await Promise.allSettled([
      api<{ totals?: StudentTotals }>('/api/me'),
      api<{ slots: TodaySlot[] }>('/api/timetable/today'),
    ])

    if (meR.status === 'fulfilled') {
      setTotals(meR.value.totals)
    } else {
      setMeFailed(true)
      setMeError(meR.reason instanceof Error ? meR.reason.message : undefined)
    }

    if (todayR.status === 'fulfilled') {
      setToday(todayR.value.slots ?? [])
    } else {
      setToday((prev) => prev ?? [])
    }
  }, [])

  React.useEffect(() => {
    scanSignalRef.current = scanSignal
  }, [scanSignal])

  React.useEffect(() => {
    scanHandledRef.current = scanHandled
  }, [scanHandled])

  React.useEffect(() => {
    load()
    loadSlow()
  }, [load, loadSlow, reloadKey, scanSignal])

  /* ADAPTIVE POLLING — the cost lever.
     A live attendance window is precious: poll every 10s so the card and
     the "already checked in" state stay fresh. With nothing live, 45s is
     plenty — that cuts idle requests (Vercel invocations, Turso reads,
     mobile battery and data) by ~78% without any UX loss. */
  const liveCountLocal = (sessions ?? []).length
  React.useEffect(() => {
    const iv = setInterval(load, liveCountLocal > 0 ? 10_000 : 45_000)
    return () => clearInterval(iv)
  }, [load, liveCountLocal])

  const liveCount = (sessions ?? []).filter((s) => !checkedMap[s.id]).length
  const onTrack = (totals?.overallPct ?? 0) >= 70

  return (
    <section aria-label="Student home" className="flex flex-col gap-6">
      {/* ===== Hero — attendance at a glance ===== */}
      {totals === undefined && !meFailed ? (
        <Skeleton className="h-[168px] rounded-2xl" />
      ) : meFailed && totals === undefined ? (
        <LoadErrorCard message={meError} onRetry={load} title="Your attendance did not load" />
      ) : totals ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="corner-glow relative overflow-hidden rounded-2xl bg-ink p-5 text-cream shadow-lg shadow-ink/25 sm:p-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
              <AttendanceRing pct={totals.overallPct} tone={onTrack ? 'green' : 'gold'} />

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <p className="text-sm font-medium text-cream/70">
                  {greeting()}, <span className="font-semibold text-cream">{user.name}</span>
                </p>
                <h2 className="mt-1 font-display text-2xl leading-snug text-cream sm:text-3xl">
                  {totals.totalSessions === 0
                    ? 'Your attendance journey starts here'
                    : onTrack
                      ? 'You are on track — keep it up!'
                      : 'You are below the safe line'}
                </h2>

                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1.5 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-gold" aria-hidden />
                    {totals.attendedSessions}/{totals.totalSessions} sessions
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-3 py-1.5 text-xs font-semibold">
                    <Users className="h-3.5 w-3.5 text-gold" aria-hidden />
                    {totals.classes} {totals.classes === 1 ? 'class' : 'classes'}
                  </span>
                  {onGoAnalysis ? (
                    <button
                      type="button"
                      onClick={onGoAnalysis}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gold px-3.5 text-xs font-bold text-ink shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
                    >
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                      See my analysis
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}

      {/* ===== Live sessions ===== */}
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-2xl text-heading">
          <Radio className="h-5 w-5 text-ink" aria-hidden />
          Live sessions
          {liveCount > 0 ? (
            <Badge className="badge-glow border-none bg-gold text-ink hover:bg-gold">
              {liveCount} to check in
            </Badge>
          ) : null}
        </h2>

        {sessions === null ? (
          <Skeleton className="h-36 rounded-xl" />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="No active session right now"
            hint="When your teacher starts one, it appears here — check in fast."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sessions.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="card-3d border-gradient-amber">
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-heading">{s.className}</h3>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-label">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          {s.teacherName ?? 'Teacher'}
                        </p>
                      </div>
                      <SessionTimer endsAt={s.endsAt} />
                    </div>

                    {checkedMap[s.id] ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-green/10 px-3 py-2.5">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-green">
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          Attendance recorded
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {!s.requireGps ? (
                          <p className="flex items-center gap-1.5 text-xs font-medium text-green">
                            <Globe className="h-3.5 w-3.5" aria-hidden />
                            Remote check-in OK — works from anywhere
                          </p>
                        ) : null}
                        <Button
                          onClick={() => {
                            setOpenScannerNow(false)
                            setCheckinSession(s)
                          }}
                          className="btn-3d btn-ink h-11 w-full text-base font-bold"
                        >
                          {s.requireCode === false ? (
                            'Check in now'
                          ) : (
                            <>
                              <ScanLine className="h-5 w-5" aria-hidden />
                              Check in — scan QR
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Today's classes ===== */}
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-2xl text-heading">
          <CalendarDays className="h-5 w-5 text-ink" aria-hidden />
          Today&rsquo;s classes
        </h2>

        {today === null ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : today.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-cream-soft/70 px-4 py-3 text-sm text-label">
            No scheduled classes today.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {today.map((s, i) => {
              const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
              const isNow = nowMin >= s.startMin && nowMin < s.endMin
              return (
                <motion.li
                  key={`${s.classId}-${s.startMin}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.2) }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-cream-soft/60 px-3 py-2.5"
                >
                  <span className="font-mono text-sm font-bold tabular-nums text-ink">
                    {timeRange(s.startMin, s.endMin)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenClass(s.classId)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-heading hover:underline"
                    aria-label={`Open ${s.className}`}
                  >
                    {s.className}
                  </button>
                  <span className="truncate text-xs text-label">{s.room ? `Room ${s.room}` : ''}</span>
                  {isNow ? (
                    <Badge className="badge-glow border-none bg-gold text-ink hover:bg-gold">Now</Badge>
                  ) : null}
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Streak strip */}
      {totals && totals.attendedSessions > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-cream-soft/60 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-body">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/25">
              <Flame className="h-4.5 w-4.5 text-gold-deep" aria-hidden />
            </span>
            Attend every session to grow your streak — analysis tracks it for you.
          </span>
        </div>
      ) : null}

      {/* Check-in dialog */}
      <CheckinDialog
        user={user}
        session={checkinSession}
        open={!!checkinSession}
        openScannerNow={openScannerNow}
        onOpenChange={(open) => {
          if (!open) {
            setCheckinSession(null)
            setOpenScannerNow(false)
          }
        }}
        onChecked={() => {
          load()
          loadSlow() // the hero % and counts changed after this check-in
        }}
      />
    </section>
  )
}
