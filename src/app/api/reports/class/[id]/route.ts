import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, requireUser, serverError, unauthorized } from '@/lib/hajira'

/** Class attendance report: per-student %, eligibility flag (teacher only) */
async function GET_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return forbidden('Teachers only')
  const { id } = await ctx.params

  const cls = await db.class.findUnique({ where: { id } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')

  const url = new URL(req.url)
  const threshold = Math.min(
    Math.max(Number(url.searchParams.get('threshold')) || cls.threshold || 70, 0),
    100
  )

  const [roster, sessions] = await Promise.all([
    db.membership.findMany({
      where: { classId: id },
      include: { student: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.session.findMany({
      where: { classId: id },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true, status: true },
    }),
  ])

  const total = sessions.length
  const sessionIds = new Set(sessions.map((s) => s.id))
  const checkIns = await db.checkIn.findMany({
    where: { session: { classId: id } },
    select: { studentId: true, status: true, sessionId: true },
  })

  const stats = new Map<string, { present: number; flagged: number }>()
  // matrix[studentId][sessionId] = 'PRESENT' | 'FLAGGED' — the present-sheet grid
  const matrix: Record<string, Record<string, string>> = {}
  for (const c of checkIns) {
    if (!sessionIds.has(c.sessionId)) continue
    const s = stats.get(c.studentId) || { present: 0, flagged: 0 }
    if (c.status === 'PRESENT') s.present++
    else if (c.status === 'FLAGGED') s.flagged++
    stats.set(c.studentId, s)
    if (c.status === 'PRESENT' || c.status === 'FLAGGED') {
      ;(matrix[c.studentId] ??= {})[c.sessionId] = c.status
    }
  }

  // present count per session (for the grid footer)
  const presentPerSession = new Map<string, number>()
  for (const c of checkIns) {
    if (c.status === 'PRESENT') {
      presentPerSession.set(c.sessionId, (presentPerSession.get(c.sessionId) ?? 0) + 1)
    }
  }

  const rows = roster.map((m) => {
    const s = stats.get(m.student.id) || { present: 0, flagged: 0 }
    const absent = total - s.present - s.flagged
    const pct = total ? Math.round((s.present / total) * 100) : 0
    return {
      studentId: m.student.id,
      name: m.student.name,
      phone: m.student.phone,
      present: s.present,
      flagged: s.flagged,
      absent: Math.max(0, absent),
      pct,
      eligible: pct >= threshold,
    }
  })
  rows.sort((a, b) => b.pct - a.pct)

  return NextResponse.json({
    cls: { id: cls.id, name: cls.name, code: cls.code },
    totalSessions: total,
    threshold,
    rows,
    sessions: sessions.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      status: s.status,
      presentCount: presentPerSession.get(s.id) ?? 0,
    })),
    matrix,
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
