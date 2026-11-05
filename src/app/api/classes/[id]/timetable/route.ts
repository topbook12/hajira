import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden, requireUser, serverError, unauthorized } from '@/lib/hajira'

type SlotInput = { dayOfWeek: number; startMin: number; endMin: number; room?: string | null }

function normalizeSlots(raw: unknown): { ok: true; slots: SlotInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'slots must be an array' }
  const seen = new Set<string>()
  const slots: SlotInput[] = []
  for (const s of raw) {
    const day = Number(s?.dayOfWeek)
    const startMin = Number(s?.startMin)
    const endMin = Number(s?.endMin)
    const room = s?.room == null ? null : String(s.room).trim().slice(0, 60) || null
    if (!Number.isInteger(day) || day < 0 || day > 6) return { ok: false, error: 'dayOfWeek must be 0 (Sun) … 6 (Sat)' }
    if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439) return { ok: false, error: 'startMin must be 0–1439 (minutes from midnight)' }
    if (!Number.isInteger(endMin) || endMin < 1 || endMin > 1440) return { ok: false, error: 'endMin must be 1–1440 (minutes from midnight)' }
    if (endMin <= startMin) return { ok: false, error: 'End time must be after the start time' }
    const key = `${day}:${startMin}`
    if (seen.has(key)) return { ok: false, error: 'Two slots repeat the same day and start time' }
    seen.add(key)
    slots.push({ dayOfWeek: day, startMin, endMin, room })
  }
  return { ok: true, slots }
}

/** Weekly timetable of a class — teacher (owner) or enrolled student */
async function GET_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  const { id } = await ctx.params

  const cls = await db.class.findUnique({ where: { id } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  if (user.role === 'TEACHER') {
    if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')
  } else {
    const member = await db.membership.findUnique({
      where: { classId_studentId: { classId: id, studentId: user.id } },
    })
    if (!member) return forbidden('You are not a student of this class')
  }

  const slots = await db.classSlot.findMany({
    where: { classId: id },
    orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
  })
  return NextResponse.json({ slots })
}

/** Replace the whole weekly timetable (teacher only) */
async function PUT_impl(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return forbidden('Teachers only')
  const { id } = await ctx.params

  const cls = await db.class.findUnique({ where: { id } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')

  const body = await req.json().catch(() => null)
  const norm = normalizeSlots(body?.slots)
  if (!norm.ok) return badRequest(norm.error)

  // Replace-all in one transaction: the client edits a local copy and saves
  // once, so this is the simplest correct contract (no diffing bugs).
  await db.$transaction([
    db.classSlot.deleteMany({ where: { classId: id } }),
    db.classSlot.createMany({
      data: norm.slots.map((s) => ({ ...s, classId: id })),
    }),
  ])

  const saved = await db.classSlot.findMany({
    where: { classId: id },
    orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
  })
  return NextResponse.json({ saved })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    return await GET_impl(req, ctx)
  } catch (e) {
    return serverError(e)
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    return await PUT_impl(req, ctx)
  } catch (e) {
    return serverError(e)
  }
}
