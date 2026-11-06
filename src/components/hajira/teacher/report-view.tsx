'use client'

import * as React from 'react'

import { ArrowLeft, Download, FileBarChart2, Grid3X3, Loader2, Users2 } from 'lucide-react'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, downloadBlob, type ReportData } from '@/lib/hajira-client'
import { EmptyState, useHajiraToasts } from '@/components/hajira/shared'

/** Short date for grid columns: "5 Nov" — always Bangladesh time */
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
  })
}

/** Cell mark for the present sheet */
function Mark({ status }: { status?: string }) {
  if (status === 'PRESENT')
    return (
      <span
        aria-label="Present"
        className="flex h-6 w-6 items-center justify-center rounded-md bg-green/12 text-sm font-bold text-green"
      >
        P
      </span>
    )
  if (status === 'FLAGGED')
    return (
      <span
        aria-label="Flagged"
        className="flex h-6 w-6 items-center justify-center rounded-md bg-gold/40 text-sm font-bold text-ink"
      >
        F
      </span>
    )
  return (
    <span
      aria-label="Absent"
      className="flex h-6 w-6 items-center justify-center rounded-md bg-rust/8 text-sm font-medium text-rust/70"
    >
      ·
    </span>
  )
}

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
    downloadBlob(blob, 'hajira-report.csv')
  }

  const downloadExcel = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/classes/${classId}/export`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      downloadBlob(
        blob,
        `Hajira_${data?.cls.name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'class'}_${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      ok('Present sheet downloaded', 'Grid, summary, sessions and check-in log inside')
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
              ? `${data.totalSessions} sessions • ${data.rows.length} students • threshold ${threshold}%`
              : 'Loading…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <Select value={threshold} onValueChange={setThreshold}>
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
          ) : null}
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
            Excel sheet
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
        <Tabs defaultValue="sheet">
          <TabsList className="h-10 w-full justify-start gap-1 overflow-x-auto bg-cream-soft p-1 sm:w-fit">
            <TabsTrigger
              value="sheet"
              className="gap-1.5 rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <Grid3X3 className="h-4 w-4" aria-hidden />
              Present sheet
            </TabsTrigger>
            <TabsTrigger
              value="summary"
              className="gap-1.5 rounded-lg px-4 data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <Users2 className="h-4 w-4" aria-hidden />
              Summary
            </TabsTrigger>
          </TabsList>

          {/* ===== Present sheet — students × sessions grid ===== */}
          <TabsContent value="sheet" className="mt-4">
            <Card className="card-3d">
              <CardContent className="p-4 sm:p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-10" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-ink" aria-hidden />
                  </div>
                ) : data.sessions.length === 0 ? (
                  <EmptyState
                    icon={Grid3X3}
                    title="No sessions yet"
                    hint="Every attendance session adds a column to this sheet."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-20 min-w-[150px] border-b border-border bg-card px-3 py-2 text-left font-semibold text-heading">
                            Student
                          </th>
                          {data.sessions.map((s) => (
                            <th
                              key={s.id}
                              title={new Date(s.startedAt).toLocaleString('en-US', {
                                day: 'numeric',
                                month: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                              className="border-b border-border bg-card px-1.5 py-2 text-center font-mono text-[11px] font-medium text-label"
                            >
                              <span className="block w-11 whitespace-nowrap">
                                {dayLabel(s.startedAt)}
                              </span>
                            </th>
                          ))}
                          <th className="border-b border-border bg-card px-2 py-2 text-center font-semibold text-green">
                            P
                          </th>
                          <th className="border-b border-border bg-card px-2 py-2 text-center font-semibold text-gold-deep">
                            F
                          </th>
                          <th className="border-b border-border bg-card px-2 py-2 text-center font-semibold text-rust">
                            A
                          </th>
                          <th className="border-b border-border bg-card px-3 py-2 text-center font-semibold text-heading">
                            %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r, i) => (
                          <tr key={r.studentId} className="group">
                            <td
                              className={
                                'sticky left-0 z-10 max-w-[180px] truncate border-b border-border/60 bg-card px-3 py-1.5 font-medium text-heading group-hover:bg-cream-soft' +
                                (i % 2 === 1 ? ' bg-cream-soft/40' : '')
                              }
                              title={`${r.name} • ${r.phone}`}
                            >
                              {r.name}
                            </td>
                            {data.sessions.map((s) => (
                              <td
                                key={s.id}
                                className={
                                  'border-b border-border/60 px-1.5 py-1.5 text-center' +
                                  (i % 2 === 1 ? ' bg-cream-soft/40' : '')
                                }
                              >
                                <span className="flex justify-center">
                                  <Mark status={data.matrix[r.studentId]?.[s.id]} />
                                </span>
                              </td>
                            ))}
                            <td
                              className={
                                'border-b border-border/60 px-2 py-1.5 text-center font-mono font-semibold text-green' +
                                (i % 2 === 1 ? ' bg-cream-soft/40' : '')
                              }
                            >
                              {r.present}
                            </td>
                            <td
                              className={
                                'border-b border-border/60 px-2 py-1.5 text-center font-mono font-semibold text-gold-deep' +
                                (i % 2 === 1 ? ' bg-cream-soft/40' : '')
                              }
                            >
                              {r.flagged}
                            </td>
                            <td
                              className={
                                'border-b border-border/60 px-2 py-1.5 text-center font-mono font-semibold text-rust' +
                                (i % 2 === 1 ? ' bg-cream-soft/40' : '')
                              }
                            >
                              {r.absent}
                            </td>
                            <td
                              className={
                                'border-b border-border/60 px-3 py-1.5 text-center font-mono font-bold text-heading' +
                                (i % 2 === 1 ? ' bg-cream-soft/40' : '')
                              }
                            >
                              {r.pct}%
                            </td>
                          </tr>
                        ))}
                        {/* footer: present count per session */}
                        <tr>
                          <td className="sticky left-0 z-10 border-t border-border bg-cream-soft px-3 py-2 text-xs font-semibold text-label">
                            Present that day
                          </td>
                          {data.sessions.map((s) => (
                            <td
                              key={s.id}
                              className="border-t border-border bg-cream-soft px-1.5 py-2 text-center font-mono text-xs font-semibold text-ink"
                            >
                              {s.presentCount}
                            </td>
                          ))}
                          <td colSpan={4} className="border-t border-border bg-cream-soft" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-label">
                  <span className="inline-flex items-center gap-1">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-green/12 text-[10px] font-bold text-green">P</span>
                    Present
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-gold/40 text-[10px] font-bold text-ink">F</span>
                    Flagged (needs review)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-rust/8 text-[10px] text-rust">·</span>
                    Absent
                  </span>
                  <span>Scroll sideways for more sessions →</span>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Summary — per-student totals ===== */}
          <TabsContent value="summary" className="mt-4">
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
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}
