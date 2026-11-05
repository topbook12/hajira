'use client'

import * as React from 'react'

import { CalendarDays, Loader2, Plus, Save, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api, type ClassSlot } from '@/lib/hajira-client'
import {
  DAY_NAMES,
  DAY_SHORT,
  EmptyState,
  ScrollList,
  timeToMin,
  timeRange,
  useHajiraToasts,
} from '@/components/hajira/shared'

/**
 * Weekly schedule editor (Phase 2 — Timetable).
 * Local copy + one "Save schedule" PUT (replace-all) — simple, no diff bugs.
 */
export default function TimetableEditor({ classId }: { classId: string }) {
  const { ok, err } = useHajiraToasts()
  const [slots, setSlots] = React.useState<ClassSlot[] | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // add-row form
  const [day, setDay] = React.useState('0')
  const [start, setStart] = React.useState('09:00')
  const [end, setEnd] = React.useState('10:00')
  const [room, setRoom] = React.useState('')

  React.useEffect(() => {
    let alive = true
    api<{ slots: ClassSlot[] }>(`/api/classes/${classId}/timetable`)
      .then((d) => {
        if (alive) setSlots(Array.isArray(d.slots) ? d.slots : [])
      })
      .catch((e) => {
        err('Could not load the timetable', e instanceof Error ? e.message : undefined)
        if (alive) setSlots([])
      })
    return () => {
      alive = false
    }
  }, [classId])

  const addSlot = () => {
    const startMin = timeToMin(start)
    const endMin = timeToMin(end)
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
      err('Pick a valid start and end time')
      return
    }
    if (endMin <= startMin) {
      err('End time must be after the start time')
      return
    }
    const dayNum = Number(day)
    if (slots?.some((s) => s.dayOfWeek === dayNum && s.startMin === startMin)) {
      err('That day already has a class at this start time')
      return
    }
    setSlots((prev) =>
      [...(prev ?? []), { dayOfWeek: dayNum, startMin, endMin, room: room.trim() || null }].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin
      )
    )
    setDirty(true)
  }

  const removeSlot = (idx: number) => {
    setSlots((prev) => (prev ?? []).filter((_, i) => i !== idx))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await api<{ saved: ClassSlot[] }>(`/api/classes/${classId}/timetable`, {
        method: 'PUT',
        body: { slots: slots ?? [] },
      })
      setSlots(res.saved)
      setDirty(false)
      ok('Weekly schedule saved', 'Students see today’s classes on their home screen')
    } catch (e) {
      err('Could not save the schedule', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  // group by day for display
  const grouped = React.useMemo(() => {
    const map = new Map<number, ClassSlot[]>()
    for (const s of slots ?? []) {
      const arr = map.get(s.dayOfWeek) ?? []
      arr.push(s)
      map.set(s.dayOfWeek, arr)
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [slots])

  return (
    <Card className="card-3d">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <CalendarDays className="h-4 w-4 text-label" aria-hidden />
            Weekly schedule
          </h3>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !dirty || slots === null}
            className="btn-3d btn-ink h-8 px-3 font-semibold"
            aria-label="Save weekly schedule"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
            {dirty ? 'Save schedule' : 'Saved'}
          </Button>
        </div>

        {slots === null ? (
          <div className="h-16 animate-pulse rounded-lg bg-secondary/60" aria-label="Loading timetable" />
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No weekly schedule yet"
            hint="Add the class times below — students will see “Today's classes” on their home screen."
          />
        ) : (
          <ScrollList>
            <ul className="flex flex-col gap-2">
              {grouped.map(([d, daySlots]) => (
                <li key={d} className="rounded-lg border border-border/60 bg-cream-soft/60 px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-label">{DAY_NAMES[d]}</p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {daySlots.map((s, i) => (
                      <li key={`${s.dayOfWeek}-${s.startMin}-${i}`} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">
                          {timeRange(s.startMin, s.endMin)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-body">
                          {s.room ? `Room ${s.room}` : '—'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSlot((slots ?? []).indexOf(s))}
                          aria-label={`Remove ${DAY_NAMES[d]} ${timeRange(s.startMin, s.endMin)}`}
                          className="h-7 w-7 text-label hover:bg-rust/10 hover:text-rust"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </ScrollList>
        )}

        {/* add row */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-[110px_1fr_1fr_1fr_auto]">
          <div className="flex flex-col gap-1">
            <Label htmlFor="slot-day" className="text-xs text-label">Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger id="slot-day" className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_SHORT.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="slot-start" className="text-xs text-label">Start</Label>
            <Input id="slot-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="bg-card" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="slot-end" className="text-xs text-label">End</Label>
            <Input id="slot-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-card" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="slot-room" className="text-xs text-label">Room</Label>
            <Input id="slot-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="301" className="bg-card" />
          </div>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <Button onClick={addSlot} className="btn-3d btn-gold w-full font-semibold" aria-label="Add class time">
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
