import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, serverError, unauthorized } from '@/lib/hajira'

/** Active sessions relevant to the current user (teacher: own classes, student: enrolled classes) */
async function GET_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const now = new Date()
  const base = {
    status: 'ACTIVE' as const,
    endsAt: { gt: now },
  }

  if (user.role === 'TEACHER') {
    const sessions = await db.session.findMany({
      where: { ...base, class: { teacherId: user.id } },
      include: { class: { select: { name: true, code: true } } },
      orderBy: { startedAt: 'desc' },
    })
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        classId: s.classId,
        className: s.class.name,
        classCode: s.class.code,
        requireGps: s.requireGps,
        requireCode: s.requireCode,
        autoPresence: s.autoPresence,
        endsAt: s.endsAt,
        durationSec: s.durationSec,
        startedAt: s.startedAt,
      })),
    })
  }

  const sessions = await db.session.findMany({
    where: { ...base, class: { memberships: { some: { studentId: user.id } } } },
    include: {
      class: { select: { name: true, code: true, teacher: { select: { name: true } } } },
    },
    orderBy: { startedAt: 'desc' },
  })

  // Which of these has this student already checked into? One indexed query
  // replaces the N per-session lookups the Home screen used to make —
  // 4+ requests per poll become 1 (less mobile data, less DB load, lower cost).
  const sessionIds = sessions.map((s) => s.id)
  const mine = sessionIds.length
    ? await db.checkIn.findMany({
        where: { studentId: user.id, sessionId: { in: sessionIds } },
        select: { sessionId: true },
      })
    : []

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.class.name,
      classCode: s.class.code,
      teacherName: s.class.teacher.name,
      requireGps: s.requireGps,
      requireCode: s.requireCode,
      autoPresence: s.autoPresence,
      endsAt: s.endsAt,
      durationSec: s.durationSec,
      startedAt: s.startedAt,
    })),
    checkedSessionIds: mine.map((m) => m.sessionId),
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
