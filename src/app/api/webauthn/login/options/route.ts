import { NextRequest, NextResponse } from 'next/server'
import { serverError } from '@/lib/hajira'
import { getRpAndOrigin, newChallengeExp, signChallenge } from '@/lib/webauthn'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { clientIp, rateLimit } from '@/lib/rate-limit'

/**
 * Step 1 of passkey sign-in (usernameless — no session yet):
 * a DISCOVERABLE-credential request. allowCredentials is empty, so the
 * authenticator lets the user pick any passkey for this rpID. The challenge
 * is a signed stateless token ('login' purpose, 120s TTL); the account is
 * resolved from userHandle during /verify.
 */
async function POST_impl(req: NextRequest) {
  const byIp = rateLimit(`webauthn:login-opt:ip:${clientIp(req)}`, 30, 5 * 60_000)
  if (!byIp.ok) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${Math.max(byIp.retryAfterSec, 5)} seconds` },
      { status: 429, headers: { 'Retry-After': String(Math.max(byIp.retryAfterSec, 5)) } }
    )
  }

  const { rpID } = getRpAndOrigin(req)

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [], // empty = any discoverable credential for this rpID
    userVerification: 'preferred',
    challenge: signChallenge({ sub: 'login', purpose: 'login', exp: newChallengeExp() }),
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
