import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, serverError, unauthorized } from '@/lib/hajira'

/** Student joins a class by code */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'STUDENT') return badRequest('Only students can join classes')

  const body = await req.json().catch(() => null)
  const code = String(body?.code || '').trim().toUpperCase()
  if (!code) return badRequest('Enter the class code')

  const cls = await db.class.findUnique({ where: { code } })
  if (!cls) return badRequest('No class found for this code')

  await db.membership.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: user.id } },
    create: { classId: cls.id, studentId: user.id },
    update: {},
  })

  return NextResponse.json({ cls: { id: cls.id, name: cls.name, code: cls.code } })
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
