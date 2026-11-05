'use client'

import * as React from 'react'

import { AlertTriangle, Copy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/* ------------------------------ format helpers --------------------------- */

/** Weekday names, Bangladesh week starts on Sunday */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "09:30" -> 570 minutes from midnight */
export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN
  return h * 60 + m
}

/** 570 -> "09:30" */
export function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 570..690 -> "09:30–11:30" (en dash, 24h) */
export function timeRange(startMin: number, endMin: number): string {
  return `${minToTime(startMin)}–${minToTime(endMin)}`
}

/** mm:ss countdown, latin digits */
export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** English date-time, e.g. "Nov 5, 1:21 PM" */
export function fmtDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  try {
    return d.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return d.toLocaleString()
  }
}

/* --------------------------------- hooks --------------------------------- */

/** Ticking countdown toward `endsAt`; re-renders once per second */
export function useCountdown(endsAt: string | Date | null | undefined): {
  remainingSec: number
  ended: boolean
} {
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    if (!endsAt) return
    setNow(Date.now())
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [endsAt])

  if (!endsAt) return { remainingSec: 0, ended: true }
  const remainingSec = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
  return { remainingSec, ended: remainingSec <= 0 }
}

/** Shared ok/err toast helpers (shadcn toast) — stable identities */
export function useHajiraToasts() {
  const { toast } = useToast()
  const ok = React.useCallback(
    (title: string, description?: string) => toast({ title, description }),
    [toast]
  )
  const err = React.useCallback(
    (title?: string, description?: string) =>
      toast({ title: title ?? 'Something went wrong', description, variant: 'destructive' }),
    [toast]
  )
  return { toast, ok, err }
}

/* ------------------------------ tiny components --------------------------- */

/** Pulsing live dot (red for live banners, green for active items) */
export function PulsingDot({ color = 'red' }: { color?: 'red' | 'green' }) {
  const bg = color === 'red' ? 'bg-red-500' : 'bg-green-light'
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', bg)} />
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', bg)} />
    </span>
  )
}

const METHOD_LABEL: Record<string, string> = {
  QR: 'QR scan',
  PIN: 'Code',
  BUTTON: 'Button',
  MANUAL: 'Manual',
}

export function methodLabel(method?: string | null): string {
  return METHOD_LABEL[method ?? ''] ?? (method || 'Button')
}

export function MethodBadge({ method }: { method?: string | null }) {
  return (
    <Badge variant="outline" className="border-border bg-secondary font-normal text-label">
      {methodLabel(method)}
    </Badge>
  )
}

/** PRESENT / FLAGGED / ABSENT badge — green tint / gold / rust */
export function CheckStatusBadge({ status, title }: { status: string; title?: string }) {
  if (status === 'PRESENT')
    return (
      <Badge title={title} className="bg-green/10 text-green hover:bg-green/10">
        Present
      </Badge>
    )
  if (status === 'FLAGGED')
    return (
      <Badge title={title} className="bg-gold/25 text-ink hover:bg-gold/25">
        Flagged
      </Badge>
    )
  return (
    <Badge title={title} className="bg-rust/10 text-rust hover:bg-rust/10">
      Absent
    </Badge>
  )
}

/** Session status badge — ACTIVE (and not yet ended) shows pulsing "Live" */
export function SessionStatusBadge({ status, endsAt }: { status: string; endsAt?: string | Date }) {
  const active = status === 'ACTIVE' && (!endsAt || new Date(endsAt).getTime() > Date.now())
  if (active)
    return (
      <Badge className="gap-1.5 bg-green/10 text-green hover:bg-green/10">
        <PulsingDot color="green" />
        Live
      </Badge>
    )
  return (
    <Badge variant="secondary" className="bg-secondary text-label hover:bg-secondary">
      Ended
    </Badge>
  )
}

/** Copyable class code chip */
export function CodeChip({ code, className }: { code: string; className?: string }) {
  const { ok, err } = useHajiraToasts()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      ok('Code copied', code)
    } catch {
      err('Copy failed', 'Select the code manually and copy it')
    }
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-secondary py-0.5 pl-2.5 pr-1 font-mono text-xs font-semibold tracking-wide text-ink',
        className
      )}
    >
      {code}
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        title="Copy code"
        className="rounded-full p-1 text-label transition-colors hover:bg-border hover:text-heading"
      >
        <Copy className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )
}

/** Empty state with icon + hint */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  className,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-cream-soft/70 px-6 py-10 text-center',
        className
      )}
    >
      <Icon className="h-10 w-10 text-border" aria-hidden />
      <p className="text-sm font-medium text-body">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-label">{hint}</p> : null}
    </div>
  )
}

/** Vertically scrollable list (max-h-96) with a thin, subtle custom scrollbar */
export function ScrollList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#DAD5CC_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb:hover]:bg-label',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Amber flag list (AlertTriangle + flag texts) */
export function FlagList({ flags, className }: { flags: string[]; className?: string }) {
  if (!flags || flags.length === 0) return null
  return (
    <div className={cn('mt-1.5 flex flex-wrap items-center gap-1 text-xs text-amber-700', className)}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {flags.map((f, i) => (
        <span key={i} className="rounded bg-amber-50 px-1.5 py-0.5 leading-5">
          {f}
        </span>
      ))}
    </div>
  )
}
