import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, requireUser, serverError, sweepAutoAbsences, unauthorized } from '@/lib/hajira'

/** Teacher closes the session */
async function POST_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const session = await db.session.findUnique({
    where: { id },
    include: { class: { select: { teacherId: true } } },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.class.teacherId !== user.id) return forbidden('You are not the teacher of this session')

  // AUTO PRESENCE: the window is closing — every roster student who was
  // never counted inside it becomes ABSENT explicitly (the whole point of
  // the mode: present = seen in range, everyone else = absent). Idempotent.
  if (session.autoPresence) {
    await sweepAutoAbsences(id, session.classId)
  }

  const updated = await db.session.update({
    where: { id },
    data: { status: 'CLOSED' },
  })
  const presentCount = await db.checkIn.count({
    where: { sessionId: id, status: 'PRESENT' },
  })
  const rosterCount = await db.membership.count({ where: { classId: session.classId } })

  return NextResponse.json({
    session: updated,
    summary: { presentCount, rosterCount },
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
