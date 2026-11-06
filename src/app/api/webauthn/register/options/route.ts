import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, serverError, unauthorized } from '@/lib/hajira'
import {
  getRpAndOrigin,
  newChallengeExp,
  signChallenge,
  stringToBytes,
} from '@/lib/webauthn'
import { generateRegistrationOptions } from '@simplewebauthn/server'

/**
 * Step 1 of passkey enrollment (logged in): hand the browser a
 * PublicKeyCredentialCreationOptionsJSON whose challenge is a signed,
 * stateless token bound to THIS user ('register' purpose, 120s TTL).
 *
 * excludeCredentials prevents double-enrolling the same device.
 */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const { rpID } = getRpAndOrigin(req)
  const existing = await db.credential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  })

  const options = await generateRegistrationOptions({
    rpName: 'Hajira',
    rpID,
    userName: user.phone,
    userDisplayName: user.name,
    // userHandle: the browser echoes it back as userHandle on usernameless
    // login — UTF-8 bytes of the user id let us resolve the account later.
    userID: stringToBytes(user.id),
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? c.transports.split(',') : undefined,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    challenge: signChallenge({ sub: user.id, purpose: 'register', exp: newChallengeExp() }),
    timeout: 120_000, // match the challenge TTL
  })

  return NextResponse.json({ options })
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
