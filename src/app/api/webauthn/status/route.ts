import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, serverError, unauthorized } from '@/lib/hajira'

/**
 * Biometric enrollment status for the logged-in user.
 * GET    -> what's enrolled, and whether the check-in gate is on.
 * DELETE -> remove one of the user's own credentials (body: { credentialId }).
 */
async function GET_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const credentials = await db.credential.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    enrolled: credentials.length > 0,
    biometricRequired: user.biometricRequired,
    credentials: credentials.map((c) => ({
      id: c.id,
      credentialId: c.credentialId,
      deviceType: c.deviceType,
      transports: c.transports ? c.transports.split(',') : null,
      backedUp: c.backedUp,
      createdAt: c.createdAt,
    })),
  })
}

export async function GET(req: NextRequest) {
  try {
    return await GET_impl(req)
  } catch (e) {
    return serverError(e)
  }
}

async function DELETE_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const body = await req.json().catch(() => null)
  const credentialId = String(body?.credentialId || '').trim()
  if (!credentialId) return badRequest('credentialId required')

  const credential = await db.credential.findFirst({
    where: { credentialId, userId: user.id },
  })
  if (!credential) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
  }

  await db.credential.delete({ where: { id: credential.id } })
  const remaining = await db.credential.count({ where: { userId: user.id } })

  // Keep state consistent: with no credential left there is nothing to
  // assert against, so a stale "biometric required" preference would block
  // the check-in flow — switch it off automatically.
  const biometricRequired = remaining > 0 ? user.biometricRequired : false
  if (remaining === 0 && user.biometricRequired) {
    await db.user.update({ where: { id: user.id }, data: { biometricRequired: false } })
  }

  return NextResponse.json({ ok: true, enrolled: remaining > 0, biometricRequired })
}

export async function DELETE(req: NextRequest) {
  try {
    return await DELETE_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
