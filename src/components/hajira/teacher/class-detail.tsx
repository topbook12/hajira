'use client'

import * as React from 'react'

import {
  ArrowLeft,
  CalendarClock,
  Download,
  KeyRound,
  Loader2,
  Play,
  Radio,
  ScanLine,
  UserPlus,
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api, getSocket, getPosition, type TeacherClassDetailData } from '@/lib/hajira-client'
import TimetableEditor from '@/components/hajira/teacher/timetable-editor'
import {
  fmtDateTime,
  CodeChip,
  EmptyState,
  ScrollList,
  SessionStatusBadge,
  useHajiraToasts,
} from '@/components/hajira/shared'

export default function TeacherClassDetail({
  classId,
  onBack,
  onLive,
}: {
  classId: string
  onBack: () => void
  onLive: (sessionId: string) => void
}) {
  const { ok, err } = useHajiraToasts()
  const [data, setData] = React.useState<TeacherClassDetailData | null>(null)
  const [loading, setLoading] = React.useState(true)

  // start-session form
  const [durationSec, setDurationSec] = React.useState('120')
  const [radius, setRadius] = React.useState(100)
  const [requireGps, setRequireGps] = React.useState(true)
  const [requireCode, setRequireCode] = React.useState(true)
  const [starting, setStarting] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)

  // add-students dialog
  const [studentsOpen, setStudentsOpen] = React.useState(false)
  const [studentsText, setStudentsText] = React.useState('')
  const [adding, setAdding] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<TeacherClassDetailData>(`/api/classes/${classId}`)
      setData(d)
    } catch (e) {
      err('Could not load the class', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [classId])

  React.useEffect(() => {
    load()
  }, [load])

  const startSession = async () => {
    setStarting(true)
    try {
      const pos = await getPosition()
      const res = await api<{
        session: { id: string; classId: string }
        warning?: string
      }>('/api/sessions', {
        method: 'POST',
        body: {
          classId,
          durationSec: Number(durationSec),
          radiusM: radius,
          requireGps,
          requireCode,
          lat: pos?.lat,
          lng: pos?.lng,
        },
      })
      if (res.warning) ok('Warning', res.warning)
      getSocket().emit('session:started', { classId, session: res.session })
      ok('Session is live!', 'Students can now check in')
      onLive(res.session.id)
    } catch (e) {
      err('Could not start the session', e instanceof Error ? e.message : undefined)
    } finally {
      setStarting(false)
    }
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/classes/${classId}/export`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Hajira_${data?.cls.name.replace(/\s+/g, '-') ?? 'class'}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      ok('Excel downloaded', 'Summary, sessions and full check-in log inside')
    } catch (e) {
      err('Could not export Excel', e instanceof Error ? e.message : undefined)
    } finally {
      setExporting(false)
    }
  }

  const addStudents = async (e: React.FormEvent) => {
    e.preventDefault()
    const students = studentsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,;\t]/).map((p) => p.trim())
        return { name: parts[0] ?? '', phone: (parts[1] ?? '').replace(/\D/g, '') }
      })
      .filter((s) => s.name && s.phone)

    if (students.length === 0) {
      err('Add at least one row', 'Format: name,phone — e.g. Rahim Uddin,01712345678')
      return
    }

    setAdding(true)
    try {
      const res = await api<{ added: number; skipped: number }>(
        `/api/classes/${classId}/students`,
        { method: 'POST', body: { students } }
      )
      ok(
        `${res.added} added${res.skipped ? `, ${res.skipped} skipped` : ''}`,
        res.skipped ? 'Rows that were duplicates or malformed were skipped' : undefined
      )
      setStudentsText('')
      setStudentsOpen(false)
      await load()
    } catch (e) {
      err('Could not add students', e instanceof Error ? e.message : undefined)
    } finally {
      setAdding(false)
    }
  }

  /** Teacher-side recovery: clear a student's password + device binding. */
  const resetStudentPassword = async (student: { id: string; name: string }) => {
    const confirmed = window.confirm(
      `Reset password for ${student.name}?\n\nThey will sign in next with their phone number + a NEW password. Their current password and device binding stop working.`
    )
    if (!confirmed) return
    try {
      const res = await api<{ message: string }>(
        `/api/classes/${classId}/students/${student.id}/reset`,
        { method: 'POST' }
      )
      ok('Password reset', res.message)
    } catch (e) {
      err('Could not reset password', e instanceof Error ? e.message : undefined)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon={Radio}
        title="This class is unavailable"
        hint="Refresh the page and try again."
      />
    )
  }

  return (
    <section aria-label={data.cls.name} className="flex flex-col gap-5">
      <Button
        variant="ghost"
        onClick={onBack}
        className="-ml-2 w-fit gap-2 text-label hover:text-heading"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All classes
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-heading">{data.cls.name}</h2>
          <p className="mt-0.5 text-sm text-label">
            Teacher: {data.cls.teacherName} • {data.roster.length} students
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CodeChip code={data.cls.code} />
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={exporting}
            className="border-border font-semibold text-ink hover:bg-secondary"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Excel
          </Button>
        </div>
      </div>

      {/* Start session */}
      <Card className="card-3d border-gradient-amber">
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-heading">
              <Play className="h-4 w-4" aria-hidden />
              Start attendance
            </h3>
            <p className="mt-0.5 text-sm text-label">
              Set the time window and verification rules, then go live.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration-select">Time limit</Label>
              <Select value={durationSec} onValueChange={setDurationSec}>
                <SelectTrigger id="duration-select" className="w-full bg-card">
                  <SelectValue placeholder="Pick a duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60 seconds</SelectItem>
                  <SelectItem value="120">120 seconds</SelectItem>
                  <SelectItem value="180">180 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="radius-slider">GPS radius: {radius} m</Label>
              <Slider
                id="radius-slider"
                value={[radius]}
                onValueChange={(v) => setRadius(v[0] ?? radius)}
                min={30}
                max={300}
                step={10}
                className="mt-2 [&_[data-slot=slider-range]]:bg-gold-deep [&_[data-slot=slider-thumb]]:border-gold-deep"
                aria-label="GPS radius (meters)"
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Switch
                  id="gps-switch"
                  checked={requireGps}
                  onCheckedChange={setRequireGps}
                  className="data-[state=checked]:bg-ink"
                />
                <Label htmlFor="gps-switch" className="cursor-pointer font-normal">
                  Verify GPS location
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="code-switch"
                  checked={requireCode}
                  onCheckedChange={setRequireCode}
                  className="data-[state=checked]:bg-ink"
                />
                <Label htmlFor="code-switch" className="cursor-pointer font-normal">
                  Require QR / PIN
                </Label>
              </div>
            </div>
          </div>

          <p className="flex items-start gap-1.5 text-xs text-label">
            <ScanLine className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            The QR code and 6-digit PIN refresh every 30 seconds while the session is live —
            screenshots sent to absent friends stop working within half a minute.
          </p>

          <Button
            onClick={startSession}
            disabled={starting}
            className="btn-3d btn-gold w-full font-semibold sm:w-fit sm:self-start"
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Getting location…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden />
                Start session
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Weekly schedule (Phase 2 — Timetable) */}
      <TimetableEditor classId={classId} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Roster */}
        <Card className="card-3d">
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-heading">
                <Users className="h-4 w-4 text-label" aria-hidden />
                Students ({data.roster.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStudentsOpen(true)}
                className="border-border text-ink hover:bg-secondary"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                Add students
              </Button>
            </div>

            {data.roster.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students yet"
                hint="Paste a CSV list to add them, or share the class code so students can join themselves."
              />
            ) : (
              <ScrollList>
                <ul className="flex flex-col gap-2">
                  {data.roster.map((s) => {
                    const pct = s.pct
                    const atRisk = typeof pct === 'number' && pct < (data.cls.threshold ?? 70)
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-cream-soft/60 px-3 py-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/25 text-sm font-bold text-ink">
                          {s.name.trim().charAt(0) || '?'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-heading">{s.name}</span>
                          <span className="block font-mono text-xs text-label">{s.phone}</span>
                        </span>
                        <span className="flex w-20 shrink-0 flex-col items-end gap-1">
                          {typeof pct === 'number' ? (
                            <>
                              <span
                                className={
                                  'font-mono text-xs font-bold ' +
                                  (atRisk ? 'text-amber-600' : 'text-green')
                                }
                              >
                                {pct}%
                              </span>
                              <span className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                                <span
                                  className={
                                    'block h-full rounded-full ' + (atRisk ? 'bg-gold-deep' : 'bg-green')
                                  }
                                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                />
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-label">No sessions</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => resetStudentPassword({ id: s.id, name: s.name })}
                          aria-label={`Reset password for ${s.name}`}
                          title="Reset password (student signs in next with a new password)"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label hover:bg-rust/10 hover:text-rust"
                        >
                          <KeyRound className="h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </ScrollList>
            )}

            <p className="rounded-lg bg-gold/15 px-3 py-2 text-xs text-ink">
              Students can also join with code: <span className="font-mono font-bold">{data.cls.code}</span>
            </p>
          </CardContent>
        </Card>

        {/* Recent sessions */}
        <Card className="card-3d">
          <CardContent className="flex flex-col gap-3 p-6">
            <h3 className="flex items-center gap-2 font-semibold text-heading">
              <CalendarClock className="h-4 w-4 text-label" aria-hidden />
              Recent sessions
            </h3>

            {data.sessions.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No sessions yet"
                hint="Start your first session from the card above."
              />
            ) : (
              <ScrollList>
                <ul className="flex flex-col gap-2">
                  {data.sessions.map((s) => {
                    const isActive = s.status === 'ACTIVE' && new Date(s.endsAt).getTime() > Date.now()
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-cream-soft/60 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-heading">{fmtDateTime(s.startedAt)}</p>
                          <p className="text-xs text-label">{s.presentCount} present</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SessionStatusBadge status={s.status} endsAt={s.endsAt} />
                          {isActive ? (
                            <Button
                              size="sm"
                              onClick={() => onLive(s.id)}
                              className="btn-3d btn-gold h-8 px-3"
                            >
                              <Radio className="h-3.5 w-3.5" aria-hidden />
                              View live
                            </Button>
                          ) : (
                            <Badge variant="outline" className="border-border font-normal text-label">
                              {s.presentCount}/{data.roster.length}
                            </Badge>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </ScrollList>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add students dialog */}
      <Dialog open={studentsOpen} onOpenChange={setStudentsOpen}>
        <DialogContent className="dialog-sheet sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add students</DialogTitle>
            <DialogDescription>
              One per line — format: <span className="font-mono">name,phone</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addStudents} className="flex flex-col gap-4">
            <Textarea
              value={studentsText}
              onChange={(e) => setStudentsText(e.target.value)}
              placeholder={'Rahim Uddin,01712345678\nKarim Hossain,01812345678'}
              rows={6}
              className="font-mono text-sm"
              aria-label="Student list (name,phone)"
            />
            <p className="text-xs text-label">
              Students can also join themselves with the class code:{' '}
              <span className="font-mono font-bold text-ink">{data.cls.code}</span>
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStudentsOpen(false)}
                className="border-border hover:bg-secondary"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding} className="btn-3d btn-ink font-semibold">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
