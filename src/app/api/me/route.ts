import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, serverError, unauthorized } from '@/lib/hajira'

function pub(u: { id: string; name: string; phone: string; role: string }) {
  return { id: u.id, name: u.name, phone: u.phone, role: u.role }
}

/** Current user + role-aware class list with stats */
async function GET_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  if (user.role === 'TEACHER') {
    const classes = await db.class.findMany({
      where: { teacherId: user.id },
      include: {
        _count: { select: { memberships: true, sessions: true } },
        sessions: {
          where: { status: 'ACTIVE', endsAt: { gt: new Date() } },
          take: 1,
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Class average attendance = PRESENT check-ins / (sessions × roster)
    const withStats = await Promise.all(
      classes.map(async (c) => {
        const present = await db.checkIn.count({
          where: { status: 'PRESENT', session: { classId: c.id } },
        })
        const capacity = c._count.sessions * c._count.memberships
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          studentCount: c._count.memberships,
          totalSessions: c._count.sessions,
          avgPct: capacity ? Math.round((present / capacity) * 100) : 0,
          activeSessionId: c.sessions[0]?.id ?? null,
        }
      })
    )

    const totals = withStats.reduce(
      (acc, c) => ({
        students: acc.students + c.studentCount,
        sessions: acc.sessions + c.totalSessions,
      }),
      { students: 0, sessions: 0 }
    )

    return NextResponse.json({
      user: pub(user),
      classes: withStats,
      totals: {
        classes: withStats.length,
        students: totals.students,
        sessions: totals.sessions,
        avgPct: withStats.length
          ? Math.round(withStats.reduce((s, c) => s + c.avgPct, 0) / withStats.length)
          : 0,
      },
    })
  }

  // STUDENT: enrolled classes with attendance %
  const memberships = await db.membership.findMany({
    where: { studentId: user.id },
    include: { class: { include: { teacher: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  })

  const classes = await Promise.all(
    memberships.map(async (m) => {
      const classId = m.class.id
      const [total, present] = await Promise.all([
        db.session.count({ where: { classId } }),
        db.checkIn.count({
          where: { studentId: user.id, status: 'PRESENT', session: { classId } },
        }),
      ])
      return {
        id: classId,
        name: m.class.name,
        code: m.class.code,
        teacherName: m.class.teacher.name,
        totalSessions: total,
        attendedSessions: present,
        myPct: total ? Math.round((present / total) * 100) : 0,
      }
    })
  )

  const totalSessions = classes.reduce((s, c) => s + c.totalSessions, 0)
  const attendedSessions = classes.reduce((s, c) => s + c.attendedSessions, 0)

  return NextResponse.json({
    user: pub(user),
    classes,
    totals: {
      classes: classes.length,
      totalSessions,
      attendedSessions,
      overallPct: totalSessions ? Math.round((attendedSessions / totalSessions) * 100) : 0,
    },
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
