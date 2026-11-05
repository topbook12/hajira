'use client'

import { BarChart3, BookOpen, Home, UserRound } from 'lucide-react'

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
 *  - Mobile   : fixed bottom tab bar (thumb reach, safe-area aware) — the
 *               app-like dashboard feel students expect on a phone.
 *  - sm and up: a centered segmented control under the header.
 */
export default function StudentTabs({
  view,
  onChange,
}: {
  view: StudentTab
  onChange: (tab: StudentTab) => void
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
      </nav>

      {/* mobile bottom tab bar */}
      <nav
        aria-label="Student sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          {TABS.map((t) => {
            const active = view === t.key
            return (
              <button
                key={t.key}
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
          })}
        </div>
      </nav>
    </>
  )
}
