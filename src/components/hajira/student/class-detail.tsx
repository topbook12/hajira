'use client'

import * as React from 'react'

import { ArrowLeft, CalendarClock, GraduationCap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type StudentClassDetailData } from '@/lib/hajira-client'
import {
  bn,
  bnDateTime,
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
      err('ক্লাস লোড করা যায়নি', e instanceof Error ? e.message : undefined)
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
        title="ক্লাসটি দেখা যাচ্ছে না"
        hint="পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।"
      />
    )
  }

  const atRisk = data.myPct < 60

  return (
    <section aria-label={data.cls.name} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-neutral-900">{data.cls.name}</h2>
          <p className="mt-0.5 text-sm text-neutral-500">শিক্ষক: {data.cls.teacherName}</p>
        </div>
        <CodeChip code={data.cls.code} />
      </div>

      {/* Attendance progress */}
      <Card className={atRisk ? 'border-amber-300 bg-amber-50/50 shadow-sm' : 'border-emerald-200 bg-emerald-50/50 shadow-sm'}>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-neutral-600">আমার উপস্থিতি</p>
              <p
                className={
                  atRisk
                    ? 'text-4xl font-extrabold text-amber-600'
                    : 'text-4xl font-extrabold text-emerald-700'
                }
              >
                {bn(data.myPct)}%
              </p>
            </div>
            <Progress
              value={data.myPct}
              className="mt-2 h-2 flex-1 self-center [&>div]:bg-emerald-600"
              aria-label={`উপস্থিতি ${data.myPct}%`}
            />
          </div>
          <p className="text-sm text-neutral-600">পরীক্ষার জন্য ন্যূনতম ৬০% উপস্থিতি দরকার</p>
          {atRisk ? (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
              ⚠️ আপনি ঝুঁকিতে আছেন! পরের সেশনগুলোতে অবশ্যই উপস্থিত থাকুন।
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Session history */}
      <Card className="border-neutral-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-neutral-900">
            <CalendarClock className="h-4 w-4 text-neutral-500" aria-hidden />
            সেশন ইতিহাস
          </h3>

          {data.sessions.length === 0 ? (
            <EmptyState icon={CalendarClock} title="এখনো কোনো সেশন হয়নি" hint="শিক্ষক সেশন শুরু করলে এখানে দেখা যাবে।" />
          ) : (
            <ScrollList>
              <ul className="flex flex-col gap-2">
                {data.sessions.map((s) => {
                  const isRunning = s.status === 'ACTIVE' && s.myStatus === 'ABSENT'
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-100 bg-neutral-50/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {bnDateTime(s.startedAt)}
                        </p>
                        {s.myMethod ? (
                          <p className="text-xs text-neutral-500">পদ্ধতি: {methodLabel(s.myMethod)}</p>
                        ) : null}
                      </div>
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          <PulsingDot color="emerald" />
                          চলছে
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
        <Button variant="outline" onClick={onBack} className="border-neutral-300">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          ফিরে যান
        </Button>
      </div>
    </section>
  )
}
