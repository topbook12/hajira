import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden, requireUser, serverError, unauthorized } from '@/lib/hajira'

/** Teacher manual override: { studentId, status: PRESENT|FLAGGED|ABSENT } */
async function POST_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return forbidden('Teachers only')
  const { id } = await ctx.params

  const session = await db.session.findUnique({
    where: { id },
    include: { class: { select: { teacherId: true } } },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.class.teacherId !== user.id) return forbidden('You are not the teacher of this session')

  const body = await req.json().catch(() => null)
  const studentId = String(body?.studentId || '')
  const status = String(body?.status || '')
  if (!studentId || !['PRESENT', 'FLAGGED', 'ABSENT'].includes(status)) {
    return badRequest('Provide studentId and status (PRESENT/FLAGGED/ABSENT)')
  }

  const checkIn = await db.checkIn.upsert({
    where: { sessionId_studentId: { sessionId: id, studentId } },
    create: {
      sessionId: id,
      studentId,
      status,
      method: 'MANUAL',
      gpsOk: status === 'PRESENT',
    },
    update: { status, method: 'MANUAL', flags: null },
  })

  return NextResponse.json({ checkIn })
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
