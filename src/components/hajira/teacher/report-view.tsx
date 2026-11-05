'use client'

import * as React from 'react'

import { ArrowLeft, Download, FileBarChart2, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, type ReportData } from '@/lib/hajira-client'
import { bn, EmptyState, useHajiraToasts } from '@/components/hajira/shared'

export default function TeacherReportView({
  classId,
  onBack,
}: {
  classId: string
  onBack: () => void
}) {
  const { err } = useHajiraToasts()
  const [data, setData] = React.useState<ReportData | null>(null)
  const [threshold, setThreshold] = React.useState('60')
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await api<ReportData>(`/api/reports/class/${classId}?threshold=${threshold}`)
      setData(d)
    } catch (e) {
      err('রিপোর্ট লোড করা যায়নি', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
     
  }, [classId, threshold])

  React.useEffect(() => {
    load()
  }, [load])

  const downloadCsv = () => {
    if (!data) return
    const head = ['নাম', 'ফোন', 'উপস্থিত', 'ফ্ল্যাগড', 'অনুপস্থিত', 'শতকরা', 'যোগ্যতা']
    const lines = [head.join(',')]
    for (const r of data.rows) {
      const cells = [
        r.name,
        r.phone,
        String(r.present),
        String(r.flagged),
        String(r.absent),
        `${r.pct}%`,
        r.eligible ? 'যোগ্য' : 'ঝুঁকিতে',
      ]
      lines.push(cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hajira-report.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-label="উপস্থিতি রিপোর্ট" className="flex flex-col gap-5">
      <Button
        variant="ghost"
        onClick={onBack}
        className="-ml-2 w-fit gap-2 text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        ফিরে যান
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            {data ? data.cls.name : 'রিপোর্ট'}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            {data ? `মোট সেশন: ${bn(data.totalSessions)} • যোগ্যতার ন্যূনতম সীমা: ${bn(threshold)}%` : 'লোড হচ্ছে…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={threshold} onValueChange={setThreshold}>
            <SelectTrigger className="w-[130px]" aria-label="যোগ্যতার সীমা">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">৫০%</SelectItem>
              <SelectItem value="60">৬০%</SelectItem>
              <SelectItem value="75">৭৫%</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={downloadCsv}
            disabled={!data || data.rows.length === 0}
            variant="outline"
            className="border-emerald-300 font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV ডাউনলোড
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={FileBarChart2}
          title="এই ক্লাসে এখনো কোনো রিপোর্ট নেই"
          hint="সেশন শুরু করে উপস্থিতি নিলে এখানে প্রতি-শিক্ষার্থী রিপোর্ট দেখা যাবে।"
        />
      ) : (
        <Card className="border-neutral-200 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            {loading ? (
              <div className="flex items-center justify-center py-10" role="status">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" aria-hidden />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-neutral-200">
                      <TableHead className="min-w-[140px]">নাম</TableHead>
                      <TableHead>ফোন</TableHead>
                      <TableHead className="text-center">উপস্থিত</TableHead>
                      <TableHead className="text-center">ফ্ল্যাগড</TableHead>
                      <TableHead className="text-center">অনুপস্থিত</TableHead>
                      <TableHead className="min-w-[150px]">শতকরা</TableHead>
                      <TableHead className="text-center">পরীক্ষার যোগ্যতা</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r.studentId} className="border-neutral-100">
                        <TableCell className="font-medium text-neutral-900">{r.name}</TableCell>
                        <TableCell className="font-mono text-sm text-neutral-500">{r.phone}</TableCell>
                        <TableCell className="text-center font-semibold text-emerald-700">
                          {bn(r.present)}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-amber-600">
                          {bn(r.flagged)}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-rose-600">
                          {bn(r.absent)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                                <div
                                  className={r.pct >= data.threshold ? 'h-full rounded-full bg-emerald-600' : 'h-full rounded-full bg-amber-500'}
                                  style={{ width: `${Math.min(100, r.pct)}%` }}
                                />
                              </div>
                            </div>
                            <span className="font-mono text-sm font-semibold text-neutral-700">
                              {bn(r.pct)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {r.eligible ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">যোগ্য</Badge>
                          ) : (
                            <Badge
                              className={
                                r.pct >= Math.max(0, data.threshold - 20)
                                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                                  : 'bg-rose-100 text-rose-700 hover:bg-rose-100'
                              }
                            >
                              ঝুঁকিতে
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
