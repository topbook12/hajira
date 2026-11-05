import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, unauthorized } from '@/lib/hajira'

/** Active sessions relevant to the current user (teacher: own classes, student: enrolled classes) */
export async function GET(req: NextRequest) {
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
      endsAt: s.endsAt,
      durationSec: s.durationSec,
      startedAt: s.startedAt,
    })),
  })
}
