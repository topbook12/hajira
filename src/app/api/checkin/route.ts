import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, haversineM, requireUser, serverError, unauthorized, verifyCode } from '@/lib/hajira'

/**
 * Student check-in — the 3-proof verification engine:
 *  1. WHO   -> device binding + optional fingerprint (bioVerified)
 *  2. WHERE -> GPS geofence around the classroom
 *  3. WHEN  -> active session within the 1-2 minute window (+ optional rotating QR/PIN)
 */
async function POST_impl(req: NextRequest) {
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

  // Proof 3 (WHEN + anti-forwarding): rotating QR payload or 6-digit PIN.
  // The code changes every 30s and is signed per session — a screenshot sent
  // to an off-campus friend is useless by the time they try it.
  if (code) {
    const v = verifyCode(code, session)
    if (v.ok) {
      method = v.method
    } else {
      flags.push('Attendance code invalid or expired')
    }
  } else if (session.requireCode) {
    flags.push('Attendance code missing (scan the QR or type the PIN)')
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

  // Proof 1b (WHO, strongest): fingerprint — enforced when the student opted
  // in ("Require fingerprint at check-in"). Skipping is allowed but honest:
  // the check-in lands as FLAGGED so the teacher reviews it — attendance is
  // never silently lost.
  if (user.biometricRequired && !bioVerified) {
    if (body?.bioFallback === true) {
      flags.push('Fingerprint verification skipped')
    } else {
      return NextResponse.json(
        {
          error:
            'Fingerprint verification is required for your account — verify with the sensor, or check in without it (it will be marked for review)',
          code: 'BIO_REQUIRED',
        },
        { status: 403 }
      )
    }
  }

  const status = flags.length ? 'FLAGGED' : 'PRESENT'

  let checkIn
  try {
    checkIn = await db.checkIn.create({
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
  } catch (e: unknown) {
    // Race: a second tab / double-tap got in first. The unique constraint
    // (sessionId, studentId) guarantees exactly one record — treat it as the
    // same happy outcome instead of surfacing an error.
    const code = (e as { code?: string })?.code
    if (code === 'P2002') {
      const existing2 = await db.checkIn.findUnique({
        where: { sessionId_studentId: { sessionId, studentId: user.id } },
      })
      return NextResponse.json(
        { already: true, checkIn: existing2, message: 'Your attendance was already recorded' },
        { status: 200 }
      )
    }
    throw e
  }

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

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
