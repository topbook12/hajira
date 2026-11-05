import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, unauthorized } from '@/lib/hajira'

/** Student joins a class by code */
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'STUDENT') return badRequest('শুধু শিক্ষার্থী ক্লাসে যুক্ত হতে পারে')

  const body = await req.json().catch(() => null)
  const code = String(body?.code || '').trim().toUpperCase()
  if (!code) return badRequest('ক্লাস কোড দিন')

  const cls = await db.class.findUnique({ where: { code } })
  if (!cls) return badRequest('এই কোডে কোনো ক্লাস পাওয়া যায়নি')

  await db.membership.upsert({
    where: { classId_studentId: { classId: cls.id, studentId: user.id } },
    create: { classId: cls.id, studentId: user.id },
    update: {},
  })

  return NextResponse.json({ cls: { id: cls.id, name: cls.name, code: cls.code } })
}
