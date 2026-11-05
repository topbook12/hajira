import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest } from '@/lib/hajira'

/**
 * Demo login: find-or-create user by phone.
 * Real OTP/SMS verification is planned for Phase 2.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const phone = String(body.phone || '').trim()
    const name = String(body.name || '').trim()
    const role = body.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'

    if (!/^\d{6,15}$/.test(phone)) {
      return badRequest('Enter a valid phone number (digits only)')
    }
    if (!name || name.length < 2) {
      return badRequest('Enter your name')
    }

    let user = await db.user.findUnique({ where: { phone } })
    if (!user) {
      user = await db.user.create({ data: { phone, name, role } })
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
    })
  } catch {
    return badRequest('Sign in failed')
  }
}
