import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { forbidden, requireUser, unauthorized } from '@/lib/hajira'

/**
 * Excel export — the teacher's portable, offline copy of all attendance data.
 *
 * 3 sheets:
 *   1. Summary      — per-student % and exam eligibility
 *   2. Sessions     — one row per attendance session
 *   3. Check-in Log — one row per recorded check-in (the raw ledger)
 *
 * Workbooks are tiny (a full class-year is a few hundred KB), which is why
 * Excel is Hajira's long-term archive format while the cloud DB stays lean.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') return forbidden('Teachers only')
  const { id } = await ctx.params

  const cls = await db.class.findUnique({ where: { id }, include: { teacher: true } })
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  if (cls.teacherId !== user.id) return forbidden('You are not the teacher of this class')

  const [roster, sessions, checkIns] = await Promise.all([
    db.membership.findMany({
      where: { classId: id },
      include: { student: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.session.findMany({
      where: { classId: id },
      orderBy: { startedAt: 'asc' },
      include: { _count: { select: { checkIns: { where: { status: 'PRESENT' } } } } },
    }),
    db.checkIn.findMany({
      where: { session: { classId: id } },
      include: {
        student: { select: { name: true, phone: true } },
        session: { select: { startedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const total = sessions.length
  const presentByStudent = new Map<string, number>()
  const flaggedByStudent = new Map<string, number>()
  for (const c of checkIns) {
    if (c.status === 'PRESENT') {
      presentByStudent.set(c.studentId, (presentByStudent.get(c.studentId) ?? 0) + 1)
    } else if (c.status === 'FLAGGED') {
      flaggedByStudent.set(c.studentId, (flaggedByStudent.get(c.studentId) ?? 0) + 1)
    }
  }

  // Sheet 1 — Summary
  const summaryRows = roster.map((m) => {
    const present = presentByStudent.get(m.studentId) ?? 0
    const flagged = flaggedByStudent.get(m.studentId) ?? 0
    const pct = total ? Math.round((present / total) * 100) : 0
    return {
      Name: m.student.name,
      Phone: m.student.phone,
      Sessions: total,
      Present: present,
      Flagged: flagged,
      Absent: Math.max(0, total - present - flagged),
      'Attendance %': `${pct}%`,
      Eligibility: pct >= cls.threshold ? 'Eligible' : 'At risk',
    }
  })

  // Sheet 2 — Sessions
  const sessionRows = sessions.map((s) => ({
    Date: s.startedAt.toISOString().slice(0, 10),
    Started: s.startedAt.toISOString().slice(11, 16),
    Ended: s.endsAt.toISOString().slice(11, 16),
    Status: s.status === 'ACTIVE' ? 'Live/Active' : 'Closed',
    'Present (verified)': s._count.checkIns,
    'GPS radius (m)': s.radiusM,
    'GPS required': s.requireGps ? 'Yes' : 'No',
    'Code required': s.requireCode ? 'Yes' : 'No',
  }))

  // Sheet 3 — Check-in Log
  const logRows = checkIns.map((c) => {
    let flags: string = ''
    try {
      flags = c.flags ? JSON.parse(c.flags).join('; ') : ''
    } catch {
      flags = c.flags ?? ''
    }
    return {
      Date: c.createdAt.toISOString().slice(0, 10),
      Time: c.createdAt.toISOString().slice(11, 19),
      Student: c.student.name,
      Phone: c.student.phone,
      Status: c.status,
      Method: c.method,
      'Distance (m)': c.distanceM ?? '',
      'GPS OK': c.gpsOk ? 'Yes' : 'No',
      'Fingerprint': c.bioVerified ? 'Yes' : 'No',
      Flags: flags,
    }
  })

  const wb = XLSX.utils.book_new()
  const info = [
    { Field: 'Class', Value: cls.name },
    { Field: 'Join code', Value: cls.code },
    { Field: 'Teacher', Value: cls.teacher.name },
    { Field: 'Total sessions', Value: total },
    { Field: 'Students', Value: roster.length },
    { Field: 'Eligibility threshold', Value: `${cls.threshold}%` },
    { Field: 'Exported', Value: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
    { Field: 'Exported by', Value: user.name },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Class Info')
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(summaryRows.length ? summaryRows : [{ Name: '—', Note: 'No students yet' }]),
    'Summary'
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sessionRows.length ? sessionRows : [{ Note: 'No sessions yet' }]),
    'Sessions'
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(logRows.length ? logRows : [{ Note: 'No check-ins yet' }]),
    'Check-in Log'
  )

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const safeName = cls.name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'class'
  const filename = `Hajira_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    },
  })
}
