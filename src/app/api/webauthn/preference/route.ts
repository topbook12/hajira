import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, serverError, unauthorized } from '@/lib/hajira'

/**
 * Toggle the check-in biometric gate for the logged-in user.
 * Enabling with zero registered credentials is rejected — the gate would
 * otherwise be impossible to satisfy at check-in time.
 */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const body = await req.json().catch(() => null)
  const enabled = !!body?.enabled

  if (enabled) {
    const count = await db.credential.count({ where: { userId: user.id } })
    if (count === 0) return badRequest('Register a fingerprint first')
  }

  await db.user.update({
    where: { id: user.id },
    data: { biometricRequired: enabled },
  })

  return NextResponse.json({ ok: true, biometricRequired: enabled })
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
