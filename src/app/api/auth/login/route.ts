import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden } from '@/lib/hajira'
import { isTransientDbError } from '@/lib/db'
import { hashPassword, setSessionCookie, verifyPassword } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/rate-limit'
import { normalizeBdPhone } from '@/lib/phone'

/**
 * Sign in — or create an account on first use (find-or-create with password).
 *
 * - Phone numbers are CANONICALIZED (01XXXXXXXXX): 015…, +880152…, 880152…
 *   and 152… all reach the same account on every device.
 * - Accounts are unique per (phone, role): one number may hold a teacher
 *   account AND a student account (pilot reality — teachers demo the
 *   student view on their own phone).
 * - New phone + role -> account created; password is set now. TEACHER role
 *   additionally requires the institute teacher key.
 * - Existing phone + role -> password must match; cross-role matches get a
 *   clear "switch the tab" error instead of a wrong-password lie.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const phone = normalizeBdPhone(String(body?.phone || ''))
    const name = String(body?.name || '').trim()
    const password = String(body?.password || '')
    const role = body?.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'
    const teacherKey = String(body?.teacherKey || '').trim()

    // Brute-force guard: per-phone AND per-IP budgets. Honest errors tell
    // the user how long to wait instead of leaving them confused.
    const byPhone = rateLimit(`login:phone:${phone || 'none'}`, 8, 5 * 60_000)
    const byIp = rateLimit(`login:ip:${clientIp(req)}`, 40, 5 * 60_000)
    const blocked = !byPhone.ok ? byPhone : !byIp.ok ? byIp : null
    if (blocked) {
      return NextResponse.json(
        { error: `Too many attempts — try again in ${Math.max(blocked.retryAfterSec, 5)} seconds` },
        { status: 429, headers: { 'Retry-After': String(Math.max(blocked.retryAfterSec, 5)) } }
      )
    }

    if (!/^\d{6,15}$/.test(phone)) {
      return badRequest('Enter a valid phone number (digits only)')
    }
    if (password.length < 4) {
      return badRequest('Password must be at least 4 characters')
    }

    // Same-role account first — a number may hold BOTH a teacher and a
    // student account, so the same-role row must always win.
    const user = await db.user.findUnique({ where: { phone_role: { phone, role } } })

    if (user) {
      // Existing account
      if (user.passwordHash) {
        if (!verifyPassword(password, user.passwordHash)) {
          return badRequest('Wrong password for this account')
        }
        const res = NextResponse.json({
          user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
        })
        setSessionCookie(res, user.id)
        return res
      }

      // Legacy account (no password yet) — claim it
      if (name && name.length >= 2 && name !== user.name) {
        return badRequest('This phone is registered with a different name')
      }
      const updated = await db.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(password) },
      })
      const res = NextResponse.json({
        user: { id: updated.id, name: updated.name, phone: updated.phone, role: updated.role },
      })
      setSessionCookie(res, updated.id)
      return res
    }

    // New account — but first: does this number exist under the OTHER role?
    // Then the fix is one tap — say so instead of silently creating a dupe.
    const other = await db.user.findUnique({
      where: { phone_role: { phone, role: role === 'TEACHER' ? 'STUDENT' : 'TEACHER' } },
    })
    if (other) {
      return forbidden(
        other.role === 'TEACHER'
          ? 'This number already has a TEACHER account — switch the tab on top to Teacher and sign in'
          : 'This number already has a STUDENT account — switch the tab on top to Student and sign in'
      )
    }

    if (!name || name.length < 2) {
      return badRequest('Enter your full name')
    }
    if (role === 'TEACHER') {
      // Bootstrap rule: the FIRST teacher of this institute signs up without
      // any key — otherwise nobody could ever create the first account.
      // Only AFTER a teacher exists do further teacher signups need the
      // shared key (TEACHER_SIGNUP_KEY env var, default 'HAJIRA-TEACHER').
      const teacherCount = await db.user.count({ where: { role: 'TEACHER' } })
      if (teacherCount > 0) {
        const expected = process.env.TEACHER_SIGNUP_KEY || 'HAJIRA-TEACHER'
        if (teacherKey !== expected) {
          return forbidden(
            'Invalid teacher key — a teacher account already exists for this institute. Ask your department for the institute teacher key.'
          )
        }
      }
    }

    const created = await db.user.create({
      data: { phone, name, role, passwordHash: hashPassword(password) },
    })
    const res = NextResponse.json({
      user: { id: created.id, name: created.name, phone: created.phone, role: created.role },
    })
    setSessionCookie(res, created.id)
    return res
  } catch (e) {
    // A dropped Turso socket is NOT "wrong credentials" — tell the truth so
    // the user retries instead of thinking their password is wrong.
    if (isTransientDbError(e)) {
      return NextResponse.json(
        { error: 'Network hiccup while signing in — please try again' },
        { status: 503 }
      )
    }
    console.error('[api:error][login]', e)
    return badRequest('Sign in failed — please try again')
  }
}
