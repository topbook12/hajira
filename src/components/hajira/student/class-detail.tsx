'use client'

import * as React from 'react'

import { ArrowLeft, CalendarClock, GraduationCap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type StudentClassDetailData } from '@/lib/hajira-client'
import {
  fmtDateTime,
  CheckStatusBadge,
  EmptyState,
  CodeChip,
  methodLabel,
  PulsingDot,
  ScrollList,
  useHajiraToasts,
} from '@/components/hajira/shared'

export default function StudentClassDetail({
  classId,
  onBack,
}: {
  classId: string
  onBack: () => void
}) {
  const { err } = useHajiraToasts()
  const [data, setData] = React.useState<StudentClassDetailData | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      const d = await api<StudentClassDetailData>(`/api/classes/${classId}`)
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

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="This class is unavailable"
        hint="Refresh the page and try again."
      />
    )
  }

  const atRisk = data.myPct < 60

  return (
    <section aria-label={data.cls.name} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-2xl text-heading">{data.cls.name}</h2>
          <p className="mt-0.5 text-sm text-label">Teacher: {data.cls.teacherName}</p>
        </div>
        <CodeChip code={data.cls.code} />
      </div>

      {/* Attendance progress */}
      <Card className={atRisk ? 'border border-amber-200 bg-amber-50/40 shadow-sm' : 'card-3d border border-green/20'}>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-label">My attendance</p>
              <p
                className={
                  atRisk
                    ? 'font-display text-5xl text-amber-600'
                    : 'font-display text-5xl text-green'
                }
              >
                {data.myPct}%
              </p>
            </div>
            <Progress
              value={data.myPct}
              className={
                atRisk
                  ? 'mt-2 h-2 flex-1 self-center [&>div]:bg-gold-deep'
                  : 'mt-2 h-2 flex-1 self-center [&>div]:bg-green'
              }
              aria-label={`Attendance ${data.myPct}%`}
            />
          </div>
          <p className="text-sm text-body">You need at least 60% attendance to sit for the exam</p>
          {atRisk ? (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
              You are at risk — make sure to attend the upcoming sessions.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Session history */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-3 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <CalendarClock className="h-4 w-4 text-label" aria-hidden />
            Session history
          </h3>

          {data.sessions.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No sessions yet"
              hint="Sessions will appear here once your teacher starts one."
            />
          ) : (
            <ScrollList>
              <ul className="flex flex-col gap-2">
                {data.sessions.map((s) => {
                  const isRunning = s.status === 'ACTIVE' && s.myStatus === 'ABSENT'
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-cream-soft/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-heading">
                          {fmtDateTime(s.startedAt)}
                        </p>
                        {s.myMethod ? (
                          <p className="text-xs text-label">Method: {methodLabel(s.myMethod)}</p>
                        ) : null}
                      </div>
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-xs font-bold text-green">
                          <PulsingDot color="green" />
                          Live now
                        </span>
                      ) : (
                        <CheckStatusBadge status={s.myStatus} />
                      )}
                    </li>
                  )
                })}
              </ul>
            </ScrollList>
          )}
        </CardContent>
      </Card>

      <div>
        <Button variant="outline" onClick={onBack} className="border-border hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>
      </div>
    </section>
  )
}
