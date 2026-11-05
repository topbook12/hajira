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
import { CodeChip, EmptyState, PulsingDot, useHajiraToasts } from '@/components/hajira/shared'

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
      err('Could not load classes', e instanceof Error ? e.message : undefined)
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
      err('Enter a class name')
      return
    }
    setCreating(true)
    try {
      const res = await api<{ cls: { id: string; name: string; code: string } }>('/api/classes', {
        method: 'POST',
        body: { name },
      })
      ok(`Class created: ${res.cls.name}`, `Share this code with students: ${res.cls.code}`)
      setNewName('')
      setDialogOpen(false)
      await load()
    } catch (e) {
      err('Could not create the class', e instanceof Error ? e.message : undefined)
    } finally {
      setCreating(false)
    }
  }

  return (
    <section aria-label="My classes" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-heading">My Classes</h2>
          <p className="text-sm text-label">Open a class to start an attendance session</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="btn-3d btn-ink font-semibold">
          <Plus className="h-4 w-4" aria-hidden />
          New class
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
          title="No classes yet. Create your first class."
          hint="Creating a class generates a unique join code — students use it to enroll themselves."
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
              <Card className="card-3d card-inner-glow flex h-full flex-col">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 font-semibold text-heading" title={c.name}>
                      {c.name}
                    </h3>
                    {c.activeSessionId ? (
                      <Badge className="shrink-0 gap-1.5 border-none bg-green/10 text-green hover:bg-green/10">
                        <PulsingDot color="green" />
                        Live session
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <CodeChip code={c.code} />
                  </div>

                  <p className="inline-flex items-center gap-1.5 text-sm text-body">
                    <Users className="h-4 w-4 text-label" aria-hidden />
                    {c.studentCount} students
                  </p>

                  <div className="mt-auto flex gap-2 pt-1">
                    <Button onClick={() => onOpenClass(c.id)} className="btn-3d btn-ink h-9 flex-1">
                      Open class
                    </Button>
                    <Button
                      onClick={() => onOpenReport(c.id)}
                      variant="outline"
                      className="h-9 flex-1 border-border hover:bg-secondary"
                    >
                      Report
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
        <DialogContent className="dialog-sheet sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a new class</DialogTitle>
            <DialogDescription>
              A unique join code will be generated — students use it to enroll.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createClass} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-class-name">Class name</Label>
              <Input
                id="new-class-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="CSE 301 — Section A"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="border-border hover:bg-secondary"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating} className="btn-3d btn-ink font-semibold">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
