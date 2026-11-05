import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden, requireUser, serverError, unauthorized } from '@/lib/hajira'

/**
 * Teacher-initiated password recovery for a student.
 *
 * Pilot reality: there is no SMS/OTP yet, so a student who forgets their
 * password (or loses their phone) would otherwise be permanently locked
 * out. The student's own teacher is the trust anchor — they know the
 * student's face and roster.
 *
 * Effect: the student's password and device binding are cleared. On their
 * next login they claim a new password (the find-or-create flow treats a
 * null passwordHash as "claim it now"), and their next check-in re-binds
 * the device cleanly.
 */
async function POST_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; studentId: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return badRequest('Only teachers can reset student passwords')

  const { id, studentId } = await ctx.params

  const cls = await db.class.findUnique({ where: { id } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')

  // Only students actually enrolled in THIS class can be reset — a teacher
  // can never touch accounts outside their own roster.
  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: id, studentId } },
  })
  if (!member) return badRequest('This student is not enrolled in your class')

  const student = await db.user.findUnique({ where: { id: studentId } })
  if (!student || student.role !== 'STUDENT') {
    return badRequest('Account not found or not a student')
  }

  await db.user.update({
    where: { id: studentId },
    data: { passwordHash: null, deviceId: null },
  })

  return NextResponse.json({
    message: `Password reset for ${student.name} — they sign in next with their phone + a NEW password`,
  })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    return await POST_impl(req, ctx)
  } catch (e) {
    return serverError(e)
  }
}
