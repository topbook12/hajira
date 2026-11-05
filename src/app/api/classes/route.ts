import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, randomClassCode, requireUser, unauthorized } from '@/lib/hajira'

/** Teacher creates a class */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return badRequest('Only teachers can create classes')

  const body = await req.json().catch(() => null)
  const name = String(body?.name || '').trim()
  if (!name) return badRequest('Provide a class name')

  let code = randomClassCode()
  for (let i = 0; i < 5; i++) {
    const exists = await db.class.findUnique({ where: { code } })
    if (!exists) break
    code = randomClassCode()
  }

  const cls = await db.class.create({
    data: { name, code, teacherId: user.id },
  })
  return NextResponse.json({ cls })
}
