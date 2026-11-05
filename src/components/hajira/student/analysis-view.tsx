'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Flame,
  Fingerprint,
  MapPin,
  Medal,
  ShieldAlert,
  SkipForward,
  TrendingUp,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type StudentAnalytics } from '@/lib/hajira-client'
import {
  EmptyState,
  fmtDateTime,
  LoadErrorCard,
  methodLabel,
  useHajiraToasts,
} from '@/components/hajira/shared'

const CHART_GRID = '#E5E1DA'
const CHART_LABEL = '#6B6760'

function MiniStat({
  label,
  value,
  tone = 'default',
  icon: Icon,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'good' | 'warn' | 'bad'
  icon?: React.ComponentType<{ className?: string }>
}) {
  const toneCls =
    tone === 'good'
      ? 'text-green'
      : tone === 'warn'
        ? 'text-gold-deep'
        : tone === 'bad'
          ? 'text-rust'
          : 'text-heading'
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border/60 bg-card px-2 py-3.5 text-center shadow-sm">
      {Icon ? <Icon className={`h-4 w-4 ${toneCls}`} aria-hidden /> : null}
      <span className={`font-display text-xl font-bold tabular-nums ${toneCls}`}>{value}</span>
      <span className="text-[11px] font-medium leading-tight text-label">{label}</span>
    </div>
  )
}

/** Last sessions strip — like a habit tracker */
function SessionStrip({ timeline }: { timeline: StudentAnalytics['timeline'] }) {
  if (timeline.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5" role="img" aria-label="Recent sessions attendance strip">
      {timeline.map((t) => {
        const d = new Date(t.at)
        const title = `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} · ${t.className} · ${
          t.status === 'PRESENT' ? 'Present' : t.status === 'FLAGGED' ? 'Flagged' : 'Absent'
        }`
        return (
          <span
            key={t.id}
            title={title}
            className={
              'h-6 w-6 rounded-md border ' +
              (t.status === 'PRESENT'
                ? 'border-green/30 bg-green/85'
                : t.status === 'FLAGGED'
                  ? 'border-gold-deep/40 bg-gold'
                  : 'border-rust/25 bg-rust/70')
            }
          />
        )
      })}
    </div>
  )
}

