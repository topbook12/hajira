import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden, requireUser, unauthorized } from '@/lib/hajira'

type Row = { name: string; phone: string }

/** Teacher bulk-enrolls students: { students: [{name, phone}] } */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return badRequest('শুধু শিক্ষক স্টুডেন্ট যোগ করতে পারেন')
  const { id } = await ctx.params

  const cls = await db.class.findUnique({ where: { id } })
  if (!cls) return NextResponse.json({ error: 'ক্লাস পাওয়া যায়নি' }, { status: 404 })
  if (cls.teacherId !== user.id) return forbidden('এই ক্লাসের শিক্ষক আপনি নন')

  const body = await req.json().catch(() => null)
  const rows: Row[] = Array.isArray(body?.students) ? body.students : []
  const cleaned = rows
    .map((r) => ({ name: String(r?.name || '').trim(), phone: String(r?.phone || '').trim() }))
    .filter((r) => r.name && /^\d{6,15}$/.test(r.phone))
  if (!cleaned.length) return badRequest('কমপক্ষে একজন স্টুডেন্টের নাম ও ফোন দিন')

  let added = 0
  let skipped = 0
  for (const r of cleaned) {
    const student = await db.user.upsert({
      where: { phone: r.phone },
      create: { phone: r.phone, name: r.name, role: 'STUDENT' },
      update: {},
    })
    const exists = await db.membership.findUnique({
      where: { classId_studentId: { classId: id, studentId: student.id } },
    })
    if (exists) {
      skipped++
      continue
    }
    await db.membership.create({ data: { classId: id, studentId: student.id } })
    added++
  }

  return NextResponse.json({ added, skipped })
}
