import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, requireUser, serverError, sweepAutoAbsences, unauthorized } from '@/lib/hajira'

/** Live session detail — teacher sees all check-ins, student sees own + counts */
async function GET_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const session = await db.session.findUnique({
    where: { id },
    include: {
      class: { select: { id: true, name: true, code: true, teacherId: true } },
    },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const rosterCount = await db.membership.count({ where: { classId: session.classId } })
  const now = new Date()
  const expired = session.endsAt <= now
  const effectiveStatus = session.status === 'ACTIVE' && expired ? 'CLOSED' : session.status

  // AUTO PRESENCE lazy sweep: the first client that notices the window is
  // over finalizes the session — absentees get their ABSENT rows here even
  // if the teacher never tapped "End session". Idempotent + one-shot.
  if (session.autoPresence && session.status === 'ACTIVE' && expired) {
    await sweepAutoAbsences(session.id, session.classId)
    await db.session.update({ where: { id: session.id }, data: { status: 'CLOSED' } })
  }

  if (user.role === 'TEACHER') {
    if (session.class.teacherId !== user.id) return forbidden('You are not the teacher of this session')
    const checkIns = await db.checkIn.findMany({
      where: { sessionId: id },
      include: { student: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({
      role: 'TEACHER',
      session: {
        id: session.id,
        classId: session.classId,
        className: session.class.name,
        classCode: session.class.code,
        status: effectiveStatus,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        durationSec: session.durationSec,
        radiusM: session.radiusM,
        requireGps: session.requireGps,
        requireCode: session.requireCode,
        autoPresence: session.autoPresence,
      },
      rosterCount,
      checkIns: checkIns.map((c) => ({
        id: c.id,
        studentId: c.studentId,
        studentName: c.student.name,
        studentPhone: c.student.phone,
        status: c.status,
        distanceM: c.distanceM,
        method: c.method,
        bioVerified: c.bioVerified,
        gpsOk: c.gpsOk,
        flags: c.flags ? JSON.parse(c.flags) : [],
        createdAt: c.createdAt,
      })),
    })
  }

  // STUDENT
  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: session.classId, studentId: user.id } },
  })
  if (!member) return forbidden('You are not a student of this class')

  const mine = await db.checkIn.findUnique({
    where: { sessionId_studentId: { sessionId: id, studentId: user.id } },
  })
  const presentCount = await db.checkIn.count({
    where: { sessionId: id, status: 'PRESENT' },
  })

  return NextResponse.json({
    role: 'STUDENT',
    session: {
      id: session.id,
      classId: session.classId,
      className: session.class.name,
      classCode: session.class.code,
      status: effectiveStatus,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      durationSec: session.durationSec,
      requireGps: session.requireGps,
      requireCode: session.requireCode,
      autoPresence: session.autoPresence,
    },
    rosterCount,
    presentCount,
    myCheckIn: mine
      ? {
          status: mine.status,
          method: mine.method,
          distanceM: mine.distanceM,
          bioVerified: mine.bioVerified,
          flags: mine.flags ? JSON.parse(mine.flags) : [],
          createdAt: mine.createdAt,
        }
      : null,
  })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    return await GET_impl(req, ctx)
  } catch (e) {
    return serverError(e)
  }
}
