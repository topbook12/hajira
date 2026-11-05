'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { BookOpen, CalendarDays, Loader2, Plus, Radio, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  api,
  getSocket,
  type ActiveSessionInfo,
  type HajiraUser,
  type StudentClassInfo,
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

export default function StudentHomeView({
  user,
  onOpenClass,
  reloadKey,
}: {
  user: HajiraUser
  onOpenClass: (classId: string) => void
  reloadKey: number
}) {
  const { ok, err } = useHajiraToasts()
  const [classes, setClasses] = React.useState<StudentClassInfo[] | null>(null)
  const [sessions, setSessions] = React.useState<ActiveSessionInfo[] | null>(null)
  const [today, setToday] = React.useState<TodaySlot[] | null>(null)
  const [checkedMap, setCheckedMap] = React.useState<Record<string, boolean>>({})
  const [joinOpen, setJoinOpen] = React.useState(false)
  const [joinCode, setJoinCode] = React.useState('')
  const [joining, setJoining] = React.useState(false)
  const [checkinSession, setCheckinSession] = React.useState<ActiveSessionInfo | null>(null)

  const load = React.useCallback(async () => {
    try {
      const [me, active, todayRes] = await Promise.all([
        api<{ classes: StudentClassInfo[] }>('/api/me'),
        api<{ sessions: ActiveSessionInfo[] }>('/api/sessions/active'),
        api<{ slots: TodaySlot[] }>('/api/timetable/today').catch(() => ({ slots: [] as TodaySlot[] })),
      ])
      setClasses(me.classes)
      setSessions(active.sessions)
      setToday(todayRes.slots ?? [])
      const entries = await Promise.all(
        active.sessions.map(async (s) => {
          try {
            const d = await api<{ myCheckIn: unknown | null }>(`/api/sessions/${s.id}`)
            return [s.id, !!d.myCheckIn] as const
          } catch {
            return [s.id, false] as const
          }
        })
      )
      setCheckedMap(Object.fromEntries(entries))
    } catch (e) {
      err('Could not load data', e instanceof Error ? e.message : undefined)
      if (!classes) setClasses([])
      if (!sessions) setSessions([])
      if (!today) setToday([])
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load, reloadKey])

  /* poll active sessions every 10s */
  React.useEffect(() => {
    const iv = setInterval(load, 10_000)
    return () => clearInterval(iv)
  }, [load])

  /* realtime: join class rooms, listen for session start/close */
  const classIdsKey = React.useMemo(
    () => (classes ?? []).map((c) => c.id).sort().join(','),
    [classes]
  )
  React.useEffect(() => {
    if (!classIdsKey) return
    const ids = classIdsKey.split(',').filter(Boolean)
    const sock = getSocket()
    ids.forEach((id) => sock.emit('join-class', { classId: id }))
    const onStarted = () => {
      ok('A new session just started', 'Check in now!')
      load()
    }
    const onClosed = () => {
      load()
    }
    sock.on('session:started', onStarted)
    sock.on('session:closed', onClosed)
    return () => {
      sock.off('session:started', onStarted)
      sock.off('session:closed', onClosed)
      ids.forEach((id) => sock.emit('leave-class', { classId: id }))
    }
  }, [classIdsKey, load, ok])

  const joinClass = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      err('Enter the class code')
      return
    }
    setJoining(true)
    try {
      const res = await api<{ cls: { id: string; name: string; code: string } }>('/api/classes/join', {
        method: 'POST',
        body: { code },
      })
      ok(`Joined class: ${res.cls.name}`)
      getSocket().emit('join-class', { classId: res.cls.id })
      setJoinCode('')
      setJoinOpen(false)
      await load()
    } catch (e) {
      err('Could not join the class', e instanceof Error ? e.message : undefined)
    } finally {
      setJoining(false)
    }
  }

  const liveCount = (sessions ?? []).filter((s) => !checkedMap[s.id]).length

  return (
    <section aria-label="Student home" className="flex flex-col gap-6">
      {/* Active sessions */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl text-heading">
            <Radio className="h-5 w-5 text-ink" aria-hidden />
            Live sessions
            {liveCount > 0 ? (
              <Badge className="badge-glow border-none bg-gold text-ink hover:bg-gold">
                {liveCount} to check in
              </Badge>
            ) : null}
          </h2>
        </div>

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
                        <span className="text-sm font-semibold text-green">
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

      {/* My classes */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-heading">My Classes</h2>
          <Button
            variant="outline"
            onClick={() => setJoinOpen(true)}
            className="border-border font-semibold text-ink hover:bg-secondary"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Join a class
          </Button>
        </div>

        {classes === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
          </div>
        ) : classes.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="You haven't joined any class yet"
            hint="Use the class code your teacher shared to enroll."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {classes.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.3) }}
              >
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenClass(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenClass(c.id)
                    }
                  }}
                  className="card-3d card-inner-glow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open details for ${c.name}`}
                >
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div>
                      <h3 className="font-semibold text-heading">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-label">
                        Teacher: {c.teacherName} • {c.totalSessions} sessions
                      </p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-body">Attendance</span>
                        <span
                          className={
                            c.myPct >= 60
                              ? 'font-mono font-bold text-green'
                              : 'font-mono font-bold text-amber-600'
                          }
                        >
                          {c.myPct}%
                        </span>
                      </div>
                      <Progress
                        value={c.myPct}
                        className={
                          c.myPct >= 60
                            ? 'h-2 [&>div]:bg-green'
                            : 'h-2 [&>div]:bg-gold-deep'
                        }
                        aria-label={`Attendance ${c.myPct}%`}
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Join class dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="dialog-sheet sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join a class</DialogTitle>
            <DialogDescription>Enter the code your teacher shared.</DialogDescription>
          </DialogHeader>
          <form onSubmit={joinClass} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="join-code">Class code</Label>
              <Input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. HJ-X7K2"
                className="font-mono uppercase"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setJoinOpen(false)}
                className="border-border hover:bg-secondary"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={joining} className="btn-3d btn-ink font-semibold">
                {joining ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Join class'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
