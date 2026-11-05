import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  badRequest,
  randomSecret,
  requireUser,
  serverError,
  unauthorized,
} from '@/lib/hajira'

/** Teacher starts an attendance session (captures classroom location) */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return badRequest('Only teachers can start sessions')

  const body = await req.json().catch(() => null)
  const classId = String(body?.classId || '')
  const durationSec = Math.min(Math.max(Number(body?.durationSec) || 120, 30), 600)
  const radiusM = Math.min(Math.max(Number(body?.radiusM) || 100, 30), 1000)
  let requireGps = !!body?.requireGps
  const requireCode = body?.requireCode === undefined ? true : !!body.requireCode
  const lat = body?.lat == null ? null : Number(body.lat)
  const lng = body?.lng == null ? null : Number(body.lng)

  const cls = await db.class.findUnique({ where: { id: classId || 'none' } })
  if (!cls) return badRequest('Class not found')
  if (cls.teacherId !== user.id) return badRequest('You are not the teacher of this class')

  // prevent duplicate active session for same class
  const active = await db.session.findFirst({
    where: { classId, status: 'ACTIVE', endsAt: { gt: new Date() } },
  })
  if (active) {
    return NextResponse.json({ session: active, warning: 'A session is already active' })
  }

  let warning: string | undefined
  if (requireGps && (lat == null || lng == null)) {
    requireGps = false
    warning = 'Location unavailable — session started without GPS verification'
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
      requireCode,
      durationSec,
      endsAt,
      status: 'ACTIVE',
    },
  })

  return NextResponse.json({ session, warning })
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
