'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { BookOpen, Loader2, Plus } from 'lucide-react'

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
  type StudentClassInfo,
  type StudentTotals,
} from '@/lib/hajira-client'
import { EmptyState, useHajiraToasts } from '@/components/hajira/shared'

/**
 * Student "Classes" tab — every enrolled class with live attendance %,
 * plus self-enrollment via the teacher's class code.
 */
export default function StudentClassesView({
  onOpenClass,
  reloadKey,
  onJoined,
}: {
  onOpenClass: (classId: string) => void
  reloadKey: number
  onJoined?: (totals: StudentTotals | undefined) => void
}) {
  const { ok, err } = useHajiraToasts()
  const [classes, setClasses] = React.useState<StudentClassInfo[] | null>(null)
  const [joinOpen, setJoinOpen] = React.useState(false)
  const [joinCode, setJoinCode] = React.useState('')
  const [joining, setJoining] = React.useState(false)
  const loadedOnce = React.useRef(false)

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ classes: StudentClassInfo[]; totals?: StudentTotals }>('/api/me')
      setClasses(data.classes ?? [])
      onJoined?.(data.totals)
    } catch (e) {
      setClasses((prev) => prev ?? [])
      if (!loadedOnce.current) {
        err('Classes did not load', e instanceof Error ? e.message : undefined)
      }
    } finally {
      loadedOnce.current = true
    }
  }, [err, onJoined])

  React.useEffect(() => {
    load()
  }, [load, reloadKey])

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

  return (
    <section aria-label="My classes" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-heading">My Classes</h2>
          <p className="text-sm text-label">Attendance at a glance, class by class</p>
        </div>
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
          hint="Use the class code your teacher shared to enroll — it takes one second."
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
                    <p className="mt-1.5 text-xs text-label">
                      Attended {c.attendedSessions} of {c.totalSessions} sessions
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

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
    </section>
  )
}
