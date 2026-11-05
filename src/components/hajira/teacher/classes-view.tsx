'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { BookOpen, Loader2, Plus, Radio, Search, Users } from 'lucide-react'

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
import { Skeleton } from '@/components/ui/skeleton'
import { api, type TeacherClassInfo, type TeacherTotals } from '@/lib/hajira-client'
import { CodeChip, EmptyState, PulsingDot, useHajiraToasts } from '@/components/hajira/shared'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border/60 bg-card px-2 py-3 text-center shadow-sm">
      <span className="font-display text-2xl font-bold tabular-nums text-heading">{value}</span>
      <span className="text-[11px] font-medium leading-tight text-label">{label}</span>
    </div>
  )
}

export default function TeacherClassesView({
  onOpenClass,
  onOpenReport,
  reloadKey,
}: {
  onOpenClass: (classId: string) => void
  onOpenReport: (classId: string) => void
  reloadKey: number
}) {
  const { ok, err } = useHajiraToasts()
  const [classes, setClasses] = React.useState<TeacherClassInfo[] | null>(null)
  const [totals, setTotals] = React.useState<TeacherTotals | undefined>(undefined)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const loadedOnce = React.useRef(false)

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ classes: TeacherClassInfo[]; totals?: TeacherTotals }>('/api/me')
      setClasses(data.classes ?? [])
      setTotals(data.totals)
    } catch (e) {
      setClasses((prev) => prev ?? [])
      if (!loadedOnce.current) {
        err('Could not load classes', e instanceof Error ? e.message : undefined)
      }
    } finally {
      loadedOnce.current = true
    }
  }, [err])

  React.useEffect(() => {
    load()
  }, [load, reloadKey])

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) {
      err('Enter a class name')
      return
    }
    setCreating(true)
    try {
      const res = await api<{ cls: { id: string; name: string; code: string } }>('/api/classes', {
        method: 'POST',
        body: { name },
      })
      ok(`Class created: ${res.cls.name}`, `Share this code with students: ${res.cls.code}`)
      setNewName('')
      setDialogOpen(false)
      await load()
    } catch (e) {
      err('Could not create the class', e instanceof Error ? e.message : undefined)
    } finally {
      setCreating(false)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = (classes ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  )

  return (
    <section aria-label="My classes" className="flex flex-col gap-5">
      {/* Semester at a glance */}
      <div className="grid grid-cols-4 gap-2.5 sm:max-w-xl">
        {totals === undefined ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="Classes" value={totals.classes} />
            <StatCard label="Students" value={totals.students} />
            <StatCard label="Sessions" value={totals.sessions} />
            <StatCard
              label="Avg attendance"
              value={`${totals.avgPct}%`}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-heading">My Classes</h2>
          <p className="text-sm text-label">Open a class to start an attendance session</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="btn-3d btn-ink font-semibold">
          <Plus className="h-4 w-4" aria-hidden />
          New class
        </Button>
      </div>

      {classes !== null && classes.length > 3 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by class name or code…"
            aria-label="Search classes"
            className="h-11 bg-card pl-9"
          />
        </div>
      ) : null}

      {classes === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No classes yet. Create your first class."
          hint="Creating a class generates a unique join code — students use it to enroll themselves."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title={`No class matches “${search}”`}
          hint="Try a different name or code."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.3) }}
            >
              <Card className="card-3d card-inner-glow flex h-full flex-col">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 font-semibold text-heading" title={c.name}>
                      {c.name}
                    </h3>
                    {c.activeSessionId ? (
                      <Badge className="shrink-0 gap-1.5 border-none bg-green/10 text-green hover:bg-green/10">
                        <PulsingDot color="green" />
                        Live
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <CodeChip code={c.code} />
                    <span className="inline-flex items-center gap-1 text-sm text-body">
                      <Users className="h-4 w-4 text-label" aria-hidden />
                      {c.studentCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-body">
                      <Radio className="h-4 w-4 text-label" aria-hidden />
                      {c.totalSessions}
                    </span>
                    <span
                      className={
                        'ml-auto font-mono text-sm font-bold ' +
                        (c.avgPct >= 70 ? 'text-green' : 'text-amber-600')
                      }
                    >
                      {c.avgPct}%
                    </span>
                  </div>

                  <div className="mt-auto flex gap-2 pt-1">
                    <Button onClick={() => onOpenClass(c.id)} className="btn-3d btn-ink h-10 flex-1">
                      Open class
                    </Button>
                    <Button
                      onClick={() => onOpenReport(c.id)}
                      variant="outline"
                      className="h-10 flex-1 border-border hover:bg-secondary"
                    >
                      Report
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* New class dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="dialog-sheet sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a new class</DialogTitle>
            <DialogDescription>
              A unique join code will be generated — students use it to enroll.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createClass} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-class-name">Class name</Label>
              <Input
                id="new-class-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="CSE 301 — Section A"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-border hover:bg-secondary"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating} className="btn-3d btn-ink font-semibold">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
