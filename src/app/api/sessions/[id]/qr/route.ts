import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  forbidden,
  pinOf,
  payloadOf,
  requireUser,
  SLOT_MS,
  slotOf,
  unauthorized,
} from '@/lib/hajira'

/** Current rotating QR payload + 6-digit PIN for the projector screen (teacher only) */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return forbidden('শুধু শিক্ষকের জন্য')
  const { id } = await ctx.params

  const session = await db.session.findUnique({
    where: { id },
    include: { class: { select: { teacherId: true } } },
  })
  if (!session) return NextResponse.json({ error: 'সেশন পাওয়া যায়নি' }, { status: 404 })
  if (session.class.teacherId !== user.id) return forbidden('এই সেশনের শিক্ষক আপনি নন')

  const t = slotOf()
  const slot = session.endsAt.getTime() < Date.now() ? t : t
  return NextResponse.json({
    payload: payloadOf(session.secret, session.id, slot),
    pin: pinOf(session.secret, session.id, slot),
    slot,
    expiresInSec: Math.max(0, Math.ceil((SLOT_MS * (slot + 1) - Date.now()) / 1000)),
  })
}
