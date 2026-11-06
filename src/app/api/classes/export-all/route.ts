import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { requireUser, serverError, unauthorized } from '@/lib/hajira'
import { dhakaDate, dhakaStamp, setColWidths } from '@/lib/excel'

/**
 * Export ALL of a teacher's classes in one workbook — the full semester
 * archive in a single file.
 *
 *   Sheet 1 "Overview"     — one row per class (students, sessions, avg %)
 *   Sheet per class        — the classic Present Sheet grid:
 *                            rows = students, columns = sessions, P/F/A + %
 *
 * Sheet names use the class join code (unique, Excel-safe); a numeric suffix
 * keeps them within Excel's 31-character limit in the unlikely collision case.
 */
async function GET_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()
  if (user.role !== 'TEACHER') {
    return NextResponse.json({ error: 'Teachers only' }, { status: 403 })
  }

  const classes = await db.class.findMany({
    where: { teacherId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { memberships: true, sessions: true } } },
  })

  const dateLabel = (d: Date) => dhakaDate(d)
  const usedNames = new Set<string>(['Overview'])
  const overview: Record<string, string | number>[] = []

  const wb = XLSX.utils.book_new()

  for (const cls of classes) {
    const [roster, sessions, checkIns] = await Promise.all([
      db.membership.findMany({
        where: { classId: cls.id },
        include: { student: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.session.findMany({
        where: { classId: cls.id },
        orderBy: { startedAt: 'asc' },
        select: { id: true, startedAt: true },
      }),
      db.checkIn.findMany({
        where: { session: { classId: cls.id } },
        select: { studentId: true, status: true, sessionId: true },
      }),
    ])

    const total = sessions.length
    const presentByStudent = new Map<string, number>()
    const flaggedByStudent = new Map<string, number>()
    const byStudent = new Map<string, Map<string, string>>()
    for (const c of checkIns) {
      if (c.status === 'PRESENT' || c.status === 'FLAGGED') {
        const row = byStudent.get(c.studentId) ?? new Map<string, string>()
        row.set(c.sessionId, c.status === 'PRESENT' ? 'P' : 'F')
        byStudent.set(c.studentId, row)
      }
      if (c.status === 'PRESENT') {
        presentByStudent.set(c.studentId, (presentByStudent.get(c.studentId) ?? 0) + 1)
      } else if (c.status === 'FLAGGED') {
        flaggedByStudent.set(c.studentId, (flaggedByStudent.get(c.studentId) ?? 0) + 1)
      }
    }

    // class average
    const capacity = total * roster.length
    const presentTotal = [...presentByStudent.values()].reduce((a, b) => a + b, 0)
    const avgPct = capacity ? Math.round((presentTotal / capacity) * 100) : 0
    overview.push({
      Class: cls.name,
      Code: cls.code,
      Students: roster.length,
      Sessions: total,
      'Average attendance %': avgPct,
      Threshold: `${cls.threshold}%`,
    })

    // Present Sheet grid for this class
    const dateCount = new Map<string, number>()
    const colLabels = sessions.map((s) => {
      const base = dateLabel(s.startedAt)
      const n = (dateCount.get(base) ?? 0) + 1
      dateCount.set(base, n)
      return n > 1 ? `${base} #${n}` : base
    })

    const rows: Record<string, string | number>[] = roster.map((m, i) => {
      const marks = byStudent.get(m.studentId)
      const present = presentByStudent.get(m.studentId) ?? 0
      const flagged = flaggedByStudent.get(m.studentId) ?? 0
      const pct = total ? Math.round((present / total) * 100) : 0
      const row: Record<string, string | number> = {
        SL: i + 1,
        Name: m.student.name,
        Phone: m.student.phone,
      }
      sessions.forEach((s, idx) => {
        row[colLabels[idx]] = marks?.get(s.id) ?? 'A'
      })
      row['P'] = present
      row['F'] = flagged
      row['A'] = Math.max(0, total - present - flagged)
      row['%'] = `${pct}%`
      row['Eligibility'] = pct >= cls.threshold ? 'Eligible' : 'At risk'
      return row
    })

    // unique, Excel-safe sheet name (≤31 chars)
    let name = (cls.code || cls.name).replace(/[[\]:*?/\\]/g, '-').slice(0, 28) || 'Class'
    let n = 2
    while (usedNames.has(name)) {
      name = `${name.slice(0, 26)}_${n++}`
    }
    usedNames.add(name)
    const sheetRowsOut = rows.length ? rows : [{ Name: '—', Note: 'No students yet' }]
    const ws = XLSX.utils.json_to_sheet(sheetRowsOut)
    setColWidths(ws, sheetRowsOut)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const info = [
    { Field: 'Teacher', Value: user.name },
    { Field: 'Classes', Value: classes.length },
    { Field: 'Exported', Value: dhakaStamp() },
    { Field: 'Note', Value: 'One Present Sheet per class — P = present, F = flagged, A = absent. Dates and times are Dhaka time (UTC+6).' },
  ]
  const infoWs = XLSX.utils.json_to_sheet(info)
  setColWidths(infoWs, info)
  XLSX.utils.book_append_sheet(wb, infoWs, 'Read Me')
  const overviewRows = overview.length ? overview : [{ Note: 'No classes yet' }]
  const overviewWs = XLSX.utils.json_to_sheet(overviewRows)
  setColWidths(overviewWs, overviewRows)
  XLSX.utils.book_append_sheet(wb, overviewWs, 'Overview')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `Hajira_All_Classes_${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    },
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
