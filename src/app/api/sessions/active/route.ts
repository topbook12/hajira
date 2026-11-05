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
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      classId: s.classId,
      className: s.class.name,
      classCode: s.class.code,
      teacherName: s.class.teacher.name,
      requireGps: s.requireGps,
      requireCode: s.requireCode,
      endsAt: s.endsAt,
      durationSec: s.durationSec,
      startedAt: s.startedAt,
    })),
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
