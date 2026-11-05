'use client'

import * as React from 'react'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  MapPin,
  RefreshCw,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  api,
  getDeviceId,
  getSocket,
  getPosition,
  tryFingerprint,
  type CheckInInfo,
  type HajiraUser,
} from '@/lib/hajira-client'
import {
  bn,
  methodLabel,
  useHajiraToasts,
} from '@/components/hajira/shared'

type CheckinSession = { id: string; className: string; teacherName?: string }

type BioState = 'idle' | 'verifying' | 'ok' | 'unsupported' | 'skipped'

type Result =
  | { kind: 'present'; message: string; checkIn: CheckInInfo }
  | { kind: 'flagged'; message: string; checkIn: CheckInInfo }
  | { kind: 'already'; message: string }
  | { kind: 'error'; message: string }

const STEP_LABELS = ['লোকেশন', 'কোড (ঐচ্ছিক)', 'যাচাই ও নিশ্চিতকরণ']

export default function CheckinDialog({
  user,
  session,
  open,
  onOpenChange,
  onChecked,
}: {
  user: HajiraUser
  session: CheckinSession | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChecked?: () => void
}) {
  const { err } = useHajiraToasts()
  const [locStatus, setLocStatus] = React.useState<'locating' | 'ok' | 'fail'>('locating')
  const [loc, setLoc] = React.useState<{ lat: number; lng: number; acc?: number } | null>(null)
  const [code, setCode] = React.useState('')
  const [bio, setBio] = React.useState<BioState>('idle')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)

  const locate = React.useCallback(async () => {
    setLocStatus('locating')
    const p = await getPosition()
    if (p) {
      setLoc(p)
      setLocStatus('ok')
    } else {
      setLoc(null)
      setLocStatus('fail')
    }
  }, [])

  /* reset + auto-locate + URL ?code= prefill each time the dialog opens */
  React.useEffect(() => {
    if (!open) return
    setResult(null)
    setCode('')
    setBio('idle')
    setSubmitting(false)
    try {
      const q = new URLSearchParams(window.location.search).get('code')
      if (q) setCode(q)
    } catch {
      /* ignore */
    }
    locate()
  }, [open, locate])

  const verifyFingerprint = async () => {
    setBio('verifying')
    const okBio = await tryFingerprint(user.name)
    setBio(okBio ? 'ok' : 'unsupported')
  }

  const submit = async () => {
    if (!session) return
    setSubmitting(true)
    try {
      const res = await api<{
        already?: boolean
        checkIn?: CheckInInfo
        className?: string
        message?: string
      }>('/api/checkin', {
        method: 'POST',
        body: {
          sessionId: session.id,
          code: code.trim() || undefined,
          lat: loc?.lat,
          lng: loc?.lng,
          deviceId: getDeviceId(),
          bioVerified: bio === 'ok',
        },
      })

      if (res.already) {
        setResult({ kind: 'already', message: res.message ?? 'আপনার উপস্থিতি আগেই রেকর্ড হয়েছে ✅' })
      } else if (res.checkIn) {
        const ci: CheckInInfo = {
          status: res.checkIn.status,
          method: res.checkIn.method,
          distanceM: res.checkIn.distanceM,
          bioVerified: res.checkIn.bioVerified,
          gpsOk: res.checkIn.gpsOk,
          flags: Array.isArray(res.checkIn.flags) ? res.checkIn.flags : [],
          createdAt: res.checkIn.createdAt,
        }
        setResult({
          kind: ci.status === 'PRESENT' ? 'present' : 'flagged',
          message: res.message ?? '',
          checkIn: ci,
        })
        /* announce to the teacher's live screen */
        getSocket().emit('checkin:new', {
          sessionId: session.id,
          checkIn: { ...ci, id: `rt-${Date.now()}`, studentId: user.id, studentName: user.name, studentPhone: user.phone, sessionId: session.id },
        })
      } else {
        setResult({ kind: 'error', message: 'অজানা সমস্যা হয়েছে' })
      }
      onChecked?.()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'সমস্যা হয়েছে'
      setResult({ kind: 'error', message })
      err('চেক-ইন ব্যর্থ হয়েছে', message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{session?.className ?? 'উপস্থিতি'}</DialogTitle>
          <DialogDescription>
            {session?.teacherName ? `${session.teacherName} • ` : ''}৩ ধাপে উপস্থিতি নিশ্চিত করুন
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex items-center gap-1.5" aria-label="চেক-ইন ধাপসমূহ">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' +
                  (result
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-emerald-600 text-white')
                }
              >
                {bn(i + 1)}
              </span>
              <span className="truncate text-[11px] font-medium text-neutral-500">{label}</span>
              {i < STEP_LABELS.length - 1 ? <span className="h-px flex-1 bg-neutral-200" aria-hidden /> : null}
            </li>
          ))}
        </ol>

        {result ? (
          /* ------------------------- RESULT PANEL ------------------------- */
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 p-6 text-center"
          >
            {result.kind === 'present' ? (
              <>
                <CheckCircle2 className="h-14 w-14 text-emerald-600" aria-hidden />
                <p className="text-lg font-bold text-emerald-700">উপস্থিত নিশ্চিত হয়েছে!</p>
                <p className="text-sm text-neutral-600">{result.message}</p>
                <div className="mt-1 flex flex-wrap justify-center gap-1.5 text-xs">
                  <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700">
                    পদ্ধতি: {methodLabel(result.checkIn.method)}
                  </span>
                  {result.checkIn.distanceM != null ? (
                    <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700">
                      দূরত্ব: {bn(Math.round(result.checkIn.distanceM))} মি.
                    </span>
                  ) : null}
                  {result.checkIn.bioVerified ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700">
                      ফিঙ্গারপ্রিন্ট ✓
                    </span>
                  ) : null}
                  <span
                    className={
                      result.checkIn.gpsOk
                        ? 'rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-700'
                        : 'rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-700'
                    }
                  >
                    GPS {result.checkIn.gpsOk ? '✓' : '✗'}
                  </span>
                </div>
              </>
            ) : result.kind === 'flagged' ? (
              <>
                <AlertTriangle className="h-14 w-14 text-amber-500" aria-hidden />
                <p className="text-lg font-bold text-amber-700">চেক-ইন হয়েছে, তবে ফ্ল্যাগ হয়েছে</p>
                <p className="text-sm text-neutral-600">{result.message}</p>
                <ul className="w-full space-y-1 text-left" aria-label="ফ্ল্যাগের কারণসমূহ">
                  {result.checkIn.flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-neutral-500">শিক্ষক যাচাই করে সিদ্ধান্ত নেবেন।</p>
              </>
            ) : result.kind === 'already' ? (
              <>
                <CheckCircle2 className="h-14 w-14 text-emerald-600" aria-hidden />
                <p className="text-lg font-bold text-emerald-700">ইতিমধ্যে রেকর্ড হয়েছে</p>
                <p className="text-sm text-neutral-600">{result.message}</p>
              </>
            ) : (
              <>
                <XCircle className="h-14 w-14 text-rose-600" aria-hidden />
                <p className="text-lg font-bold text-rose-700">চেক-ইন করা যায়নি</p>
                <p className="text-sm text-neutral-600">{result.message}</p>
              </>
            )}

            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="mt-2 w-full border-neutral-300 sm:w-auto"
            >
              বন্ধ করুন
            </Button>
          </motion.div>
        ) : (
          /* --------------------------- FORM STEPS -------------------------- */
          <div className="flex flex-col gap-5">
            {/* Step 1 — location */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-neutral-800">📍 লোকেশন যাচাই</p>
              {locStatus === 'locating' ? (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  লোকেশন খোঁজা হচ্ছে…
                </p>
              ) : locStatus === 'ok' ? (
                <p className="flex items-start gap-2 text-sm font-medium text-emerald-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  লোকেশন পাওয়া গেছে
                  {loc?.acc != null ? (
                    <span className="font-normal text-neutral-500">(নির্ভুলতা ~{bn(Math.round(loc.acc))} মি)</span>
                  ) : null}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="flex items-start gap-2 text-sm text-amber-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    লোকেশন পাওয়া যায়নি — পারমিশন দিন বা তবুও চেক-ইন করতে পারেন (ফ্ল্যাগ হবে)
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={locate}
                    className="w-fit border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    আবার চেষ্টা করুন
                  </Button>
                </div>
              )}
            </div>

            {/* Step 2 — optional code */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="checkin-code">QR/PIN কোড (ঐচ্ছিক)</Label>
              <Input
                id="checkin-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="৬-ডিজিটের কোড বা QR পেলোড"
                className="font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-neutral-500">
                প্রজেক্টরের QR স্ক্যান করলে বা ৬-ডিজিটের কোড লিখলে দ্রুত যাচাই হয়
              </p>
            </div>

            {/* Step 3 — fingerprint */}
            <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-neutral-800">🔐 ফিঙ্গারপ্রিন্ট যাচাই (ঐচ্ছিক)</p>
              {bio === 'ok' ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ✅ ফিঙ্গারপ্রিন্ট যাচাই হয়েছে
                </p>
              ) : bio === 'verifying' ? (
                <p className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  যাচাই চলছে — ডিভাইসে সেন্সর ব্যবহার করুন…
                </p>
              ) : bio === 'unsupported' || bio === 'skipped' ? (
                <p className="text-sm text-neutral-500">
                  এই ডিভাইসে ফিঙ্গারপ্রিন্ট সাপোর্ট নেই — বাটন চেপেই চেক-ইন করুন
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={verifyFingerprint}
                    className="border-emerald-300 font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    <Fingerprint className="h-4 w-4" aria-hidden />
                    ফিঙ্গারপ্রিন্ট দিয়ে যাচাই করুন
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBio('skipped')}
                    className="text-neutral-500"
                  >
                    এড়িয়ে যান
                  </Button>
                </div>
              )}
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="h-12 w-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  পাঠানো হচ্ছে…
                </>
              ) : (
                'উপস্থিতি নিশ্চিত করুন'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
