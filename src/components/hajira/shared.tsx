'use client'

import * as React from 'react'

import { AlertTriangle, Copy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/* --------------------------- Bengali number helpers ---------------------- */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/** Convert latin digits to Bengali digits */
export function bn(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d)
}

/** mm:ss countdown in Bengali digits */
export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return bn(`${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`)
}

/** Bengali date-time */
export function bnDateTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  try {
    return d.toLocaleString('bn-BD', {
      day: 'numeric',
      month: 'long',
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
      toast({ title: title ?? 'সমস্যা হয়েছে', description, variant: 'destructive' }),
    [toast]
  )
  return { toast, ok, err }
}

/* ------------------------------ tiny components --------------------------- */

/** Pulsing live dot (red for live sessions, emerald for active classes) */
export function PulsingDot({ color = 'red' }: { color?: 'red' | 'emerald' }) {
  const bg = color === 'red' ? 'bg-red-500' : 'bg-emerald-500'
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', bg)} />
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', bg)} />
    </span>
  )
}

const METHOD_LABEL: Record<string, string> = {
  QR: 'QR স্ক্যান',
  PIN: 'কোড',
  BUTTON: 'বাটন',
  MANUAL: 'ম্যানুয়াল',
}

export function methodLabel(method?: string | null): string {
  return METHOD_LABEL[method ?? ''] ?? (method || 'বাটন')
}

export function MethodBadge({ method }: { method?: string | null }) {
  return (
    <Badge variant="outline" className="border-neutral-200 bg-neutral-50 font-normal text-neutral-600">
      {methodLabel(method)}
    </Badge>
  )
}

/** PRESENT / FLAGGED / ABSENT badge (emerald / amber / rose) */
export function CheckStatusBadge({ status, title }: { status: string; title?: string }) {
  if (status === 'PRESENT')
    return (
      <Badge title={title} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        উপস্থিত
      </Badge>
    )
  if (status === 'FLAGGED')
    return (
      <Badge title={title} className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        ফ্ল্যাগড
      </Badge>
    )
  return (
    <Badge title={title} className="bg-rose-100 text-rose-700 hover:bg-rose-100">
      অনুপস্থিত
    </Badge>
  )
}

/** Session status badge — ACTIVE (and not yet ended) shows pulsing "চলছে" */
export function SessionStatusBadge({ status, endsAt }: { status: string; endsAt?: string | Date }) {
  const active = status === 'ACTIVE' && (!endsAt || new Date(endsAt).getTime() > Date.now())
  if (active)
    return (
      <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <PulsingDot color="emerald" />
        চলছে
      </Badge>
    )
  return (
    <Badge variant="secondary" className="bg-neutral-100 text-neutral-600 hover:bg-neutral-100">
      শেষ
    </Badge>
  )
}

/** Copyable class code chip */
export function CodeChip({ code, className }: { code: string; className?: string }) {
  const { ok, err } = useHajiraToasts()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      ok('কোড কপি হয়েছে', code)
    } catch {
      err('কপি করা যায়নি', 'ম্যানুয়ালি কোডটি সিলেক্ট করে কপি করুন')
    }
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 py-0.5 pl-2.5 pr-1 font-mono text-xs font-semibold tracking-wide text-neutral-700',
        className
      )}
    >
      {code}
      <button
        type="button"
        onClick={copy}
        aria-label="কোড কপি"
        title="কোড কপি"
        className="rounded-full p-1 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800"
      >
        <Copy className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )
}

/** Empty state with icon + Bengali text */
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
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 px-6 py-10 text-center',
        className
      )}
    >
      <Icon className="h-10 w-10 text-neutral-300" aria-hidden />
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-neutral-500">{hint}</p> : null}
    </div>
  )
}

/** Vertically scrollable list (max-h-96) with a thin, subtle custom scrollbar */
export function ScrollList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#d4d4d8_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300 [&::-webkit-scrollbar-thumb:hover]:bg-neutral-400',
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
