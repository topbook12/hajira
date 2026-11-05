import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, serverError, unauthorized } from '@/lib/hajira'

/**
 * Student analytics — the "everything in one place" feed.
 *
 * One call powers the whole Analysis tab:
 *   totals   — overall %, attended/flagged counts, current + best streak
 *   perClass — per-class %, attended/absent, RANK among classmates
 *   timeline — last 30 sessions (chronological) for the trend chart
 *   recent   — last 10 check-ins for the activity feed
 */
async function GET_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'STUDENT') {
    return NextResponse.json({ error: 'Students only' }, { status: 403 })
  }

  const memberships = await db.membership.findMany({
    where: { studentId: user.id },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          code: true,
          threshold: true,
          teacher: { select: { name: true } },
          _count: { select: { memberships: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const classIds = memberships.map((m) => m.class.id)
  const classById = new Map(memberships.map((m) => [m.class.id, m.class]))

  if (classIds.length === 0) {
    return NextResponse.json({
      totals: {
        classes: 0,
        totalSessions: 0,
        attendedSessions: 0,
        flaggedSessions: 0,
        overallPct: 0,
        currentStreak: 0,
        bestStreak: 0,
      },
      perClass: [],
      timeline: [],
      recent: [],
    })
  }

  const [sessions, myCheckIns] = await Promise.all([
    db.session.findMany({
      where: { classId: { in: classIds } },
      select: { id: true, classId: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
    }),
    db.checkIn.findMany({
      where: { studentId: user.id, session: { classId: { in: classIds } } },
      select: {
        id: true,
        sessionId: true,
        status: true,
        method: true,
        distanceM: true,
        gpsOk: true,
        bioVerified: true,
        createdAt: true,
        session: {
          select: { classId: true, startedAt: true, class: { select: { name: true } } },
        },
      },
    }),
  ])

  const myBySession = new Map(myCheckIns.map((c) => [c.sessionId, c]))
  const presentByClass = new Map<string, number>()
  for (const s of sessions) {
    const c = myBySession.get(s.id)
    if (c && c.status === 'PRESENT') {
      presentByClass.set(s.classId, (presentByClass.get(s.classId) ?? 0) + 1)
    }
  }

  // Rank within each class: PRESENT check-ins grouped over ALL students.
  const rankByClass = new Map<string, { rank: number; size: number }>()
  await Promise.all(
    classIds.map(async (cid) => {
      const [board, size] = await Promise.all([
        db.checkIn.groupBy({
          by: ['studentId'],
          where: { session: { classId: cid }, status: 'PRESENT' },
          _count: { _all: true },
        }),
        db.membership.count({ where: { classId: cid } }),
      ])
      const mine = presentByClass.get(cid) ?? 0
      const above = board.filter((b) => b._count._all > mine).length
      rankByClass.set(cid, { rank: above + 1, size })
    })
  )

  const perClass = memberships.map((m) => {
    const cid = m.class.id
    const total = sessions.filter((s) => s.classId === cid).length
    const present = presentByClass.get(cid) ?? 0
    const flagged = myCheckIns.filter(
      (c) => c.session.classId === cid && c.status === 'FLAGGED'
    ).length
    const r = rankByClass.get(cid)
    return {
      id: cid,
      name: m.class.name,
      code: m.class.code,
      teacherName: m.class.teacher.name,
      total,
      present,
      flagged,
      absent: Math.max(0, total - present - flagged),
      pct: total ? Math.round((present / total) * 100) : 0,
      rank: total ? (r?.rank ?? 1) : null,
      classSize: r?.size ?? m.class._count.memberships,
    }
  })

  // Chronological timeline (last 30) — null status = absent
  const lastSessions = sessions.slice(-30)
  const timeline = lastSessions.map((s) => {
    const c = myBySession.get(s.id)
    return {
      id: s.id,
      at: s.startedAt,
      className: classById.get(s.classId)?.name ?? 'Class',
      status: (c?.status === 'PRESENT' || c?.status === 'FLAGGED' ? c.status : null) as
        | 'PRESENT'
        | 'FLAGGED'
        | null,
    }
  })

  // Streaks count showing up in person (PRESENT or FLAGGED = was there)
  let currentStreak = 0
  let bestStreak = 0
  let run = 0
  for (const t of timeline) {
    if (t.status) {
      run++
      bestStreak = Math.max(bestStreak, run)
    } else {
      run = 0
    }
  }
  // current streak walks backwards from the most recent session
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].status) currentStreak++
    else break
  }
  if (timeline.length === 30) {
    // last-30 window only — never claim more than what we can see
    currentStreak = Math.min(currentStreak, 30)
    bestStreak = Math.min(bestStreak, 30)
  }

  const attendedSessions = myCheckIns.filter((c) => c.status === 'PRESENT').length
  const flaggedSessions = myCheckIns.filter((c) => c.status === 'FLAGGED').length
  const totalSessions = sessions.length

  const recent = [...myCheckIns]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      at: c.createdAt,
      className: c.session.class.name,
      status: c.status as 'PRESENT' | 'FLAGGED' | 'ABSENT',
      method: c.method,
      distanceM: c.distanceM,
      gpsOk: c.gpsOk,
      bioVerified: c.bioVerified,
    }))

  return NextResponse.json({
    totals: {
      classes: classIds.length,
      totalSessions,
      attendedSessions,
      flaggedSessions,
      overallPct: totalSessions ? Math.round((attendedSessions / totalSessions) * 100) : 0,
      currentStreak,
      bestStreak,
    },
    perClass,
    timeline,
    recent,
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
