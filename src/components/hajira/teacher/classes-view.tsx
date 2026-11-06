'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import {
  BookOpen,
  CheckCircle2,
  Download,
  Files,
  Loader2,
  Plus,
  Radio,
  Search,
  Users,
} from 'lucide-react'

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
  downloadBlob,
  type TeacherClassInfo,
  type TeacherTotals,
} from '@/lib/hajira-client'
import { CodeChip, EmptyState, PulsingDot, useHajiraToasts } from '@/components/hajira/shared'
import FingerprintCard from '@/components/hajira/fingerprint-card'

/** One dark-hero stat cell (icon + value + label, cream on peppercorn) */
function HeroStat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-cream/[0.06] px-1 py-3 text-center">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/20">
        <Icon className="h-4 w-4 text-gold" aria-hidden />
      </span>
      <span className="font-display text-xl font-bold tabular-nums text-cream sm:text-2xl">
        {value}
      </span>
      <span className="text-[10px] font-medium leading-tight text-cream/60 sm:text-[11px]">
        {label}
      </span>
    </div>
  )
}

export default function TeacherClassesView({
  userName,
  onOpenClass,
  onOpenReport,
  onOpenLive,
  reloadKey,
}: {
  userName?: string
  onOpenClass: (classId: string) => void
  onOpenReport: (classId: string) => void
  /** jump straight into a running attendance session */
  onOpenLive?: (sessionId: string) => void
  reloadKey: number
}) {
  const { ok, err } = useHajiraToasts()
  const [classes, setClasses] = React.useState<TeacherClassInfo[] | null>(null)
  const [totals, setTotals] = React.useState<TeacherTotals | undefined>(undefined)
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [exportingAll, setExportingAll] = React.useState(false)
  const [sheetBusyId, setSheetBusyId] = React.useState<string | null>(null)
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

  /** One class → Excel workbook (Info, Present Sheet grid, Summary, Sessions, Log) */
  const downloadSheet = async (c: TeacherClassInfo) => {
    setSheetBusyId(c.id)
    try {
      const res = await fetch(`/api/classes/${c.id}/export`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      downloadBlob(blob, `Hajira_${c.name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'class'}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      ok('Present sheet downloaded', `${c.name} — full attendance workbook inside`)
    } catch (e) {
      err('Could not export the sheet', e instanceof Error ? e.message : undefined)
    } finally {
      setSheetBusyId(null)
    }
  }

  /** Every class → one workbook with an Overview sheet + a sheet per class */
  const downloadAll = async () => {
    setExportingAll(true)
    try {
      const res = await fetch('/api/classes/export-all')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      downloadBlob(blob, `Hajira_All_Classes_${new Date().toISOString().slice(0, 10)}.xlsx`)
      ok('All classes exported', 'One present sheet per class + overview')
    } catch (e) {
      err('Could not export all classes', e instanceof Error ? e.message : undefined)
    } finally {
      setExportingAll(false)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = (classes ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  )
  const liveClass = (classes ?? []).find((c) => c.activeSessionId) ?? null

  return (
    <section aria-label="My classes" className="flex flex-col gap-5">
      {/* ===== Dashboard hero — semester at a glance ===== */}
      {totals === undefined ? (
        <Skeleton className="h-[188px] rounded-2xl" />
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="corner-glow relative overflow-hidden rounded-2xl bg-ink p-5 text-cream shadow-lg shadow-ink/25 sm:p-6">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-cream/70">
                Welcome back{userName ? (
                  <>
                    , <span className="font-semibold text-cream">{userName}</span>
                  </>
                ) : null}
              </p>
              <h2 className="font-display text-2xl leading-snug text-cream sm:text-3xl">
                Your semester, at a glance
              </h2>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
              <HeroStat label="Classes" value={totals.classes} icon={BookOpen} />
              <HeroStat label="Students" value={totals.students} icon={Users} />
              <HeroStat label="Sessions" value={totals.sessions} icon={Radio} />
              <HeroStat label="Avg attendance" value={`${totals.avgPct}%`} icon={CheckCircle2} />
            </div>
          </div>
        </motion.div>
      )}

      {/* ===== Live now spotlight ===== */}
      {liveClass?.activeSessionId ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green/30 bg-green/10 px-4 py-3.5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <PulsingDot color="green" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-green">Attendance is live — {liveClass.name}</p>
              <p className="text-xs text-label">Students are checking in right now</p>
            </div>
          </div>
          {onOpenLive ? (
            <Button
              size="sm"
              onClick={() => onOpenLive(liveClass.activeSessionId!)}
              className="btn-3d btn-gold h-9 shrink-0 px-4 font-semibold"
            >
              <Radio className="h-4 w-4" aria-hidden />
              Join live
            </Button>
          ) : null}
        </motion.div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-heading">My Classes</h2>
          <p className="text-sm text-label">Open a class to start an attendance session</p>
        </div>
        <div className="flex items-center gap-2">
          {classes && classes.length > 0 ? (
            <Button
              variant="outline"
              onClick={downloadAll}
              disabled={exportingAll}
              className="border-border font-semibold text-ink hover:bg-secondary"
            >
              {exportingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Files className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">Download all sheets</span>
              <span className="sm:hidden">All sheets</span>
            </Button>
          ) : null}
          <Button onClick={() => setDialogOpen(true)} className="btn-3d btn-ink font-semibold">
            <Plus className="h-4 w-4" aria-hidden />
            New class
          </Button>
        </div>
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
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-label">Class average</span>
                      <span
                        className={
                          'font-mono text-sm font-bold ' +
                          (c.avgPct >= 70 ? 'text-green' : 'text-gold-deep')
                        }
                      >
                        {c.avgPct}%
                      </span>
                    </div>
                    <Progress
                      value={c.avgPct}
                      className={c.avgPct >= 70 ? 'h-2 [&>div]:bg-green' : 'h-2 [&>div]:bg-gold-deep'}
                      aria-label={`Average attendance ${c.avgPct}%`}
                    />
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
                    <Button
                      onClick={() => downloadSheet(c)}
                      disabled={sheetBusyId === c.id}
                      variant="outline"
                      size="icon"
                      aria-label={`Download present sheet for ${c.name}`}
                      title="Download present sheet (Excel)"
                      className="h-10 w-10 shrink-0 border-border text-ink hover:bg-secondary"
                    >
                      {sheetBusyId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Fingerprint sign-in — teachers register a passkey once, then skip the password */}
      <FingerprintCard role="TEACHER" />

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
