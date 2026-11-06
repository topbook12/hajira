import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, serverError, unauthorized } from '@/lib/hajira'
import {
  b64urlToBytes,
  challengeVerifier,
  getRpAndOrigin,
  isCredentialResponse,
} from '@/lib/webauthn'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'

/**
 * Step 2 of the check-in biometric gate (logged in): prove the logged-in
 * user just performed a UV-flagged assertion with one of THEIR credentials.
 * Returns verifiedAt so the client can pass bioVerified context along to
 * the check-in flow.
 */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!isCredentialResponse(body?.response)) {
    return badRequest('Invalid authentication response')
  }
  const response = body.response as AuthenticationResponseJSON

  const credential = await db.credential.findFirst({
    where: { credentialId: response.id, userId: user.id },
  })
  if (!credential) {
    return badRequest('This passkey is not registered to your account')
  }

  const { rpID, allowedOrigins } = getRpAndOrigin(req)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeVerifier('assert', user.id),
      expectedOrigin: allowedOrigins,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: b64urlToBytes(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? credential.transports.split(',') : undefined,
      },
      requireUserVerification: true,
    })
  } catch (e) {
    console.error('[api:error][webauthn:assert:verify]', e)
    return badRequest('Fingerprint verification failed or expired — please try again')
  }

  if (!verification.verified) {
    return badRequest('Fingerprint verification failed — please try again')
  }

  await db.credential.update({
    where: { id: credential.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp,
    },
  })

  return NextResponse.json({ ok: true, verifiedAt: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
