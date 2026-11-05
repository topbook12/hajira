import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  badRequest,
  randomSecret,
  requireUser,
  unauthorized,
} from '@/lib/hajira'

/** Teacher starts an attendance session (captures classroom location) */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return badRequest('শুধু শিক্ষক সেশন শুরু করতে পারেন')

  const body = await req.json().catch(() => null)
  const classId = String(body?.classId || '')
  const durationSec = Math.min(Math.max(Number(body?.durationSec) || 120, 30), 600)
  const radiusM = Math.min(Math.max(Number(body?.radiusM) || 100, 30), 1000)
  let requireGps = !!body?.requireGps
  const lat = body?.lat == null ? null : Number(body.lat)
  const lng = body?.lng == null ? null : Number(body.lng)

  const cls = await db.class.findUnique({ where: { id: classId || 'none' } })
  if (!cls) return badRequest('ক্লাস পাওয়া যায়নি')
  if (cls.teacherId !== user.id) return badRequest('এই ক্লাসের শিক্ষক আপনি নন')

  // prevent duplicate active session for same class
  const active = await db.session.findFirst({
    where: { classId, status: 'ACTIVE', endsAt: { gt: new Date() } },
  })
  if (active) {
    return NextResponse.json({ session: active, warning: 'ইতিমধ্যে একটি সক্রিয় সেশন আছে' })
  }

  let warning: string | undefined
  if (requireGps && (lat == null || lng == null)) {
    requireGps = false
    warning = 'লোকেশন পাওয়া যায়নি — GPS যাচাই ছাড়া সেশন চালু হলো'
  }

  const endsAt = new Date(Date.now() + durationSec * 1000)
  const session = await db.session.create({
    data: {
      classId,
      secret: randomSecret(),
      lat,
      lng,
      radiusM,
      requireGps,
      durationSec,
      endsAt,
      status: 'ACTIVE',
    },
  })

  return NextResponse.json({ session, warning })
}
