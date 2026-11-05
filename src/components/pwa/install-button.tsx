'use client'

import * as React from 'react'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openInstallGate } from '@/components/pwa/install-gate'

/**
 * True when the user could still install (not already running as the
 * installed app and we haven't recorded a completed install).
 * Used by the header button + login-screen pill to hide themselves.
 */
export function useInstallAvailable(): boolean {
  const [available, setAvailable] = React.useState(false)

  React.useEffect(() => {
    const check = () => {
      try {
        const standalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true
        const installed = localStorage.getItem('hajira-installed') === '1'
        setAvailable(!standalone && !installed)
      } catch {
        setAvailable(false)
      }
    }
    check()
    window.addEventListener('appinstalled', check)
    return () => window.removeEventListener('appinstalled', check)
  }, [])

  return available
}

/**
 * Subtle header entry point — opens the Install Gate. Renders nothing when
 * the app is already installed, so it never clutters the installed app.
 */
export default function InstallButton({ className }: { className?: string }) {
  const available = useInstallAvailable()
  if (!available) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={openInstallGate}
      aria-label="Install Hajira app"
      title="Install Hajira on this device"
      className={cn('relative h-9 w-9 text-label hover:bg-gold/20 hover:text-ink', className)}
    >
      <Download className="h-4 w-4" aria-hidden />
      <span
        aria-hidden
        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold-deep"
      />
    </Button>
  )
}
