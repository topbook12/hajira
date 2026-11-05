import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, haversineM, requireUser, unauthorized, verifyCode } from '@/lib/hajira'

/**
 * Student check-in — the 3-proof verification engine:
 *  1. WHO   -> device binding + optional fingerprint (bioVerified)
 *  2. WHERE -> GPS geofence around the classroom
 *  3. WHEN  -> active session within the 1-2 minute window (+ optional rotating QR/PIN)
 */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'STUDENT') return badRequest('Only students can check in')

  const body = await req.json().catch(() => null)
  const sessionId = String(body?.sessionId || '')
  const code = String(body?.code || '').trim()
  const deviceId = String(body?.deviceId || '').trim()
  const bioVerified = !!body?.bioVerified
  const lat = body?.lat == null ? null : Number(body.lat)
  const lng = body?.lng == null ? null : Number(body.lng)

  if (!sessionId) return badRequest('Session ID required')
  if (!deviceId) return badRequest('Device ID required')

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { class: { select: { name: true } } },
  })
  if (!session) return badRequest('Session not found')

  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId: user.id } },
  })
  if (!member) return badRequest('You are not a student of this class')

  const now = new Date()
  if (session.status !== 'ACTIVE' || session.endsAt <= now) {
    return NextResponse.json({ error: 'The session window has ended — attendance is closed' }, { status: 410 })
  }

  const existing = await db.checkIn.findUnique({
    where: { sessionId_studentId: { sessionId, studentId: user.id } },
  })
  if (existing) {
    return NextResponse.json(
      { already: true, checkIn: existing, message: 'Your attendance was already recorded' },
      { status: 200 }
    )
  }

  const flags: string[] = []
  let method = 'BUTTON'
  let gpsOk = !session.requireGps
  let distanceM: number | null = null

  // Proof 3 (optional fast-entry): rotating QR payload or 6-digit PIN
  if (code) {
    const v = verifyCode(code, session)
    if (v.ok) {
      method = v.method
    } else {
      flags.push('Code verification failed (wrong or expired)')
    }
  }

  // Proof 2 (WHERE): GPS geofence
  if (session.requireGps) {
    if (lat == null || lng == null) {
      flags.push('GPS unavailable (grant location permission)')
    } else {
      distanceM = Math.round(haversineM(session.lat!, session.lng!, lat, lng) * 10) / 10
      gpsOk = distanceM <= session.radiusM
      if (!gpsOk) flags.push(`Outside classroom range (~${Math.round(distanceM)} m)`)
    }
  }

  // Proof 1 (WHO): device binding — one device per student
  if (user.deviceId && user.deviceId !== deviceId) {
    flags.push('Check-in from a new/different device')
  } else if (!user.deviceId) {
    await db.user.update({ where: { id: user.id }, data: { deviceId } })
  }

  const status = flags.length ? 'FLAGGED' : 'PRESENT'

  const checkIn = await db.checkIn.create({
    data: {
      sessionId,
      studentId: user.id,
      status,
      distanceM,
      method,
      bioVerified,
      gpsOk,
      deviceId,
      flags: flags.length ? JSON.stringify(flags) : null,
    },
  })

  return NextResponse.json({
    checkIn: {
      id: checkIn.id,
      status: checkIn.status,
      method: checkIn.method,
      distanceM: checkIn.distanceM,
      bioVerified: checkIn.bioVerified,
      gpsOk: checkIn.gpsOk,
      flags,
      createdAt: checkIn.createdAt,
    },
    className: session.class.name,
    message:
      status === 'PRESENT'
        ? 'Attendance recorded successfully'
        : 'Checked in, but some items were flagged for review',
  })
}
