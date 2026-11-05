'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import { BookOpen, Loader2, Plus, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type TeacherClassInfo } from '@/lib/hajira-client'
import { bn, CodeChip, EmptyState, PulsingDot, useHajiraToasts } from '@/components/hajira/shared'

export default function TeacherClassesView({
  onOpenClass,
  onOpenReport,
  reloadKey,
}: {
  onOpenClass: (classId: string) => void
  onOpenReport: (classId: string) => void
  reloadKey: number
}) {
  const { ok, err } = useHajiraToasts()
  const [classes, setClasses] = React.useState<TeacherClassInfo[] | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ classes: TeacherClassInfo[] }>('/api/me')
      setClasses(data.classes)
    } catch (e) {
      err('ক্লাস লোড করা যায়নি', e instanceof Error ? e.message : undefined)
      setClasses([])
    }
     
  }, [])

  React.useEffect(() => {
    load()
  }, [load, reloadKey])

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) {
      err('ক্লাসের নাম লিখুন')
      return
    }
    setCreating(true)
    try {
      const res = await api<{ cls: { id: string; name: string; code: string } }>('/api/classes', {
        method: 'POST',
        body: { name },
      })
      ok(`ক্লাস তৈরি হয়েছে: ${res.cls.name}`, `শিক্ষার্থীদের কোড দিন: ${res.cls.code}`)
      setNewName('')
      setDialogOpen(false)
      await load()
    } catch (e) {
      err('ক্লাস তৈরি করা যায়নি', e instanceof Error ? e.message : undefined)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section aria-label="আমার ক্লাসসমূহ" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">আমার ক্লাসসমূহ</h2>
          <p className="text-sm text-neutral-500">ক্লাসে প্রবেশ করে উপস্থিতি সেশন শুরু করুন</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          নতুন ক্লাস
        </Button>
      </div>

      {classes === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="এখনো কোনো ক্লাস নেই। নতুন ক্লাস তৈরি করুন।"
          hint="ক্লাস তৈরি করলে একটি ইউনিক কোড পাবেন — শিক্ষার্থীরা সেই কোড দিয়ে ক্লাসে যুক্ত হতে পারবে।"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.05, 0.3) }}
            >
              <Card className="flex h-full flex-col border-neutral-200 shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 font-semibold text-neutral-900" title={c.name}>
                      {c.name}
                    </h3>
                    {c.activeSessionId ? (
                      <Badge className="shrink-0 gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        <PulsingDot color="emerald" />
                        সক্রিয় সেশন চলছে
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <CodeChip code={c.code} />
                  </div>

                  <p className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
                    <Users className="h-4 w-4 text-neutral-400" aria-hidden />
                    {bn(c.studentCount)} জন শিক্ষার্থী
                  </p>

                  <div className="mt-auto flex gap-2 pt-1">
                    <Button
                      onClick={() => onOpenClass(c.id)}
                      className="h-9 flex-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                    >
                      ক্লাস দেখুন
                    </Button>
                    <Button onClick={() => onOpenReport(c.id)} variant="outline" className="h-9 flex-1 border-neutral-300">
                      রিপোর্ট
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* New class dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>নতুন ক্লাস তৈরি করুন</DialogTitle>
            <DialogDescription>
              ক্লাস তৈরি হলে একটি ইউনিক কোড তৈরি হবে — শিক্ষার্থীরা সেটি দিয়ে যুক্ত হবে।
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createClass} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-class-name">ক্লাসের নাম</Label>
              <Input
                id="new-class-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="CSE 301 — সেকশন A"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-neutral-300"
              >
                বাতিল
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'তৈরি করুন'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
