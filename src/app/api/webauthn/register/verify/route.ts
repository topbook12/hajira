import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, requireUser, serverError, unauthorized } from '@/lib/hajira'
import {
  bytesToB64url,
  challengeVerifier,
  getRpAndOrigin,
  isCredentialResponse,
} from '@/lib/webauthn'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'

/**
 * Step 2 of passkey enrollment (logged in): verify the attestation response.
 *
 * No server-side challenge store — `expectedChallenge` is a callback that
 * re-verifies the signed token the authenticator echoed (HMAC + expiry +
 * 'register' purpose + sub === session user). Origin/rpID are derived from
 * request headers, so the same code serves localhost, production and previews.
 */
async function POST_impl(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!isCredentialResponse(body?.response)) {
    return badRequest('Invalid registration response')
  }
  const response = body.response as RegistrationResponseJSON

  const { rpID, allowedOrigins } = getRpAndOrigin(req)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeVerifier('register', user.id),
      expectedOrigin: allowedOrigins,
      expectedRPID: rpID,
      requireUserVerification: true, // we asked for userVerification: 'required'
    })
  } catch (e) {
    // Library throws on expired/replayed/mismatched challenges etc. — a
    // client-side problem, not a 500. Details go to the server log only.
    console.error('[api:error][webauthn:register:verify]', e)
    return badRequest('Fingerprint setup failed or expired — please try again')
  }

  if (!verification.verified || !verification.registrationInfo) {
    return badRequest('Fingerprint setup failed — please try again')
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  // A credential ID is globally unique — if it already exists under a
  // DIFFERENT account, refuse instead of silently re-homing it. Re-enrolling
  // one of YOUR own credentials just refreshes its record.
  const existing = await db.credential.findUnique({ where: { credentialId: credential.id } })
  if (existing && existing.userId !== user.id) {
    return badRequest('This passkey is already registered to another account')
  }

  const sharedData = {
    publicKey: bytesToB64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports?.length ? credential.transports.join(',') : null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  }
  await db.credential.upsert({
    where: { credentialId: credential.id },
    update: sharedData,
    create: { userId: user.id, credentialId: credential.id, ...sharedData },
  })

  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
