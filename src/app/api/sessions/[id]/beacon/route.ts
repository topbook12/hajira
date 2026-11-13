import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, haversineM, requireUser, serverError, unauthorized } from '@/lib/hajira'
import { rateLimit } from '@/lib/rate-limit'

/**
 * AUTO PRESENCE beacon — the passive attendance engine.
 *
 * The teacher opted this session into "auto attendance": during the window,
 * students simply keep the app open. Every ~15 seconds the app posts a
 * location beacon here, and the server decides:
 *
 *   - inside the GPS fence  -> PRESENT, method AUTO (no tap, no QR, no PIN)
 *   - outside the fence     -> FLAGGED "Outside classroom range" (honest,
 *                              reviewable — never silently dropped)
 *   - no location from GPS  -> FLAGGED "Location unavailable" (they were
 *                              online, but we cannot verify where)
 *   - never beaconed at all -> ABSENT, written by the end-of-window sweep
 *
 * Repeats are idempotent: once PRESENT, later beacons change nothing. A
 * FLAGGED student who walks into range IS upgraded to PRESENT — honest
 * correction, not a loophole: the fence still decides.
 */
async function POST_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'STUDENT') return badRequest('Only students beacon attendance')

  const { id } = await ctx.params
  const body = await req.json().catch(() => null)
  const deviceId = String(body?.deviceId || '').trim()
  const lat = body?.lat == null ? null : Number(body.lat)
  const lng = body?.lng == null ? null : Number(body.lng)

  // Beacons arrive every ~15s per student — a loose budget, only to stop
  // runaway loops, not honest usage.
  const rl = rateLimit(`beacon:${id}:${user.id}`, 12, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Slow down', retryAfterSec: rl.retryAfterSec }, { status: 429 })
  }

  const session = await db.session.findUnique({
    where: { id },
    include: { class: { select: { id: true, name: true } } },
  })
  if (!session) return badRequest('Session not found')
  if (!session.autoPresence) return badRequest('This session does not use auto attendance')

  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId: user.id } },
  })
  if (!member) return badRequest('You are not a student of this class')

  const now = new Date()
  if (session.status !== 'ACTIVE' || session.endsAt <= now) {
    return NextResponse.json({ error: 'The auto-attendance window has ended' }, { status: 410 })
  }

  // WHERE — the whole proof in this mode
  const flags: string[] = []
  let gpsOk = false
  let distanceM: number | null = null
  if (lat == null || lng == null) {
    flags.push('Location unavailable during auto attendance')
  } else if (!session.requireGps || session.lat == null || session.lng == null) {
    gpsOk = true // defensive: auto sessions always require GPS, but never trap a student in an impossible state
  } else {
    distanceM = Math.round(haversineM(session.lat, session.lng, lat, lng) * 10) / 10
    gpsOk = distanceM <= session.radiusM
    if (!gpsOk) flags.push(`Outside classroom range (~${Math.round(distanceM)} m)`)
  }

  // WHO — same device binding as the manual check-in
  if (user.deviceId && deviceId && user.deviceId !== deviceId) {
    flags.push('Beacon from a new/different device')
  } else if (!user.deviceId && deviceId) {
    await db.user.update({ where: { id: user.id }, data: { deviceId } })
  }

  const existing = await db.checkIn.findUnique({
    where: { sessionId_studentId: { sessionId: id, studentId: user.id } },
  })

  if (existing) {
    if (existing.status === 'PRESENT') {
      return NextResponse.json({
        checkIn: { status: 'PRESENT', method: existing.method, distanceM: existing.distanceM, gpsOk: true, flags: [] },
        message: 'Attendance already recorded automatically',
      })
    }
    // FLAGGED -> in range now: honest upgrade
    if (gpsOk && existing.status === 'FLAGGED') {
      const updated = await db.checkIn.update({
        where: { id: existing.id },
        data: { status: 'PRESENT', gpsOk: true, distanceM, flags: null },
      })
      return NextResponse.json({
        checkIn: { status: updated.status, method: updated.method, distanceM: updated.distanceM, gpsOk: true, flags: [] },
        message: 'You moved inside the classroom range — attendance counted',
      })
    }
    return NextResponse.json({
      checkIn: {
        status: existing.status,
        method: existing.method,
        distanceM: existing.distanceM ?? distanceM,
        gpsOk,
        flags: flags.length ? flags : ['Outside classroom range'],
      },
      message:
        gpsOk && existing.status === 'ABSENT'
          ? 'The window was over when you arrived — ask your teacher to review'
          : 'You are outside the classroom range',
    })
  }

  const status = gpsOk ? 'PRESENT' : 'FLAGGED'
  const created = await db.checkIn
    .create({
      data: {
        sessionId: id,
        studentId: user.id,
        status,
        method: 'AUTO',
        distanceM,
        gpsOk,
        deviceId: deviceId || null,
        flags: flags.length ? JSON.stringify(flags) : null,
      },
    })
    .catch((e: unknown) => {
      // another beacon raced us — treat the winner as the truth
      if ((e as { code?: string })?.code === 'P2002') return null
      throw e
    })

  if (!created) {
    return NextResponse.json({
      checkIn: { status: 'PRESENT', method: 'AUTO', distanceM, gpsOk, flags: [] },
      message: 'Attendance recorded automatically',
    })
  }

  return NextResponse.json({
    checkIn: {
      status: created.status,
      method: created.method,
      distanceM: created.distanceM,
      gpsOk: created.gpsOk,
      flags,
    },
    className: session.class.name,
    message:
      status === 'PRESENT'
        ? 'Attendance recorded automatically — you are inside the classroom range'
        : 'You are outside the classroom range — marked for review',
  })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    return await POST_impl(req, ctx)
  } catch (e) {
    return serverError(e)
  }
}
