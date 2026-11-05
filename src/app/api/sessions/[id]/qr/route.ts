import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  forbidden,
  pinOf,
  payloadOf,
  requireUser,
  serverError,
  SLOT_MS,
  slotOf,
  unauthorized,
} from '@/lib/hajira'

/** Current rotating QR payload + 6-digit PIN for the projector screen (teacher only) */
async function GET_impl(
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

  const slot = slotOf()
  return NextResponse.json({
    payload: payloadOf(session.secret, session.id, slot),
    pin: pinOf(session.secret, session.id, slot),
    slot,
    expiresInSec: Math.max(0, Math.ceil((SLOT_MS * (slot + 1) - Date.now()) / 1000)),
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
