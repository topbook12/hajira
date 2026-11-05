'use client'

import * as React from 'react'

import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Play,
  Radio,
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
import {
  bn,
  bnDateTime,
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
  const [starting, setStarting] = React.useState(false)

  // add-students dialog
  const [studentsOpen, setStudentsOpen] = React.useState(false)
  const [studentsText, setStudentsText] = React.useState('')
  const [adding, setAdding] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const d = await api<TeacherClassDetailData>(`/api/classes/${classId}`)
      setData(d)
    } catch (e) {
      err('ক্লাস লোড করা যায়নি', e instanceof Error ? e.message : undefined)
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
          lat: pos?.lat,
          lng: pos?.lng,
        },
      })
      if (res.warning) ok('সতর্কতা', res.warning)
      getSocket().emit('session:started', { classId, session: res.session })
      ok('সেশন চালু হয়েছে!', 'শিক্ষার্থীরা এখন উপস্থিতি দিতে পারবে')
      onLive(res.session.id)
    } catch (e) {
      err('সেশন শুরু করা যায়নি', e instanceof Error ? e.message : undefined)
    } finally {
      setStarting(false)
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
      err('অন্তত একটি সারি দিন', 'ফরম্যাট: নাম,ফোন — যেমন: রাহিম উদ্দিন,01712345678')
      return
    }

    setAdding(true)
    try {
      const res = await api<{ added: number; skipped: number }>(
        `/api/classes/${classId}/students`,
        { method: 'POST', body: { students } }
      )
      ok(
        `${bn(res.added)} জন যোগ হয়েছে${res.skipped ? `, ${bn(res.skipped)} জন বাদ` : ''}`,
        res.skipped ? 'আগেই যুক্ত বা ভুল ফরম্যাটের সারিগুলো বাদ দেওয়া হয়েছে' : undefined
      )
      setStudentsText('')
      setStudentsOpen(false)
      await load()
    } catch (e) {
      err('স্টুডেন্ট যোগ করা যায়নি', e instanceof Error ? e.message : undefined)
    } finally {
      setAdding(false)
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
        title="ক্লাসটি দেখা যাচ্ছে না"
        hint="পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।"
      />
    )
  }

  return (
    <section aria-label={data.cls.name} className="flex flex-col gap-5">
      <Button
        variant="ghost"
        onClick={onBack}
        className="w-fit -ml-2 gap-2 text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        ক্লাসসমূহ
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">{data.cls.name}</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            শিক্ষক: {data.cls.teacherName} • {bn(data.roster.length)} জন শিক্ষার্থী
          </p>
        </div>
        <CodeChip code={data.cls.code} />
      </div>

      {/* Start session */}
      <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm">
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-emerald-900">
              <Play className="h-4 w-4" aria-hidden />
              সেশন শুরু করুন
            </h3>
            <p className="mt-0.5 text-sm text-emerald-800/70">
              উপস্থিতির টাইম-উইন্ডো ও যাচাই নিয়ম ঠিক করে সেশন চালু করুন।
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration-select">সময়সীমা</Label>
              <Select value={durationSec} onValueChange={setDurationSec}>
                <SelectTrigger id="duration-select" className="w-full bg-white">
                  <SelectValue placeholder="সময় নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">৬০ সেকেন্ড</SelectItem>
                  <SelectItem value="120">১২০ সেকেন্ড</SelectItem>
                  <SelectItem value="180">১৮০ সেকেন্ড</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="radius-slider">রেডিয়াস: {bn(radius)} মিটার</Label>
              <Slider
                id="radius-slider"
                value={[radius]}
                onValueChange={(v) => setRadius(v[0] ?? radius)}
                min={30}
                max={300}
                step={10}
                className="mt-2 [&_[data-slot=slider-range]]:bg-emerald-600 [&_[data-slot=slider-thumb]]:border-emerald-600"
                aria-label="GPS রেডিয়াস (মিটার)"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="gps-switch"
                checked={requireGps}
                onCheckedChange={setRequireGps}
                className="data-[state=checked]:bg-emerald-600"
              />
              <Label htmlFor="gps-switch" className="cursor-pointer font-normal">
                GPS যাচাই করুন
              </Label>
            </div>
          </div>

          <Button
            onClick={startSession}
            disabled={starting}
            className="w-full bg-emerald-600 font-semibold text-white hover:bg-emerald-700 sm:w-fit sm:self-start"
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                লোকেশন নেওয়া হচ্ছে…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden />
                সেশন শুরু
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Roster */}
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-neutral-900">
                <Users className="h-4 w-4 text-neutral-500" aria-hidden />
                শিক্ষার্থী তালিকা ({bn(data.roster.length)})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStudentsOpen(true)}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <UserPlus className="h-4 w-4" aria-hidden />
                স্টুডেন্ট যোগ করুন
              </Button>
            </div>

            {data.roster.length === 0 ? (
              <EmptyState
                icon={Users}
                title="এখনো কোনো শিক্ষার্থী নেই"
                hint="CSV আকারে পেস্ট করে যোগ করুন, অথবা শিক্ষার্থীরা ক্লাস কোড দিয়ে নিজেরাই যুক্ত হবে।"
              />
            ) : (
              <ScrollList>
                <ul className="flex flex-col gap-2">
                  {data.roster.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                        {s.name.trim().charAt(0) || '?'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-900">{s.name}</span>
                        <span className="block font-mono text-xs text-neutral-500">{s.phone}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollList>
            )}

            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              স্টুডেন্টরা ক্লাস কোড দিয়েও যুক্ত হতে পারবে: <span className="font-mono font-bold">{data.cls.code}</span>
            </p>
          </CardContent>
        </Card>

        {/* Recent sessions */}
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-6">
            <h3 className="flex items-center gap-2 font-semibold text-neutral-900">
              <CalendarClock className="h-4 w-4 text-neutral-500" aria-hidden />
              সাম্প্রতিক সেশনসমূহ
            </h3>

            {data.sessions.length === 0 ? (
              <EmptyState icon={CalendarClock} title="এখনো কোনো সেশন হয়নি" hint="উপরের কার্ড থেকে প্রথম সেশন শুরু করুন।" />
            ) : (
              <ScrollList>
                <ul className="flex flex-col gap-2">
                  {data.sessions.map((s) => {
                    const isActive = s.status === 'ACTIVE' && new Date(s.endsAt).getTime() > Date.now()
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-900">{bnDateTime(s.startedAt)}</p>
                          <p className="text-xs text-neutral-500">
                            {bn(s.presentCount)} জন উপস্থিত
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SessionStatusBadge status={s.status} endsAt={s.endsAt} />
                          {isActive ? (
                            <Button
                              size="sm"
                              onClick={() => onLive(s.id)}
                              className="h-8 bg-emerald-600 px-3 text-white hover:bg-emerald-700"
                            >
                              <Radio className="h-3.5 w-3.5" aria-hidden />
                              লাইভ দেখুন
                            </Button>
                          ) : (
                            <Badge variant="outline" className="border-neutral-200 font-normal text-neutral-400">
                              {bn(s.presentCount)}/{bn(data.roster.length)}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>স্টুডেন্ট যোগ করুন</DialogTitle>
            <DialogDescription>
              প্রতি লাইনে একজন — ফরম্যাট: <span className="font-mono">নাম,ফোন</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addStudents} className="flex flex-col gap-4">
            <Textarea
              value={studentsText}
              onChange={(e) => setStudentsText(e.target.value)}
              placeholder={'রাহিম উদ্দিন,01712345678\nকরিম হোসেন,01812345678'}
              rows={6}
              className="font-mono text-sm"
              aria-label="স্টুডেন্ট তালিকা (নাম,ফোন)"
            />
            <p className="text-xs text-neutral-500">
              স্টুডেন্টরা ক্লাস কোড দিয়েও যুক্ত হতে পারবে:{' '}
              <span className="font-mono font-bold text-neutral-700">{data.cls.code}</span>
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStudentsOpen(false)}
                className="border-neutral-300"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                disabled={adding}
                className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'যোগ করুন'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
