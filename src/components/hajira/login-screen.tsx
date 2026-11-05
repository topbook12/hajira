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
  { icon: Fingerprint, label: 'ফিঙ্গারপ্রিন্ট যাচাই' },
  { icon: MapPin, label: 'GPS লোকেশন ভেরিফিকেশন' },
  { icon: Timer, label: '১–২ মিনিটের টাইম-উইন্ডো' },
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
      err('নাম লিখুন', 'কমপক্ষে ২ অক্ষরের নাম দিন')
      return
    }
    if (!/^\d{6,15}$/.test(cleanPhone)) {
      err('সঠিক ফোন নম্বর দিন', 'যেমন: 01712345678 (শুধু ডিজিট)')
      return
    }
    setLoading(true)
    try {
      const res = await api<{ user: HajiraUser }>('/api/auth/login', {
        method: 'POST',
        body: { name: cleanName, phone: cleanPhone, role },
      })
      persistUser(res.user)
      ok(`স্বাগতম, ${res.user.name}!`, role === 'TEACHER' ? 'শিক্ষক হিসেবে প্রবেশ করেছেন' : 'শিক্ষার্থী হিসেবে প্রবেশ করেছেন')
      onLogin(res.user)
    } catch (e) {
      err('প্রবেশ ব্যর্থ হয়েছে', e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 py-10 sm:py-14"
    >
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 text-center" aria-label="হাজিরা পরিচিতি">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/20">
          <GraduationCap className="h-9 w-9" aria-hidden />
        </span>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-emerald-700">হাজিরা</h1>
          <p className="mt-2 text-sm text-neutral-600 sm:text-base">
            ১ মিনিটে উপস্থিতি — প্রক্সি-প্রুফ, ঝামেলাহীন
          </p>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="বৈশিষ্ট্যসমূহ">
          {FEATURES.map((f) => (
            <li
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"
            >
              <f.icon className="h-3.5 w-3.5" aria-hidden />
              {f.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Login card */}
      <Card className="w-full border-neutral-200 shadow-sm">
        <CardContent className="p-6">
          <Tabs value={role} onValueChange={(v) => setRole(v as Role)}>
            <TabsList className="grid w-full grid-cols-2 bg-neutral-100">
              <TabsTrigger value="TEACHER" className="data-[state=active]:bg-white">
                শিক্ষক
              </TabsTrigger>
              <TabsTrigger value="STUDENT" className="data-[state=active]:bg-white">
                শিক্ষার্থী
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="hajira-name">নাম</Label>
              <Input
                id="hajira-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="আপনার পুরো নাম"
                autoComplete="name"
                required
                minLength={2}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hajira-phone">ফোন নম্বর</Label>
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
              className="mt-1 h-11 w-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : 'প্রবেশ করুন'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-neutral-500">
            ডেমো: যেকোনো নাম ও ফোন নম্বর দিয়ে প্রবেশ করুন
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
