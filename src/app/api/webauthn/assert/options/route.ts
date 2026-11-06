import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, serverError, unauthorized } from '@/lib/hajira'
import { getRpAndOrigin, newChallengeExp, signChallenge } from '@/lib/webauthn'
import { generateAuthenticationOptions } from '@simplewebauthn/server'

/**
 * Step 1 of the check-in biometric gate (logged in): narrow the prompt to
 * THIS user's registered credentials and demand real user verification
 * ('required' — the whole point is proving the student is physically present
 * on their enrolled device). Challenge: signed stateless 'assert' token.
 */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const credentials = await db.credential.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  })
  if (credentials.length === 0) {
    return badRequest('Register a fingerprint first')
  }

  const { rpID } = getRpAndOrigin(req)

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? c.transports.split(',') : undefined,
    })),
    userVerification: 'required',
    challenge: signChallenge({ sub: user.id, purpose: 'assert', exp: newChallengeExp() }),
    timeout: 120_000,
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
