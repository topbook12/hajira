import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, forbidden } from '@/lib/hajira'
import { hashPassword, setSessionCookie, verifyPassword } from '@/lib/auth'

/**
 * Sign in — or create an account on first use (find-or-create with password).
 *
 * - New phone     -> account created; password is set now; role as chosen.
 *   TEACHER role additionally requires the institute teacher key (no SMS
 *   cost, still keeps random students from opening teacher accounts).
 * - Existing phone-> password must match. A legacy account without a
 *   password (pre-password demo data) claims its password on this login.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const phone = String(body?.phone || '').replace(/\D/g, '')
    const name = String(body?.name || '').trim()
    const password = String(body?.password || '')
    const role = body?.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'
    const teacherKey = String(body?.teacherKey || '').trim()

    if (!/^\d{6,15}$/.test(phone)) {
      return badRequest('Enter a valid phone number (digits only)')
    }
    if (password.length < 4) {
      return badRequest('Password must be at least 4 characters')
    }

    const user = await db.user.findUnique({ where: { phone } })

    if (user) {
      // Existing account
      if (user.passwordHash) {
        if (!verifyPassword(password, user.passwordHash)) {
          return badRequest('This phone is already registered — wrong password')
        }
        if (role !== user.role) {
          return forbidden(
            `This phone is registered as a ${user.role === 'TEACHER' ? 'teacher' : 'student'} — switch the tab on top`
          )
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

    // New account
    if (!name || name.length < 2) {
      return badRequest('Enter your full name')
    }
    if (role === 'TEACHER') {
      const expected = process.env.TEACHER_SIGNUP_KEY || 'HAJIRA-TEACHER'
      if (teacherKey !== expected) {
        return forbidden('Invalid teacher key — ask your department for it')
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
  } catch {
    return badRequest('Sign in failed — please try again')
  }
}