export default function StudentAnalysisView({
  reloadKey,
  onOpenClass,
}: {
  reloadKey: number
  onOpenClass: (classId: string) => void
}) {
  const { err } = useHajiraToasts()
  const [data, setData] = React.useState<StudentAnalytics | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [failMsg, setFailMsg] = React.useState<string | undefined>(undefined)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const d = await api<StudentAnalytics>('/api/student/analytics')
      setData(d)
    } catch (e) {
      setFailed(true)
      setFailMsg(e instanceof Error ? e.message : undefined)
      err('Analysis did not load', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [err])

  React.useEffect(() => {
    load()
  }, [load, reloadKey])

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-52" />
        <div className="grid grid-cols-4 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[86px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  if (failed && !data) {
    return <LoadErrorCard message={failMsg} onRetry={load} title="Your analysis did not load" />
  }

  if (!data) return null

  const { totals, perClass, timeline, recent } = data

  // cumulative % over time for the trend line
  let attended = 0
  const trend = timeline.map((t, i) => {
    if (t.status === 'PRESENT') attended++
    const d = new Date(t.at)
    return {
      name: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      pct: Math.round((attended / (i + 1)) * 100),
      present: t.status === 'PRESENT',
    }
  })

  const presentCount = totals.attendedSessions
  const flaggedCount = totals.flaggedSessions
  const absentCount = Math.max(0, totals.totalSessions - presentCount - flaggedCount)

  return (
    <section aria-label="My analysis" className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 font-display text-2xl text-heading">
          <BarChart3 className="h-5 w-5 text-ink" aria-hidden />
          My Analysis
        </h2>
        <p className="text-sm text-label">Everything about your attendance, in one place</p>
      </div>

      {/* ===== headline stats ===== */}
      <div className="grid grid-cols-4 gap-2.5 sm:max-w-xl">
        <MiniStat label="Overall" value={`${totals.overallPct}%`} tone={totals.overallPct >= 70 ? 'good' : 'warn'} />
        <MiniStat label="Present" value={presentCount} tone="good" />
        <MiniStat label="Flagged" value={flaggedCount} tone={flaggedCount > 0 ? 'warn' : 'default'} />
        <MiniStat label="Absent" value={absentCount} tone={absentCount > 0 ? 'bad' : 'default'} />
      </div>

      {/* ===== trend chart ===== */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold text-heading">
              <TrendingUp className="h-4 w-4 text-label" aria-hidden />
              Attendance trend
            </h3>
            <span className="text-xs text-label">Last {timeline.length || 0} sessions</span>
          </div>

          {trend.length < 2 ? (
            <EmptyState
              icon={TrendingUp}
              title="Not enough sessions yet"
              hint="After a few attendance sessions, your trend line appears here."
              className="py-8"
            />
          ) : (
            <>
              <div className="h-48 w-full sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pctFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E6C800" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#E6C800" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: CHART_LABEL }}
                      tickLine={false}
                      axisLine={{ stroke: CHART_GRID }}
                      interval="preserveStartEnd"
                      minTickGap={28}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: CHART_LABEL }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: `1px solid ${CHART_GRID}`,
                        fontSize: 12,
                        boxShadow: '0 4px 12px rgba(36,28,21,0.08)',
                      }}
                      formatter={(v: number | string) => [`${v}%`, 'Attendance']}
                    />
                    <ReferenceLine
                      y={70}
                      stroke="#2D4F35"
                      strokeDasharray="5 4"
                      strokeOpacity={0.55}
                      label={{ value: 'target 70%', fontSize: 10, fill: '#2D4F35', position: 'insideTopRight' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="pct"
                      stroke="#241C15"
                      strokeWidth={2.2}
                      fill="url(#pctFill)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#241C15' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* habit strip + streaks */}
              <div className="flex flex-col gap-3 rounded-xl bg-cream-soft/70 p-3.5">
                <SessionStrip timeline={timeline} />
                <div className="flex items-center gap-4 text-xs text-label">
                  <span className="inline-flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
                    Streak <b className="font-mono text-ink">{totals.currentStreak}</b> · best{' '}
                    <b className="font-mono text-ink">{totals.bestStreak}</b>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-green/85" /> present
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-gold" /> flagged
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-rust/70" /> absent
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ===== per class breakdown ===== */}
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl text-heading">Class by class</h3>
        {perClass.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Join a class to see your analysis"
            hint="Once you join with a class code, every session starts counting here."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {perClass.map((c, i) => {
              const atRisk = c.pct < 70
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.25) }}
                >
                  <Card
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenClass(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpenClass(c.id)
                      }
                    }}
                    className="card-3d cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open details for ${c.name}`}
                  >
                    <CardContent className="flex flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate font-semibold text-heading">{c.name}</h4>
                          <p className="truncate text-xs text-label">{c.teacherName}</p>
                        </div>
                        {c.rank && c.classSize > 1 ? (
                          <Badge className="shrink-0 gap-1 border-none bg-ink text-cream hover:bg-ink">
                            <Medal className="h-3 w-3 text-gold" aria-hidden />#{c.rank} of {c.classSize}
                          </Badge>
                        ) : null}
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-body">
                            {c.present}/{c.total} sessions
                          </span>
                          <span
                            className={
                              'font-mono font-bold ' + (atRisk ? 'text-gold-deep' : 'text-green')
                            }
                          >
                            {c.pct}%
                          </span>
                        </div>
                        <Progress
                          value={c.pct}
                          className={atRisk ? 'h-2 [&>div]:bg-gold-deep' : 'h-2 [&>div]:bg-green'}
                          aria-label={`Attendance ${c.pct}%`}
                        />
                      </div>

                      {/* what-if coaching line */}
                      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-label">
                        {atRisk ? (
                          <>
                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-deep" aria-hidden />
                            Attend the next{' '}
                            <b className="font-mono text-ink">
                              {Math.max(1, Math.ceil((0.7 * c.total - c.present) / 0.3))}
                            </b>{' '}
                            sessions in a row to get back to 70%.
                          </>
                        ) : (
                          <>
                            <SkipForward className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" aria-hidden />
                            You can still miss{' '}
                            <b className="font-mono text-ink">
                              {Math.max(
                                0,
                                Math.floor((c.present - 0.7 * c.total) / 0.7)
                              )}
                            </b>{' '}
                            {Math.max(0, Math.floor((c.present - 0.7 * c.total) / 0.7)) === 1
                              ? 'session'
                              : 'sessions'}{' '}
                            and stay at 70%+.
                          </>
                        )}
                      </p>

                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
                        Full history
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== recent check-ins ===== */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-3 p-5 sm:p-6">
          <h3 className="font-semibold text-heading">Recent check-ins</h3>
          {recent.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No check-ins yet"
              hint="Your check-in history appears here after your first session."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {recent.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.2) }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-cream-soft/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-heading">{r.className}</p>
                    <p className="flex items-center gap-2 text-xs text-label">
                      {fmtDateTime(r.at)}
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {r.gpsOk ? 'GPS ok' : 'no GPS'}
                      </span>
                      {r.bioVerified ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Fingerprint className="h-3 w-3" aria-hidden />
                          bio
                        </span>
                      ) : null}
                      <span>· {methodLabel(r.method)}</span>
                    </p>
                  </div>
                  {r.status === 'PRESENT' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green" aria-label="Present" />
                  ) : r.status === 'FLAGGED' ? (
                    <Badge className="shrink-0 border-none bg-gold/25 text-ink hover:bg-gold/25">
                      Flagged
                    </Badge>
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-rust" aria-label="Absent" />
                  )}
                </motion.li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
