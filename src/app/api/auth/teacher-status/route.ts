import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Does this institute already have a teacher account?
 *
 * Public on purpose — it leaks nothing but a boolean, and it lets the login
 * screen adapt: when NO teacher exists yet, the teacher-key field is hidden
 * entirely ("you'll be the first teacher — no key needed"); when one exists,
 * the field is shown with clear instructions instead of a mysterious
 * "(optional)" box that fails with an error nobody understands.
 *
 * `teacherExists: null` = could not check (DB hiccup) — the UI then keeps a
 * neutral field and the login route still enforces the real rule anyway.
 */
export async function GET() {
  try {
    const teacherCount = await db.user.count({ where: { role: 'TEACHER' } })
    return NextResponse.json(
      { teacherExists: teacherCount > 0 },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('[api:error][teacher-status]', e)
    return NextResponse.json(
      { teacherExists: null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
