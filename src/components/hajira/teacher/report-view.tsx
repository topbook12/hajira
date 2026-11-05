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
import { EmptyState, useHajiraToasts } from '@/components/hajira/shared'

export default function TeacherReportView({
  classId,
  onBack,
}: {
  classId: string
  onBack: () => void
}) {
  const { ok, err } = useHajiraToasts()
  const [data, setData] = React.useState<ReportData | null>(null)
  const [threshold, setThreshold] = React.useState<string>('')
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const q = threshold ? `?threshold=${threshold}` : ''
      const d = await api<ReportData>(`/api/reports/class/${classId}${q}`)
      setData(d)
      // adopt the class default (70% for BD universities) until the teacher picks one
      if (!threshold) setThreshold(String(d.threshold))
    } catch (e) {
      err('Could not load the report', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [classId, threshold])

  React.useEffect(() => {
    load()
  }, [load])

  const downloadCsv = () => {
    if (!data) return
    const head = ['Name', 'Phone', 'Present', 'Flagged', 'Absent', 'Percentage', 'Eligibility']
    const lines = [head.join(',')]
    for (const r of data.rows) {
      const cells = [
        r.name,
        r.phone,
        String(r.present),
        String(r.flagged),
        String(r.absent),
        `${r.pct}%`,
        r.eligible ? 'Eligible' : 'At risk',
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

  const downloadExcel = async () => {
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

  return (
    <section aria-label="Attendance report" className="flex flex-col gap-5">
      <Button
        variant="ghost"
        onClick={onBack}
        className="-ml-2 w-fit gap-2 text-label hover:text-heading"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-heading">
            {data ? data.cls.name : 'Report'}
          </h2>
          <p className="mt-0.5 text-sm text-label">
            {data
              ? `Total sessions: ${data.totalSessions} • Eligibility threshold: ${threshold}%`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={threshold || undefined} onValueChange={setThreshold}>
            <SelectTrigger className="w-[130px] bg-card" aria-label="Eligibility threshold">
              <SelectValue placeholder="Threshold" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50%</SelectItem>
              <SelectItem value="60">60%</SelectItem>
              <SelectItem value="70">70%</SelectItem>
              <SelectItem value="75">75%</SelectItem>
              <SelectItem value="80">80%</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={downloadExcel}
            disabled={!data || exporting}
            className="btn-3d btn-ink font-semibold"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Export Excel
          </Button>
          <Button
            onClick={downloadCsv}
            disabled={!data || data.rows.length === 0}
            variant="outline"
            className="border-border font-semibold text-ink hover:bg-secondary"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          icon={FileBarChart2}
          title="No report for this class yet"
          hint="Run a session and the per-student report will appear here."
        />
      ) : (
        <Card className="card-3d">
          <CardContent className="p-4 sm:p-6">
            {loading ? (
              <div className="flex items-center justify-center py-10" role="status">
                <Loader2 className="h-6 w-6 animate-spin text-ink" aria-hidden />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="min-w-[140px]">Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-center">Present</TableHead>
                      <TableHead className="text-center">Flagged</TableHead>
                      <TableHead className="text-center">Absent</TableHead>
                      <TableHead className="min-w-[150px]">Attendance</TableHead>
                      <TableHead className="text-center">Exam eligibility</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r.studentId} className="border-border/60">
                        <TableCell className="font-medium text-heading">{r.name}</TableCell>
                        <TableCell className="font-mono text-sm text-label">{r.phone}</TableCell>
                        <TableCell className="text-center font-semibold text-green">
                          {r.present}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-amber-600">
                          {r.flagged}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-rust">
                          {r.absent}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20">
                              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                <div
                                  className={
                                    r.pct >= data.threshold
                                      ? 'h-full rounded-full bg-green'
                                      : 'h-full rounded-full bg-gold-deep'
                                  }
                                  style={{ width: `${Math.min(100, r.pct)}%` }}
                                />
                              </div>
                            </div>
                            <span className="font-mono text-sm font-semibold text-body">
                              {r.pct}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {r.eligible ? (
                            <Badge className="border-none bg-green/10 text-green hover:bg-green/10">
                              Eligible
                            </Badge>
                          ) : (
                            <Badge
                              className={
                                r.pct >= Math.max(0, data.threshold - 20)
                                  ? 'border-none bg-gold/25 text-ink hover:bg-gold/25'
                                  : 'border-none bg-rust/10 text-rust hover:bg-rust/10'
                              }
                            >
                              At risk
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
