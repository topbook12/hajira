'use client'

import { BarChart3, BookOpen, Home, ScanLine, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'

export type StudentTab = 'home' | 'analysis' | 'classes' | 'profile'

const TABS: { key: StudentTab; label: string; icon: typeof Home }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'analysis', label: 'Analysis', icon: BarChart3 },
  { key: 'classes', label: 'Classes', icon: BookOpen },
  { key: 'profile', label: 'Profile', icon: UserRound },
]

/**
 * Student navigation.
 *  - Mobile   : fixed bottom tab bar with a raised center SCAN button
 *               (thumb reach, safe-area aware) — one tap to the camera,
 *               exactly like a native attendance app.
 *  - sm and up: a centered segmented control under the header.
 */
export default function StudentTabs({
  view,
  onChange,
  onScan,
}: {
  view: StudentTab
  onChange: (tab: StudentTab) => void
  /** raised center camera button — opens the live session's QR scanner */
  onScan?: () => void
}) {
  return (
    <>
      {/* desktop / tablet segmented control */}
      <nav
        aria-label="Student sections"
        className="mx-auto hidden w-fit items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm sm:flex"
      >
        {TABS.map((t) => {
          const active = view === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
                active
                  ? 'bg-ink text-gold shadow-sm'
                  : 'text-label hover:bg-secondary hover:text-heading'
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          )
        })}
        {onScan ? (
          <button
            type="button"
            onClick={onScan}
            className="ml-1 flex h-9 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-ink shadow-sm transition-transform hover:scale-[1.03] active:scale-95"
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            Scan
          </button>
        ) : null}
      </nav>

      {/* mobile bottom tab bar with raised scan FAB */}
      <nav
        aria-label="Student sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.key} t={t} active={view === t.key} onChange={onChange} />
          ))}

          {/* center scan FAB */}
          {onScan ? (
            <div className="relative flex items-end justify-center">
              <button
                type="button"
                onClick={onScan}
                aria-label="Scan attendance QR code"
                className="-mt-7 flex h-14 w-14 flex-col items-center justify-center rounded-full border-4 border-background bg-gold text-ink shadow-lg shadow-gold/40 transition-transform active:scale-90"
              >
                <ScanLine className="h-6 w-6" aria-hidden />
              </button>
            </div>
          ) : (
            <span />
          )}

          {TABS.slice(2).map((t) => (
            <TabButton key={t.key} t={t} active={view === t.key} onChange={onChange} />
          ))}
        </div>
      </nav>
    </>
  )
}

function TabButton({
  t,
  active,
  onChange,
}: {
  t: { key: StudentTab; label: string; icon: typeof Home }
  active: boolean
  onChange: (tab: StudentTab) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(t.key)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition-colors',
        active ? 'text-ink' : 'text-label active:bg-secondary'
      )}
    >
      <span
        className={cn(
          'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
          active && 'bg-gold/30'
        )}
      >
        <t.icon className="h-5 w-5" aria-hidden />
      </span>
      {t.label}
    </button>
  )
}
