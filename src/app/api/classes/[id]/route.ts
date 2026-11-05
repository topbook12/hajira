import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, requireUser, serverError, unauthorized } from '@/lib/hajira'

/** Role-aware class detail: teacher gets roster+sessions, student gets own history */
async function GET_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const cls = await db.class.findUnique({
    where: { id },
    include: { teacher: { select: { name: true } } },
  })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const sessions = await db.session.findMany({
    where: { classId: id },
    orderBy: { startedAt: 'desc' },
    take: 30,
    include: { _count: { select: { checkIns: { where: { status: 'PRESENT' } } } } },
  })

  if (user.role === 'TEACHER') {
    if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')
    const memberships = await db.membership.findMany({
      where: { classId: id },
      include: { student: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    })

    // Per-student attendance over ALL sessions of this class
    const totalSessions = await db.session.count({ where: { classId: id } })
    const roster = await Promise.all(
      memberships.map(async (m) => {
        const present = await db.checkIn.count({
          where: { studentId: m.student.id, status: 'PRESENT', session: { classId: id } },
        })
        return {
          id: m.student.id,
          name: m.student.name,
          phone: m.student.phone,
          presentCount: present,
          pct: totalSessions ? Math.round((present / totalSessions) * 100) : null,
        }
      })
    )

    return NextResponse.json({
      role: 'TEACHER',
      cls: { id: cls.id, name: cls.name, code: cls.code, teacherName: cls.teacher.name, threshold: cls.threshold },
      roster,
      totalSessions,
      sessions: sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        status: s.status,
        endsAt: s.endsAt,
        presentCount: s._count.checkIns,
      })),
    })
  }

  // STUDENT
  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: id, studentId: user.id } },
  })
  if (!member) return forbidden('You are not a student of this class')

  const myCheckIns = await db.checkIn.findMany({
    where: { studentId: user.id, session: { classId: id } },
  })
  const bySession = new Map(myCheckIns.map((c) => [c.sessionId, c]))
  const presentCount = myCheckIns.filter((c) => c.status === 'PRESENT').length
  // % is computed over ALL sessions of the class (matches /api/me),
  // not just the 30 most recent ones shown below
  const totalSessions = await db.session.count({ where: { classId: id } })
  const pct = totalSessions ? Math.round((presentCount / totalSessions) * 100) : 0

  return NextResponse.json({
    role: 'STUDENT',
    cls: { id: cls.id, name: cls.name, code: cls.code, teacherName: cls.teacher.name, threshold: cls.threshold },
    myPct: pct,
    sessions: sessions.map((s) => {
      const mine = bySession.get(s.id)
      return {
        id: s.id,
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        status: s.status,
        myStatus: mine ? mine.status : 'ABSENT',
        myMethod: mine ? mine.method : null,
      }
    }),
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
