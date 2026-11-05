'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { Fingerprint, GraduationCap, Loader2, MapPin, Timer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, setUser as persistUser, type HajiraUser, type Role } from '@/lib/hajira-client'
import { useHajiraToasts } from '@/components/hajira/shared'

const FEATURES = [
  { icon: Fingerprint, label: 'Fingerprint verification' },
  { icon: MapPin, label: 'GPS geofence' },
  { icon: Timer, label: '1–2 minute window' },
]

export default function LoginScreen({ onLogin }: { onLogin: (u: HajiraUser) => void }) {
  const { ok, err } = useHajiraToasts()
  const [role, setRole] = React.useState<Role>('TEACHER')
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanName.length < 2) {
      err('Enter your name', 'Use at least 2 characters')
      return
    }
    if (!/^\d{6,15}$/.test(cleanPhone)) {
      err('Enter a valid phone number', 'Digits only, e.g. 01712345678')
      return
    }
    setLoading(true)
    try {
      const res = await api<{ user: HajiraUser }>('/api/auth/login', {
        method: 'POST',
        body: { name: cleanName, phone: cleanPhone, role },
      })
      persistUser(res.user)
      ok(
        `Welcome, ${res.user.name}!`,
        role === 'TEACHER' ? 'Signed in as teacher' : 'Signed in as student'
      )
      onLogin(res.user)
    } catch (e) {
      err('Sign in failed', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="hero-bg mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 py-10 sm:py-14"
    >
      {/* Hero */}
      <section className="corner-glow flex flex-col items-center gap-4 text-center" aria-label="Hajira introduction">
        <span className="btn-3d flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-gold shadow-lg shadow-ink/25">
          <GraduationCap className="h-9 w-9" aria-hidden />
        </span>
        <div>
          <h1 className="font-display text-5xl tracking-tight text-heading">Hajira</h1>
          <p className="mt-2 text-sm text-label sm:text-base">
            Attendance in 60 seconds — proxy-proof, effortless.
          </p>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="Features">
          {FEATURES.map((f) => (
            <li
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink-soft"
            >
              <f.icon className="h-3.5 w-3.5" aria-hidden />
              {f.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Login card */}
      <Card className="card-3d card-inner-glow w-full">
        <CardContent className="p-6">
          <Tabs value={role} onValueChange={(v) => setRole(v as Role)}>
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="TEACHER" className="data-[state=active]:bg-card data-[state=active]:text-ink">
                Teacher
              </TabsTrigger>
              <TabsTrigger value="STUDENT" className="data-[state=active]:bg-card data-[state=active]:text-ink">
                Student
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="hajira-name">Full name</Label>
              <Input
                id="hajira-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                required
                minLength={2}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hajira-phone">Phone number</Label>
              <Input
                id="hajira-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                autoComplete="tel"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="btn-3d btn-ink mt-1 h-11 w-full text-base font-semibold"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : 'Sign in'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-label">
            Demo — sign in with any name and phone number
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
