'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, Radio, Users } from 'lucide-react'

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
  EmptyState,
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

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn'
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border/60 bg-card px-2 py-3 text-center shadow-sm">
      <span
        className={
          'font-display text-2xl font-bold tabular-nums ' +
          (tone === 'good' ? 'text-green' : tone === 'warn' ? 'text-amber-600' : 'text-heading')
        }
      >
        {value}
      </span>
      <span className="text-[11px] font-medium leading-tight text-label">{label}</span>
    </div>
  )
}

export default function StudentHomeView({
  user,
  reloadKey,
  onOpenClass,
  onTotals,
}: {
  user: HajiraUser
  reloadKey: number
  onOpenClass: (classId: string) => void
  onTotals?: (totals: StudentTotals | undefined) => void
}) {
  const { err } = useHajiraToasts()
  const [totals, setTotals] = React.useState<StudentTotals | undefined>(undefined)
  const [sessions, setSessions] = React.useState<ActiveSessionInfo[] | null>(null)
  const [today, setToday] = React.useState<TodaySlot[] | null>(null)
  const [checkedMap, setCheckedMap] = React.useState<Record<string, boolean>>({})
  const [checkinSession, setCheckinSession] = React.useState<ActiveSessionInfo | null>(null)
  const loadedOnce = React.useRef(false)

  const load = React.useCallback(async () => {
    // Each feed succeeds or fails INDEPENDENTLY — one flaky response must
    // never blank the whole dashboard (the mobile "data won't load" trap).
    const [meR, activeR, todayR] = await Promise.allSettled([
      api<{ totals?: StudentTotals }>('/api/me'),
      api<{ sessions: ActiveSessionInfo[] }>('/api/sessions/active'),
      api<{ slots: TodaySlot[] }>('/api/timetable/today'),
    ])

    if (meR.status === 'fulfilled') {
      setTotals(meR.value.totals)
      onTotals?.(meR.value.totals)
    } else {
      // toast only on the FIRST failure — never spam every 10s poll
      if (!loadedOnce.current) {
        err('Data did not load', meR.reason instanceof Error ? meR.reason.message : undefined)
      }
    }

    if (activeR.status === 'fulfilled') {
      setSessions(activeR.value.sessions ?? [])
    } else {
      setSessions((prev) => prev ?? [])
    }

    if (todayR.status === 'fulfilled') {
      setToday(todayR.value.slots ?? [])
    } else {
      setToday((prev) => prev ?? [])
    }
    loadedOnce.current = true

    const activeList = activeR.status === 'fulfilled' ? activeR.value.sessions ?? [] : []
    const entries = await Promise.all(
      activeList.map(async (s) => {
        try {
          const d = await api<{ myCheckIn: unknown | null }>(`/api/sessions/${s.id}`)
          return [s.id, !!d.myCheckIn] as const
        } catch {
          return [s.id, false] as const
        }
      })
    )
    setCheckedMap(Object.fromEntries(entries))
  }, [err, onTotals])

  React.useEffect(() => {
    load()
  }, [load, reloadKey])

  /* poll active sessions every 10s */
  React.useEffect(() => {
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [load])

  const liveCount = (sessions ?? []).filter((s) => !checkedMap[s.id]).length

  return (
    <section aria-label="Student home" className="flex flex-col gap-6">
      {/* My attendance at a glance */}
      <div className="grid grid-cols-3 gap-2.5 sm:max-w-md">
        {totals === undefined ? (
          <>
            <Skeleton className="h-[74px] rounded-xl" />
            <Skeleton className="h-[74px] rounded-xl" />
            <Skeleton className="h-[74px] rounded-xl" />
          </>
        ) : (
          <>
            <StatCard
              label="Overall attendance"
              value={`${totals.overallPct}%`}
              tone={totals.overallPct >= 70 ? 'good' : totals.totalSessions > 0 ? 'warn' : 'default'}
            />
            <StatCard
              label="Sessions attended"
              value={`${totals.attendedSessions}/${totals.totalSessions}`}
            />
            <StatCard label="Classes joined" value={String(totals.classes)} />
          </>
        )}
      </div>

      {/* Active sessions */}
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
                      <Button
                        onClick={() => setCheckinSession(s)}
                        className="btn-3d btn-ink h-11 w-full text-base font-bold"
                      >
                        Check in now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Today's classes (Phase 2 — Timetable) */}
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

      {/* Check-in dialog */}
      <CheckinDialog
        user={user}
        session={checkinSession}
        open={!!checkinSession}
        onOpenChange={(open) => {
          if (!open) setCheckinSession(null)
        }}
        onChecked={load}
      />
    </section>
  )
}
