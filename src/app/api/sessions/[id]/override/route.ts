import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden, requireUser, unauthorized } from '@/lib/hajira'

/** Teacher manual override: { studentId, status: PRESENT|FLAGGED|ABSENT } */
export async function POST(
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

  const body = await req.json().catch(() => null)
  const studentId = String(body?.studentId || '')
  const status = String(body?.status || '')
  if (!studentId || !['PRESENT', 'FLAGGED', 'ABSENT'].includes(status)) {
    return badRequest('স্টুডেন্ট ও স্ট্যাটাস দিন (PRESENT/FLAGGED/ABSENT)')
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
