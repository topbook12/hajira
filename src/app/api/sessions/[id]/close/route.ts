import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { forbidden, requireUser, unauthorized } from '@/lib/hajira'

/** Teacher closes the session */
export async function POST(
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
  if (!session) return NextResponse.json({ error: 'সেশন পাওয়া যায়নি' }, { status: 404 })
  if (session.class.teacherId !== user.id) return forbidden('এই সেশনের শিক্ষক আপনি নন')

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
