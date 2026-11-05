'use client'

import {
  Fingerprint,
  GraduationCap,
  Info,
  LogOut,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getDeviceId, type HajiraUser } from '@/lib/hajira-client'
import { openInstallGate } from '@/components/pwa/install-gate'

/**
 * Student "Profile" tab — identity, device binding, install entry point and
 * a short plain-language explanation of how the attendance is verified.
 */
export default function StudentProfileView({
  user,
  onLogout,
}: {
  user: HajiraUser
  onLogout: () => void
}) {
  const deviceId = typeof window !== 'undefined' ? getDeviceId() : ''

  return (
    <section aria-label="Profile" className="flex flex-col gap-5">
      {/* identity card */}
      <Card className="card-3d border-gradient-amber">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-2xl font-bold text-gold shadow-md">
              {user.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-2xl text-heading">{user.name}</h2>
              <p className="font-mono text-sm text-label">{user.phone}</p>
              <Badge className="mt-1.5 border border-border bg-secondary text-label hover:bg-secondary">
                Student
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* device + security */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-3 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <ShieldCheck className="h-4 w-4 text-label" aria-hidden />
            Device &amp; security
          </h3>
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-cream-soft/60 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/25 text-ink">
              <Smartphone className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-heading">This device</p>
              <p className="truncate font-mono text-xs text-label" title={deviceId}>
                {deviceId ? `${deviceId.slice(0, 18)}…` : 'Not assigned yet'}
              </p>
              <p className="mt-0.5 text-xs text-label">
                Your attendance is bound to this device so nobody can check in for you.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-cream-soft/60 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/25 text-ink">
              <Fingerprint className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-heading">Fingerprint check-in</p>
              <p className="text-xs text-label">
                Optional at every check-in — supported devices show the sensor option automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* how it works */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-3 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <Info className="h-4 w-4 text-label" aria-hidden />
            How attendance works
          </h3>
          <ol className="flex flex-col gap-2 text-sm text-body">
            {[
              'Your teacher opens a 1–2 minute attendance session in class.',
              'A live card appears on your Home tab — tap Check in now.',
              'Confirm your location, scan the projector QR (or type the PIN), done.',
              'The QR and PIN refresh every 30 seconds — screenshots never work.',
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/25 text-[11px] font-bold text-ink">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* app + account */}
      <Card className="card-3d">
        <CardContent className="flex flex-col gap-3 p-6">
          <h3 className="flex items-center gap-2 font-semibold text-heading">
            <GraduationCap className="h-4 w-4 text-label" aria-hidden />
            App
          </h3>
          <Button
            variant="outline"
            onClick={() => openInstallGate()}
            className="h-11 justify-start border-border font-semibold text-ink hover:bg-secondary"
          >
            Install Hajira on this phone
          </Button>
          <Separator className="bg-border" />
          <Button
            variant="ghost"
            onClick={onLogout}
            className="h-11 justify-start text-rust hover:bg-rust/10 hover:text-rust"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Button>
          <p className="text-center text-xs text-label">Hajira — Smart Attendance Platform</p>
        </CardContent>
      </Card>
    </section>
  )
}
