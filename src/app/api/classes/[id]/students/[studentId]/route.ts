import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden, requireUser, serverError, unauthorized } from '@/lib/hajira'

/**
 * Remove a student from a class (teacher management).
 *
 * FK-safe order and data correctness: the student's check-ins for THIS
 * class's sessions are deleted with the membership — otherwise the present
 * sheet would keep counting a student who is no longer on the roster.
 * Their account and their data in OTHER classes are untouched.
 */
async function DELETE_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; studentId: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return badRequest('Only teachers can remove students')
  const { id, studentId } = await ctx.params

  const cls = await db.class.findUnique({ where: { id } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')

  const member = await db.membership.findUnique({
    where: { classId_studentId: { classId: id, studentId } },
  })
  if (!member) return NextResponse.json({ error: 'This student is not in the class' }, { status: 404 })

  const removedCheckIns = await db.checkIn.deleteMany({
    where: { studentId, session: { classId: id } },
  })
  await db.membership.delete({ where: { id: member.id } })

  return NextResponse.json({
    ok: true,
    removedCheckIns: removedCheckIns.count,
    message: 'Student removed from this class',
  })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; studentId: string }> }
) {
  try {
    return await DELETE_impl(req, ctx)
  } catch (e) {
    return serverError(e)
  }
}
