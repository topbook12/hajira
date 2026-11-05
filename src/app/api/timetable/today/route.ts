import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, serverError, unauthorized } from '@/lib/hajira'

/** Today's classes for the signed-in student across all enrolled classes */
async function GET_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  // JS getDay(): 0 = Sunday … 6 = Saturday — same convention as ClassSlot.
  const day = new Date().getDay()

  const slots = await db.classSlot.findMany({
    where: {
      dayOfWeek: day,
      class: { memberships: { some: { studentId: user.id } } },
    },
    include: { class: { select: { name: true, code: true } } },
    orderBy: { startMin: 'asc' },
  })

  return NextResponse.json({
    day,
    slots: slots.map((s) => ({
      classId: s.classId,
      className: s.class.name,
      classCode: s.class.code,
      startMin: s.startMin,
      endMin: s.endMin,
      room: s.room,
    })),
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
