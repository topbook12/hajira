'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import QRCode from 'react-qr-code'
import {
  ArrowLeft,
  BarChart3,
  Check,
  Fingerprint,
  ListChecks,
  Loader2,
  MapPin,
  Square,
  X,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  api,
  getSocket,
  type LiveCheckInRow,
  type QrInfo,
  type TeacherSessionData,
} from '@/lib/hajira-client'
import {
  bn,
  CheckStatusBadge,
  EmptyState,
  FlagList,
  MethodBadge,
  mmss,
  PulsingDot,
  ScrollList,
  useCountdown,
  useHajiraToasts,
} from '@/components/hajira/shared'

export default function TeacherLiveSession({
  sessionId,
  onBack,
  onViewReport,
}: {
  sessionId: string
  onBack: () => void
  onViewReport: (classId: string) => void
}) {
  const { ok, err } = useHajiraToasts()
  const [session, setSession] = React.useState<TeacherSessionData['session'] | null>(null)
  const [checkIns, setCheckIns] = React.useState<LiveCheckInRow[]>([])
  const [rosterCount, setRosterCount] = React.useState(0)
  const [qr, setQr] = React.useState<QrInfo | null>(null)
  const [closing, setClosing] = React.useState(false)
  const expiredHandled = React.useRef(false)

  const { remainingSec } = useCountdown(session?.endsAt ?? null)
  const ended = !session || session.status !== 'ACTIVE' || remainingSec <= 0

  const load = React.useCallback(async () => {
    try {
      const d = await api<TeacherSessionData>(`/api/sessions/${sessionId}`)
      setSession(d.session)
      setCheckIns(d.checkIns)
      setRosterCount(d.rosterCount)
    } catch (e) {
      err('সেশন লোড করা যায়নি', e instanceof Error ? e.message : undefined)
    }
     
  }, [sessionId])

  /* initial load + realtime join */
  React.useEffect(() => {
    let alive = true
    load()
    const sock = getSocket()
    sock.emit('join-session', { sessionId })

    const onNew = (payload: unknown) => {
      if (!alive) return
      const ci = payload as Partial<LiveCheckInRow> & { sessionId?: string }
      if (ci.sessionId && ci.sessionId !== sessionId) return
      const row: LiveCheckInRow = {
        id: ci.id ?? `rt-${ci.studentId ?? Math.random()}`,
        studentId: ci.studentId ?? '',
        studentName: ci.studentName ?? 'শিক্ষার্থী',
        studentPhone: ci.studentPhone ?? '',
        status: ci.status ?? 'PRESENT',
        distanceM: ci.distanceM ?? null,
        method: ci.method ?? 'BUTTON',
        bioVerified: !!ci.bioVerified,
        gpsOk: !!ci.gpsOk,
        flags: Array.isArray(ci.flags) ? ci.flags : [],
        createdAt: ci.createdAt ?? new Date().toISOString(),
      }
      setCheckIns((prev) =>
        prev.some((p) => p.studentId === row.studentId) ? prev : [row, ...prev]
      )
    }
    const onClosed = (payload: unknown) => {
      const data = payload as { sessionId?: string }
      if (!data?.sessionId || data.sessionId === sessionId) load()
    }

    sock.on('checkin:new', onNew)
    sock.on('session:closed', onClosed)
    return () => {
      alive = false
      sock.emit('leave-session', { sessionId })
      sock.off('checkin:new', onNew)
      sock.off('session:closed', onClosed)
    }
  }, [sessionId, load])

  /* rotating QR / PIN poll — every 5s while live */
  React.useEffect(() => {
    if (ended) {
      setQr(null)
      return
    }
    let alive = true
    const pull = async () => {
      try {
        const q = await api<QrInfo>(`/api/sessions/${sessionId}/qr`)
        if (alive) setQr(q)
      } catch {
        /* QR poll failure is non-fatal */
      }
    }
    pull()
    const iv = setInterval(pull, 5000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [sessionId, ended])

  /* refetch once when the time window expires (server marks effective CLOSED) */
  React.useEffect(() => {
    if (ended && !expiredHandled.current) {
      expiredHandled.current = true
      if (session?.status === 'ACTIVE') load()
    }
    if (!ended) expiredHandled.current = false
  }, [ended, session?.status, load])

  const presentCount = checkIns.filter((c) => c.status === 'PRESENT').length
  const pct = rosterCount ? Math.round((presentCount / rosterCount) * 100) : 0

  const override = async (row: LiveCheckInRow, status: 'PRESENT' | 'ABSENT') => {
    try {
      const res = await api<{ checkIn: { status: string; method: string; distanceM: number | null; bioVerified: boolean; gpsOk: boolean; flags: string | string[] | null } }>(
        `/api/sessions/${sessionId}/override`,
        { method: 'POST', body: { studentId: row.studentId, status } }
      )
      const c = res.checkIn
      let flags: string[] = []
      if (typeof c.flags === 'string' && c.flags) {
        try {
          flags = JSON.parse(c.flags)
        } catch {
          flags = []
        }
      } else if (Array.isArray(c.flags)) {
        flags = c.flags
      }
      setCheckIns((prev) =>
        prev.map((p) =>
          p.studentId === row.studentId
            ? { ...p, status: c.status as LiveCheckInRow['status'], method: c.method, distanceM: c.distanceM ?? null, bioVerified: !!c.bioVerified, gpsOk: !!c.gpsOk, flags }
            : p
        )
      )
      ok(
        status === 'PRESENT' ? `${row.studentName} — উপস্থিত করা হয়েছে` : `${row.studentName} — অনুপস্থিত করা হয়েছে`
      )
    } catch (e) {
      err('পরিবর্তন করা যায়নি', e instanceof Error ? e.message : undefined)
    }
  }

  const closeSession = async () => {
    setClosing(true)
    try {
      const res = await api<{
        session: { id: string; classId: string }
        summary: { presentCount: number; rosterCount: number }
      }>(`/api/sessions/${sessionId}/close`, { method: 'POST' })
      getSocket().emit('session:closed', { classId: res.session.classId, sessionId })
      ok(
        `সেশন শেষ: ${bn(res.summary.presentCount)}/${bn(res.summary.rosterCount)} উপস্থিত`,
        'রিপোর্ট থেকে বিস্তারিত দেখুন'
      )
      setQr(null)
      await load()
    } catch (e) {
      err('সেশন বন্ধ করা যায়নি', e instanceof Error ? e.message : undefined)
    } finally {
      setClosing(false)
    }
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-label="লোড হচ্ছে">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-hidden />
      </div>
    )
  }

  return (
    <section aria-label="লাইভ উপস্থিতি সেশন" className="flex flex-col gap-5">
      <Button
        variant="ghost"
        onClick={onBack}
        className="-ml-2 w-fit gap-2 text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        ফিরে যান
      </Button>

      {/* Live header banner */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-700 p-6 text-white shadow-md shadow-emerald-600/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
              {!ended ? (
                <>
                  <PulsingDot color="red" />
                  লাইভ উপস্থিতি চলছে
                </>
              ) : (
                'সেশন শেষ'
              )}
            </div>
            <h2 className="mt-1 truncate text-2xl font-bold">{session.className}</h2>
            <p className="mt-0.5 text-sm text-emerald-100/90">
              কোড: <span className="font-mono">{session.classCode}</span> • রেডিয়াস:{' '}
              {bn(session.radiusM)} মি.{session.requireGps ? ' • GPS যাচাই চালু' : ''}
            </p>
          </div>
          <div className="text-left sm:text-right" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-100/80">অবশিষ্ট সময়</p>
            <p className="font-mono text-4xl font-bold tabular-nums">
              {ended ? <span className="text-2xl">সেশন শেষ</span> : mmss(remainingSec)}
            </p>
          </div>
        </div>
      </div>

      {/* Ended summary */}
      {ended ? (
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-sm font-medium text-neutral-500">সেশনের ফলাফল</p>
            <p className="text-4xl font-extrabold text-emerald-700">
              {bn(presentCount)}
              <span className="text-xl font-semibold text-neutral-400"> / {bn(rosterCount)}</span>
            </p>
            <p className="text-sm text-neutral-600">শিক্ষার্থী উপস্থিত</p>
            <Progress value={pct} className="h-2 max-w-xs [&>div]:bg-emerald-600" aria-label="উপস্থিতির হার" />
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => onViewReport(session.classId)}
                className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                <BarChart3 className="h-4 w-4" aria-hidden />
                রিপোর্ট দেখুন
              </Button>
              <Button variant="outline" onClick={onBack} className="border-neutral-300">
                ফিরে যান
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* QR + PIN (hidden when ended) */}
      {!ended && qr ? (
        <Card className="border-emerald-200 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <p className="text-sm font-medium text-neutral-600">
              প্রজেক্টরে দেখান — শিক্ষার্থীরা স্ক্যান করে দ্রুত চেক-ইন করবে
            </p>
            <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <QRCode value={qr.payload} size={220} />
            </div>
            <p className="mt-1 text-sm text-neutral-500">অথবা এই কোড লিখুন:</p>
            <p className="font-mono text-3xl font-bold tracking-widest text-emerald-700" aria-label="PIN কোড">
              {qr.pin}
            </p>
            <div className="w-full max-w-[220px]">
              <Progress
                value={(qr.expiresInSec / 30) * 100}
                className="h-1.5 [&>div]:bg-emerald-600"
                aria-label="কোডের বৈধতা"
              />
              <p className="mt-1 text-center text-xs text-neutral-500">
                নতুন কোড আসবে {bn(qr.expiresInSec)} সেকেন্ডে
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <Card className="border-neutral-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700">
              উপস্থিত{' '}
              <span className="font-bold text-emerald-700">
                {bn(presentCount)}/{bn(rosterCount)}
              </span>
            </span>
            <span className="font-mono font-semibold text-neutral-600">{bn(pct)}%</span>
          </div>
          <Progress value={pct} className="mt-2 h-2 [&>div]:bg-emerald-600" aria-label="উপস্থিতির হার" />
        </CardContent>
      </Card>

      {/* Live check-in list */}
      <Card className="border-neutral-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 font-semibold text-neutral-900">
            <ListChecks className="h-4 w-4 text-emerald-600" aria-hidden />
            লাইভ চেক-ইন তালিকা
          </h3>

          {checkIns.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="এখনো কেউ চেক-ইন করেনি"
              hint="শিক্ষার্থীরা চেক-ইন করলেই এখানে সাথে সাথে দেখা যাবে।"
            />
          ) : (
            <ScrollList>
              <ul className="flex flex-col gap-2">
                {checkIns.map((row) => (
                  <motion.li
                    key={`${row.studentId}-${row.id}`}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-start justify-between gap-3 rounded-lg border border-neutral-100 bg-white p-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-9 w-9 border border-emerald-100">
                        <AvatarFallback className="bg-emerald-100 text-sm font-bold text-emerald-700">
                          {row.studentName.trim().charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {row.studentName}
                          {row.bioVerified ? (
                            <Fingerprint
                              className="ml-1.5 inline h-4 w-4 text-emerald-600"
                              aria-label="ফিঙ্গারপ্রিন্ট যাচাইকৃত"
                            />
                          ) : null}
                        </p>
                        <p className="font-mono text-xs text-neutral-400">{row.studentPhone}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <CheckStatusBadge status={row.status} />
                          <MethodBadge method={row.method} />
                          {row.distanceM != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {bn(Math.round(row.distanceM))} মি.
                            </span>
                          ) : null}
                          <span
                            className={
                              row.gpsOk
                                ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                                : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700'
                            }
                          >
                            {row.gpsOk ? 'GPS ✓' : 'GPS ✗'}
                          </span>
                        </div>
                        <FlagList flags={row.flags} />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => override(row, 'PRESENT')}
                        disabled={ended}
                        aria-label={`${row.studentName} — উপস্থিত করুন`}
                        title="উপস্থিত করুন"
                        className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => override(row, 'ABSENT')}
                        disabled={ended}
                        aria-label={`${row.studentName} — অনুপস্থিত করুন`}
                        title="অনুপস্থিত করুন"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </ScrollList>
          )}
        </CardContent>
      </Card>

      {/* Close session */}
      {!ended ? (
        <Button
          onClick={closeSession}
          disabled={closing}
          variant="outline"
          className="w-full border-rose-300 font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 sm:w-fit sm:self-center"
        >
          {closing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
          সেশন শেষ করুন
        </Button>
      ) : null}
    </section>
  )
}
