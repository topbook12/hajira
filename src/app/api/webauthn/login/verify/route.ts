import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, serverError } from '@/lib/hajira'
import { setSessionCookie } from '@/lib/auth'
import {
  b64urlToBytes,
  challengeVerifier,
  getRpAndOrigin,
  isCredentialResponse,
} from '@/lib/webauthn'
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * Step 2 of passkey sign-in (usernameless): resolve the account from the
 * credential + userHandle, verify the assertion, mint the SAME session
 * cookie the phone+PIN login route sets, and answer with the same user shape.
 */
async function POST_impl(req: NextRequest) {
  const byIp = rateLimit(`webauthn:login:ip:${clientIp(req)}`, 30, 5 * 60_000)
  if (!byIp.ok) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${Math.max(byIp.retryAfterSec, 5)} seconds` },
      { status: 429, headers: { 'Retry-After': String(Math.max(byIp.retryAfterSec, 5)) } }
    )
  }

  const body = await req.json().catch(() => null)
  if (!isCredentialResponse(body?.response)) {
    return badRequest('Invalid authentication response')
  }
  const response = body.response as AuthenticationResponseJSON

  const { rpID, allowedOrigins } = getRpAndOrigin(req)

  const credential = await db.credential.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  })
  if (!credential) {
    return badRequest('This passkey is not registered — sign in with phone and PIN instead')
  }
  const user = credential.user

  // userHandle is the user id we encoded at registration (UTF-8 bytes).
  // A mismatch means the passkey belongs to a different account — reject.
  const userHandle = (response.response as { userHandle?: unknown }).userHandle
  if (typeof userHandle === 'string' && userHandle.length > 0) {
    if (Buffer.from(userHandle, 'base64url').toString('utf8') !== credential.userId) {
      return badRequest('This passkey belongs to a different account')
    }
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeVerifier('login'),
      expectedOrigin: allowedOrigins,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: b64urlToBytes(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? credential.transports.split(',') : undefined,
      },
      requireUserVerification: true, // passkeys on phones verify biometric/PIN anyway
    })
  } catch (e) {
    console.error('[api:error][webauthn:login:verify]', e)
    return badRequest('Fingerprint sign-in failed or expired — please try again')
  }

  if (!verification.verified) {
    return badRequest('Fingerprint sign-in failed — please try again')
  }

  // Replay defense: the lib already rejected lower counters; persist the new one.
  await db.credential.update({
    where: { id: credential.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp,
    },
  })

  // Same cookie mechanism as POST /api/auth/login.
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
  })
  setSessionCookie(res, user.id)
  return res
}

export async function POST(req: NextRequest) {
  try {
    return await POST_impl(req)
  } catch (e) {
    return serverError(e)
  }
}
