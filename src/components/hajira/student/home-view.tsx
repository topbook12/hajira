'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { BookOpen, Loader2, Plus, Radio, Users } from 'lucide-react'

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
} from '@/lib/hajira-client'
import {
  bn,
  EmptyState,
  mmss,
  PulsingDot,
  useCountdown,
  useHajiraToasts,
} from '@/components/hajira/shared'
import CheckinDialog from '@/components/hajira/student/checkin-dialog'

/** Per-session ticking timer */
function SessionTimer({ endsAt }: { endsAt: string }) {
  const { remainingSec } = useCountdown(endsAt)
  if (remainingSec <= 0) {
    return (
      <Badge variant="secondary" className="bg-neutral-100 text-neutral-500 hover:bg-neutral-100">
        সময় শেষ
      </Badge>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-emerald-700">
      <PulsingDot color="emerald" />
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
  const [checkedMap, setCheckedMap] = React.useState<Record<string, boolean>>({})
  const [joinOpen, setJoinOpen] = React.useState(false)
  const [joinCode, setJoinCode] = React.useState('')
  const [joining, setJoining] = React.useState(false)
  const [checkinSession, setCheckinSession] = React.useState<ActiveSessionInfo | null>(null)

  const load = React.useCallback(async () => {
    try {
      const [me, active] = await Promise.all([
        api<{ classes: StudentClassInfo[] }>('/api/me'),
        api<{ sessions: ActiveSessionInfo[] }>('/api/sessions/active'),
      ])
      setClasses(me.classes)
      setSessions(active.sessions)
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
      err('ডেটা লোড করা যায়নি', e instanceof Error ? e.message : undefined)
      if (!classes) setClasses([])
      if (!sessions) setSessions([])
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
      ok('নতুন সেশন চালু হয়েছে', 'এখনই উপস্থিতি দিন!')
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
      err('ক্লাস কোড লিখুন')
      return
    }
    setJoining(true)
    try {
      const res = await api<{ cls: { id: string; name: string; code: string } }>('/api/classes/join', {
        method: 'POST',
        body: { code },
      })
      ok(`ক্লাসে যুক্ত হয়েছে: ${res.cls.name}`)
      getSocket().emit('join-class', { classId: res.cls.id })
      setJoinCode('')
      setJoinOpen(false)
      await load()
    } catch (e) {
      err('ক্লাসে যুক্ত হওয়া যায়নি', e instanceof Error ? e.message : undefined)
    } finally {
      setJoining(false)
    }
  }

  const liveCount = (sessions ?? []).filter((s) => !checkedMap[s.id]).length

  return (
    <section aria-label="শিক্ষার্থী হোম" className="flex flex-col gap-6">
      {/* Active sessions */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
            <Radio className="h-5 w-5 text-emerald-600" aria-hidden />
            চলমান সেশন
            {liveCount > 0 ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                {bn(liveCount)} টি বাকি
              </Badge>
            ) : null}
          </h2>
        </div>

        {sessions === null ? (
          <Skeleton className="h-36 rounded-xl" />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="এখন কোনো সক্রিয় সেশন নেই।"
            hint="শিক্ষক সেশন চালু করলেই এখানে দেখা যাবে — তখন দ্রুত উপস্থিতি দিন।"
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
                <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
                  <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-neutral-900">{s.className}</h3>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-500">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          {s.teacherName ?? 'শিক্ষক'}
                        </p>
                      </div>
                      <SessionTimer endsAt={s.endsAt} />
                    </div>

                    {checkedMap[s.id] ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-100/80 px-3 py-2.5">
                        <span className="text-sm font-semibold text-emerald-800">
                          উপস্থিতি রেকর্ড হয়েছে ✅
                        </span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setCheckinSession(s)}
                        className="h-11 w-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
                      >
                        উপস্থিতি দিন
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* My classes */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">আমার ক্লাসসমূহ</h2>
          <Button
            variant="outline"
            onClick={() => setJoinOpen(true)}
            className="border-emerald-300 font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Plus className="h-4 w-4" aria-hidden />
            ক্লাসে যুক্ত হোন
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
            title="এখনো কোনো ক্লাসে যুক্ত হননি।"
            hint="শিক্ষকের দেওয়া ক্লাস কোড দিয়ে ক্লাসে যুক্ত হোন।"
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
                  className="cursor-pointer border-neutral-200 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  aria-label={`${c.name} ক্লাসের বিস্তারিত দেখুন`}
                >
                  <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
                    <div>
                      <h3 className="font-semibold text-neutral-900">{c.name}</h3>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        শিক্ষক: {c.teacherName} • মোট সেশন: {bn(c.totalSessions)}
                      </p>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-neutral-600">উপস্থিতি</span>
                        <span
                          className={
                            c.myPct >= 60
                              ? 'font-mono font-bold text-emerald-700'
                              : 'font-mono font-bold text-amber-600'
                          }
                        >
                          {bn(c.myPct)}%
                        </span>
                      </div>
                      <Progress
                        value={c.myPct}
                        className="h-2 [&>div]:bg-emerald-600"
                        aria-label={`উপস্থিতি ${c.myPct}%`}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ক্লাসে যুক্ত হোন</DialogTitle>
            <DialogDescription>শিক্ষকের দেওয়া ক্লাস কোড লিখুন।</DialogDescription>
          </DialogHeader>
          <form onSubmit={joinClass} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="join-code">ক্লাস কোড</Label>
              <Input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="যেমন: HJ-X7K2"
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
                className="border-neutral-300"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                disabled={joining}
                className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'যুক্ত হোন'}
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
