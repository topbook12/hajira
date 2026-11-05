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
  const [password, setPassword] = React.useState('')
  const [teacherKey, setTeacherKey] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    const cleanPhone = phone.replace(/\D/g, '')
    // NOTE: name is NOT required here — returning users sign in with just
    // phone + password; the server asks for a name only when creating a new
    // account (its error message guides the user to fill it in).
    if (password.length < 4) {
      err('Enter a password', 'At least 4 characters')
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
        body: {
          name: cleanName,
          phone: cleanPhone,
          password,
          role,
          teacherKey: role === 'TEACHER' ? teacherKey.trim() : undefined,
        },
      })
      persistUser(res.user)
      ok(
        `Welcome, ${res.user.name}!`,
        res.user.role === 'TEACHER' ? 'Signed in as teacher' : 'Signed in as student'
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
              <Label htmlFor="hajira-name">Full name (new accounts)</Label>
              <Input
                id="hajira-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Needed only the first time"
                autoComplete="name"
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="hajira-password">Password</Label>
              <Input
                id="hajira-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={role === 'TEACHER' ? 'Create or enter your password' : 'Your password'}
                autoComplete={role === 'TEACHER' ? 'new-password' : 'current-password'}
                minLength={4}
                required
              />
            </div>
            {role === 'TEACHER' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="hajira-teacher-key">
                  Teacher key <span className="font-normal text-label">(optional)</span>
                </Label>
                <Input
                  id="hajira-teacher-key"
                  value={teacherKey}
                  onChange={(e) => setTeacherKey(e.target.value)}
                  placeholder="Leave empty if you are the first teacher"
                  autoComplete="off"
                />
                <p className="text-xs text-label">
                  The <strong>first teacher</strong> of your institute signs up without a key. After
                  that, new teachers need the institute key from your department.
                </p>
              </div>
            ) : null}
            <Button
              type="submit"
              disabled={loading}
              className="btn-3d btn-ink mt-1 h-11 w-full text-base font-semibold"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : role === 'TEACHER' ? (
                'Continue as teacher'
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-label">
            First time here? Add your name, and your account is created automatically — this
            password protects it from then on.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
