import * as XLSX from 'xlsx'

/**
 * Excel correctness helpers.
 *
 * Times were previously formatted with `toISOString()` / `getDate()` — both
 * are UTC. Bangladesh is UTC+6, so a 09:00 class exported as "03:00" (and a
 * session started 00:15 Dhaka time even landed on the previous sheet day).
 * Every date/time an exported sheet shows is now formatted in Asia/Dhaka —
 * the timezone the teacher and students actually live in — no matter where
 * the server runs (Vercel edges are UTC).
 */

const TZ = 'Asia/Dhaka'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Split an instant into Dhaka wall-clock parts (all numeric strings). */
function dhakaParts(d: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  )
}

/** "05 Nov" — the Present Sheet column label (Dhaka calendar day). */
export function dhakaDate(d: Date): string {
  const p = dhakaParts(d)
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]}`
}

/** "2025-11-05" — sortable ISO date in Dhaka time. */
export function dhakaDateISO(d: Date): string {
  const p = dhakaParts(d)
  return `${p.year}-${p.month}-${p.day}`
}

/** "09:30" — Dhaka wall clock, 24h. */
export function dhakaTime(d: Date): string {
  const p = dhakaParts(d)
  return `${p.hour}:${p.minute}`
}

/** "09:30:15" — Dhaka wall clock with seconds (check-in ledger). */
export function dhakaTimeSec(d: Date): string {
  const p = dhakaParts(d)
  return `${p.hour}:${p.minute}:${p.second}`
}

/** "05 Nov 2025, 09:30 — Dhaka time (UTC+6)" — the "Exported" stamp. */
export function dhakaStamp(d: Date = new Date()): string {
  const p = dhakaParts(d)
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute} — Dhaka time (UTC+6)`
}

/**
 * Give every column a realistic width so Bengali/long names and the P/F/A
 * grid never render truncated or #### in Excel/Sheets.
 */
export function setColWidths(
  ws: XLSX.WorkSheet,
  rows: Record<string, string | number>[],
  max = 34
): void {
  const keys = Object.keys(rows[0] ?? {})
  if (keys.length === 0) return
  ws['!cols'] = keys.map((k) => {
    let w = Math.max(k.length + 2, 8)
    for (const r of rows) {
      const v = r[k]
      if (v != null) w = Math.max(w, String(v).length + 2)
    }
    return { wch: Math.min(w, max) }
  })
}
